import { route, AppError } from './router'
import {
  assignMissingBarcodes,
  generateBarcodeFor,
  resolveScan,
  posContext,
  type ScanResult,
  type LabelRequest,
  type PosContext
} from '../services/barcode'
import { exportBarcodeLabels } from '../services/pdf'

export function registerBarcodeRoutes(): void {
  // Counter bootstrap. Gated on sales:create (not settings:view) so an Operator
  // can read the company state code needed for correct IGST/CGST selection.
  route<undefined, PosContext>('pos:context', 'sales:create', () => posContext())

  /**
   * Resolve a scanned code. Returns null rather than throwing when nothing
   * matches so the POS can show "unknown barcode" without an error dialog on
   * every mis-scan.
   */
  route<{ code: string }, ScanResult | null>('barcode:scan', 'sales:create', (p) => resolveScan(p.code))

  route<{ itemId: string }, { barcode: string }>('barcode:generate', 'items:manage', (p, ctx) =>
    generateBarcodeFor(p.itemId, ctx.user)
  )

  route<undefined, { assigned: { id: string; sku: string; name: string; barcode: string }[] }>(
    'barcode:assignMissing',
    'items:manage',
    (_p, ctx) => assignMissingBarcodes(ctx.user)
  )

  route<LabelRequest, { path: string }>('barcode:labels', 'items:manage', async (p, ctx) => {
    if (!p?.itemIds?.length) throw new AppError('Select at least one item.', 'VALIDATION')
    return exportBarcodeLabels(p, ctx.user)
  })
}
