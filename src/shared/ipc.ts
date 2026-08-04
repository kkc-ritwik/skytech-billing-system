import type { Role, Permission } from './permissions'

/**
 * Typed IPC contract shared by main, preload and renderer.
 *
 * The renderer never talks to Node directly. It calls window.api.invoke(channel,
 * payload); the preload forwards to ipcRenderer.invoke; the main process routes
 * to a handler that (1) checks the session, (2) checks the permission, (3) runs
 * inside a DB transaction where needed, (4) writes the audit log.
 *
 * Every handler returns an IpcResponse envelope — errors are values, never
 * thrown across the boundary.
 */

export type IpcResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: IpcErrorCode }

export type IpcErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'LICENSE_BLOCKED'
  | 'INTERNAL'

export interface AuthUser {
  id: string
  username: string
  fullName: string
  email: string | null
  role: Role
  permissions: Permission[]
  mustChangePassword: boolean
}

export interface SessionInfo {
  token: string
  user: AuthUser
  expiresAt: number
}

export type LicenseStatusName = 'trial' | 'active' | 'expired' | 'grace'

export interface LicenseStatus {
  status: LicenseStatusName
  isUsable: boolean // false => app should lock to the activation screen
  daysRemaining: number | null
  licensedTo: string | null
  edition: string | null
  expiresAt: number | null
  machineFingerprint: string
  message: string
  /**
   * Set when the install was activated by an older build that stored only a
   * hash of the key. The app keeps working, but the key must be entered once
   * more before the grace period runs out.
   */
  needsReactivation?: boolean
}

/** Channel naming convention: "<domain>:<action>". */
export const CHANNELS = {
  // Auth / session
  authLogin: 'auth:login',
  authLogout: 'auth:logout',
  authMe: 'auth:me',
  authChangePassword: 'auth:changePassword',
  authUpdateProfile: 'auth:updateProfile',
  authRegenRecovery: 'auth:regenRecovery',
  authResetWithRecovery: 'auth:resetWithRecovery',
  authBootstrapStatus: 'auth:bootstrapStatus', // is first-run setup needed?
  authBootstrap: 'auth:bootstrap', // create first owner account

  // License
  licenseStatus: 'license:status',
  licenseActivate: 'license:activate',
  licenseDeactivate: 'license:deactivate',
  licenseMachineId: 'license:machineId',

  // Generic master/data domains are exposed as "<domain>:list|get|save|delete".
  // (Implemented per-domain in main/ipc/*.)

  // System
  appInfo: 'app:info',
  backupCreate: 'backup:create',
  backupRestore: 'backup:restore'
} as const

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS] | string
