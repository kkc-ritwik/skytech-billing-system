import { route } from './router'
import { withValidation } from './_validate'
import { listSalesDocs, getSalesDoc, saveSalesDoc, deleteSalesDoc, convertSalesDoc } from '../services/sales'
import type { SalesDocInput } from '@shared/dto'

export function registerSalesRoutes(): void {
  route<{ docType: string; from?: number; to?: number }, unknown>('sales:list', 'sales:view', (p) =>
    listSalesDocs(p.docType, { from: p.from, to: p.to })
  )
  route<{ id: string }, unknown>('sales:get', 'sales:view', (p) => getSalesDoc(p.id))
  route<SalesDocInput, { id: string; number: string }>('sales:save', 'sales:create', (p, ctx) =>
    withValidation(() => saveSalesDoc(p, ctx.user))
  )
  route<{ id: string; targetDocType: SalesDocInput['docType'] }, { id: string; number: string }>(
    'sales:convert',
    'sales:create',
    (p, ctx) => withValidation(() => convertSalesDoc(p.id, p.targetDocType, ctx.user))
  )
  route<{ id: string }, { ok: true }>('sales:delete', 'sales:delete', async (p, ctx) => {
    await withValidation(() => deleteSalesDoc(p.id, ctx.user))
    return { ok: true }
  })
}
