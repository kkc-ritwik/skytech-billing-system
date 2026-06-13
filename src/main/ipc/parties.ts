import { ZodError } from 'zod'
import { route, AppError } from './router'
import { deleteParty, getParty, listParties, saveParty } from '../services/parties'
import { partyLedger } from '../services/ledger'
import { exportPartyStatement } from '../services/pdf'
import type { PartyInput } from '@shared/dto'

async function withValidation<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ZodError) {
      throw new AppError(err.errors[0]?.message ?? 'Invalid input.', 'VALIDATION')
    }
    throw err
  }
}

export function registerPartyRoutes(): void {
  route<{ search?: string; partyType?: 'customer' | 'vendor'; activeOnly?: boolean } | undefined, unknown>(
    'parties:list',
    'parties:view',
    (p) => listParties(p)
  )

  route<{ id: string }, unknown>('parties:get', 'parties:view', (p) => getParty(p.id))

  route<{ id: string }, unknown>('parties:ledger', 'parties:view', (p) => partyLedger(p.id))

  route<{ id: string }, { path: string }>('parties:statementPdf', 'parties:view', (p, ctx) =>
    withValidation(() => exportPartyStatement(p.id, ctx.user))
  )

  route<PartyInput, { id: string }>('parties:save', 'parties:manage', async (p, ctx) => {
    const id = await withValidation(() => saveParty(p, ctx.user))
    return { id }
  })

  route<{ id: string }, { ok: true }>('parties:delete', 'parties:manage', async (p, ctx) => {
    await deleteParty(p.id, ctx.user)
    return { ok: true }
  })
}
