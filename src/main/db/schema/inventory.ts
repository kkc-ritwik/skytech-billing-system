import { integer, real, sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { id } from './common'
import { items } from './items'
import { users } from './auth'

/**
 * Append-only stock movement ledger. Current stock for an item is SUM(qtyDelta).
 * Every movement points back to the document that caused it (GRN, invoice,
 * return, adjustment) for full traceability. Nothing here is ever updated;
 * corrections are new compensating rows.
 *
 * qtyDelta: positive = stock in, negative = stock out.
 * movementType: grn | sales_invoice | sales_return | purchase_return |
 *               adjustment | opening
 */
export const stockLedger = sqliteTable(
  'stock_ledger',
  {
    id: id(),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),
    movementType: text('movement_type').notNull(),
    qtyDelta: real('qty_delta').notNull(),
    // Per-unit cost in paise at time of movement (for valuation / COGS).
    unitCost: integer('unit_cost').notNull().default(0),
    // Optional batch / expiry for batch-wise stock & expiry tracking.
    batchNo: text('batch_no'),
    expiryDate: integer('expiry_date', { mode: 'timestamp_ms' }),
    refType: text('ref_type'), // source document type
    refId: text('ref_id'), // source document id
    refNumber: text('ref_number'), // human-readable doc number
    note: text('note'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
  },
  (t) => ({
    itemIdx: index('stock_ledger_item_idx').on(t.itemId),
    refIdx: index('stock_ledger_ref_idx').on(t.refType, t.refId)
  })
)

/**
 * Manual stock adjustment header (damage, expiry, physical count). Each
 * adjustment line writes a row into stockLedger with movementType='adjustment'.
 */
export const stockAdjustments = sqliteTable('stock_adjustments', {
  id: id(),
  number: text('number').notNull(),
  reason: text('reason').notNull(), // damage | expiry | count_correction | other
  note: text('note'),
  adjustedAt: integer('adjusted_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export const stockAdjustmentLines = sqliteTable(
  'stock_adjustment_lines',
  {
    id: id(),
    adjustmentId: text('adjustment_id')
      .notNull()
      .references(() => stockAdjustments.id),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id),
    qtyDelta: real('qty_delta').notNull(), // +/-
    unitCost: integer('unit_cost').notNull().default(0)
  },
  (t) => ({ adjIdx: index('stock_adj_line_idx').on(t.adjustmentId) })
)

export type StockLedgerRow = typeof stockLedger.$inferSelect
