import { and, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { items, units, taxRates, itemCategories, stockLedger } from '../db/schema'
import { itemInputSchema, type ItemInput } from '@shared/dto'
import type { AuthUser } from '@shared/ipc'
import { audit } from './audit'

export interface ItemListRow {
  id: string
  sku: string
  name: string
  hsnCode: string | null
  unitSymbol: string | null
  taxName: string | null
  taxRateBps: number | null
  categoryName: string | null
  purchasePrice: number
  sellingPrice: number
  sellingPriceIsInclusive: boolean
  trackInventory: boolean
  reorderLevel: number
  currentStock: number
  isActive: boolean
}

/** Current stock per item = opening stock + sum of ledger movements. */
async function stockMap(): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ itemId: stockLedger.itemId, qty: sql<number>`sum(${stockLedger.qtyDelta})` })
    .from(stockLedger)
    .groupBy(stockLedger.itemId)
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.itemId, Number(r.qty) || 0)
  return m
}

export async function listItems(filter?: { search?: string; activeOnly?: boolean }): Promise<ItemListRow[]> {
  const conds = [isNull(items.deletedAt)]
  if (filter?.activeOnly) conds.push(eq(items.isActive, true))
  if (filter?.search) {
    const q = `%${filter.search}%`
    conds.push(or(like(items.name, q), like(items.sku, q), like(items.barcode, q))!)
  }
  const rows = await getDb()
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      hsnCode: items.hsnCode,
      unitSymbol: units.symbol,
      taxName: taxRates.name,
      taxRateBps: taxRates.rateBps,
      categoryName: itemCategories.name,
      purchasePrice: items.purchasePrice,
      sellingPrice: items.sellingPrice,
      sellingPriceIsInclusive: items.sellingPriceIsInclusive,
      trackInventory: items.trackInventory,
      reorderLevel: items.reorderLevel,
      isActive: items.isActive
    })
    .from(items)
    .leftJoin(units, eq(items.unitId, units.id))
    .leftJoin(taxRates, eq(items.taxRateId, taxRates.id))
    .leftJoin(itemCategories, eq(items.categoryId, itemCategories.id))
    .where(and(...conds))
    .orderBy(desc(items.createdAt))

  const stock = await stockMap()
  return rows.map((r) => ({ ...r, currentStock: stock.get(r.id) ?? 0 }))
}

export async function getItem(id: string) {
  return getDb().select().from(items).where(eq(items.id, id)).get()
}

export async function saveItem(input: ItemInput, user: AuthUser): Promise<string> {
  const data = itemInputSchema.parse(input)
  const db = getDb()
  const now = new Date()

  // Enforce unique SKU among non-deleted items.
  const clash = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.sku, data.sku), isNull(items.deletedAt)))
    .get()
  if (clash && clash.id !== data.id) {
    const err = new Error(`An item with SKU "${data.sku}" already exists.`) as Error & { code: string }
    err.code = 'CONFLICT'
    throw err
  }

  if (data.id) {
    await db
      .update(items)
      .set({
        sku: data.sku,
        name: data.name,
        description: data.description ?? null,
        categoryId: data.categoryId || null,
        unitId: data.unitId || null,
        hsnCode: data.hsnCode ?? null,
        taxRateId: data.taxRateId || null,
        purchasePrice: data.purchasePrice,
        sellingPrice: data.sellingPrice,
        sellingPriceIsInclusive: data.sellingPriceIsInclusive,
        trackInventory: data.trackInventory,
        reorderLevel: data.reorderLevel,
        barcode: data.barcode ?? null,
        isActive: data.isActive,
        updatedAt: now
      })
      .where(eq(items.id, data.id))
    await audit({ userId: user.id, username: user.username, action: 'item.update', entityType: 'item', entityId: data.id })
    return data.id
  }

  const row = await db
    .insert(items)
    .values({
      sku: data.sku,
      name: data.name,
      description: data.description ?? null,
      categoryId: data.categoryId || null,
      unitId: data.unitId || null,
      hsnCode: data.hsnCode ?? null,
      taxRateId: data.taxRateId || null,
      purchasePrice: data.purchasePrice,
      sellingPrice: data.sellingPrice,
      sellingPriceIsInclusive: data.sellingPriceIsInclusive,
      trackInventory: data.trackInventory,
      reorderLevel: data.reorderLevel,
      openingStock: data.openingStock,
      openingStockValue: data.openingStockValue,
      barcode: data.barcode ?? null,
      isActive: data.isActive
    })
    .returning({ id: items.id })
    .get()

  // Seed opening stock as a ledger movement so valuation stays consistent.
  if (data.trackInventory && data.openingStock > 0) {
    const unitCost = data.openingStock > 0 ? Math.round(data.openingStockValue / data.openingStock) : 0
    await db.insert(stockLedger).values({
      itemId: row.id,
      movementType: 'opening',
      qtyDelta: data.openingStock,
      unitCost,
      refType: 'opening',
      note: 'Opening stock',
      occurredAt: now,
      createdBy: user.id,
      createdAt: now
    })
  }

  await audit({ userId: user.id, username: user.username, action: 'item.create', entityType: 'item', entityId: row.id })
  return row.id
}

export async function deleteItem(id: string, user: AuthUser): Promise<void> {
  await getDb().update(items).set({ deletedAt: new Date(), isActive: false }).where(eq(items.id, id))
  await audit({ userId: user.id, username: user.username, action: 'item.delete', entityType: 'item', entityId: id })
}

/** Reference data for item forms (dropdowns). */
export async function itemRefs() {
  const db = getDb()
  const [u, t, c] = await Promise.all([
    db.select({ id: units.id, name: units.name, symbol: units.symbol }).from(units),
    db.select({ id: taxRates.id, name: taxRates.name, rateBps: taxRates.rateBps }).from(taxRates).where(eq(taxRates.isActive, true)),
    db.select({ id: itemCategories.id, name: itemCategories.name }).from(itemCategories)
  ])
  return { units: u, taxRates: t, categories: c }
}
