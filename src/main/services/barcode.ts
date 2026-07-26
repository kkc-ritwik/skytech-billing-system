import { and, eq, isNull, sql, inArray, like, or } from 'drizzle-orm'
import { getDb } from '../db/client'
import { items, taxRates, stockLedger } from '../db/schema'
import { buildBarcode, normaliseScan, code128Svg, isValidInternalBarcode } from '@shared/barcode'
import type { AuthUser } from '@shared/ipc'
import { audit } from './audit'
import { getCompany, getSettings } from './settings'

/**
 * Barcode assignment and scan resolution.
 *
 * One barcode per item/design (not per physical piece): scanning the same code
 * repeatedly at the counter increments PCS on the line, which matches how the
 * trade's bills group stock by quality/design.
 */

/** Highest internal sequence already issued, so numbering never collides. */
async function nextSequence(): Promise<number> {
  const rows = await getDb()
    .select({ barcode: items.barcode })
    .from(items)
    .where(and(isNull(items.deletedAt), like(items.barcode, '22%')))

  let max = 0
  for (const r of rows) {
    if (!r.barcode || !isValidInternalBarcode(r.barcode)) continue
    // Strip the "22" prefix and the trailing check digit to recover the counter.
    const seq = Number(r.barcode.slice(2, -1))
    if (Number.isFinite(seq) && seq > max) max = seq
  }
  return max + 1
}

/**
 * Give every barcode-less active item a fresh internal barcode.
 * Returns what was assigned so the UI can offer to print those labels.
 */
export async function assignMissingBarcodes(
  user: AuthUser
): Promise<{ assigned: { id: string; sku: string; name: string; barcode: string }[] }> {
  const db = getDb()
  const pending = await db
    .select({ id: items.id, sku: items.sku, name: items.name })
    .from(items)
    .where(and(isNull(items.deletedAt), eq(items.isActive, true), or(isNull(items.barcode), eq(items.barcode, ''))!))

  let seq = await nextSequence()
  const assigned: { id: string; sku: string; name: string; barcode: string }[] = []

  for (const it of pending) {
    const barcode = buildBarcode(seq++)
    await db.update(items).set({ barcode, updatedAt: new Date() }).where(eq(items.id, it.id))
    assigned.push({ ...it, barcode })
  }

  if (assigned.length) {
    await audit({
      userId: user.id,
      username: user.username,
      action: 'item.barcode.assign',
      entityType: 'item',
      details: { count: assigned.length }
    })
  }
  return { assigned }
}

/** Issue a barcode for one item, replacing any existing code. */
export async function generateBarcodeFor(itemId: string, user: AuthUser): Promise<{ barcode: string }> {
  const db = getDb()
  const item = await db.select({ id: items.id }).from(items).where(eq(items.id, itemId)).get()
  if (!item) throw Object.assign(new Error('Item not found.'), { code: 'NOT_FOUND' })

  const barcode = buildBarcode(await nextSequence())
  await db.update(items).set({ barcode, updatedAt: new Date() }).where(eq(items.id, itemId))
  await audit({ userId: user.id, username: user.username, action: 'item.barcode.generate', entityType: 'item', entityId: itemId })
  return { barcode }
}

export interface ScanResult {
  id: string
  sku: string
  name: string
  barcode: string | null
  hsnCode: string | null
  sellingPrice: number
  sellingPriceIsInclusive: boolean
  taxRateBps: number
  cutLength: number
  packing: string | null
  trackInventory: boolean
  stockOnHand: number
}

/**
 * Resolve a scanned code to an item. Scanners act as keyboard wedges, so the
 * raw string may carry a trailing newline. We fall back to SKU so the same box
 * works when an operator types a code by hand instead of scanning.
 */
export async function resolveScan(rawCode: string): Promise<ScanResult | null> {
  const code = normaliseScan(rawCode)
  if (!code) return null

  const db = getDb()
  const row = await db
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      barcode: items.barcode,
      hsnCode: items.hsnCode,
      sellingPrice: items.sellingPrice,
      sellingPriceIsInclusive: items.sellingPriceIsInclusive,
      trackInventory: items.trackInventory,
      cutLength: items.cutLength,
      packing: items.packing,
      rateBps: taxRates.rateBps
    })
    .from(items)
    .leftJoin(taxRates, eq(items.taxRateId, taxRates.id))
    .where(
      and(
        isNull(items.deletedAt),
        eq(items.isActive, true),
        or(eq(items.barcode, code), eq(items.sku, code))!
      )
    )
    .get()

  if (!row) return null

  const agg = await db
    .select({ sum: sql<number>`coalesce(sum(${stockLedger.qtyDelta}), 0)` })
    .from(stockLedger)
    .where(eq(stockLedger.itemId, row.id))
    .get()

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    barcode: row.barcode,
    hsnCode: row.hsnCode,
    sellingPrice: row.sellingPrice,
    sellingPriceIsInclusive: !!row.sellingPriceIsInclusive,
    taxRateBps: row.rateBps ?? 0,
    cutLength: row.cutLength ?? 0,
    packing: row.packing,
    trackInventory: !!row.trackInventory,
    stockOnHand: Number(agg?.sum ?? 0)
  }
}

export interface PosContext {
  /** Company state code — decides IGST vs CGST/SGST at the counter. */
  companyStateCode: string | null
  defaultSchemeLabel: string
  defaultSchemePct: number // basis points
  defaultCutLength: number
  defaultTransportName: string | null
}

/**
 * Everything the counter screen needs before the first scan.
 *
 * This exists as its own route because an Operator — the role that actually
 * works the POS — deliberately has no `settings:view`. Without it the screen
 * could not read the company state code and would silently bill intra-state
 * GST on inter-state sales. Gated on `sales:create` and returns nothing else.
 */
export async function posContext(): Promise<PosContext> {
  const company = await getCompany()
  const s = await getSettings()

  const numeric = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

  return {
    companyStateCode: company?.stateCode ?? null,
    defaultSchemeLabel: typeof s.defaultSchemeLabel === 'string' ? s.defaultSchemeLabel : 'DISCOUNT',
    defaultSchemePct: numeric(s.defaultSchemePct, 0),
    defaultCutLength: numeric(s.defaultCutLength, 0),
    defaultTransportName: typeof s.defaultTransportName === 'string' ? s.defaultTransportName : null
  }
}

export interface LabelRequest {
  itemIds: string[]
  /** Labels printed per item — normally one per piece in stock. */
  copies?: number
  /** Show the selling price on the label. */
  showPrice?: boolean
}

/**
 * Build the HTML for a sheet of barcode labels (65 per A4 sheet, the common
 * 38.1 x 21.2 mm address-label stock). Rendered to PDF by the pdf service.
 */
export async function renderLabelSheetHtml(req: LabelRequest): Promise<string> {
  const ids = req.itemIds.filter(Boolean)
  if (!ids.length) throw Object.assign(new Error('Select at least one item to print labels for.'), { code: 'VALIDATION' })

  const rows = await getDb()
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      barcode: items.barcode,
      sellingPrice: items.sellingPrice,
      cutLength: items.cutLength
    })
    .from(items)
    .where(inArray(items.id, ids))

  const missing = rows.filter((r) => !r.barcode)
  if (missing.length) {
    throw Object.assign(
      new Error(`${missing.length} selected item(s) have no barcode yet. Generate barcodes first.`),
      { code: 'VALIDATION' }
    )
  }

  const copies = Math.max(1, Math.min(200, req.copies ?? 1))
  const esc = (s: unknown): string =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

  const cells: string[] = []
  for (const r of rows) {
    for (let i = 0; i < copies; i++) {
      cells.push(`<div class="label">
        <div class="nm">${esc(r.name)}</div>
        <div class="bc">${code128Svg(r.barcode!, { moduleWidth: 1.1, height: 26, fontSize: 7, quietZone: 6 })}</div>
        <div class="ft">
          <span>${esc(r.sku)}</span>
          ${req.showPrice !== false ? `<span>&#8377;${(r.sellingPrice / 100).toFixed(2)}</span>` : ''}
        </div>
      </div>`)
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 8mm 5mm; }
    * { box-sizing: border-box; }
    body { margin:0; font-family:'Segoe UI',Arial,sans-serif; }
    .sheet { display:grid; grid-template-columns:repeat(5, 38.1mm); grid-auto-rows:21.2mm; gap:0; }
    .label { padding:1mm; display:flex; flex-direction:column; align-items:center;
             justify-content:center; overflow:hidden; page-break-inside:avoid; }
    .nm { font-size:6pt; font-weight:600; line-height:1.1; text-align:center; max-height:2.2em;
          overflow:hidden; width:100%; }
    .bc svg { display:block; max-width:100%; height:auto; }
    .ft { display:flex; justify-content:space-between; width:100%; font-size:5.5pt; padding:0 1mm; }
  </style></head><body><div class="sheet">${cells.join('')}</div></body></html>`
}
