import { desc, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from '../db/client'
import { items, units, stockLedger, stockAdjustments, stockAdjustmentLines } from '../db/schema'
import { stockAdjustmentInputSchema, type StockAdjustmentInput } from '@shared/dto'
import type { AuthUser } from '@shared/ipc'
import { nextDocumentNumber } from './sequences'
import { audit } from './audit'

export interface StockRow {
  id: string
  sku: string
  name: string
  unitSymbol: string | null
  currentStock: number
  reorderLevel: number
  stockValue: number
  isLow: boolean
}

export async function stockSummary(): Promise<StockRow[]> {
  const itemRows = await getDb()
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      unitSymbol: units.symbol,
      reorderLevel: items.reorderLevel
    })
    .from(items)
    .leftJoin(units, eq(items.unitId, units.id))
    .where(isNull(items.deletedAt))

  const ledger = await getDb()
    .select({
      itemId: stockLedger.itemId,
      qty: sql<number>`sum(${stockLedger.qtyDelta})`,
      value: sql<number>`sum(${stockLedger.qtyDelta} * ${stockLedger.unitCost})`
    })
    .from(stockLedger)
    .groupBy(stockLedger.itemId)

  const map = new Map(ledger.map((l) => [l.itemId, { qty: Number(l.qty) || 0, value: Number(l.value) || 0 }]))
  return itemRows.map((r) => {
    const agg = map.get(r.id) ?? { qty: 0, value: 0 }
    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      unitSymbol: r.unitSymbol,
      currentStock: agg.qty,
      reorderLevel: r.reorderLevel,
      stockValue: Math.round(agg.value),
      isLow: agg.qty <= r.reorderLevel
    }
  })
}

/** Batch-wise stock with nearest expiry (remaining = net of all movements). */
export async function expiryReport() {
  const rows = await getDb()
    .select({
      itemId: stockLedger.itemId,
      itemName: items.name,
      sku: items.sku,
      unitSymbol: units.symbol,
      batchNo: stockLedger.batchNo,
      remaining: sql<number>`sum(${stockLedger.qtyDelta})`,
      expiry: sql<number>`min(${stockLedger.expiryDate})`
    })
    .from(stockLedger)
    .innerJoin(items, eq(stockLedger.itemId, items.id))
    .leftJoin(units, eq(items.unitId, units.id))
    .where(sql`${stockLedger.batchNo} is not null`)
    .groupBy(stockLedger.itemId, stockLedger.batchNo)
  const now = Date.now()
  return rows
    .map((r) => {
      const remaining = Number(r.remaining) || 0
      const expiry = r.expiry ? Number(r.expiry) : null
      const daysToExpiry = expiry ? Math.floor((expiry - now) / 86400000) : null
      return { ...r, remaining, expiry, daysToExpiry }
    })
    .filter((r) => r.remaining > 0.0001)
    .sort((a, b) => (a.expiry ?? Infinity) - (b.expiry ?? Infinity))
}

export async function itemLedger(itemId: string) {
  return getDb()
    .select()
    .from(stockLedger)
    .where(eq(stockLedger.itemId, itemId))
    .orderBy(desc(stockLedger.occurredAt))
    .limit(500)
}

export async function createAdjustment(input: StockAdjustmentInput, user: AuthUser): Promise<{ id: string; number: string }> {
  const d = stockAdjustmentInputSchema.parse(input)
  const at = new Date(d.adjustedAt)
  const result = await getDb().transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, 'stock_adjustment', at)
    const adj = await tx
      .insert(stockAdjustments)
      .values({ number, reason: d.reason, note: d.note ?? null, adjustedAt: at, createdBy: user.id, createdAt: new Date() })
      .returning({ id: stockAdjustments.id })
      .get()

    for (const l of d.lines) {
      await tx.insert(stockAdjustmentLines).values({ adjustmentId: adj.id, itemId: l.itemId, qtyDelta: l.qtyDelta, unitCost: l.unitCost })
      await tx.insert(stockLedger).values({
        itemId: l.itemId,
        movementType: 'adjustment',
        qtyDelta: l.qtyDelta,
        unitCost: l.unitCost,
        refType: 'adjustment',
        refId: adj.id,
        refNumber: number,
        note: d.reason,
        occurredAt: at,
        createdBy: user.id,
        createdAt: new Date()
      })
    }
    return { id: adj.id, number }
  })

  await audit({ userId: user.id, username: user.username, action: 'inventory.adjust', entityType: 'stock_adjustment', entityId: result.id })
  return result
}
