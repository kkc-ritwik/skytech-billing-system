import { CHANNELS, type AuthUser, type SessionInfo } from '@shared/ipc'
import { anonRoute, authedRoute, AppError } from './router'
import {
  bootstrap,
  changePassword,
  isBootstrapNeeded,
  login,
  logout,
  resetPasswordWithRecovery,
  regenerateRecoveryCode,
  updateProfile,
  AuthError
} from '../services/auth'

async function mapAuthError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof AuthError) throw new AppError(err.message, err.code)
    throw err
  }
}

export function registerAuthRoutes(): void {
  anonRoute<void, { needed: boolean }>(
    CHANNELS.authBootstrapStatus,
    async () => ({ needed: await isBootstrapNeeded() }),
    { bypassLicense: true }
  )

  anonRoute<
    { fullName: string; username: string; password: string; email?: string; setupCode?: string },
    { session: SessionInfo; recoveryCode: string }
  >(CHANNELS.authBootstrap, (p) => mapAuthError(() => bootstrap(p)), { bypassLicense: true })

  anonRoute<{ username: string; password: string }, SessionInfo>(
    CHANNELS.authLogin,
    (p) => mapAuthError(() => login(p.username, p.password)),
    { bypassLicense: true }
  )

  anonRoute<{ username: string; recoveryCode: string; newPassword: string }, { recoveryCode: string }>(
    CHANNELS.authResetWithRecovery,
    (p) => mapAuthError(() => resetPasswordWithRecovery(p.username, p.recoveryCode, p.newPassword)),
    { bypassLicense: true }
  )

  anonRoute<void, AuthUser | null>(CHANNELS.authMe, (_p, ctx) => ctx.user, {
    bypassLicense: true
  })

  authedRoute<void, { ok: true }>(CHANNELS.authLogout, async (_p, ctx) => {
    if (ctx.token) await logout(ctx.token)
    return { ok: true }
  })

  authedRoute<{ oldPassword: string; newPassword: string }, { ok: true }>(
    CHANNELS.authChangePassword,
    async (p, ctx) => {
      await mapAuthError(() => changePassword(ctx.user.id, p.oldPassword, p.newPassword))
      return { ok: true }
    }
  )

  authedRoute<{ fullName: string; email?: string | null }, AuthUser>(
    CHANNELS.authUpdateProfile,
    (p, ctx) => mapAuthError(() => updateProfile(ctx.user.id, p))
  )

  authedRoute<void, { recoveryCode: string }>(CHANNELS.authRegenRecovery, (_p, ctx) =>
    mapAuthError(() => regenerateRecoveryCode(ctx.user.id))
  )
}
