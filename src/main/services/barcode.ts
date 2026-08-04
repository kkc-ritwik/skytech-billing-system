import { and, eq, isNull, sql, inArray, like, or } from 'drizzle-orm'
import { getDb } from '../db/client'
import { items, taxRates, stockLedger } from '../db/schema'
import { buildBarcode, normaliseScan, code128Svg, code128ModuleCount, isValidInternalBarcode } from '@shared/barcode'
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

export interface LabelLine {
  itemId: string
  copies: number
}

/**
 * How labels sit on the physical stock, all in millimetres so a shop can copy
 * the numbers straight off the label packet.
 */
export interface LabelSheet {
  pageWidthMm: number
  pageHeightMm: number
  marginTopMm: number
  marginRightMm: number
  marginBottomMm: number
  marginLeftMm: number
  labelWidthMm: number
  labelHeightMm: number
  columnGapMm: number
  rowGapMm: number
  showName: boolean
  showSku: boolean
  showPrice: boolean
  skipLabels: number
}

export interface LabelRequest {
  lines: LabelLine[]
  sheet: LabelSheet
}

/** A4, 65 address labels — the stock most Indian stationers carry. */
export const DEFAULT_LABEL_SHEET: LabelSheet = {
  pageWidthMm: 210,
  pageHeightMm: 297,
  marginTopMm: 8,
  marginRightMm: 5,
  marginBottomMm: 8,
  marginLeftMm: 5,
  labelWidthMm: 38.1,
  labelHeightMm: 21.2,
  columnGapMm: 0,
  rowGapMm: 0,
  showName: true,
  showSku: true,
  showPrice: true,
  skipLabels: 0
}

/**
 * How the requested labels tile onto the sheet.
 *
 * `moduleWidthMm` is the printed width of the narrowest bar. Scanners need
 * roughly 0.19 mm to read reliably, so this is what tells a shop that the label
 * size they typed is too small *before* they waste a sheet finding out.
 */
export interface LabelLayout {
  columns: number
  rows: number
  perSheet: number
  totalLabels: number
  sheets: number
  moduleWidthMm: number
  tooSmallToScan: boolean
}

/** Narrowest bar a typical handheld scanner reads dependably, in mm. */
export const MIN_SCANNABLE_MODULE_MM = 0.19

export function computeLabelLayout(sheet: LabelSheet, totalLabels: number, sampleBarcode = '220000000018'): LabelLayout {
  const usableW = sheet.pageWidthMm - sheet.marginLeftMm - sheet.marginRightMm
  const usableH = sheet.pageHeightMm - sheet.marginTopMm - sheet.marginBottomMm

  // n labels occupy n*w + (n-1)*gap. Solve for the largest n that still fits.
  const fit = (usable: number, size: number, gap: number): number =>
    size <= 0 ? 0 : Math.max(0, Math.floor((usable + gap) / (size + gap) + 1e-6))

  const columns = fit(usableW, sheet.labelWidthMm, sheet.columnGapMm)
  const rows = fit(usableH, sheet.labelHeightMm, sheet.rowGapMm)
  const perSheet = columns * rows
  const withSkips = totalLabels + Math.max(0, sheet.skipLabels)
  const sheets = perSheet > 0 ? Math.ceil(withSkips / perSheet) : 0

  // The barcode is drawn across the label minus a 1 mm padding either side.
  const barcodeWidthMm = Math.max(0, sheet.labelWidthMm - 2)
  const modules = code128ModuleCount(sampleBarcode, LABEL_QUIET_ZONE)
  const moduleWidthMm = modules > 0 ? barcodeWidthMm / modules : 0

  return {
    columns,
    rows,
    perSheet,
    totalLabels,
    sheets,
    moduleWidthMm,
    tooSmallToScan: moduleWidthMm > 0 && moduleWidthMm < MIN_SCANNABLE_MODULE_MM
  }
}

/** Quiet zone in modules. Code 128 requires 10; less and scanners struggle. */
const LABEL_QUIET_ZONE = 10

/**
 * Build the printable HTML for a run of barcode labels.
 *
 * Pagination is worked out here rather than left to the browser: each sheet is
 * an explicitly sized block with a forced page break, so what the shop sees in
 * the preview is exactly what comes out of the printer. `@page` carries the
 * sheet size in mm and the PDF is rendered with `preferCSSPageSize`, which is
 * what lets a 50 x 25 mm thermal roll and an A4 sheet share one code path.
 */
export async function renderLabelSheetHtml(req: LabelRequest): Promise<string> {
  const lines = (req.lines ?? []).filter((l) => l?.itemId && l.copies > 0)
  if (!lines.length) {
    throw Object.assign(new Error('Select at least one item to print labels for.'), { code: 'VALIDATION' })
  }
  const sheet = req.sheet ?? DEFAULT_LABEL_SHEET

  const rows = await getDb()
    .select({
      id: items.id,
      sku: items.sku,
      name: items.name,
      barcode: items.barcode,
      sellingPrice: items.sellingPrice
    })
    .from(items)
    .where(inArray(items.id, lines.map((l) => l.itemId)))

  const byId = new Map(rows.map((r) => [r.id, r]))
  const unknown = lines.filter((l) => !byId.has(l.itemId))
  if (unknown.length) {
    throw Object.assign(new Error(`${unknown.length} selected item(s) no longer exist.`), { code: 'VALIDATION' })
  }
  const missing = lines.filter((l) => !byId.get(l.itemId)!.barcode)
  if (missing.length) {
    const names = missing.slice(0, 3).map((l) => byId.get(l.itemId)!.name).join(', ')
    throw Object.assign(
      new Error(
        `${missing.length} selected item(s) have no barcode yet (${names}${missing.length > 3 ? '…' : ''}). ` +
          'Use "Generate barcodes" first.'
      ),
      { code: 'VALIDATION' }
    )
  }

  const esc = (v: unknown): string =>
    String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

  const layout = computeLabelLayout(sheet, lines.reduce((a, l) => a + l.copies, 0))
  if (layout.perSheet < 1) {
    throw Object.assign(
      new Error('No label fits on the sheet at these measurements. Check the sheet size, margins and label size.'),
      { code: 'VALIDATION' }
    )
  }

  // Geometry, in mm, inside one label.
  const padMm = 1
  const innerW = sheet.labelWidthMm - padMm * 2
  const innerH = sheet.labelHeightMm - padMm * 2
  const nameH = sheet.showName ? Math.min(4, innerH * 0.22) : 0
  const footH = sheet.showSku || sheet.showPrice ? Math.min(3.2, innerH * 0.18) : 0
  const barBandH = Math.max(2, innerH - nameH - footH)

  /**
   * The SVG carries a viewBox, so CSS decides its final size; only the aspect
   * ratio matters. Pick the bar height in user units that makes the symbol come
   * out `barBandH` mm tall once scaled to `innerW` mm wide.
   */
  function barcodeSvg(code: string): string {
    const mwUnits = 1
    const modules = code128ModuleCount(code, LABEL_QUIET_ZONE)
    const totalWUnits = modules * mwUnits
    const captionMm = Math.min(2.4, barBandH * 0.34)
    const scale = totalWUnits / innerW // user units per mm
    const fontUnits = captionMm * scale
    const barHeightUnits = (barBandH - captionMm) * scale
    return code128Svg(code, {
      moduleWidth: mwUnits,
      height: Math.max(1, barHeightUnits),
      fontSize: Math.max(1, fontUnits),
      quietZone: LABEL_QUIET_ZONE
    })
  }

  // Flatten to one cell per printed label, then chunk into sheets.
  const cells: string[] = []
  for (let i = 0; i < Math.max(0, sheet.skipLabels); i++) cells.push('<div class="label blank"></div>')
  for (const line of lines) {
    const r = byId.get(line.itemId)!
    const price = `&#8377;${(r.sellingPrice / 100).toFixed(2)}`
    const foot =
      sheet.showSku || sheet.showPrice
        ? `<div class="ft">${sheet.showSku ? `<span class="sku">${esc(r.sku)}</span>` : '<span></span>'}${
            sheet.showPrice ? `<span class="pr">${price}</span>` : ''
          }</div>`
        : ''
    const cell =
      `<div class="label">` +
      (sheet.showName ? `<div class="nm">${esc(r.name)}</div>` : '') +
      `<div class="bc">${barcodeSvg(r.barcode!)}</div>` +
      foot +
      `</div>`
    for (let i = 0; i < line.copies; i++) cells.push(cell)
  }

  const pages: string[] = []
  for (let i = 0; i < cells.length; i += layout.perSheet) {
    pages.push(`<div class="sheet">${cells.slice(i, i + layout.perSheet).join('')}</div>`)
  }

  const n = (v: number): string => String(Math.round(v * 1000) / 1000)

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${n(sheet.pageWidthMm)}mm ${n(sheet.pageHeightMm)}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin:0; padding:0; background:#fff; }
    body { font-family:'Segoe UI',Arial,sans-serif; -webkit-print-color-adjust:exact; }
    .sheet {
      width:${n(sheet.pageWidthMm)}mm; height:${n(sheet.pageHeightMm)}mm;
      padding:${n(sheet.marginTopMm)}mm ${n(sheet.marginRightMm)}mm ${n(sheet.marginBottomMm)}mm ${n(sheet.marginLeftMm)}mm;
      display:grid;
      grid-template-columns:repeat(${layout.columns}, ${n(sheet.labelWidthMm)}mm);
      grid-auto-rows:${n(sheet.labelHeightMm)}mm;
      column-gap:${n(sheet.columnGapMm)}mm; row-gap:${n(sheet.rowGapMm)}mm;
      align-content:start; justify-content:start;
      page-break-after:always; break-after:page; overflow:hidden;
    }
    .sheet:last-child { page-break-after:auto; break-after:auto; }
    .label {
      width:${n(sheet.labelWidthMm)}mm; height:${n(sheet.labelHeightMm)}mm; padding:${n(padMm)}mm;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      overflow:hidden; page-break-inside:avoid; break-inside:avoid;
    }
    .label.blank { visibility:hidden; }
    .nm { height:${n(nameH)}mm; line-height:${n(nameH)}mm; font-size:${n(nameH * 0.82)}mm; font-weight:600;
          text-align:center; width:100%; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .bc { width:${n(innerW)}mm; height:${n(barBandH)}mm; display:flex; align-items:center; justify-content:center; }
    .bc svg { width:100%; height:100%; display:block; }
    .ft { height:${n(footH)}mm; line-height:${n(footH)}mm; font-size:${n(footH * 0.78)}mm;
          display:flex; justify-content:space-between; align-items:center; width:100%; gap:1mm; }
    .ft .sku { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
    .ft .pr { font-weight:700; white-space:nowrap; }
  </style></head><body>${pages.join('')}</body></html>`
}
