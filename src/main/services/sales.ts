import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { getDb } from '../db/client'
import { salesDocuments, salesDocumentLines, parties, stockLedger, items, settings } from '../db/schema'
import { salesDocInputSchema, type SalesDocInput } from '@shared/dto'
import { computeDocument } from '@shared/calc'
import { formatQty } from '@shared/qty'
import type { AuthUser } from '@shared/ipc'
import { nextDocumentNumber } from './sequences'
import { audit } from './audit'

/**
 * Whether an invoice may drive stock below zero.
 *
 * Defaults to blocking it. A shop that has never opened Settings should not be
 * able to bill goods it does not have: stock figures silently going negative is
 * how a stock report stops meaning anything. Turning it off stays possible for
 * the shops that genuinely sell ahead of goods arriving.
 */
async function preventNegativeStockEnabled(): Promise<boolean> {
  const row = await getDb().select().from(settings).where(eq(settings.key, 'preventNegativeStock')).get()
  if (!row) return true
  try {
    return JSON.parse(row.value) !== false
  } catch {
    return true
  }
}

/**
 * When the "prevent negative stock" setting is on, block an invoice that would
 * drive any inventory-tracked item below zero. Must run inside the same
 * transaction AFTER any previous movements for this doc were reversed, so the
 * available figure is accurate on edit.
 */
async function assertStockAvailable(
  tx: DbOrTx,
  lineItems: { itemId: string | null; quantity: number }[]
): Promise<void> {
  const ids = [...new Set(lineItems.map((l) => l.itemId).filter((x): x is string => !!x))]
  if (ids.length === 0) return
  const itemRows = await tx
    .select({ id: items.id, name: items.name, track: items.trackInventory })
    .from(items)
    .where(inArray(items.id, ids))
  const itemMap = new Map(itemRows.map((r) => [r.id, r]))

  // Aggregate requested quantity per item (a line item can appear twice).
  const requested = new Map<string, number>()
  for (const l of lineItems) {
    if (l.itemId) requested.set(l.itemId, (requested.get(l.itemId) ?? 0) + l.quantity)
  }

  for (const [itemId, qty] of requested) {
    const meta = itemMap.get(itemId)
    if (!meta || !meta.track) continue
    const agg = await tx
      .select({ sum: sql<number>`coalesce(sum(${stockLedger.qtyDelta}), 0)` })
      .from(stockLedger)
      .where(eq(stockLedger.itemId, itemId))
      .get()
    const available = Number(agg?.sum ?? 0)
    if (available < qty) {
      throw Object.assign(
        new Error(
          `Not enough stock for "${meta.name}". Available: ${formatQty(available)}, required: ${formatQty(qty)}.`
        ),
        { code: 'VALIDATION' }
      )
    }
  }
}

const STATUS_FOR: Record<string, string> = {
  sales_order: 'confirmed',
  proforma: 'draft',
  invoice: 'confirmed',
  challan: 'confirmed',
  sales_return: 'confirmed'
}

export async function listSalesDocs(docType: string, filter?: { from?: number; to?: number }) {
  const conds = [eq(salesDocuments.docType, docType), isNull(salesDocuments.deletedAt)]
  if (filter?.from) conds.push(gte(salesDocuments.issueDate, new Date(filter.from)))
  if (filter?.to) conds.push(lte(salesDocuments.issueDate, new Date(filter.to)))
  return getDb()
    .select({
      id: salesDocuments.id,
      number: salesDocuments.number,
      issueDate: salesDocuments.issueDate,
      dueDate: salesDocuments.dueDate,
      partyName: parties.name,
      status: salesDocuments.status,
      grandTotal: salesDocuments.grandTotal,
      paidAmount: salesDocuments.paidAmount,
      paymentStatus: salesDocuments.paymentStatus
    })
    .from(salesDocuments)
    .innerJoin(parties, eq(salesDocuments.partyId, parties.id))
    .where(and(...conds))
    .orderBy(desc(salesDocuments.issueDate))
    .limit(1000)
}

export async function getSalesDoc(id: string) {
  const header = await getDb().select().from(salesDocuments).where(eq(salesDocuments.id, id)).get()
  if (!header) return null
  const lines = await getDb()
    .select()
    .from(salesDocumentLines)
    .where(eq(salesDocumentLines.documentId, id))
    .orderBy(salesDocumentLines.sortOrder)
  return { ...header, lines }
}

/** Moving weighted-average cost of an item from its current ledger state. */
async function avgCost(tx: DbOrTx, itemId: string, fallback: number): Promise<number> {
  const agg = await tx
    .select({
      qty: sql<number>`coalesce(sum(${stockLedger.qtyDelta}), 0)`,
      val: sql<number>`coalesce(sum(${stockLedger.qtyDelta} * ${stockLedger.unitCost}), 0)`
    })
    .from(stockLedger)
    .where(eq(stockLedger.itemId, itemId))
    .get()
  const qty = Number(agg?.qty ?? 0)
  const val = Number(agg?.val ?? 0)
  return qty > 0 ? Math.round(val / qty) : fallback
}

/**
 * Inventory effect: invoice removes stock (recording COGS at weighted-average
 * cost), sales_return adds it back at the same average. The captured unitCost is
 * what the Profit & Loss report uses to compute COGS.
 */
async function writeStock(
  tx: DbOrTx,
  docType: string,
  docId: string,
  number: string,
  lines: { itemId: string | null; quantity: number; batchNo?: string | null; expiryDate?: number | null }[],
  occurredAt: Date,
  userId: string
): Promise<void> {
  if (docType !== 'invoice' && docType !== 'sales_return') return
  const sign = docType === 'invoice' ? -1 : 1
  const movementType = docType === 'invoice' ? 'sales_invoice' : 'sales_return'

  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))]
  const itemRows = itemIds.length
    ? await tx.select({ id: items.id, purchasePrice: items.purchasePrice }).from(items).where(inArray(items.id, itemIds))
    : []
  const fallback = new Map(itemRows.map((r) => [r.id, r.purchasePrice]))

  for (const l of lines) {
    if (!l.itemId) continue
    const cost = await avgCost(tx, l.itemId, fallback.get(l.itemId) ?? 0)
    await tx.insert(stockLedger).values({
      itemId: l.itemId,
      movementType,
      qtyDelta: sign * l.quantity,
      unitCost: cost,
      batchNo: l.batchNo ?? null,
      expiryDate: l.expiryDate ? new Date(l.expiryDate) : null,
      refType: 'sales',
      refId: docId,
      refNumber: number,
      occurredAt,
      createdBy: userId,
      createdAt: new Date()
    })
  }
}

export async function saveSalesDoc(input: SalesDocInput, user: AuthUser): Promise<{ id: string; number: string }> {
  const d = salesDocInputSchema.parse(input)
  const issueDate = new Date(d.issueDate)
  const { lines, totals } = computeDocument(
    d.lines.map((l) => ({
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      discountAmount: l.discountAmount,
      taxRateBps: l.taxRateBps,
      cutLength: l.cutLength
    })),
    d.isInterState,
    { extraCharges: d.extraCharges, extraDiscount: d.extraDiscount, schemePct: d.schemePct }
  )

  // `totals` also carries derived, display-only figures (taxableValue, totalPcs,
  // totalMetres) that have no column. Pick out exactly the persisted ones so the
  // spread below can never push an unknown key at the insert.
  const totalColumns = {
    subTotal: totals.subTotal,
    discountTotal: totals.discountTotal,
    schemeAmount: totals.schemeAmount,
    cgstTotal: totals.cgstTotal,
    sgstTotal: totals.sgstTotal,
    igstTotal: totals.igstTotal,
    cessTotal: totals.cessTotal,
    extraCharges: totals.extraCharges,
    extraDiscount: totals.extraDiscount,
    roundOff: totals.roundOff,
    grandTotal: totals.grandTotal
  }

  /** Header fields shared by the insert and the update paths. */
  const dispatchColumns = {
    schemeLabel: d.schemeLabel ?? null,
    schemePct: d.schemePct,
    challanNo: d.challanNo ?? null,
    orderNo: d.orderNo ?? null,
    agentName: d.agentName ?? null,
    consigneeName: d.consigneeName ?? null,
    consigneeGstin: d.consigneeGstin ?? null,
    lrNo: d.lrNo ?? null,
    lrDate: d.lrDate ? new Date(d.lrDate) : null,
    transportName: d.transportName ?? null,
    transportStation: d.transportStation ?? null,
    caseNo: d.caseNo ?? null,
    weight: d.weight,
    freight: d.freight,
    ewayBillNo: d.ewayBillNo ?? null,
    transporterId: d.transporterId ?? null,
    dueDays: d.dueDays
  }

  const guardStock = d.docType === 'invoice' && (await preventNegativeStockEnabled())

  const result = await getDb().transaction(async (tx) => {
    let docId = d.id
    let number: string

    if (docId) {
      const existing = await tx.select().from(salesDocuments).where(eq(salesDocuments.id, docId)).get()
      if (!existing) throw Object.assign(new Error('Document not found.'), { code: 'NOT_FOUND' })
      if (existing.paidAmount > 0) {
        throw Object.assign(new Error('Cannot edit a document that has payments recorded against it.'), { code: 'CONFLICT' })
      }
      number = existing.number
      await tx.delete(salesDocumentLines).where(eq(salesDocumentLines.documentId, docId))
      await tx.delete(stockLedger).where(and(eq(stockLedger.refType, 'sales'), eq(stockLedger.refId, docId)))
      await tx
        .update(salesDocuments)
        .set({
          partyId: d.partyId,
          issueDate,
          dueDate: d.dueDate ? new Date(d.dueDate) : null,
          referenceNo: d.referenceNo ?? null,
          isInterState: d.isInterState,
          extraChargesLabel: d.extraChargesLabel ?? null,
          notes: d.notes ?? null,
          termsAndConditions: d.termsAndConditions ?? null,
          ...dispatchColumns,
          ...totalColumns,
          updatedAt: new Date()
        })
        .where(eq(salesDocuments.id, docId))
    } else {
      number = await nextDocumentNumber(tx, d.docType, issueDate)
      const row = await tx
        .insert(salesDocuments)
        .values({
          docType: d.docType,
          number,
          partyId: d.partyId,
          parentId: d.parentId ?? null,
          issueDate,
          dueDate: d.dueDate ? new Date(d.dueDate) : null,
          referenceNo: d.referenceNo ?? null,
          isInterState: d.isInterState,
          extraChargesLabel: d.extraChargesLabel ?? null,
          status: STATUS_FOR[d.docType] ?? 'confirmed',
          notes: d.notes ?? null,
          termsAndConditions: d.termsAndConditions ?? null,
          ...dispatchColumns,
          ...totalColumns,
          createdBy: user.id
        })
        .returning({ id: salesDocuments.id })
        .get()
      docId = row.id
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const src = d.lines[i]
      await tx.insert(salesDocumentLines).values({
        documentId: docId,
        itemId: src.itemId ?? null,
        description: src.description,
        hsnCode: src.hsnCode ?? null,
        batchNo: src.batchNo ?? null,
        expiryDate: src.expiryDate ? new Date(src.expiryDate) : null,
        quantity: l.quantity,
        cutLength: src.cutLength,
        packing: src.packing ?? null,
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

    const stockLines = d.lines.map((l, i) => ({ itemId: l.itemId ?? null, quantity: lines[i].quantity, batchNo: l.batchNo ?? null, expiryDate: l.expiryDate ?? null }))
    if (guardStock) await assertStockAvailable(tx, stockLines)

    await writeStock(tx, d.docType, docId, number, stockLines, issueDate, user.id)

    return { id: docId, number }
  })

  // Audit AFTER commit (base connection would otherwise collide with the tx).
  await audit({ userId: user.id, username: user.username, action: `sales.${d.docType}.save`, entityType: 'sales', entityId: result.id })
  return result
}

/** Create a new document from an existing one (order/proforma → invoice, etc.). */
export async function convertSalesDoc(
  id: string,
  targetDocType: SalesDocInput['docType'],
  user: AuthUser
): Promise<{ id: string; number: string }> {
  const source = await getSalesDoc(id)
  if (!source) throw Object.assign(new Error('Source document not found.'), { code: 'NOT_FOUND' })

  const result = await saveSalesDoc(
    {
      docType: targetDocType,
      partyId: source.partyId,
      parentId: id,
      issueDate: Date.now(),
      referenceNo: source.number,
      isInterState: !!source.isInterState,
      extraChargesLabel: source.extraChargesLabel ?? null,
      extraCharges: source.extraCharges ?? 0,
      extraDiscount: source.extraDiscount ?? 0,

      // Carry the trade scheme and the whole dispatch block across the
      // conversion — an order converted to an invoice must bill identically.
      schemeLabel: source.schemeLabel ?? null,
      schemePct: source.schemePct ?? 0,
      challanNo: source.challanNo ?? null,
      orderNo: source.orderNo ?? null,
      agentName: source.agentName ?? null,
      consigneeName: source.consigneeName ?? null,
      consigneeGstin: source.consigneeGstin ?? null,
      lrNo: source.lrNo ?? null,
      lrDate: source.lrDate ? (source.lrDate instanceof Date ? source.lrDate.getTime() : source.lrDate) : null,
      transportName: source.transportName ?? null,
      transportStation: source.transportStation ?? null,
      caseNo: source.caseNo ?? null,
      weight: source.weight ?? 0,
      freight: source.freight ?? 0,
      ewayBillNo: source.ewayBillNo ?? null,
      transporterId: source.transporterId ?? null,
      dueDays: source.dueDays ?? 0,

      notes: source.notes ?? null,
      termsAndConditions: source.termsAndConditions ?? null,
      lines: source.lines.map((l) => ({
        itemId: l.itemId ?? null,
        description: l.description,
        hsnCode: l.hsnCode ?? null,
        batchNo: l.batchNo ?? null,
        expiryDate: l.expiryDate ? (l.expiryDate instanceof Date ? l.expiryDate.getTime() : l.expiryDate) : null,
        quantity: l.quantity,
        cutLength: l.cutLength ?? 0,
        packing: l.packing ?? null,
        unitPrice: l.unitPrice,
        discountPct: l.discountPct,
        discountAmount: l.discountAmount,
        taxRateBps: l.taxRateBps
      }))
    },
    user
  )

  await getDb().update(salesDocuments).set({ status: 'converted', updatedAt: new Date() }).where(eq(salesDocuments.id, id))
  await audit({ userId: user.id, username: user.username, action: 'sales.convert', entityType: 'sales', entityId: id, details: { to: targetDocType, newId: result.id } })
  return result
}

export async function deleteSalesDoc(id: string, user: AuthUser): Promise<void> {
  await getDb().transaction(async (tx) => {
    const existing = await tx.select().from(salesDocuments).where(eq(salesDocuments.id, id)).get()
    if (existing && existing.paidAmount > 0) {
      throw Object.assign(new Error('Cannot delete a document with payments recorded.'), { code: 'CONFLICT' })
    }
    await tx.delete(stockLedger).where(and(eq(stockLedger.refType, 'sales'), eq(stockLedger.refId, id)))
    await tx.update(salesDocuments).set({ deletedAt: new Date(), status: 'cancelled' }).where(eq(salesDocuments.id, id))
  })
  await audit({ userId: user.id, username: user.username, action: 'sales.delete', entityType: 'sales', entityId: id })
}
