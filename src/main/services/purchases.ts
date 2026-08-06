import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { getDb } from '../db/client'
import {
  purchaseDocuments,
  purchaseDocumentLines,
  parties,
  stockLedger,
  items
} from '../db/schema'
import { purchaseDocInputSchema, type PurchaseDocInput } from '@shared/dto'
import { computeDocument } from '@shared/calc'
import type { AuthUser } from '@shared/ipc'
import { nextDocumentNumber } from './sequences'
import { audit } from './audit'

const STATUS_FOR: Record<string, string> = {
  purchase_order: 'confirmed',
  grn: 'received',
  purchase_return: 'confirmed'
}

export async function listPurchaseDocs(docType: string, filter?: { from?: number; to?: number }) {
  const conds = [eq(purchaseDocuments.docType, docType), isNull(purchaseDocuments.deletedAt)]
  if (filter?.from) conds.push(gte(purchaseDocuments.issueDate, new Date(filter.from)))
  if (filter?.to) conds.push(lte(purchaseDocuments.issueDate, new Date(filter.to)))
  return getDb()
    .select({
      id: purchaseDocuments.id,
      number: purchaseDocuments.number,
      issueDate: purchaseDocuments.issueDate,
      partyName: parties.name,
      status: purchaseDocuments.status,
      grandTotal: purchaseDocuments.grandTotal,
      paidAmount: purchaseDocuments.paidAmount,
      paymentStatus: purchaseDocuments.paymentStatus,
      supplierInvoiceNo: purchaseDocuments.supplierInvoiceNo
    })
    .from(purchaseDocuments)
    .innerJoin(parties, eq(purchaseDocuments.partyId, parties.id))
    .where(and(...conds))
    .orderBy(desc(purchaseDocuments.issueDate))
    .limit(1000)
}

export async function getPurchaseDoc(id: string) {
  const header = await getDb().select().from(purchaseDocuments).where(eq(purchaseDocuments.id, id)).get()
  if (!header) return null
  const lines = await getDb()
    .select()
    .from(purchaseDocumentLines)
    .where(eq(purchaseDocumentLines.documentId, id))
    .orderBy(purchaseDocumentLines.sortOrder)
  return { ...header, lines }
}

/** Inventory effect for a purchase doc: GRN adds stock, return removes it. */
async function writeStock(
  tx: DbOrTx,
  docType: string,
  docId: string,
  number: string,
  lines: { itemId: string | null; quantity: number; unitPrice: number; batchNo?: string | null; expiryDate?: number | null }[],
  occurredAt: Date,
  userId: string
): Promise<void> {
  if (docType !== 'grn' && docType !== 'purchase_return') return
  const sign = docType === 'grn' ? 1 : -1
  const movementType = docType === 'grn' ? 'grn' : 'purchase_return'
  for (const l of lines) {
    if (!l.itemId) continue
    await tx.insert(stockLedger).values({
      itemId: l.itemId,
      movementType,
      qtyDelta: sign * l.quantity,
      unitCost: l.unitPrice,
      batchNo: l.batchNo ?? null,
      expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
      refType: 'purchase',
      refId: docId,
      refNumber: number,
      occurredAt,
      createdBy: userId,
      createdAt: new Date()
    })
  }
}

/**
 * Carry the buyer's repricing back onto the item master when goods are received.
 *
 * The purchase screen is where a shop decides what a design will sell for: the
 * vendor's rate comes in, a margin is applied, and the resulting MRP is what
 * goes on the sticker. Writing all three back means the next purchase of the
 * same design opens with what it was priced at last time, and the price printed
 * on the label is the price it was just given.
 *
 * Only a GRN reprices. A purchase order is an intention to buy, and a return is
 * goods going back out — neither should move the selling price.
 */
async function repriceItems(
  tx: DbOrTx,
  docType: string,
  lines: { itemId?: string | null; unitPrice: number; marginBps?: number; sellingPrice?: number }[]
): Promise<void> {
  if (docType !== 'grn') return
  for (const l of lines) {
    if (!l.itemId) continue
    const patch: Record<string, unknown> = { purchasePrice: l.unitPrice, updatedAt: new Date() }
    if (typeof l.marginBps === 'number') patch.marginBps = l.marginBps
    // A selling price of 0 means "not priced here" — never wipe an existing one.
    if (typeof l.sellingPrice === 'number' && l.sellingPrice > 0) patch.sellingPrice = l.sellingPrice
    await tx.update(items).set(patch).where(eq(items.id, l.itemId))
  }
}

export async function savePurchaseDoc(input: PurchaseDocInput, user: AuthUser): Promise<{ id: string; number: string }> {
  const d = purchaseDocInputSchema.parse(input)
  const issueDate = new Date(d.issueDate)
  const { lines, totals } = computeDocument(
    d.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      discountAmount: l.discountAmount,
      taxRateBps: l.taxRateBps
    })),
    d.isInterState,
    {
      extraCharges: d.extraCharges,
      extraDiscount: d.extraDiscount,
      // Vendor's bill-level discount, taken off BEFORE GST is worked out.
      schemePct: d.schemePct,
      schemeAmount: d.schemeAmount
    }
  )

  const result = await getDb().transaction(async (tx) => {
    let docId = d.id
    let number: string

    if (docId) {
      const existing = await tx.select().from(purchaseDocuments).where(eq(purchaseDocuments.id, docId)).get()
      if (!existing) throw Object.assign(new Error('Document not found.'), { code: 'NOT_FOUND' })
      number = existing.number
      // Replace lines and reverse previous stock effect.
      await tx.delete(purchaseDocumentLines).where(eq(purchaseDocumentLines.documentId, docId))
      await tx.delete(stockLedger).where(and(eq(stockLedger.refType, 'purchase'), eq(stockLedger.refId, docId)))
      await tx
        .update(purchaseDocuments)
        .set({
          partyId: d.partyId,
          issueDate,
          dueDate: d.dueDate ? new Date(d.dueDate) : null,
          supplierInvoiceNo: d.supplierInvoiceNo ?? null,
          supplierInvoiceDate: d.supplierInvoiceDate ? new Date(d.supplierInvoiceDate) : null,
          isInterState: d.isInterState,
          extraChargesLabel: d.extraChargesLabel ?? null,
          schemePct: d.schemePct,
          batchNo: d.batchNo ?? null,
          notes: d.notes ?? null,
          ...totals,
          updatedAt: new Date()
        })
        .where(eq(purchaseDocuments.id, docId))
    } else {
      number = await nextDocumentNumber(tx, d.docType, issueDate)
      const row = await tx
        .insert(purchaseDocuments)
        .values({
          docType: d.docType,
          number,
          partyId: d.partyId,
          parentId: d.parentId ?? null,
          issueDate,
          dueDate: d.dueDate ? new Date(d.dueDate) : null,
          supplierInvoiceNo: d.supplierInvoiceNo ?? null,
          supplierInvoiceDate: d.supplierInvoiceDate ? new Date(d.supplierInvoiceDate) : null,
          isInterState: d.isInterState,
          extraChargesLabel: d.extraChargesLabel ?? null,
          schemePct: d.schemePct,
          batchNo: d.batchNo ?? null,
          status: STATUS_FOR[d.docType] ?? 'confirmed',
          notes: d.notes ?? null,
          ...totals,
          createdBy: user.id
        })
        .returning({ id: purchaseDocuments.id })
        .get()
      docId = row.id
    }

    // Insert lines
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const src = d.lines[i]
      await tx.insert(purchaseDocumentLines).values({
        documentId: docId,
        itemId: src.itemId ?? null,
        description: src.description,
        hsnCode: src.hsnCode ?? null,
        batchNo: src.batchNo ?? d.batchNo ?? null,
        expiryDate: src.expiryDate ? new Date(src.expiryDate) : null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        discountAmount: l.discountAmount,
        taxRateBps: l.taxRateBps,
        taxableValue: l.taxableValue,
        cgstAmount: l.cgstAmount,
        sgstAmount: l.sgstAmount,
        igstAmount: l.igstAmount,
        cessAmount: l.cessAmount,
        lineTotal: l.lineTotal,
        sortOrder: i
      })
    }

    await writeStock(
      tx,
      d.docType,
      docId,
      number,
      d.lines.map((l, i) => ({ itemId: l.itemId ?? null, quantity: lines[i].quantity, unitPrice: lines[i].unitPrice, batchNo: l.batchNo ?? d.batchNo ?? null, expiryDate: l.expiryDate ?? null })),
      issueDate,
      user.id
    )

    // Batch/lot is entered once for the whole consignment; a line may still
    // override it. Fall back to the document's value so the stock ledger and
    // the printed paperwork agree.
    await repriceItems(
      tx,
      d.docType,
      d.lines.map((l, i) => ({
        itemId: l.itemId ?? null,
        unitPrice: lines[i].unitPrice,
        marginBps: l.marginBps,
        sellingPrice: l.sellingPrice
      }))
    )

    return { id: docId, number }
  })

  // Audit AFTER commit — it uses the base connection and would otherwise
  // collide with the open interactive transaction (SQLITE_BUSY).
  await audit({ userId: user.id, username: user.username, action: `purchase.${d.docType}.save`, entityType: 'purchase', entityId: result.id })
  return result
}

/** Create a new purchase document from an existing one (PO → GRN, etc.). */
export async function convertPurchaseDoc(
  id: string,
  targetDocType: PurchaseDocInput['docType'],
  user: AuthUser
): Promise<{ id: string; number: string }> {
  const source = await getPurchaseDoc(id)
  if (!source) throw Object.assign(new Error('Source document not found.'), { code: 'NOT_FOUND' })

  const result = await savePurchaseDoc(
    {
      docType: targetDocType,
      partyId: source.partyId,
      parentId: id,
      issueDate: Date.now(),
      supplierInvoiceNo: source.supplierInvoiceNo ?? null,
      isInterState: !!source.isInterState,
      extraChargesLabel: source.extraChargesLabel ?? null,
      extraCharges: source.extraCharges ?? 0,
      extraDiscount: source.extraDiscount ?? 0,
      // A converted document carries the same pre-tax bill discount as the
      // order it came from, so the amount payable does not change on convert.
      schemePct: 0,
      schemeAmount: source.schemeAmount ?? 0,
      batchNo: source.batchNo ?? null,
      notes: source.notes ?? null,
      lines: source.lines.map((l) => ({
        itemId: l.itemId ?? null,
        description: l.description,
        hsnCode: l.hsnCode ?? null,
        batchNo: l.batchNo ?? null,
        expiryDate: l.expiryDate ? (l.expiryDate instanceof Date ? l.expiryDate.getTime() : l.expiryDate) : null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        discountAmount: l.discountAmount,
        taxRateBps: l.taxRateBps
      }))
    },
    user
  )

  await getDb().update(purchaseDocuments).set({ status: 'converted', updatedAt: new Date() }).where(eq(purchaseDocuments.id, id))
  await audit({ userId: user.id, username: user.username, action: 'purchase.convert', entityType: 'purchase', entityId: id, details: { to: targetDocType, newId: result.id } })
  return result
}

export async function deletePurchaseDoc(id: string, user: AuthUser): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.delete(stockLedger).where(and(eq(stockLedger.refType, 'purchase'), eq(stockLedger.refId, id)))
    await tx.update(purchaseDocuments).set({ deletedAt: new Date(), status: 'cancelled' }).where(eq(purchaseDocuments.id, id))
  })
  await audit({ userId: user.id, username: user.username, action: 'purchase.delete', entityType: 'purchase', entityId: id })
}
