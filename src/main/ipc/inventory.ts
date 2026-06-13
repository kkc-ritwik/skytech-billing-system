import { route } from './router'
import { withValidation } from './_validate'
import { stockSummary, itemLedger, createAdjustment, expiryReport } from '../services/inventory'
import type { StockAdjustmentInput } from '@shared/dto'

export function registerInventoryRoutes(): void {
  route<void, unknown>('inventory:summary', 'inventory:view', () => stockSummary())
  route<void, unknown>('inventory:expiry', 'inventory:view', () => expiryReport())
  route<{ itemId: string }, unknown>('inventory:ledger', 'inventory:view', (p) => itemLedger(p.itemId))
  route<StockAdjustmentInput, { id: string; number: string }>(
    'inventory:adjust',
    'inventory:adjust',
    (p, ctx) => withValidation(() => createAdjustment(p, ctx.user))
  )
}
