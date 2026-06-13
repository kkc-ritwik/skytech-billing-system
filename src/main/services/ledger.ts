import { and, eq, isNull, inArray } from 'drizzle-orm'
import { getDb } from '../db/client'
import { parties, salesDocuments, purchaseDocuments, payments } from '../db/schema'

export interface LedgerEntry {
  date: number
  type: string
  number: string
  debit: number // increases what the party owes us (paise)
  credit: number // decreases what the party owes us (paise)
  balance: number // running balance after this entry
}

export interface PartyLedger {
  party: { id: string; name: string; partyType: string; gstin: string | null }
  openingBalance: number
  entries: LedgerEntry[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
}

/**
 * Unified statement of account for a party. Convention: a POSITIVE balance means
 * the party owes us (receivable); NEGATIVE means we owe them (payable).
 */
export async function partyLedger(partyId: string): Promise<PartyLedger> {
  const db = getDb()
  const party = await db.select().from(parties).where(eq(parties.id, partyId)).get()
  if (!party) throw Object.assign(new Error('Party not found.'), { code: 'NOT_FOUND' })

  const sales = await db
    .select({
      docType: salesDocuments.docType,
      number: salesDocuments.number,
      date: salesDocuments.issueDate,
      total: salesDocuments.grandTotal
    })
    .from(salesDocuments)
    .where(
      and(
        eq(salesDocuments.partyId, partyId),
        isNull(salesDocuments.deletedAt),
        inArray(salesDocuments.docType, ['invoice', 'sales_return'])
      )
    )

  const purchases = await db
    .select({
      docType: purchaseDocuments.docType,
      number: purchaseDocuments.number,
      date: purchaseDocuments.issueDate,
      total: purchaseDocuments.grandTotal
    })
    .from(purchaseDocuments)
    .where(
      and(
        eq(purchaseDocuments.partyId, partyId),
        isNull(purchaseDocuments.deletedAt),
        inArray(purchaseDocuments.docType, ['grn', 'purchase_return'])
      )
    )

  const pays = await db
    .select({
      direction: payments.direction,
      number: payments.number,
      date: payments.paidAt,
      amount: payments.amount
    })
    .from(payments)
    .where(and(eq(payments.partyId, partyId), isNull(payments.deletedAt)))

  const ms = (d: Date | number): number => (d instanceof Date ? d.getTime() : d)
  const raw: Omit<LedgerEntry, 'balance'>[] = []

  for (const s of sales) {
    if (s.docType === 'invoice') raw.push({ date: ms(s.date), type: 'Tax Invoice', number: s.number, debit: s.total, credit: 0 })
    else raw.push({ date: ms(s.date), type: 'Credit Note (Sales Return)', number: s.number, debit: 0, credit: s.total })
  }
  for (const p of purchases) {
    if (p.docType === 'grn') raw.push({ date: ms(p.date), type: 'Purchase (GRN)', number: p.number, debit: 0, credit: p.total })
    else raw.push({ date: ms(p.date), type: 'Debit Note (Purchase Return)', number: p.number, debit: p.total, credit: 0 })
  }
  for (const p of pays) {
    if (p.direction === 'inbound') raw.push({ date: ms(p.date), type: 'Receipt', number: p.number, debit: 0, credit: p.amount })
    else raw.push({ date: ms(p.date), type: 'Payment', number: p.number, debit: p.amount, credit: 0 })
  }

  raw.sort((a, b) => a.date - b.date)

  let balance = party.openingBalance
  const entries: LedgerEntry[] = raw.map((e) => {
    balance += e.debit - e.credit
    return { ...e, balance }
  })

  return {
    party: { id: party.id, name: party.name, partyType: party.partyType, gstin: party.gstin },
    openingBalance: party.openingBalance,
    entries,
    totalDebit: raw.reduce((a, e) => a + e.debit, 0),
    totalCredit: raw.reduce((a, e) => a + e.credit, 0),
    closingBalance: balance
  }
}

/** Current outstanding balance per party (for list columns). */
export async function partyBalances(): Promise<Map<string, number>> {
  const db = getDb()
  const map = new Map<string, number>()

  const all = await db.select({ id: parties.id, opening: parties.openingBalance }).from(parties).where(isNull(parties.deletedAt))
  for (const p of all) map.set(p.id, p.opening)

  const add = (id: string | null, delta: number): void => {
    if (!id) return
    map.set(id, (map.get(id) ?? 0) + delta)
  }

  const sales = await db
    .select({ partyId: salesDocuments.partyId, docType: salesDocuments.docType, total: salesDocuments.grandTotal })
    .from(salesDocuments)
    .where(and(isNull(salesDocuments.deletedAt), inArray(salesDocuments.docType, ['invoice', 'sales_return'])))
  for (const s of sales) add(s.partyId, s.docType === 'invoice' ? s.total : -s.total)

  const purchases = await db
    .select({ partyId: purchaseDocuments.partyId, docType: purchaseDocuments.docType, total: purchaseDocuments.grandTotal })
    .from(purchaseDocuments)
    .where(and(isNull(purchaseDocuments.deletedAt), inArray(purchaseDocuments.docType, ['grn', 'purchase_return'])))
  for (const p of purchases) add(p.partyId, p.docType === 'grn' ? -p.total : p.total)

  const pays = await db
    .select({ partyId: payments.partyId, direction: payments.direction, amount: payments.amount })
    .from(payments)
    .where(isNull(payments.deletedAt))
  for (const p of pays) add(p.partyId, p.direction === 'inbound' ? -p.amount : p.amount)

  return map
}
