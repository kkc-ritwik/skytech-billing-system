/**
 * Populates the APP'S REAL database with the demo dataset: the firm, the buyer,
 * the 21 designs from the two bills, generated barcodes and opening stock.
 *
 * This is a convenience for trying the system out — it writes into
 * %APPDATA%/shailee-grms/ledgerline.db. Nothing here is required to run the
 * app; delete the parties/items from the UI to clear it, or delete the database
 * file to start completely fresh.
 *
 * Run via: npm run demo:seed
 */
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
const dbPath = process.env.LEDGERLINE_DB_PATH ?? join(appData, 'shailee-grms', 'ledgerline.db')
process.env.LEDGERLINE_DB_PATH = dbPath

console.log(`Seeding demo data into:\n  ${dbPath}\n`)
if (!existsSync(dbPath)) {
  console.log('(database does not exist yet — it will be created and migrated)')
}

import { migrate } from 'drizzle-orm/libsql/migrator'
import { initDatabase, getDb, closeDatabase } from '../src/main/db/client'
import { seedDefaults } from '../src/main/services/seed'
import { bootstrap } from '../src/main/services/auth'
import { saveItem } from '../src/main/services/items'
import { saveParty } from '../src/main/services/parties'
import { savePurchaseDoc } from '../src/main/services/purchases'
import { saveCompany, setSettings, getCompany } from '../src/main/services/settings'
import { assignMissingBarcodes } from '../src/main/services/barcode'
import { eq } from 'drizzle-orm'
import { users, items as itemsTable, taxRates as taxRatesTable } from '../src/main/db/schema'
import { toPaise } from '../src/shared/money'
import type { AuthUser } from '../src/shared/ipc'

const CUT = 6.3

const DESIGNS: [string, number, number, string | null][] = [
  ['PASHMINA SILK 16075', 2, 1675, null],
  ['44 O. SILK D.NO-22040', 2, 2240, null],
  ['PASHMINA SILK 13098', 6, 1398, null],
  ['BRASO RICH PALLU 1407', 6, 853, null],
  ['BRASO RICH PALLU 1414', 6, 890, null],
  ['RANGLORI SILK 11050', 6, 1150, null],
  ['BANARSI SATIN 11000', 6, 1190, null],
  ['DOLA MINA SILK 8040', 1, 840, null],
  ['DOLA MINA SILK 8050', 1, 850, null],
  ['DOLA MINA SILK 8070', 1, 870, null],
  ['DOLA MINA SILK 8090', 1, 890, null],
  ['DOLA MINA SILK 8095', 2, 895, null],
  ['DOLA MINA SILK 8075', 1, 875, null],
  ['DOLA MINA SILK 8080', 1, 880, null],
  ['DOLA MINA SILK 11020', 2, 1120, null],
  ['BANARSI TISSUE 21075', 1, 2175, null],
  ['AAYUSHI', 30, 320, 'BOX'],
  ['FLASH LIGHT (HIMANEE)', 8, 595, 'BOX'],
  ['NATKHAT GUDIA (HIMANEE)', 16, 720, 'BOX'],
  ['GUJARATI (HIMANEE)', 12, 898, 'BOX'],
  ['GOLD COVERING (HIMANEE)', 6, 798, 'BOX']
]

async function run(): Promise<void> {
  const db = await initDatabase()
  // Use drizzle's migrator, exactly as the app does on startup. Applying the
  // raw .sql files here instead would change the schema without recording it in
  // the migration bookkeeping table, and the app would then try to re-apply the
  // same migration and fail with "duplicate column name".
  await migrate(db, { migrationsFolder: join(root, 'src/main/db/migrations') })
  await seedDefaults()

  // Reuse the existing owner if the app has already been set up, so this never
  // clobbers a real account or creates a second one.
  let actor: AuthUser
  const existing = await getDb().select().from(users).limit(1).get()
  if (existing) {
    actor = {
      id: existing.id,
      username: existing.username,
      fullName: existing.fullName,
      role: existing.role,
      mustChangePassword: false
    } as AuthUser
    console.log(`Using existing account "${existing.username}" for audit attribution.`)
  } else {
    const bs = await bootstrap({
      fullName: 'Demo Owner',
      username: 'owner',
      password: 'Passw0rd1'
    })
    actor = bs.session.user
    console.log('Created a first-run account:')
    console.log('    username: owner')
    console.log('    password: Passw0rd1     <-- CHANGE THIS')
    console.log(`    recovery code: ${bs.recoveryCode}`)
  }

  if (!(await getCompany())?.gstin) {
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
      actor
    )
    console.log('Company profile saved.')
  }

  await setSettings(
    {
      invoiceTemplate: 'textile',
      invoiceInvocation: 'Shree Ganeshaya Namah',
      defaultSchemeLabel: 'DISCOUNT',
      defaultSchemePct: 200,
      defaultCutLength: CUT,
      defaultTransportName: 'ANCHAL LOGISTICS'
    },
    actor
  )

  // Textiles under HSN 5407 are taxed at 5%. Link the seeded rate rather than
  // leaving taxRateId null, which would bill every line at 0% GST.
  const gst5 = await getDb().select().from(taxRatesTable).where(eq(taxRatesTable.rateBps, 500)).get()
  if (!gst5) throw new Error('GST 5% tax rate missing — seedDefaults did not run.')

  const before = await getDb().select().from(itemsTable)
  const existingNames = new Set(before.map((i) => i.name))

  const created: string[] = []
  for (const [name, , rate, packing] of DESIGNS) {
    if (existingNames.has(name)) continue
    await saveItem(
      {
        sku: name.replace(/[^A-Z0-9]+/gi, '-').toUpperCase().slice(0, 40),
        name,
        hsnCode: '5407',
        purchasePrice: toPaise(Math.round(rate * 0.8)),
        sellingPrice: toPaise(rate),
        sellingPriceIsInclusive: false,
        trackInventory: true,
        reorderLevel: 2,
        openingStock: 0,
        openingStockValue: 0,
        cutLength: CUT,
        packing,
        isActive: true,
        taxRateId: gst5.id,
        unitId: null,
        categoryId: null,
        description: null,
        barcode: null
      } as never,
      actor
    )
    created.push(name)
  }
  console.log(`Items: ${created.length} created, ${DESIGNS.length - created.length} already present.`)

  const { assigned } = await assignMissingBarcodes(actor)
  console.log(`Barcodes: ${assigned.length} generated.`)

  let buyerId: string
  const buyer = await saveParty(
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
    actor
  )
  buyerId = buyer
  console.log('Buyer RAJESHWARI SHREE ready.')

  // Stock in, so the counter has something to sell.
  if (created.length) {
    const vendorId = await saveParty(
      { partyType: 'vendor', name: 'MILL SUPPLIER', creditLimit: 0, creditDays: 0, openingBalance: 0, isActive: true } as never,
      actor
    )
    const all = await getDb().select().from(itemsTable)
    const idOf = new Map(all.map((i) => [i.name, i.id]))
    await savePurchaseDoc(
      {
        docType: 'grn',
        partyId: vendorId,
        issueDate: Date.now(),
        isInterState: false,
        extraCharges: 0,
        extraDiscount: 0,
        lines: DESIGNS.map(([name, pcs, rate]) => ({
          itemId: idOf.get(name)!,
          description: name,
          hsnCode: '5407',
          quantity: pcs * 4,
          unitPrice: toPaise(Math.round(rate * 0.8)),
          discountPct: 0,
          discountAmount: 0,
          taxRateBps: 500
        }))
      } as never,
      actor
    )
    console.log('Opening stock received via GRN.')
  }

  // Print a few barcodes so they can be tested immediately.
  const withCodes = await getDb().select().from(itemsTable)
  console.log('\nScan-ready barcodes (type one into the POS box and press Enter):')
  for (const it of withCodes.filter((i) => i.barcode).slice(0, 6)) {
    console.log(`   ${it.barcode}   ${it.name}`)
  }
  console.log(`\nBuyer id: ${buyerId}`)
  console.log('\nDone. Start the app with "npm run dev".\n')
}

run()
  .catch((e) => {
    console.error('Seeding failed:', e)
    process.exitCode = 1
  })
  .finally(() => {
    try {
      closeDatabase()
    } catch {
      /* ignore */
    }
  })
