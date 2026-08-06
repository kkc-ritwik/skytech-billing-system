import { route, AppError } from './router'
import {
  assignMissingBarcodes,
  generateBarcodeFor,
  resolveScan,
  posContext,
  renderLabelSheetHtml,
  computeLabelLayout,
  type ScanResult,
  type LabelRequest,
  type LabelLayout,
  type PosContext
} from '../services/barcode'
import { labelRequestSchema, MAX_LABELS_PER_JOB } from '@shared/dto'
import { exportBarcodeLabels, printBarcodeLabels } from '../services/pdf'
import { listPrinters, type PrinterInfo } from '../services/printing'

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
    const req = parseLabelRequest(p)
    const total = req.lines.reduce((a, l) => a + l.copies, 0)
    if (total > MAX_LABELS_PER_JOB) {
      throw new AppError(
        `That is ${total.toLocaleString('en-IN')} labels in one go. Print at most ${MAX_LABELS_PER_JOB.toLocaleString('en-IN')} at a time.`,
        'VALIDATION'
      )
    }
    return exportBarcodeLabels(req, ctx.user)
  })

  /** Printers this machine can see, with the system default flagged. */
  route<undefined, PrinterInfo[]>('print:listPrinters', 'dashboard:view', () => listPrinters())

  /** Send labels straight to a printer instead of saving a PDF. */
  route<LabelRequest & { deviceName?: string }, { printed: true }>(
    'barcode:labelsPrint',
    'items:manage',
    async (p, ctx) => {
      const req = parseLabelRequest(p)
      const total = req.lines.reduce((a, l) => a + l.copies, 0)
      if (total > MAX_LABELS_PER_JOB) {
        throw new AppError(
          `That is ${total.toLocaleString('en-IN')} labels in one go. Print at most ${MAX_LABELS_PER_JOB.toLocaleString('en-IN')} at a time.`,
          'VALIDATION'
        )
      }
      return printBarcodeLabels(req, ctx.user, { deviceName: p.deviceName })
    }
  )

  /**
   * The same HTML the PDF is built from, for the on-screen preview. Read-only,
   * so it is gated on items:view rather than items:manage — but the export
   * itself still requires items:manage.
   */
  route<LabelRequest, { html: string; layout: LabelLayout }>('barcode:labelPreview', 'items:view', async (p) => {
    const req = parseLabelRequest(p)
    const html = await renderLabelSheetHtml(req)
    return { html, layout: computeLabelLayout(req.sheet, req.lines.reduce((a, l) => a + l.copies, 0)) }
  })
}

/** Validate a label job, surfacing the first message in plain language. */
function parseLabelRequest(p: LabelRequest): LabelRequest {
  const parsed = labelRequestSchema.safeParse(p)
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? 'Check the label settings.', 'VALIDATION')
  }
  return parsed.data
}
