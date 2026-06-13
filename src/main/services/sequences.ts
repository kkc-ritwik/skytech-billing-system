import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '../db/client'
import { documentSequences, financialYears } from '../db/schema'

export const DOC_PREFIXES: Record<string, string> = {
  invoice: 'INV',
  proforma: 'PRO',
  challan: 'DC',
  sales_order: 'SO',
  sales_return: 'SR',
  credit_note: 'CN',
  purchase_order: 'PO',
  grn: 'GRN',
  purchase_return: 'PR',
  debit_note: 'DN',
  receipt: 'RCP',
  payment_voucher: 'PV',
  stock_adjustment: 'ADJ'
}

/** The Indian financial year label for a date (Apr 1 - Mar 31). */
export function financialYearLabelFor(date: Date): string {
  const y = date.getFullYear()
  const startYear = date.getMonth() >= 3 ? y : y - 1 // month 3 = April
  const endYY = String((startYear + 1) % 100).padStart(2, '0')
  return `${startYear}-${endYY}`
}

export async function ensureFinancialYear(db: DbOrTx, date: Date): Promise<string> {
  const label = financialYearLabelFor(date)
  const existing = await db
    .select()
    .from(financialYears)
    .where(eq(financialYears.label, label))
    .get()
  if (existing) return existing.id

  const startYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1
  const start = new Date(startYear, 3, 1) // 1 Apr
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59) // 31 Mar
  const row = await db
    .insert(financialYears)
    .values({ label, startDate: start, endDate: end, isActive: true })
    .returning()
    .get()
  return row.id
}

/**
 * Generate the next gapless, FY-scoped document number for a doc type.
 * MUST be called inside the same transaction that persists the document so the
 * reserved number is never wasted on a failed insert.
 */
export async function nextDocumentNumber(
  db: DbOrTx,
  docType: string,
  issueDate: Date
): Promise<string> {
  const fyId = await ensureFinancialYear(db, issueDate)
  const fy = (await db.select().from(financialYears).where(eq(financialYears.id, fyId)).get())!

  let seq = await db
    .select()
    .from(documentSequences)
    .where(
      and(eq(documentSequences.docType, docType), eq(documentSequences.financialYearId, fyId))
    )
    .get()

  if (!seq) {
    seq = await db
      .insert(documentSequences)
      .values({
        docType,
        financialYearId: fyId,
        prefix: DOC_PREFIXES[docType] ?? docType.toUpperCase(),
        nextNumber: 1,
        padding: 4
      })
      .returning()
      .get()
  }

  const current = seq.nextNumber
  await db
    .update(documentSequences)
    .set({ nextNumber: current + 1, updatedAt: new Date() })
    .where(eq(documentSequences.id, seq.id))

  const padded = String(current).padStart(seq.padding, '0')
  return `${seq.prefix}/${fy.label}/${padded}`
}
