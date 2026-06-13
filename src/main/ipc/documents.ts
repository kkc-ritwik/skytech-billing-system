import { route } from './router'
import { withValidation } from './_validate'
import { exportDocumentPdf } from '../services/pdf'
import { exportEInvoiceJson, exportEwayJson } from '../services/einvoice'
import type { Permission } from '@shared/permissions'

export function registerDocumentRoutes(): void {
  // PDF export for a sales or purchase document. Permission depends on side.
  route<{ type: 'sales' | 'purchase'; id: string; format?: 'a4' | 'thermal' }, { path: string }>(
    'documents:pdf',
    'sales:view' as Permission,
    (p, ctx) => withValidation(() => exportDocumentPdf(p.type, p.id, ctx.user, p.format ?? 'a4'))
  )

  route<{ id: string }, { path: string }>('documents:einvoice', 'sales:view', (p, ctx) =>
    withValidation(() => exportEInvoiceJson(p.id, ctx.user))
  )
  route<{ id: string }, { path: string }>('documents:eway', 'sales:view', (p, ctx) =>
    withValidation(() => exportEwayJson(p.id, ctx.user))
  )
}
