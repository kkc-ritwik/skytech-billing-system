import { ZodError } from 'zod'
import { route, AppError } from './router'
import {
  deleteItem,
  getItem,
  itemRefs,
  listItems,
  saveItem,
  type ItemListRow
} from '../services/items'
import type { ItemInput } from '@shared/dto'

/** Run a handler, converting Zod validation errors into clean VALIDATION errors. */
async function withValidation<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ZodError) {
      throw new AppError(err.errors[0]?.message ?? 'Invalid input.', 'VALIDATION')
    }
    const anyErr = err as { code?: string; message?: string }
    if (anyErr?.code === 'CONFLICT') throw new AppError(anyErr.message!, 'CONFLICT')
    throw err
  }
}

export function registerItemRoutes(): void {
  route<{ search?: string; activeOnly?: boolean } | undefined, ItemListRow[]>(
    'items:list',
    'items:view',
    (p) => listItems(p)
  )

  route<{ id: string }, unknown>('items:get', 'items:view', (p) => getItem(p.id))

  route<{ units: unknown; taxRates: unknown; categories: unknown }, unknown>(
    'items:refs',
    'items:view',
    () => itemRefs()
  )

  route<ItemInput, { id: string }>('items:save', 'items:manage', async (p, ctx) => {
    const id = await withValidation(() => saveItem(p, ctx.user))
    return { id }
  })

  route<{ id: string }, { ok: true }>('items:delete', 'items:manage', async (p, ctx) => {
    await deleteItem(p.id, ctx.user)
    return { ok: true }
  })
}
