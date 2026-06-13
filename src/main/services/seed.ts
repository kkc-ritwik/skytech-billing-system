import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { taxRates, units, settings, companies } from '../db/schema'

/** Idempotent seed of reference data. Runs after migrations on every startup. */
export async function seedDefaults(): Promise<void> {
  const db = getDb()

  if (!(await db.select({ id: taxRates.id }).from(taxRates).limit(1).get())) {
    await db.insert(taxRates).values(
      [0, 500, 1200, 1800, 2800].map((bps) => ({
        name: `GST ${bps / 100}%`,
        rateBps: bps
      }))
    )
  }

  if (!(await db.select({ id: units.id }).from(units).limit(1).get())) {
    await db.insert(units).values([
      { name: 'Pieces', symbol: 'PCS' },
      { name: 'Box', symbol: 'BOX' },
      { name: 'Dozen', symbol: 'DZN' },
      { name: 'Set', symbol: 'SET' },
      { name: 'Kilogram', symbol: 'KG' },
      { name: 'Litre', symbol: 'LTR' },
      { name: 'Metre', symbol: 'MTR' },
      { name: 'Pack', symbol: 'PKT' }
    ])
  }

  if (!(await db.select({ id: companies.id }).from(companies).limit(1).get())) {
    await db.insert(companies).values({ legalName: 'My Company', country: 'India' })
  }

  const now = new Date()
  const defaults: Record<string, unknown> = {
    theme: 'light',
    paperSize: 'A4',
    lowStockAlerts: true,
    defaultTaxInclusive: false,
    preventNegativeStock: false
  }
  for (const [key, value] of Object.entries(defaults)) {
    const row = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get()
    if (!row) {
      await db.insert(settings).values({ key, value: JSON.stringify(value), updatedAt: now })
    }
  }
}
