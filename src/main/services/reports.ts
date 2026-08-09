import { and, between, desc, eq, gte, inArray, isNull, ne, sql } from 'drizzle-orm'
import { startOfMonth, endOfMonth, subMonths, format as fmtDate } from 'date-fns'
import { getDb } from '../db/client'
import { salesDocuments, salesDocumentLines, purchaseDocuments, parties, stockLedger, salespersons } from '../db/schema'
import { stockSummary } from './inventory'

export interface DashboardStats {
  salesThisMonth: number
  purchasesThisMonth: number
  receivables: number
  payables: number
  lowStockCount: number
  unpaidInvoices: number
}

export async function dashboardStats(): Promise<DashboardStats> {
  const db = getDb()
  const now = new Date()
  const from = startOfMonth(now)
  const to = endOfMonth(now)

  const salesMonth = await db
    .select({ total: sql<number>`coalesce(sum(${salesDocuments.grandTotal}), 0)` })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.docType, 'invoice'), isNull(salesDocuments.deletedAt), between(salesDocuments.issueDate, from, to)))
    .get()

  const purchMonth = await db
    .select({ total: sql<number>`coalesce(sum(${purchaseDocuments.grandTotal}), 0)` })
    .from(purchaseDocuments)
    .where(and(eq(purchaseDocuments.docType, 'grn'), isNull(purchaseDocuments.deletedAt), between(purchaseDocuments.issueDate, from, to)))
    .get()

  const recv = await db
    .select({ total: sql<number>`coalesce(sum(${salesDocuments.grandTotal} - ${salesDocuments.paidAmount}), 0)` })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.docType, 'invoice'), isNull(salesDocuments.deletedAt)))
    .get()

  const pay = await db
    .select({ total: sql<number>`coalesce(sum(${purchaseDocuments.grandTotal} - ${purchaseDocuments.paidAmount}), 0)` })
    .from(purchaseDocuments)
    .where(and(eq(purchaseDocuments.docType, 'grn'), isNull(purchaseDocuments.deletedAt)))
    .get()

  const unpaid = await db
    .select({ count: sql<number>`count(*)` })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.docType, 'invoice'), isNull(salesDocuments.deletedAt), ne(salesDocuments.paymentStatus, 'paid')))
    .get()

  const stock = await stockSummary()

  return {
    salesThisMonth: Number(salesMonth?.total ?? 0),
    purchasesThisMonth: Number(purchMonth?.total ?? 0),
    receivables: Number(recv?.total ?? 0),
    payables: Number(pay?.total ?? 0),
    lowStockCount: stock.filter((s) => s.isLow).length,
    unpaidInvoices: Number(unpaid?.count ?? 0)
  }
}

/** Monthly invoiced sales for the last 6 months (dashboard trend chart). */
export async function salesTrend(): Promise<{ label: string; total: number }[]> {
  const from = startOfMonth(subMonths(new Date(), 5))
  const rows = await getDb()
    .select({ issueDate: salesDocuments.issueDate, total: salesDocuments.grandTotal })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.docType, 'invoice'), isNull(salesDocuments.deletedAt), gte(salesDocuments.issueDate, from)))

  const buckets = new Map<string, number>()
  for (let i = 5; i >= 0; i--) buckets.set(fmtDate(subMonths(new Date(), i), 'yyyy-MM'), 0)
  for (const r of rows) {
    const key = fmtDate(r.issueDate as Date, 'yyyy-MM')
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + r.total)
  }
  return [...buckets.entries()].map(([k, total]) => ({ label: fmtDate(new Date(k + '-01'), 'MMM'), total }))
}

/** Most recent invoices for the dashboard. */
export async function recentInvoices(limit = 8) {
  return getDb()
    .select({
      id: salesDocuments.id,
      number: salesDocuments.number,
      issueDate: salesDocuments.issueDate,
      partyName: parties.name,
      grandTotal: salesDocuments.grandTotal,
      paymentStatus: salesDocuments.paymentStatus
    })
    .from(salesDocuments)
    .innerJoin(parties, eq(salesDocuments.partyId, parties.id))
    .where(and(eq(salesDocuments.docType, 'invoice'), isNull(salesDocuments.deletedAt)))
    .orderBy(desc(salesDocuments.issueDate))
    .limit(limit)
}

/** Items at/below reorder level, for the dashboard alert widget. */
export async function lowStockList(limit = 8) {
  const stock = await stockSummary()
  return stock.filter((s) => s.isLow).slice(0, limit)
}

export async function salesRegister(fromMs: number, toMs: number) {
  return getDb()
    .select({
      number: salesDocuments.number,
      issueDate: salesDocuments.issueDate,
      partyName: parties.name,
      taxable: salesDocuments.subTotal,
      cgst: salesDocuments.cgstTotal,
      sgst: salesDocuments.sgstTotal,
      igst: salesDocuments.igstTotal,
      grandTotal: salesDocuments.grandTotal,
      paymentStatus: salesDocuments.paymentStatus
    })
    .from(salesDocuments)
    .innerJoin(parties, eq(salesDocuments.partyId, parties.id))
    .where(and(eq(salesDocuments.docType, 'invoice'), isNull(salesDocuments.deletedAt), between(salesDocuments.issueDate, new Date(fromMs), new Date(toMs))))
    .orderBy(salesDocuments.issueDate)
}

/** Outstanding receivables per customer with simple aging buckets. */
export async function receivables() {
  const rows = await getDb()
    .select({
      id: salesDocuments.id,
      number: salesDocuments.number,
      issueDate: salesDocuments.issueDate,
      dueDate: salesDocuments.dueDate,
      partyName: parties.name,
      outstanding: sql<number>`${salesDocuments.grandTotal} - ${salesDocuments.paidAmount}`
    })
    .from(salesDocuments)
    .innerJoin(parties, eq(salesDocuments.partyId, parties.id))
    .where(
      and(
        eq(salesDocuments.docType, 'invoice'),
        isNull(salesDocuments.deletedAt),
        sql`${salesDocuments.grandTotal} - ${salesDocuments.paidAmount} > 0`
      )
    )
    .orderBy(salesDocuments.issueDate)

  const now = Date.now()
  return rows.map((r) => {
    const ref = (r.dueDate ?? r.issueDate) as Date
    const days = Math.floor((now - ref.getTime()) / 86400000)
    const bucket = days <= 30 ? '0-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+'
    return { ...r, daysOverdue: Math.max(0, days), bucket, outstanding: Number(r.outstanding) }
  })
}

export interface ProfitAndLoss {
  revenue: number // net taxable sales (invoices − returns), excl. GST
  cogs: number // cost of goods sold at weighted-average cost
  grossProfit: number
  marginBps: number // gross margin in basis points
}

/** Gross Profit & Loss for a period: net revenue − COGS. */
export async function profitAndLoss(fromMs: number, toMs: number): Promise<ProfitAndLoss> {
  const db = getDb()
  const from = new Date(fromMs)
  const to = new Date(toMs)

  const inv = await db
    .select({ t: sql<number>`coalesce(sum(${salesDocuments.subTotal}), 0)` })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.docType, 'invoice'), isNull(salesDocuments.deletedAt), between(salesDocuments.issueDate, from, to)))
    .get()
  const ret = await db
    .select({ t: sql<number>`coalesce(sum(${salesDocuments.subTotal}), 0)` })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.docType, 'sales_return'), isNull(salesDocuments.deletedAt), between(salesDocuments.issueDate, from, to)))
    .get()
  const revenue = Number(inv?.t ?? 0) - Number(ret?.t ?? 0)

  // COGS = −Σ(qtyDelta × unitCost) for sales movements (invoice out is negative
  // qty → positive cost; a return adds qty → reduces COGS).
  const cogsRow = await db
    .select({ c: sql<number>`coalesce(sum(${stockLedger.qtyDelta} * ${stockLedger.unitCost}), 0)` })
    .from(stockLedger)
    .where(and(inArray(stockLedger.movementType, ['sales_invoice', 'sales_return']), between(stockLedger.occurredAt, from, to)))
    .get()
  const cogs = -Number(cogsRow?.c ?? 0)

  const grossProfit = revenue - cogs
  const marginBps = revenue > 0 ? Math.round((grossProfit / revenue) * 10000) : 0
  return { revenue, cogs, grossProfit, marginBps }
}

/** GSTR-3B outward-supplies summary (section 3.1a) for the period. */
export async function gstr3b(fromMs: number, toMs: number) {
  const from = new Date(fromMs)
  const to = new Date(toMs)
  const inv = await getDb()
    .select({
      taxable: sql<number>`coalesce(sum(${salesDocuments.subTotal}), 0)`,
      igst: sql<number>`coalesce(sum(${salesDocuments.igstTotal}), 0)`,
      cgst: sql<number>`coalesce(sum(${salesDocuments.cgstTotal}), 0)`,
      sgst: sql<number>`coalesce(sum(${salesDocuments.sgstTotal}), 0)`,
      cess: sql<number>`coalesce(sum(${salesDocuments.cessTotal}), 0)`,
      count: sql<number>`count(*)`
    })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.docType, 'invoice'), isNull(salesDocuments.deletedAt), between(salesDocuments.issueDate, from, to)))
    .get()
  const ret = await getDb()
    .select({
      taxable: sql<number>`coalesce(sum(${salesDocuments.subTotal}), 0)`,
      igst: sql<number>`coalesce(sum(${salesDocuments.igstTotal}), 0)`,
      cgst: sql<number>`coalesce(sum(${salesDocuments.cgstTotal}), 0)`,
      sgst: sql<number>`coalesce(sum(${salesDocuments.sgstTotal}), 0)`
    })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.docType, 'sales_return'), isNull(salesDocuments.deletedAt), between(salesDocuments.issueDate, from, to)))
    .get()
  const n = (v: unknown): number => Number(v ?? 0)
  return {
    invoices: n(inv?.count),
    taxableValue: n(inv?.taxable) - n(ret?.taxable),
    igst: n(inv?.igst) - n(ret?.igst),
    cgst: n(inv?.cgst) - n(ret?.cgst),
    sgst: n(inv?.sgst) - n(ret?.sgst),
    cess: n(inv?.cess),
    get totalTax(): number {
      return this.igst + this.cgst + this.sgst + this.cess
    }
  }
}

/** HSN/SAC-wise outward summary (GSTR-1 Table 12 / GSTR-3B 3.2). */
export async function hsnWise(fromMs: number, toMs: number) {
  const rows = await getDb()
    .select({
      hsn: salesDocumentLines.hsnCode,
      qty: sql<number>`coalesce(sum(${salesDocumentLines.quantity}), 0)`,
      taxable: sql<number>`coalesce(sum(${salesDocumentLines.taxableValue}), 0)`,
      cgst: sql<number>`coalesce(sum(${salesDocumentLines.cgstAmount}), 0)`,
      sgst: sql<number>`coalesce(sum(${salesDocumentLines.sgstAmount}), 0)`,
      igst: sql<number>`coalesce(sum(${salesDocumentLines.igstAmount}), 0)`
    })
    .from(salesDocumentLines)
    .innerJoin(salesDocuments, eq(salesDocumentLines.documentId, salesDocuments.id))
    .where(
      and(
        eq(salesDocuments.docType, 'invoice'),
        isNull(salesDocuments.deletedAt),
        between(salesDocuments.issueDate, new Date(fromMs), new Date(toMs))
      )
    )
    .groupBy(salesDocumentLines.hsnCode)
  return rows.map((r) => ({
    hsn: r.hsn || '(no HSN)',
    qty: Number(r.qty),
    taxable: Number(r.taxable),
    cgst: Number(r.cgst),
    sgst: Number(r.sgst),
    igst: Number(r.igst),
    totalTax: Number(r.cgst) + Number(r.sgst) + Number(r.igst)
  }))
}

/** Overdue invoices for payment reminders (past due date, not fully paid). */
export async function overdueInvoices() {
  const rows = await getDb()
    .select({
      id: salesDocuments.id,
      number: salesDocuments.number,
      issueDate: salesDocuments.issueDate,
      dueDate: salesDocuments.dueDate,
      partyName: parties.name,
      partyPhone: parties.phone,
      grandTotal: salesDocuments.grandTotal,
      paidAmount: salesDocuments.paidAmount
    })
    .from(salesDocuments)
    .innerJoin(parties, eq(salesDocuments.partyId, parties.id))
    .where(
      and(
        eq(salesDocuments.docType, 'invoice'),
        isNull(salesDocuments.deletedAt),
        ne(salesDocuments.paymentStatus, 'paid')
      )
    )
    .orderBy(salesDocuments.dueDate)
  const now = Date.now()
  return rows
    .map((r) => {
      const due = (r.dueDate ?? r.issueDate) as Date
      const days = Math.floor((now - due.getTime()) / 86400000)
      return { ...r, outstanding: r.grandTotal - r.paidAmount, daysOverdue: days, dueDate: due.getTime(), issueDate: (r.issueDate as Date).getTime() }
    })
    .filter((r) => r.daysOverdue > 0 && r.outstanding > 0)
}

/** GSTR-1 style summary grouped by tax rate. */
export async function gstSummary(fromMs: number, toMs: number) {
  return getDb()
    .select({
      docType: salesDocuments.docType,
      taxable: sql<number>`coalesce(sum(${salesDocuments.subTotal}), 0)`,
      cgst: sql<number>`coalesce(sum(${salesDocuments.cgstTotal}), 0)`,
      sgst: sql<number>`coalesce(sum(${salesDocuments.sgstTotal}), 0)`,
      igst: sql<number>`coalesce(sum(${salesDocuments.igstTotal}), 0)`,
      total: sql<number>`coalesce(sum(${salesDocuments.grandTotal}), 0)`,
      count: sql<number>`count(*)`
    })
    .from(salesDocuments)
    .where(and(eq(salesDocuments.docType, 'invoice'), isNull(salesDocuments.deletedAt), between(salesDocuments.issueDate, new Date(fromMs), new Date(toMs))))
    .groupBy(salesDocuments.docType)
}

export interface SalespersonSaleRow {
  salespersonId: string | null
  salespersonName: string
  invoiceCount: number
  netSales: number
  incentiveBps: number
  incentiveAmount: number
}

export interface SalespersonBillRow {
  id: string
  number: string
  issueDate: number
  partyName: string
  salespersonName: string
  grandTotal: number
}

/**
 * What each salesperson sold in a period, and every bill behind it.
 *
 * The shop settles incentives at the end of the day, month and year, so both
 * views are returned together: a total per person to pay against, and the bills
 * that make up that total so any figure can be checked rather than trusted.
 *
 * Sales are counted net of returns — a saree sold and brought back has not been
 * sold, and paying incentive on it would be paying twice for nothing.
 */
export async function salespersonSales(fromMs: number, toMs: number): Promise<{
  summary: SalespersonSaleRow[]
  bills: SalespersonBillRow[]
}> {
  const db = getDb()
  const from = new Date(fromMs)
  const to = new Date(toMs)

  const rows = await db
    .select({
      id: salesDocuments.id,
      number: salesDocuments.number,
      docType: salesDocuments.docType,
      issueDate: salesDocuments.issueDate,
      grandTotal: salesDocuments.grandTotal,
      partyName: parties.name,
      salespersonId: salesDocuments.salespersonId,
      salespersonName: salespersons.name,
      incentiveBps: salespersons.incentiveBps
    })
    .from(salesDocuments)
    .innerJoin(parties, eq(salesDocuments.partyId, parties.id))
    .leftJoin(salespersons, eq(salesDocuments.salespersonId, salespersons.id))
    .where(
      and(
        isNull(salesDocuments.deletedAt),
        inArray(salesDocuments.docType, ['invoice', 'sales_return']),
        between(salesDocuments.issueDate, from, to)
      )
    )
    .orderBy(salesDocuments.issueDate)

  const byPerson = new Map<string, SalespersonSaleRow>()
  const bills: SalespersonBillRow[] = []

  for (const r of rows) {
    const key = r.salespersonId ?? '__none__'
    const name = r.salespersonName ?? 'Not recorded'
    const signed = r.docType === 'sales_return' ? -r.grandTotal : r.grandTotal

    const cur =
      byPerson.get(key) ??
      {
        salespersonId: r.salespersonId ?? null,
        salespersonName: name,
        invoiceCount: 0,
        netSales: 0,
        incentiveBps: r.incentiveBps ?? 0,
        incentiveAmount: 0
      }
    if (r.docType === 'invoice') cur.invoiceCount += 1
    cur.netSales += signed
    byPerson.set(key, cur)

    bills.push({
      id: r.id,
      number: r.number,
      issueDate: (r.issueDate as Date).getTime(),
      partyName: r.partyName,
      salespersonName: name,
      grandTotal: signed
    })
  }

  const summary = [...byPerson.values()].map((s) => ({
    ...s,
    // A rate of zero means the shop works incentives out itself; show nothing
    // rather than a misleading zero-rupee entitlement.
    incentiveAmount: s.incentiveBps > 0 ? Math.round((Math.max(0, s.netSales) * s.incentiveBps) / 10000) : 0
  }))
  summary.sort((a, b) => b.netSales - a.netSales)

  return { summary, bills: bills.reverse() }
}
