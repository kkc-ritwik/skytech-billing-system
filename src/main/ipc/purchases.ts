import { route, AppError } from './router'
import { withValidation } from './_validate'
import { listPurchaseDocs, getPurchaseDoc, savePurchaseDoc, deletePurchaseDoc, convertPurchaseDoc } from '../services/purchases'
import type { PurchaseDocInput } from '@shared/dto'

export function registerPurchaseRoutes(): void {
  route<{ docType: string; from?: number; to?: number }, unknown>('purchases:list', 'purchase:view', (p) =>
    listPurchaseDocs(p.docType, { from: p.from, to: p.to })
  )
  route<{ id: string }, unknown>('purchases:get', 'purchase:view', (p) => getPurchaseDoc(p.id))
  /**
   * As with sales: editing a saved purchase is a separate privilege from
   * creating one. Without this an Operator could rewrite a received GRN and
   * inflate stock at will.
   */
  route<PurchaseDocInput, { id: string; number: string }>('purchases:save', 'purchase:create', (p, ctx) => {
    if (p.id && !ctx.user.permissions.includes('purchase:edit')) {
      throw new AppError('You do not have permission to edit an existing document.', 'FORBIDDEN')
    }
    return withValidation(() => savePurchaseDoc(p, ctx.user))
  })
  route<{ id: string; targetDocType: PurchaseDocInput['docType'] }, { id: string; number: string }>(
    'purchases:convert',
    'purchase:create',
    (p, ctx) => withValidation(() => convertPurchaseDoc(p.id, p.targetDocType, ctx.user))
  )
  route<{ id: string }, { ok: true }>('purchases:delete', 'purchase:delete', async (p, ctx) => {
    await withValidation(() => deletePurchaseDoc(p.id, ctx.user))
    return { ok: true }
  })
}
