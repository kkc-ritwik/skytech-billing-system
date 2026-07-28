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
  // Company state code + shop defaults, needed wherever a document is raised.
  //
  // Gated on dashboard:view — the one permission every role holds — rather than
  // settings:view, because Operators and purchase-only staff must be able to
  // read the state code. Without it the app cannot tell inter-state from
  // intra-state and silently bills the wrong kind of GST. Nothing sensitive is
  // returned: a state code and the shop's default cut/scheme/transport.
  route<undefined, PosContext>('app:context', 'dashboard:view', () => posContext())

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
