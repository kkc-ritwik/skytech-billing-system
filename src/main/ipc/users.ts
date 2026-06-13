import { route } from './router'
import { withValidation } from './_validate'
import { listUsers, saveUser, deleteUser } from '../services/users'
import type { UserInput } from '@shared/dto'

export function registerUserRoutes(): void {
  route<void, unknown>('users:list', 'users:view', () => listUsers())
  route<UserInput, { id: string }>('users:save', 'users:manage', async (p, ctx) => {
    const id = await withValidation(() => saveUser(p, ctx.user))
    return { id }
  })
  route<{ id: string }, { ok: true }>('users:delete', 'users:manage', async (p, ctx) => {
    await withValidation(() => deleteUser(p.id, ctx.user))
    return { ok: true }
  })
}
