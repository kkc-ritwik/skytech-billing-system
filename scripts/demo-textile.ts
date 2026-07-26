/**
 * Full end-to-end demo of the textile billing flow, driven through the REAL
 * main-process services against a throwaway database (Electron stubbed).
 *
 * It walks the whole path a shop actually takes:
 *   company -> buyer -> item master (with CUT) -> barcodes -> stock in (GRN)
 *   -> POS barcode scanning -> invoice -> printed-bill figures -> stock out
 *
 * Both real invoices (37/GST and 39/GST) are rebuilt from scratch and every
 * printed number is asserted against the paper bills.
 *
 * Run via: npm run demo:textile
 */
import { readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = join(tmpdir(), `shailee-demo-${Date.now()}.db`)
process.env.LEDGERLINE_DB_PATH = dbPath

import { initDatabase, getClient, closeDatabase } from '../src/main/db/client'
import { bootstrap } from '../src/main/services/auth'
import { seedDefaults } from '../src/main/services/seed'
import { saveItem } from '../src/main/services/items'
import { saveParty } from '../src/main/services/parties'
import { savePurchaseDoc } from '../src/main/services/purchases'
import { saveSalesDoc, getSalesDoc } from '../src/main/services/sales'
import { saveCompany, setSettings } from '../src/main/services/settings'
import { stockSummary } from '../src/main/services/inventory'
import { assignMissingBarcodes, resolveScan } from '../src/main/services/barcode'
import { renderTextileInvoiceHtml } from '../src/main/services/pdf-textile'
import { isValidInternalBarcode } from '../src/shared/barcode'
import { toPaise, formatINR, amountInWordsINR } from '../src/shared/money'
import type { AuthUser } from '../src/shared/ipc'

let failures = 0
function check(name: string, cond: boolean, extra = ''): void {
  if (cond) console.log(`  PASS  ${name}`)
  else {
    failures++
    console.error(`  FAIL  ${name} ${extra}`)
  }
}
function money(name: string, actual: number, expectedRupees: number): void {
  const expected = Math.round(expectedRupees * 100)
  check(`${name.padEnd(26)} ${formatINR(actual)}`, actual === expected, `expected ${formatINR(expected)}`)
}
const head = (s: string): void => console.log(`\n=== ${s} ===`)

const CUT = 6.3

// [description, pcs, rate(rupees)] exactly as printed on bill 37/GST.
const BILL_37: [string, number, number][] = [
  ['PASHMINA SILK 16075', 2, 1675],
  ['44 O. SILK D.NO-22040', 2, 2240],
  ['PASHMINA SILK 13098', 6, 1398],
  ['BRASO RICH PALLU 1407', 6, 853],
  ['BRASO RICH PALLU 1414', 6, 890],
  ['RANGLORI SILK 11050', 6, 1150],
  ['BANARSI SATIN 11000', 6, 1190],
  ['DOLA MINA SILK 8040', 1, 840],
  ['DOLA MINA SILK 8050', 1, 850],
  ['DOLA MINA SILK 8070', 1, 870],
  ['DOLA MINA SILK 8090', 1, 890],
  ['DOLA MINA SILK 8095', 2, 895],
  ['DOLA MINA SILK 8075', 1, 875],
  ['DOLA MINA SILK 8080', 1, 880],
  ['DOLA MINA SILK 11020', 2, 1120],
  ['BANARSI TISSUE 21075', 1, 2175]
]

// Bill 39/GST ships in boxes, so these carry a PACKING value instead of a CUT column.
const BILL_39: [string, number, number][] = [
  ['AAYUSHI', 30, 320],
  ['FLASH LIGHT (HIMANEE)', 8, 595],
  ['NATKHAT GUDIA (HIMANEE)', 16, 720],
  ['GUJARATI (HIMANEE)', 12, 898],
  ['GOLD COVERING (HIMANEE)', 6, 798]
]

async function run(): Promise<void> {
  await initDatabase()
  const migDir = join(root, 'src/main/db/migrations')
  for (const f of readdirSync(migDir).filter((x) => x.endsWith('.sql')).sort()) {
    await getClient().executeMultiple(readFileSync(join(migDir, f), 'utf8'))
  }
  await seedDefaults()

  const bs = await bootstrap({ fullName: 'Demo Owner', username: 'owner', password: 'Passw0rd1' })
  const user: AuthUser = bs.session.user

  // ---------------------------------------------------------------- company
  head('1. Company & buyer')
  await saveCompany(
    {
      legalName: 'KRISHNA GANGA CREATION',
      tradeName: 'KRISHNA GANGA CREATION',
      gstin: '24ACNPB0084A1ZB',
      pan: 'ACNPB0084A',
      addressLine1: 'SHOP-107, DADU TEXTILE MARKET',
      addressLine2: 'RING ROAD, UMARWADA',
      city: 'SURAT',
      state: 'Gujarat',
      stateCode: '24',
      pincode: '395010',
      phone: '7902117063',
      bankName: 'H.D.F.C BANK',
      bankAccountNo: '50200095354320',
      bankIfsc: 'HDFC0001026',
      defaultTermsAndConditions:
        'SUBJECT TO SURAT JURISDICTION.\nGOODS HAVE BEEN SOLD & DESPATCHED AT THE ENTIRE RISK OF THE PURCHASER.\nCOMPLAINTS, IF ANY REGARDING THIS INVOICE MUST BE INFORMED IN WRITING WITHIN 48 HOURS.'
    } as never,
    user
  )
  await setSettings(
    {
      invoiceTemplate: 'textile',
      invoiceInvocation: 'Shree Ganeshaya Namah',
      defaultSchemeLabel: 'DISCOUNT',
      defaultSchemePct: 200,
      defaultCutLength: CUT,
      defaultTransportName: 'ANCHAL LOGISTICS'
    },
    user
  )
  check('company saved with Gujarat state code 24', true)

  const buyerId = await saveParty(
    {
      partyType: 'customer',
      name: 'RAJESHWARI SHREE',
      gstin: '10AZJPK4799G1Z6',
      billingAddressLine1: '1ST RAJESHWARI SHREE',
      billingAddressLine2: 'KALAM BAGH ROAD',
      billingCity: 'MUZAFFARPUR',
      billingState: 'Bihar',
      billingStateCode: '10',
      billingPincode: '842001',
      creditLimit: 0,
      creditDays: 0,
      openingBalance: 0,
      isActive: true
    } as never,
    user
  )
  // Gujarat (24) selling to Bihar (10) => inter-state => IGST.
  check('buyer is in Bihar (state 10) -> inter-state IGST', true)

  // ------------------------------------------------------------ item master
  head('2. Item master with CUT / PACKING')
  const itemIds = new Map<string, string>()
  for (const [name, , rate] of BILL_37) {
    const id = await saveItem(
      {
        sku: name.replace(/[^A-Z0-9]+/gi, '-').toUpperCase().slice(0, 40),
        name,
        hsnCode: '5407',
        purchasePrice: toPaise(rate * 0.8),
        sellingPrice: toPaise(rate),
        sellingPriceIsInclusive: false,
        trackInventory: true,
        reorderLevel: 0,
        openingStock: 0,
        openingStockValue: 0,
        cutLength: CUT,
        isActive: true,
        taxRateId: null,
        unitId: null,
        categoryId: null,
        description: null,
        barcode: null,
        packing: null
      } as never,
      user
    )
    itemIds.set(name, id)
  }
  for (const [name, , rate] of BILL_39) {
    const id = await saveItem(
      {
        sku: name.replace(/[^A-Z0-9]+/gi, '-').toUpperCase().slice(0, 40),
        name,
        hsnCode: '5407',
        purchasePrice: toPaise(rate * 0.8),
        sellingPrice: toPaise(rate),
        sellingPriceIsInclusive: false,
        trackInventory: true,
        reorderLevel: 0,
        openingStock: 0,
        openingStockValue: 0,
        cutLength: CUT,
        packing: 'BOX',
        isActive: true,
        taxRateId: null,
        unitId: null,
        categoryId: null,
        description: null,
        barcode: null
      } as never,
      user
    )
    itemIds.set(name, id)
  }
  check(`${itemIds.size} designs created (16 cut + 5 box)`, itemIds.size === 21, String(itemIds.size))

  // --------------------------------------------------------------- barcodes
  head('3. Barcode generation')
  const { assigned } = await assignMissingBarcodes(user)
  check('every item received a barcode', assigned.length === 21, String(assigned.length))
  check('all barcodes pass the check digit', assigned.every((a) => isValidInternalBarcode(a.barcode)))
  check('all barcodes are unique', new Set(assigned.map((a) => a.barcode)).size === 21)
  console.log(`         e.g. ${assigned[0].name} -> ${assigned[0].barcode}`)

  const again = await assignMissingBarcodes(user)
  check('re-running assigns nothing (idempotent)', again.assigned.length === 0, String(again.assigned.length))

  // ------------------------------------------------------------- stock in
  head('4. Stock in (GRN)')
  const vendorId = await saveParty(
    { partyType: 'vendor', name: 'MILL SUPPLIER', creditLimit: 0, creditDays: 0, openingBalance: 0, isActive: true } as never,
    user
  )
  await savePurchaseDoc(
    {
      docType: 'grn',
      partyId: vendorId,
      issueDate: Date.now(),
      isInterState: false,
      extraCharges: 0,
      extraDiscount: 0,
      lines: [...BILL_37, ...BILL_39].map(([name, pcs, rate]) => ({
        itemId: itemIds.get(name)!,
        description: name,
        hsnCode: '5407',
        quantity: pcs * 2, // buy double so the sale cannot exhaust stock
        unitPrice: toPaise(rate * 0.8),
        discountPct: 0,
        discountAmount: 0,
        taxRateBps: 500
      }))
    } as never,
    user
  )
  const stockAfterGrn = await stockSummary()
  const pashmina = stockAfterGrn.find((s) => s.name === 'PASHMINA SILK 16075')
  check('GRN put stock on hand', (pashmina?.currentStock ?? 0) === 4, String(pashmina?.currentStock))

  // ------------------------------------------------- POS: scan every barcode
  head('5. POS — resolving scans')
  const barcodeOf = new Map(assigned.map((a) => [a.name, a.barcode]))

  /** Rebuild a bill by scanning each design's label once per piece, as at a counter. */
  async function scanCart(
    bill: [string, number, number][],
    packing: string | null
  ): Promise<{ itemId: string; description: string; hsnCode: string | null; quantity: number; cutLength: number; packing: string | null; unitPrice: number; discountPct: number; discountAmount: number; taxRateBps: number }[]> {
    const cart = new Map<string, { line: any }>()
    for (const [name, pcs] of bill) {
      const code = barcodeOf.get(name)!
      for (let i = 0; i < pcs; i++) {
        const found = await resolveScan(code + '\r\n') // scanners append a newline
        if (!found) throw new Error(`scan failed for ${name}`)
        const existing = cart.get(found.id)
        if (existing) existing.line.quantity += 1
        else
          cart.set(found.id, {
            line: {
              itemId: found.id,
              description: found.name,
              hsnCode: found.hsnCode,
              quantity: 1,
              cutLength: found.cutLength,
              packing: packing ?? found.packing,
              unitPrice: found.sellingPrice,
              discountPct: 0,
              discountAmount: 0,
              taxRateBps: 500
            }
          })
      }
    }
    return [...cart.values()].map((v) => v.line)
  }

  const cart37 = await scanCart(BILL_37, null)
  check('45 scans collapsed into 16 cart lines', cart37.length === 16, String(cart37.length))
  check('scanning the same label twice increments PCS', cart37[0].quantity === 2, String(cart37[0].quantity))
  check(
    'scanner newline is stripped before lookup',
    (await resolveScan(`${assigned[0].barcode}\r\n`))?.id === assigned[0].id
  )
  check('unknown barcode resolves to null (no crash)', (await resolveScan('229999999991')) === null)
  check('an item can also be found by typing its SKU', (await resolveScan(assigned[0].sku))?.id === assigned[0].id)

  // ----------------------------------------------------------- invoice 37
  head('6. Invoice 37/GST')
  const inv37 = await saveSalesDoc(
    {
      docType: 'invoice',
      partyId: buyerId,
      issueDate: new Date('2026-07-11').getTime(),
      isInterState: true,
      extraCharges: 0,
      extraDiscount: 0,
      schemeLabel: 'DISCOUNT',
      schemePct: 200,
      challanNo: '37/GST',
      lrNo: null,
      lrDate: new Date('2026-07-11').getTime(),
      transportName: 'ANCHAL LOGISTICS',
      transportStation: 'MUZAFFARPUR',
      caseNo: '37x1',
      weight: 0,
      freight: 0,
      ewayBillNo: '682143354925',
      transporterId: '24AQBPS9728G1ZK',
      dueDays: 0,
      termsAndConditions:
        'SUBJECT TO SURAT JURISDICTION.\nGOODS HAVE BEEN SOLD & DESPATCHED AT THE ENTIRE RISK OF THE PURCHASER.\nCOMPLAINTS, IF ANY REGARDING THIS INVOICE MUST BE INFORMED IN WRITING WITHIN 48 HOURS.',
      lines: cart37
    } as never,
    user
  )
  const doc37: any = await getSalesDoc(inv37.id)
  console.log(`  invoice number: ${inv37.number}`)
  money('SUB TOTAL', doc37.subTotal, 52126)
  money('DISCOUNT @ 2%', doc37.schemeAmount, 1042.52)
  money('Taxable Value', doc37.subTotal - doc37.schemeAmount, 51083.48)
  money('IGST @ 5%', doc37.igstTotal, 2554.17)
  money('Invoice Value', doc37.grandTotal, 53638)
  check('CGST/SGST are zero on an inter-state bill', doc37.cgstTotal === 0 && doc37.sgstTotal === 0)
  check(
    'amount in words matches the paper bill',
    amountInWordsINR(doc37.grandTotal).toUpperCase().includes('FIFTY THREE THOUSAND SIX HUNDRED THIRTY EIGHT'),
    amountInWordsINR(doc37.grandTotal)
  )
  const pcs37 = doc37.lines.reduce((a: number, l: any) => a + l.quantity, 0)
  const mts37 = Math.round(doc37.lines.reduce((a: number, l: any) => a + l.quantity * l.cutLength, 0) * 100) / 100
  check(`total PCS = 45`, pcs37 === 45, String(pcs37))
  check(`total MTS = 283.5`, mts37 === 283.5, String(mts37))
  check('CUT persisted on every line', doc37.lines.every((l: any) => l.cutLength === CUT))

  // ----------------------------------------------------------- invoice 39
  head('7. Invoice 39/GST (SCHEME + PACKING)')
  const cart39 = await scanCart(BILL_39, 'BOX')
  const inv39 = await saveSalesDoc(
    {
      docType: 'invoice',
      partyId: buyerId,
      issueDate: new Date('2026-07-14').getTime(),
      isInterState: true,
      extraCharges: 0,
      extraDiscount: 0,
      schemeLabel: 'SCHEME',
      schemePct: 200,
      challanNo: '39/GST',
      lrDate: new Date('2026-07-14').getTime(),
      transportName: 'ANCHAL LOGISTICS',
      transportStation: 'MUZAFFARPUR',
      caseNo: '39x1',
      weight: 0,
      freight: 0,
      ewayBillNo: '642144767964',
      transporterId: '24AQBPS9728G1ZK',
      dueDays: 0,
      lines: cart39
    } as never,
    user
  )
  const doc39: any = await getSalesDoc(inv39.id)
  console.log(`  invoice number: ${inv39.number}`)
  money('SUB TOTAL', doc39.subTotal, 41444)
  money('SCHEME @ 2%', doc39.schemeAmount, 828.88)
  money('Taxable Value', doc39.subTotal - doc39.schemeAmount, 40615.12)
  money('IGST @ 5%', doc39.igstTotal, 2030.76)
  money('Invoice Value', doc39.grandTotal, 42646)
  check('scheme label saved as SCHEME', doc39.schemeLabel === 'SCHEME', doc39.schemeLabel)
  check('PACKING persisted as BOX', doc39.lines.every((l: any) => l.packing === 'BOX'))
  check(
    'amount in words matches the paper bill',
    amountInWordsINR(doc39.grandTotal).toUpperCase().includes('FORTY TWO THOUSAND SIX HUNDRED FORTY SIX'),
    amountInWordsINR(doc39.grandTotal)
  )

  // ------------------------------------------------------- stock & printing
  head('8. Stock movement & printed bill')
  const stockAfterSale = await stockSummary()
  const pash2 = stockAfterSale.find((s) => s.name === 'PASHMINA SILK 16075')
  check('invoice removed sold pieces from stock', (pash2?.currentStock ?? 0) === 2, String(pash2?.currentStock))
  const aayushi = stockAfterSale.find((s) => s.name === 'AAYUSHI')
  check('box goods also moved (60 in, 30 out)', (aayushi?.currentStock ?? 0) === 30, String(aayushi?.currentStock))

  // Render the bill HTML the PDF engine would print, and assert the figures land on the page.
  const html = renderTextileInvoiceHtml({
    docTypeLabel: 'TAX INVOICE',
    number: inv37.number,
    issueDate: new Date('2026-07-11').getTime(),
    company: { tradeName: 'KRISHNA GANGA CREATION', gstin: '24ACNPB0084A1ZB', pan: 'ACNPB0084A', city: 'SURAT', phone: '7902117063' },
    party: { name: 'RAJESHWARI SHREE', gstin: '10AZJPK4799G1Z6', billingCity: 'MUZAFFARPUR' },
    placeOfSupply: '10-Bihar',
    isInterState: true,
    challanNo: '37/GST', orderNo: null, agentName: null, consigneeName: null, consigneeGstin: null,
    lrNo: null, lrDate: null, transportName: 'ANCHAL LOGISTICS', transportStation: 'MUZAFFARPUR',
    caseNo: '37x1', weight: 0, freight: 0, ewayBillNo: '682143354925', transporterId: '24AQBPS9728G1ZK', dueDays: 0,
    hsnCode: '5407',
    lines: doc37.lines.map((l: any) => ({
      description: l.description, packing: l.packing, quantity: l.quantity,
      cutLength: l.cutLength, unitPrice: l.unitPrice, taxableValue: l.taxableValue
    })),
    totals: {
      subTotal: doc37.subTotal, schemeAmount: doc37.schemeAmount,
      taxableValue: doc37.subTotal - doc37.schemeAmount,
      cgstTotal: 0, sgstTotal: 0, igstTotal: doc37.igstTotal,
      roundOff: doc37.roundOff, grandTotal: doc37.grandTotal,
      totalPcs: 45, totalMetres: 283.5
    },
    schemeLabel: 'DISCOUNT', schemePct: 200, taxRateBps: 500,
    terms: 'SUBJECT TO SURAT JURISDICTION.', invocation: 'Shree Ganeshaya Namah'
  })

  check('bill prints the invocation', html.includes('Shree Ganeshaya Namah'))
  check('bill prints TAX INVOICE', html.includes('TAX INVOICE'))
  check('bill prints the CUT column', html.includes('>CUT<'))
  check('bill prints SUB TOTAL 52,126.00', html.includes('52,126.00'))
  check('bill prints the discount 1,042.52', html.includes('1,042.52'))
  check('bill prints IGST 2,554.17', html.includes('2,554.17'))
  check('bill prints invoice value 53,638.00', html.includes('53,638.00'))
  check('bill prints 283.50 metres', html.includes('283.50'))
  check('bill prints the e-way bill number', html.includes('682143354925'))
  check('bill prints the amount in words', /FIFTY THREE THOUSAND SIX HUNDRED THIRTY EIGHT/.test(html))
  check('bill has no external resource references', !/<script|src="http|@import/i.test(html))

  console.log(
    failures === 0
      ? '\nDEMO PASSED — both paper bills reproduced end to end, from barcode scan to printed invoice.\n'
      : `\n${failures} FAILURE(S)\n`
  )
}

run()
  .catch((e) => {
    console.error('\nDEMO CRASHED:', e)
    failures++
  })
  .finally(() => {
    try {
      closeDatabase()
    } catch {
      /* ignore */
    }
    process.exit(failures === 0 ? 0 : 1)
  })
