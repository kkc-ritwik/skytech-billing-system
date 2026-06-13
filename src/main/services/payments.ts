import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { getDb } from '../db/client'
import {
  payments,
  paymentAllocations,
  parties,
  salesDocuments,
  purchaseDocuments
} from '../db/schema'
import { paymentInputSchema, type PaymentInput } from '@shared/dto'
import type { AuthUser } from '@shared/ipc'
import { nextDocumentNumber } from './sequences'
import { audit } from './audit'

function paymentStatusFor(grandTotal: number, paid: number): string {
  if (paid <= 0) return 'unpaid'
  if (paid >= grandTotal) return 'paid'
  return 'partial'
}

async function applyToSales(tx: DbOrTx, documentId: string, delta: number): Promise<void> {
  const doc = await tx.select().from(salesDocuments).where(eq(salesDocuments.id, documentId)).get()
  if (!doc) throw Object.assign(new Error('Invoice not found for allocation.'), { code: 'NOT_FOUND' })
  const paid = doc.paidAmount + delta
  await tx
    .update(salesDocuments)
    .set({ paidAmount: paid, paymentStatus: paymentStatusFor(doc.grandTotal, paid), updatedAt: new Date() })
    .where(eq(salesDocuments.id, documentId))
}

async function applyToPurchase(tx: DbOrTx, documentId: string, delta: number): Promise<void> {
  const doc = await tx.select().from(purchaseDocuments).where(eq(purchaseDocuments.id, documentId)).get()
  if (!doc) throw Object.assign(new Error('Purchase not found for allocation.'), { code: 'NOT_FOUND' })
  const paid = doc.paidAmount + delta
  await tx
    .update(purchaseDocuments)
    .set({ paidAmount: paid, paymentStatus: paymentStatusFor(doc.grandTotal, paid), updatedAt: new Date() })
    .where(eq(purchaseDocuments.id, documentId))
}

export async function recordPayment(input: PaymentInput, user: AuthUser): Promise<{ id: string; number: string }> {
  const d = paymentInputSchema.parse(input)
  const allocated = d.allocations.reduce((a, x) => a + x.amount, 0)
  if (allocated > d.amount) {
    throw Object.assign(new Error('Allocated amount exceeds the payment amount.'), { code: 'VALIDATION' })
  }
  const paidAt = new Date(d.paidAt)

  const result = await getDb().transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, d.direction === 'inbound' ? 'receipt' : 'payment_voucher', paidAt)
    const row = await tx
      .insert(payments)
      .values({
        number,
        direction: d.direction,
        partyId: d.partyId,
        amount: d.amount,
        allocatedAmount: allocated,
        paidAt,
        mode: d.mode,
        referenceNo: d.referenceNo ?? null,
        bankAccount: d.bankAccount ?? null,
        notes: d.notes ?? null,
        createdBy: user.id
      })
      .returning({ id: payments.id })
      .get()

    for (const alloc of d.allocations) {
      await tx.insert(paymentAllocations).values({
        paymentId: row.id,
        refType: alloc.refType,
        documentId: alloc.documentId,
        amount: alloc.amount
      })
      if (alloc.refType === 'sales') await applyToSales(tx, alloc.documentId, alloc.amount)
      else await applyToPurchase(tx, alloc.documentId, alloc.amount)
    }

    return { id: row.id, number }
  })

  await audit({ userId: user.id, username: user.username, action: `payment.${d.direction}`, entityType: 'payment', entityId: result.id, details: { amount: d.amount } })
  return result
}

export async function listPayments(direction: 'inbound' | 'outbound') {
  return getDb()
    .select({
      id: payments.id,
      number: payments.number,
      partyName: parties.name,
      amount: payments.amount,
      allocatedAmount: payments.allocatedAmount,
      paidAt: payments.paidAt,
      mode: payments.mode,
      referenceNo: payments.referenceNo
    })
    .from(payments)
    .innerJoin(parties, eq(payments.partyId, parties.id))
    .where(and(eq(payments.direction, direction), isNull(payments.deletedAt)))
    .orderBy(desc(payments.paidAt))
}

/** Open (unpaid/partly-paid) documents for a party, to allocate a payment to. */
export async function openDocumentsFor(direction: 'inbound' | 'outbound', partyId: string) {
  if (direction === 'inbound') {
    const rows = await getDb()
      .select({
        id: salesDocuments.id,
        number: salesDocuments.number,
        issueDate: salesDocuments.issueDate,
        grandTotal: salesDocuments.grandTotal,
        paidAmount: salesDocuments.paidAmount
      })
      .from(salesDocuments)
      .where(
        and(
          eq(salesDocuments.partyId, partyId),
          eq(salesDocuments.docType, 'invoice'),
          isNull(salesDocuments.deletedAt),
          gt(sql`${salesDocuments.grandTotal} - ${salesDocuments.paidAmount}`, 0)
        )
      )
      .orderBy(salesDocuments.issueDate)
    return rows.map((r) => ({ ...r, refType: 'sales' as const, outstanding: r.grandTotal - r.paidAmount }))
  }
  const rows = await getDb()
    .select({
      id: purchaseDocuments.id,
      number: purchaseDocuments.number,
      issueDate: purchaseDocuments.issueDate,
      grandTotal: purchaseDocuments.grandTotal,
      paidAmount: purchaseDocuments.paidAmount
    })
    .from(purchaseDocuments)
    .where(
      and(
        eq(purchaseDocuments.partyId, partyId),
        eq(purchaseDocuments.docType, 'grn'),
        isNull(purchaseDocuments.deletedAt),
        gt(sql`${purchaseDocuments.grandTotal} - ${purchaseDocuments.paidAmount}`, 0)
      )
    )
    .orderBy(purchaseDocuments.issueDate)
  return rows.map((r) => ({ ...r, refType: 'purchase' as const, outstanding: r.grandTotal - r.paidAmount }))
}
