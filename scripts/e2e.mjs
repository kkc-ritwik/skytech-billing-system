// FULL end-to-end test of the REAL running app: boots the actual main process,
// then drives the production path (renderer window.api → preload → IPC router →
// services → libSQL) through a complete business cycle, verifies every number,
// generates real invoice PDFs, and screenshots the resulting UI.
//   env -u ELECTRON_RUN_AS_NODE npx electron scripts/e2e.mjs
import { app, BrowserWindow, dialog } from 'electron'
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { tmpdir } from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'release', 'e2e')
mkdirSync(outDir, { recursive: true })

// Isolated throwaway DB so the user's real data is never touched.
const dbPath = join(tmpdir(), `shailee-e2e-${Date.now()}.db`)
for (const s of ['', '-wal', '-shm']) if (existsSync(dbPath + s)) rmSync(dbPath + s)
process.env.LEDGERLINE_DB_PATH = dbPath

// Auto-answer the Save dialog so PDF export runs unattended.
dialog.showSaveDialog = async (opts) => ({ canceled: false, filePath: join(outDir, basename((opts && opts.defaultPath) || 'out.pdf')) })

await import(pathToFileURL(join(root, 'out', 'main', 'index.js')).href)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const P = (rupees) => Math.round(rupees * 100)
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`)
  if (!ok) fails++
}

const SEQ = `(async () => {
  const api = window.api
  const call = async (ch, p) => { const r = await api.invoke(ch, p); if (!r.ok) throw new Error(ch + ': ' + r.error); return r.data }
  const P = (r) => Math.round(r * 100)
  const bs = await call('auth:bootstrap', { fullName: 'Ritwik Singh', username: 'admin', password: 'Shailee@123' })
  api.setToken(bs.session.token)
  localStorage.setItem('ll_token', bs.session.token)

  await call('settings:company:save', { legalName: 'Acme School Supplies Pvt Ltd', tradeName: 'Acme School Supplies', gstin: '07AABCA1234A1Z5', pan: 'AABCA1234A', addressLine1: '12, Industrial Area, Phase 1', addressLine2: null, city: 'New Delhi', state: 'Delhi', stateCode: '07', pincode: '110001', phone: '01140001234', email: 'sales@acme.test', website: null, bankName: 'HDFC Bank', bankAccountNo: '50100123456789', bankIfsc: 'HDFC0000123', bankBranch: 'Connaught Place', upiId: 'acme@hdfcbank', defaultTermsAndConditions: 'Goods once sold are not returnable.' })

  const mkItem = (sku,name,hsn,pp,sp,os,osv) => call('items:save', { sku, name, description:null, hsnCode:hsn, categoryId:null, unitId:null, taxRateId:null, purchasePrice:P(pp), sellingPrice:P(sp), sellingPriceIsInclusive:false, trackInventory:true, reorderLevel:20, openingStock:os, openingStockValue:P(osv), barcode:null, isActive:true })
  const nb = await mkItem('NB-A4-200','A4 Notebook 200 Pages','4820',35,60,500,17500)
  const pen = await mkItem('PEN-BL-10','Blue Gel Pen (Pack of 10)','9608',45,80,300,13500)
  const geo = await mkItem('GEO-BOX','Geometry Box','9017',90,150,100,9000)

  const mkParty = (type,name,gstin,stcd) => call('parties:save', { partyType:type, name, displayCode:null, gstin, pan:null, contactPerson:'Mr. Sharma', phone:'9810012345', email:null, billingAddressLine1:'Sector 12', billingAddressLine2:null, billingCity:'New Delhi', billingState:'Delhi', billingStateCode:stcd, billingPincode:'110022', shippingAddressLine1:null, shippingAddressLine2:null, shippingCity:null, shippingState:null, shippingPincode:null, creditLimit:0, creditDays:30, openingBalance:0, notes:null, isActive:true })
  const cust = await mkParty('customer','Delhi Public School','07AAACD1234F1Z2','07')
  const vend = await mkParty('vendor','National Paper Mills','06AAACN9999P1Z4','06')

  const grn = await call('purchases:save', { docType:'grn', partyId:vend.id, issueDate:Date.now(), isInterState:true, supplierInvoiceNo:'NPM/2026/0456', notes:null, lines:[
    { itemId:nb.id, description:'A4 Notebook 200 Pages', hsnCode:'4820', quantity:1000, unitPrice:P(35), discountPct:0, discountAmount:0, taxRateBps:1200, batchNo:'NB-2026-01', expiryDate:null },
    { itemId:pen.id, description:'Blue Gel Pen (Pack of 10)', hsnCode:'9608', quantity:500, unitPrice:P(45), discountPct:0, discountAmount:0, taxRateBps:1800, batchNo:null, expiryDate:null }
  ]})

  const inv = await call('sales:save', { docType:'invoice', partyId:cust.id, issueDate:Date.now(), referenceNo:'DPS/PO/2026/118', isInterState:false, notes:'Thank you for your business.', termsAndConditions:null, lines:[
    { itemId:nb.id, description:'A4 Notebook 200 Pages', hsnCode:'4820', quantity:200, unitPrice:P(60), discountPct:0, discountAmount:0, taxRateBps:1200, batchNo:null, expiryDate:null },
    { itemId:pen.id, description:'Blue Gel Pen (Pack of 10)', hsnCode:'9608', quantity:100, unitPrice:P(80), discountPct:0, discountAmount:0, taxRateBps:1800, batchNo:null, expiryDate:null },
    { itemId:geo.id, description:'Geometry Box', hsnCode:'9017', quantity:50, unitPrice:P(150), discountPct:0, discountAmount:0, taxRateBps:1800, batchNo:null, expiryDate:null }
  ]})
  const invDoc = await call('sales:get', { id: inv.id })

  const pdf = await call('documents:pdf', { type:'sales', id:inv.id, format:'a4' })
  const thermal = await call('documents:pdf', { type:'sales', id:inv.id, format:'thermal' })

  await call('payments:record', { direction:'inbound', partyId:cust.id, amount:invDoc.grandTotal, paidAt:Date.now(), mode:'upi', referenceNo:'UTR123456', bankAccount:null, notes:null, allocations:[{ refType:'sales', documentId:inv.id, amount:invDoc.grandTotal }] })
  const paid = await call('sales:get', { id: inv.id })
  const stock = await call('inventory:summary')
  const dash = await call('reports:dashboard')
  const pnl = await call('reports:pnl', { from:0, to: Date.now()+86400000 })
  const ledger = await call('parties:ledger', { id: cust.id })
  const gstr3b = await call('reports:gstr3b', { from:0, to: Date.now()+86400000 })

  const s = (sku) => { const r = stock.find(x => x.sku === sku); return r ? r.currentStock : null }
  return {
    grnNumber: grn.number, invNumber: inv.number,
    sub: invDoc.subTotal, cgst: invDoc.cgstTotal, sgst: invDoc.sgstTotal, grand: invDoc.grandTotal,
    payStatus: paid.paymentStatus, paidAmount: paid.paidAmount,
    pdfPath: pdf.path, thermalPath: thermal.path,
    stockNB: s('NB-A4-200'), stockPEN: s('PEN-BL-10'), stockGEO: s('GEO-BOX'),
    salesMonth: dash.salesThisMonth, unpaid: dash.unpaidInvoices,
    revenue: pnl.revenue, cogs: pnl.cogs, gross: pnl.grossProfit,
    closing: ledger.closingBalance, ledgerEntries: ledger.entries.length,
    gstrTaxable: gstr3b.taxableValue, gstrTax: gstr3b.totalTax
  }
})()`

async function getWin() {
  for (let i = 0; i < 60; i++) {
    const w = BrowserWindow.getAllWindows()[0]
    if (w && !w.webContents.isLoading()) return w
    await sleep(250)
  }
  throw new Error('window not ready')
}

app.whenReady().then(async () => {
  try {
    const win = await getWin()
    // wait for renderer to finish its own init
    await sleep(1500)
    const R = await win.webContents.executeJavaScript(SEQ)

    console.log('\n===== FULL CYCLE RESULTS =====')
    console.log(JSON.stringify(R, null, 2))
    console.log('\n===== ASSERTIONS =====')
    check('GRN numbered', /GRN\/\d{4}-\d{2}\/0001/.test(R.grnNumber), true)
    check('Invoice numbered', /INV\/\d{4}-\d{2}\/0001/.test(R.invNumber), true)
    check('Invoice subtotal ₹27,500', R.sub, P(27500))
    check('Invoice CGST ₹2,115', R.cgst, P(2115))
    check('Invoice SGST ₹2,115', R.sgst, P(2115))
    check('Invoice grand total ₹31,730', R.grand, P(31730))
    check('Invoice fully paid', R.payStatus, 'paid')
    check('Paid amount = grand total', R.paidAmount, P(31730))
    check('Stock A4 Notebook 500+1000-200=1300', R.stockNB, 1300)
    check('Stock Pen 300+500-100=700', R.stockPEN, 700)
    check('Stock Geometry 100-50=50', R.stockGEO, 50)
    check('Dashboard sales this month ₹31,730', R.salesMonth, P(31730))
    check('Dashboard unpaid invoices = 0', R.unpaid, 0)
    check('P&L revenue ₹27,500', R.revenue, P(27500))
    check('P&L COGS ₹16,000 (WAC)', R.cogs, P(16000))
    check('P&L gross profit ₹11,500', R.gross, P(11500))
    check('Customer ledger settled (0)', R.closing, 0)
    check('Ledger has invoice + receipt', R.ledgerEntries, 2)
    check('GSTR-3B taxable ₹27,500', R.gstrTaxable, P(27500))
    check('GSTR-3B total tax ₹4,230', R.gstrTax, P(4230))

    // Verify the generated bill PDFs are real, non-empty PDFs.
    for (const [label, p] of [['A4 invoice PDF', R.pdfPath], ['Thermal receipt PDF', R.thermalPath]]) {
      const ok = p && existsSync(p) && readFileSync(p).subarray(0, 4).toString() === '%PDF'
      check(label + ' generated', ok, true)
    }

    // Screenshot the resulting UI (authenticated via the token we stored).
    await win.webContents.reload()
    await sleep(2500)
    for (const [hash, name] of [['#/', 'cycle-dashboard.png'], ['#/sales', 'cycle-sales.png'], ['#/inventory', 'cycle-inventory.png'], ['#/reports', 'cycle-reports.png']]) {
      await win.webContents.executeJavaScript(`location.hash='${hash}'`)
      await sleep(1200)
      const img = await win.webContents.capturePage()
      writeFileSync(join(outDir, name), img.toPNG())
    }

    console.log(fails === 0 ? '\n✅ FULL CYCLE: ALL CHECKS PASSED' : `\n❌ FULL CYCLE: ${fails} FAILURE(S)`)
  } catch (e) {
    console.error('E2E ERROR', e)
    fails = 99
  } finally {
    try { rmSync(dbPath, { force: true }); rmSync(dbPath + '-wal', { force: true }); rmSync(dbPath + '-shm', { force: true }) } catch {}
    app.exit(fails === 0 ? 0 : 1)
  }
})
