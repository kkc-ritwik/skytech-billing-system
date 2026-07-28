import { route, AppError } from './router'
import { withValidation } from './_validate'
import { listSalesDocs, getSalesDoc, saveSalesDoc, deleteSalesDoc, convertSalesDoc } from '../services/sales'
import type { SalesDocInput } from '@shared/dto'

export function registerSalesRoutes(): void {
  route<{ docType: string; from?: number; to?: number }, unknown>('sales:list', 'sales:view', (p) =>
    listSalesDocs(p.docType, { from: p.from, to: p.to })
  )
  route<{ id: string }, unknown>('sales:get', 'sales:view', (p) => getSalesDoc(p.id))
  /**
   * One channel serves both create and edit, so the route's own permission can
   * only cover the weaker of the two. Amending a saved document is a different
   * privilege from raising a new one — a counter Operator may bill, but must not
   * be able to go back and rewrite yesterday's invoice — so the edit case is
   * checked explicitly here.
   */
  route<SalesDocInput, { id: string; number: string }>('sales:save', 'sales:create', (p, ctx) => {
    if (p.id && !ctx.user.permissions.includes('sales:edit')) {
      throw new AppError('You do not have permission to edit an existing document.', 'FORBIDDEN')
    }
    return withValidation(() => saveSalesDoc(p, ctx.user))
  })
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
