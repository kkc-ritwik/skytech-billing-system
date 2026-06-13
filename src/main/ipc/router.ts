import { ipcMain } from 'electron'
import type { AuthUser, IpcResponse, IpcErrorCode } from '@shared/ipc'
import type { Permission } from '@shared/permissions'
import { can } from '@shared/permissions'
import { resolveSession } from '../services/auth'
import { getStatus as getLicenseStatus } from '../services/license'

export interface Ctx {
  user: AuthUser
  token: string
}

export interface AnonCtx {
  user: AuthUser | null
  token: string | null
}

type Handler<P, R> = (payload: P, ctx: Ctx) => R | Promise<R>
type AnonHandler<P, R> = (payload: P, ctx: AnonCtx) => R | Promise<R>

interface Route {
  permission?: Permission
  // No authentication required (login, bootstrap, license status...).
  anonymous?: boolean
  // Reachable even when the license is expired/locked (license + app info).
  bypassLicense?: boolean
  handler: Handler<any, any> | AnonHandler<any, any>
}

const routes = new Map<string, Route>()

export function route<P, R>(
  channel: string,
  permission: Permission,
  handler: Handler<P, R>
): void {
  routes.set(channel, { permission, handler })
}

export function authedRoute<P, R>(channel: string, handler: Handler<P, R>): void {
  routes.set(channel, { handler })
}

export function anonRoute<P, R>(
  channel: string,
  handler: AnonHandler<P, R>,
  opts: { bypassLicense?: boolean } = {}
): void {
  routes.set(channel, { anonymous: true, bypassLicense: opts.bypassLicense, handler })
}

export class AppError extends Error {
  constructor(
    message: string,
    public code: IpcErrorCode = 'INTERNAL'
  ) {
    super(message)
  }
}

const IPC_CHANNEL = 'ledgerline:invoke'

export function installIpcRouter(): void {
  ipcMain.handle(
    IPC_CHANNEL,
    async (_event, msg: { channel: string; token?: string; payload?: unknown }): Promise<IpcResponse<unknown>> => {
      const route = routes.get(msg.channel)
      if (!route) return { ok: false, error: `Unknown channel: ${msg.channel}`, code: 'NOT_FOUND' }

      try {
        // 1) License gate (except explicitly bypassed channels).
        if (!route.bypassLicense) {
          const lic = await getLicenseStatus()
          if (!lic.isUsable) {
            return { ok: false, error: lic.message, code: 'LICENSE_BLOCKED' }
          }
        }

        // 2) Authentication.
        const user = await resolveSession(msg.token)
        if (!route.anonymous && !user) {
          return { ok: false, error: 'Please sign in to continue.', code: 'UNAUTHENTICATED' }
        }

        // 3) Authorization.
        if (route.permission) {
          if (!user || !can(user.role, route.permission)) {
            return { ok: false, error: 'You do not have permission to do this.', code: 'FORBIDDEN' }
          }
        }

        const ctx = { user: user!, token: msg.token ?? '' }
        const data = await route.handler(msg.payload, ctx as Ctx & AnonCtx)
        return { ok: true, data }
      } catch (err) {
        if (err instanceof AppError) return { ok: false, error: err.message, code: err.code }
        // Map known service error shapes.
        const anyErr = err as { code?: IpcErrorCode; message?: string }
        if (anyErr?.code && typeof anyErr.code === 'string' && anyErr.message) {
          return { ok: false, error: anyErr.message, code: anyErr.code }
        }
        console.error(`[ipc] ${msg.channel} failed:`, err)
        return { ok: false, error: 'Something went wrong. Please try again.', code: 'INTERNAL' }
      }
    }
  )
}
