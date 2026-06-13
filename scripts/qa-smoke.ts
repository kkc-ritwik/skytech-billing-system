/**
 * End-to-end integration smoke test of the real main-process service code,
 * driven against a throwaway libSQL database (Electron is stubbed). Exercises a
 * full business cycle: item → parties → GRN (stock in) → invoice (stock out) →
 * payment → reports, plus the negative-stock guard.
 *
 * Run via: npm run test:qa
 */
import { readdirSync, readFileSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = join(tmpdir(), `ledgerline-qa-${Date.now()}.db`)
process.env.LEDGERLINE_DB_PATH = dbPath

import { initDatabase, getDb, getClient, closeDatabase } from '../src/main/db/client'
import { bootstrap, login, resetPasswordWithRecovery } from '../src/main/services/auth'
import { seedDefaults } from '../src/main/services/seed'
import { saveItem, listItems } from '../src/main/services/items'
import { saveParty } from '../src/main/services/parties'
import { savePurchaseDoc } from '../src/main/services/purchases'
import { saveSalesDoc, getSalesDoc } from '../src/main/services/sales'
import { recordPayment } from '../src/main/services/payments'
import { stockSummary } from '../src/main/services/inventory'
import { partyLedger, partyBalances } from '../src/main/services/ledger'
import { setSettings } from '../src/main/services/settings'
import { dashboardStats, receivables, profitAndLoss, recentInvoices, salesTrend } from '../src/main/services/reports'
import { toPaise } from '../src/shared/money'
import type { AuthUser } from '../src/shared/ipc'

let failures = 0
function check(name: string, cond: boolean, extra = ''): void {
  if (cond) console.log(`✓ ${name}`)
  else { failures++; console.error(`✗ ${name} ${extra}`) }
}

async function run(): Promise<void> {
  await initDatabase()
  // Apply bundled SQL migrations.
  const migDir = join(root, 'src/main/db/migrations')
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
    await getClient().executeMultiple(readFileSync(join(migDir, f), 'utf8'))
  }
  await seedDefaults()

  // 0) Auth: first-run bootstrap. A wrong/blank vendor code must yield ADMIN
  // (customer owner), never Super Admin — that's the security-critical default.
  const bs = await bootstrap({ fullName: 'QA Owner', username: 'owner', password: 'Passw0rd1', setupCode: 'not-the-real-code' })
  const actor: AuthUser = bs.session.user
  check('wrong vendor code → Admin (not Super Admin)', actor.role === 'admin', actor.role)
  check('bootstrap returns a recovery code', /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(bs.recoveryCode), bs.recoveryCode)

  // Forgot password: reset with the recovery code, then log in with the new password.
  const reset = await resetPasswordWithRecovery('owner', bs.recoveryCode, 'Newpass99')
  check('recovery reset returns a fresh code', !!reset.recoveryCode && reset.recoveryCode !== bs.recoveryCode)
  const relog = await login('owner', 'Newpass99')
  check('login works after recovery reset', relog.user.username === 'owner')
  // Old recovery code must no longer work. (attempt #1)
  let oldCodeRejected = false
  try { await resetPasswordWithRecovery('owner', bs.recoveryCode, 'Whatever123') } catch { oldCodeRejected = true }
  check('old recovery code is rejected', oldCodeRejected)
  // Recovery attempts are rate-limited: 5 wrong attempts → account locked.
  for (let i = 0; i < 4; i++) {
    try { await resetPasswordWithRecovery('owner', 'BADX-BADX-BADX-BADX', 'Whatever123') } catch { /* expected */ }
  }
  let lockedMsg = ''
  try { await resetPasswordWithRecovery('owner', 'BADX-BADX-BADX-BADX', 'Whatever123') } catch (e) { lockedMsg = (e as Error).message }
  check('recovery locks after repeated failures', /too many attempts/i.test(lockedMsg), lockedMsg)

  // 1) Item with opening stock 100 @ ₹50 cost
  const itemId = await saveItem({
    sku: 'PEN-BLU', name: 'Blue Pen', description: null, hsnCode: '9608',
    categoryId: null, unitId: null, taxRateId: null,
    purchasePrice: toPaise(50), sellingPrice: toPaise(80), sellingPriceIsInclusive: false,
    trackInventory: true, reorderLevel: 20, openingStock: 100, openingStockValue: toPaise(5000),
    barcode: null, isActive: true
  }, actor)
  check('item created', !!itemId)

  // 2) Parties
  const customerId = await saveParty({
    partyType: 'customer', name: 'Delhi Public School', displayCode: null, gstin: null, pan: null,
    contactPerson: null, phone: null, email: null,
    billingAddressLine1: null, billingAddressLine2: null, billingCity: 'Delhi', billingState: 'Delhi',
    billingStateCode: '07', billingPincode: null, shippingAddressLine1: null, shippingAddressLine2: null,
    shippingCity: null, shippingState: null, shippingPincode: null,
    creditLimit: 0, creditDays: 30, openingBalance: 0, notes: null, isActive: true
  }, actor)
  const vendorId = await saveParty({
    partyType: 'vendor', name: 'Stationery Wholesaler', displayCode: null, gstin: null, pan: null,
    contactPerson: null, phone: null, email: null, billingAddressLine1: null, billingAddressLine2: null,
    billingCity: null, billingState: null, billingStateCode: null, billingPincode: null,
    shippingAddressLine1: null, shippingAddressLine2: null, shippingCity: null, shippingState: null,
    shippingPincode: null, creditLimit: 0, creditDays: 0, openingBalance: 0, notes: null, isActive: true
  }, actor)
  check('parties created', !!customerId && !!vendorId)

  // 3) GRN: receive 50 more → stock should be 150
  await savePurchaseDoc({
    docType: 'grn', partyId: vendorId, issueDate: Date.now(), isInterState: false,
    lines: [{ itemId, description: 'Blue Pen', hsnCode: '9608', quantity: 50, unitPrice: toPaise(50), discountPct: 0, discountAmount: 0, taxRateBps: 1800 }]
  }, actor)
  let stock = await stockSummary()
  check('stock after GRN = 150', stock.find((s) => s.id === itemId)?.currentStock === 150, JSON.stringify(stock[0]))

  // 4) Invoice: sell 30 → stock should be 120, totals correct
  const inv = await saveSalesDoc({
    docType: 'invoice', partyId: customerId, issueDate: Date.now(), isInterState: false,
    referenceNo: null, notes: null, termsAndConditions: null,
    lines: [{ itemId, description: 'Blue Pen', hsnCode: '9608', quantity: 30, unitPrice: toPaise(80), discountPct: 0, discountAmount: 0, taxRateBps: 1800 }]
  }, actor)
  check('invoice numbered FY-aware', /INV\/\d{4}-\d{2}\/0001/.test(inv.number), inv.number)
  stock = await stockSummary()
  check('stock after invoice = 120', stock.find((s) => s.id === itemId)?.currentStock === 120)

  const invDoc = await getSalesDoc(inv.id)
  // 30 * ₹80 = ₹2400 taxable; 18% GST = ₹432; grand = ₹2832
  check('invoice taxable ₹2400', invDoc!.subTotal === toPaise(2400), String(invDoc!.subTotal))
  check('invoice CGST ₹216', invDoc!.cgstTotal === toPaise(216), String(invDoc!.cgstTotal))
  check('invoice grand ₹2832', invDoc!.grandTotal === toPaise(2832), String(invDoc!.grandTotal))
  check('invoice unpaid', invDoc!.paymentStatus === 'unpaid')

  // 5) Payment: pay it fully, allocated to the invoice
  await recordPayment({
    direction: 'inbound', partyId: customerId, amount: invDoc!.grandTotal, paidAt: Date.now(),
    mode: 'upi', referenceNo: 'UTR123', bankAccount: null, notes: null,
    allocations: [{ refType: 'sales', documentId: inv.id, amount: invDoc!.grandTotal }]
  }, actor)
  const paidDoc = await getSalesDoc(inv.id)
  check('invoice marked paid', paidDoc!.paymentStatus === 'paid', paidDoc!.paymentStatus)

  // 5b) Party ledger: invoice (debit) + receipt (credit) → closing balance 0
  const ledger = await partyLedger(customerId)
  check('ledger has invoice + receipt', ledger.entries.length === 2, String(ledger.entries.length))
  check('ledger closing balance settled', ledger.closingBalance === 0, String(ledger.closingBalance))
  const balances = await partyBalances()
  check('party balance map = 0 for paid customer', (balances.get(customerId) ?? -1) === 0)

  // 5c) Validation: a malformed GSTIN is rejected
  let badGstinRejected = false
  try {
    await saveParty({
      partyType: 'customer', name: 'Bad GSTIN Co', displayCode: null, gstin: 'NOTAGSTIN', pan: null,
      contactPerson: null, phone: null, email: null, billingAddressLine1: null, billingAddressLine2: null,
      billingCity: null, billingState: null, billingStateCode: null, billingPincode: null,
      shippingAddressLine1: null, shippingAddressLine2: null, shippingCity: null, shippingState: null,
      shippingPincode: null, creditLimit: 0, creditDays: 0, openingBalance: 0, notes: null, isActive: true
    }, actor)
  } catch (e) {
    badGstinRejected = (e as { code?: string }).code === 'VALIDATION' || /GSTIN/i.test((e as Error).message)
  }
  check('invalid GSTIN rejected', badGstinRejected)

  // 6) Reports reflect the cycle
  const stats = await dashboardStats()
  check('dashboard sales this month = ₹2832', stats.salesThisMonth === toPaise(2832), String(stats.salesThisMonth))
  check('receivables now empty', (await receivables()).length === 0)

  // 6b) Profit & Loss: revenue ₹2400, COGS 30 × ₹50 = ₹1500, gross profit ₹900
  const pnl = await profitAndLoss(0, Date.now() + 86400000)
  check('P&L revenue ₹2400', pnl.revenue === toPaise(2400), String(pnl.revenue))
  check('P&L COGS ₹1500 (WAC)', pnl.cogs === toPaise(1500), String(pnl.cogs))
  check('P&L gross profit ₹900', pnl.grossProfit === toPaise(900), String(pnl.grossProfit))

  // 6c) Dashboard recent invoices widget
  const recent = await recentInvoices()
  check('dashboard recent shows the invoice', recent.length === 1 && recent[0].number === inv.number, JSON.stringify(recent))

  // 6d) Sales trend: 6 monthly buckets, current month = this invoice's total
  const trend = await salesTrend()
  check('sales trend has 6 months', trend.length === 6, String(trend.length))
  check('sales trend current month = ₹2832', trend[5].total === toPaise(2832), JSON.stringify(trend[5]))

  // 7) Negative-stock guard blocks overselling when enabled
  await setSettings({ preventNegativeStock: true }, actor)
  let blocked = false
  try {
    await saveSalesDoc({
      docType: 'invoice', partyId: customerId, issueDate: Date.now(), isInterState: false,
      referenceNo: null, notes: null, termsAndConditions: null,
      lines: [{ itemId, description: 'Blue Pen', hsnCode: '9608', quantity: 9999, unitPrice: toPaise(80), discountPct: 0, discountAmount: 0, taxRateBps: 1800 }]
    }, actor)
  } catch (e) {
    blocked = (e as { code?: string }).code === 'VALIDATION'
  }
  check('overselling blocked when guard on', blocked)

  closeDatabase()
  try { rmSync(dbPath, { force: true }); rmSync(dbPath + '-wal', { force: true }); rmSync(dbPath + '-shm', { force: true }) } catch { /* ignore */ }

  console.log(failures === 0 ? '\n✅ QA SMOKE: ALL PASS' : `\n❌ QA SMOKE: ${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((e) => { console.error('QA crashed:', e); process.exit(1) })
