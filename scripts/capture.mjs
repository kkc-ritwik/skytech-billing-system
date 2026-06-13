// Seeds a realistic dataset into an isolated DB, then screenshots every page of
// the REAL app for the client brochure. Output → release/brochure/*.png
//   env -u ELECTRON_RUN_AS_NODE npx electron scripts/capture.mjs
import { app, BrowserWindow, dialog } from 'electron'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { tmpdir } from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'release', 'brochure')
mkdirSync(outDir, { recursive: true })

const dbPath = join(tmpdir(), `skytech-cap-${Date.now()}.db`)
for (const s of ['', '-wal', '-shm']) if (existsSync(dbPath + s)) rmSync(dbPath + s)
process.env.LEDGERLINE_DB_PATH = dbPath

const logoPath = join(root, 'build', 'icon.png')
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [logoPath] })
dialog.showSaveDialog = async (opts) => ({ canceled: false, filePath: join(outDir, basename((opts && opts.defaultPath) || 'out.pdf')) })

await import(pathToFileURL(join(root, 'out', 'main', 'index.js')).href)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWin() {
  for (let i = 0; i < 60; i++) {
    const w = BrowserWindow.getAllWindows()[0]
    if (w && !w.webContents.isLoading()) return w
    await sleep(250)
  }
  throw new Error('no window')
}
let win
async function shot(name) {
  await sleep(1100)
  writeFileSync(join(outDir, name), (await win.webContents.capturePage()).toPNG())
  console.log('shot', name)
}
const clickText = (t) =>
  win.webContents.executeJavaScript(
    `(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().toLowerCase().includes(${JSON.stringify(
      t.toLowerCase()
    )}));if(b){b.click();return true}return false})()`
  )
const go = async (hash) => { await win.webContents.executeJavaScript(`location.hash='${hash}'`); await sleep(700) }

const SEED = `(async () => {
  const api = window.api
  const call = async (ch, p) => { const r = await api.invoke(ch, p); if (!r.ok) throw new Error(ch+': '+r.error); return r.data }
  const P = (r) => Math.round(r * 100)
  const bs = await call('auth:bootstrap', { fullName:'Ritwik Singh', username:'admin', password:'SkyTech@123' })
  api.setToken(bs.session.token); localStorage.setItem('ll_token', bs.session.token)
  await call('settings:company:save', { legalName:'Acme School Supplies Pvt Ltd', tradeName:'Acme School Supplies', gstin:'07AABCA1234A1Z5', pan:'AABCA1234A', addressLine1:'12, Industrial Area, Phase 1', addressLine2:null, city:'New Delhi', state:'Delhi', stateCode:'07', pincode:'110001', phone:'011-40001234', email:'sales@acmeschool.in', website:'acmeschool.in', bankName:'HDFC Bank', bankAccountNo:'50100123456789', bankIfsc:'HDFC0000123', bankBranch:'Connaught Place', upiId:'acme@hdfcbank', defaultTermsAndConditions:'1. Goods once sold are not returnable. 2. Payment due within 30 days.' })
  await call('settings:logo:pick', undefined)
  const mk = (sku,name,hsn,gst,pp,sp,os,osv,reorder) => call('items:save', { sku, name, description:null, hsnCode:hsn, categoryId:null, unitId:null, taxRateId:null, purchasePrice:P(pp), sellingPrice:P(sp), sellingPriceIsInclusive:false, trackInventory:true, reorderLevel:reorder, openingStock:os, openingStockValue:P(osv), barcode:null, isActive:true })
  const nb = await mk('NB-A4-200','A4 Notebook 200 Pages','4820',1200,35,60,500,17500,50)
  const pen = await mk('PEN-BL-10','Blue Gel Pen (Pack of 10)','9608',1800,45,80,40,1800,60)
  const geo = await mk('GEO-BOX','Geometry Box','9017',1800,90,150,100,9000,20)
  const chk = await mk('CHK-WHT','White Chalk (Box of 100)','9609',500,25,45,200,5000,40)
  const party = (type,name,gstin,stcd,city,credit) => call('parties:save', { partyType:type, name, displayCode:null, gstin, pan:null, contactPerson:'Mr. Sharma', phone:'9810012345', email:null, billingAddressLine1:'Sector 12', billingAddressLine2:null, billingCity:city, billingState:'Delhi', billingStateCode:stcd, billingPincode:'110022', shippingAddressLine1:null, shippingAddressLine2:null, shippingCity:null, shippingState:null, shippingPincode:null, creditLimit:P(credit), creditDays:30, openingBalance:0, notes:null, isActive:true })
  const dps = await party('customer','Delhi Public School, R.K. Puram','07AAACD1234F1Z2','07','New Delhi',200000)
  const sxc = await party('customer',"St. Xavier's College",'07AAACS5678K1Z9','07','New Delhi',150000)
  const npm = await party('vendor','National Paper Mills','06AAACN9999P1Z4','06','Gurgaon',0)
  const exp = Date.now() + 200*86400000
  await call('purchases:save', { docType:'grn', partyId:npm.id, issueDate:Date.now(), isInterState:true, supplierInvoiceNo:'NPM/2026/0456', notes:null, lines:[
    { itemId:nb.id, description:'A4 Notebook 200 Pages', hsnCode:'4820', quantity:1000, unitPrice:P(35), discountPct:0, discountAmount:0, taxRateBps:1200, batchNo:'NB-2026-01', expiryDate:exp },
    { itemId:pen.id, description:'Blue Gel Pen (Pack of 10)', hsnCode:'9608', quantity:500, unitPrice:P(45), discountPct:0, discountAmount:0, taxRateBps:1800, batchNo:'PEN-2026-A', expiryDate:Date.now()+60*86400000 }
  ]})
  const inv1 = await call('sales:save', { docType:'invoice', partyId:dps.id, issueDate:Date.now(), referenceNo:'DPS/PO/2026/118', isInterState:false, notes:'Thank you for your business.', termsAndConditions:null, lines:[
    { itemId:nb.id, description:'A4 Notebook 200 Pages', hsnCode:'4820', quantity:200, unitPrice:P(60), discountPct:0, discountAmount:0, taxRateBps:1200, batchNo:null, expiryDate:null },
    { itemId:pen.id, description:'Blue Gel Pen (Pack of 10)', hsnCode:'9608', quantity:100, unitPrice:P(80), discountPct:0, discountAmount:0, taxRateBps:1800, batchNo:null, expiryDate:null },
    { itemId:geo.id, description:'Geometry Box', hsnCode:'9017', quantity:50, unitPrice:P(150), discountPct:0, discountAmount:0, taxRateBps:1800, batchNo:null, expiryDate:null }
  ]})
  const inv1doc = await call('sales:get', { id: inv1.id })
  await call('payments:record', { direction:'inbound', partyId:dps.id, amount:inv1doc.grandTotal, paidAt:Date.now(), mode:'upi', referenceNo:'UTR778899', bankAccount:null, notes:null, allocations:[{ refType:'sales', documentId:inv1.id, amount:inv1doc.grandTotal }] })
  // a second, overdue & unpaid invoice for receivables/reminders
  await call('sales:save', { docType:'invoice', partyId:sxc.id, issueDate:Date.now()-40*86400000, dueDate:Date.now()-10*86400000, referenceNo:'SXC/2026/07', isInterState:false, notes:null, termsAndConditions:null, lines:[
    { itemId:geo.id, description:'Geometry Box', hsnCode:'9017', quantity:30, unitPrice:P(150), discountPct:0, discountAmount:0, taxRateBps:1800, batchNo:null, expiryDate:null },
    { itemId:chk.id, description:'White Chalk (Box of 100)', hsnCode:'9609', quantity:40, unitPrice:P(45), discountPct:0, discountAmount:0, taxRateBps:500, batchNo:null, expiryDate:null }
  ]})
  await call('inventory:adjust', { reason:'damage', note:'2 boxes water-damaged in store', adjustedAt:Date.now(), lines:[{ itemId:geo.id, qtyDelta:-2, unitCost:P(90) }] })
  // staff users
  await call('users:save', { fullName:'Riya Verma', username:'riya', email:null, role:'operator', isActive:true, password:'Riya@1234' })
  await call('users:save', { fullName:'Amit Singh', username:'amit', email:null, role:'manager', isActive:true, password:'Amit@1234' })
  return { invId: inv1.id }
})()`

app.whenReady().then(async () => {
  try {
    win = await getWin()
    win.setSize(1320, 860)
    await sleep(1500)
    await shot('01-first-run-setup.png')

    const seed = await win.webContents.executeJavaScript(SEED)
    await win.webContents.reload()
    await sleep(2600)

    await go('#/'); await shot('02-dashboard.png')
    await go('#/items'); await shot('03-items.png')
    await go('#/parties'); await shot('04-clients.png')
    await clickText('vendors'); await shot('05-vendors.png')
    // party ledger/statement dialog
    await go('#/parties'); await sleep(400)
    await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('button[title="Statement / ledger"]');if(b)b.click()})()`)
    await shot('06-party-statement.png')
    await win.webContents.executeJavaScript(`location.reload()`); await sleep(2200)
    await go('#/inventory'); await shot('07-inventory.png')
    await clickText('batch expiry'); await shot('08-batch-expiry.png')
    await go('#/purchases'); await shot('09-purchases.png')
    await go('#/sales'); await shot('10-sales.png')
    // new-invoice editor
    await clickText('new'); await sleep(900); await shot('11-invoice-editor.png')
    await win.webContents.executeJavaScript(`location.reload()`); await sleep(2200)
    await go('#/payments'); await shot('12-payments.png')
    await go('#/reports'); await shot('13-reports-receivables.png')
    await clickText('payment reminders'); await shot('14-reports-reminders.png')
    await clickText('profit & loss'); await shot('15-reports-pnl.png')
    await clickText('gstr-3b'); await shot('16-reports-gstr3b.png')
    await go('#/users'); await shot('17-users.png')
    await go('#/license'); await shot('18-license.png')
    await go('#/settings'); await shot('19-settings.png')
    await go('#/help'); await shot('20-help.png')

    // generate the bill and rasterise it
    await win.webContents.executeJavaScript(`window.api.invoke('documents:pdf',{type:'sales',id:'${seed.invId}',format:'a4'})`)
    await sleep(1500)

    // login screen
    await win.webContents.executeJavaScript(`localStorage.removeItem('ll_token');location.hash='#/';location.reload()`)
    await sleep(2600)
    await shot('00-login.png')
    console.log('CAPTURE DONE')
  } catch (e) {
    console.error('CAPTURE ERROR', e)
  } finally {
    try { for (const s of ['', '-wal', '-shm']) rmSync(dbPath + s, { force: true }) } catch {}
    app.exit(0)
  }
})
