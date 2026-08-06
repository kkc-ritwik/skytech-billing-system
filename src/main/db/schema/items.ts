import { integer, real, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { id, timestamps, softDelete } from './common'

/** Tax rates master (GST slabs: 0, 5, 12, 18, 28). Rate stored in basis points
 *  (e.g. 18% = 1800) to stay integer-exact. */
export const taxRates = sqliteTable(
  'tax_rates',
  {
    id: id(),
    name: text('name').notNull(), // "GST 18%"
    rateBps: integer('rate_bps').notNull(), // 1800 = 18.00%
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps
  },
  (t) => ({ rateUq: uniqueIndex('tax_rate_uq').on(t.rateBps) })
)

export const itemCategories = sqliteTable('item_categories', {
  id: id(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  ...timestamps
})

/** Units of measure (Pcs, Box, Kg, Litre...). */
export const units = sqliteTable(
  'units',
  {
    id: id(),
    name: text('name').notNull(), // "Pieces"
    symbol: text('symbol').notNull(), // "PCS"
    ...timestamps
  },
  (t) => ({ symUq: uniqueIndex('unit_symbol_uq').on(t.symbol) })
)

export const items = sqliteTable(
  'items',
  {
    id: id(),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    categoryId: text('category_id').references(() => itemCategories.id),
    unitId: text('unit_id').references(() => units.id),
    hsnCode: text('hsn_code'), // HSN/SAC for GST
    taxRateId: text('tax_rate_id').references(() => taxRates.id),
    // Prices in paise
    purchasePrice: integer('purchase_price').notNull().default(0),
    /**
     * Margin over the purchase rate, in basis points (4500 = 45%).
     *
     * Kept on the item so that the next time it is bought, the purchase screen
     * can offer the same margin it was priced at last time instead of the buyer
     * recalculating it from memory.
     */
    marginBps: integer('margin_bps').notNull().default(0),
    sellingPrice: integer('selling_price').notNull().default(0),
    // true => sellingPrice already includes tax (MRP-style)
    sellingPriceIsInclusive: integer('selling_price_is_inclusive', { mode: 'boolean' })
      .notNull()
      .default(false),
    // Inventory control
    trackInventory: integer('track_inventory', { mode: 'boolean' }).notNull().default(true),
    reorderLevel: real('reorder_level').notNull().default(0),
    openingStock: real('opening_stock').notNull().default(0),
    openingStockValue: integer('opening_stock_value').notNull().default(0), // paise
    barcode: text('barcode'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),

    // ---- Textile trade attributes ----
    // Metres in one piece (the "CUT", e.g. a 6.30 m saree cut). Total metres on
    // an invoice line is derived as PCS x CUT — never entered by hand.
    cutLength: real('cut_length').notNull().default(0),
    // Packing presentation shown on the invoice instead of CUT ("BOX", "BALE").
    packing: text('packing'),

    ...timestamps,
    ...softDelete
  },
  (t) => ({
    skuUq: uniqueIndex('item_sku_uq').on(t.sku),
    nameIdx: index('item_name_idx').on(t.name),
    barcodeUq: uniqueIndex('item_barcode_uq').on(t.barcode)
  })
)

export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert
export type TaxRate = typeof taxRates.$inferSelect
export type Unit = typeof units.$inferSelect
