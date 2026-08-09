import { route } from './router'
import { withValidation } from './_validate'
import { listSalespersons, saveSalesperson, deleteSalesperson } from '../services/salespersons'
import type { SalespersonInput } from '@shared/dto'

export function registerSalespersonRoutes(): void {
  // Reading the list is gated on parties:view, the permission counter staff
  // already hold — the till has to offer the names to credit a sale to.
  route<{ search?: string; activeOnly?: boolean }, unknown>('salespersons:list', 'parties:view', (p) =>
    listSalespersons(p)
  )
  route<SalespersonInput, { id: string }>('salespersons:save', 'users:manage', (p, ctx) =>
    withValidation(() => saveSalesperson(p, ctx.user))
  )
  route<{ id: string }, { ok: true }>('salespersons:delete', 'users:manage', async (p, ctx) => {
    await withValidation(() => deleteSalesperson(p.id, ctx.user))
    return { ok: true }
  })
}
