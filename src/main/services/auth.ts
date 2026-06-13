import { randomBytes, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { eq, lt } from 'drizzle-orm'
import { getDb } from '../db/client'
import { sessions, users } from '../db/schema'
import { permissionsForRole, type Role } from '@shared/permissions'
import type { AuthUser, SessionInfo } from '@shared/ipc'
import { VENDOR_SETUP_CODE_SHA256 } from '@shared/app-config'
import { audit } from './audit'

/** True when the entered code hashes to the configured vendor setup code. */
function isVendorSetupCode(code: string | undefined | null): boolean {
  if (!code) return false
  return createHash('sha256').update(code.trim()).digest('hex') === VENDOR_SETUP_CODE_SHA256
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000 // 12 hours
const MAX_FAILED_ATTEMPTS = 5
const LOCK_DURATION_MS = 15 * 60 * 1000 // 15 minutes
const BCRYPT_ROUNDS = 12
const MIN_PASSWORD_LENGTH = 8

export class AuthError extends Error {
  constructor(
    message: string,
    public code: 'VALIDATION' | 'UNAUTHENTICATED' | 'CONFLICT' | 'NOT_FOUND'
  ) {
    super(message)
  }
}

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  const role = row.role as Role
  return {
    id: row.id,
    username: row.username,
    fullName: row.fullName,
    email: row.email,
    role,
    permissions: permissionsForRole(role),
    mustChangePassword: row.mustChangePassword
  }
}

export async function isBootstrapNeeded(): Promise<boolean> {
  const anyUser = await getDb().select({ id: users.id }).from(users).limit(1).get()
  return !anyUser
}

export function validatePassword(password: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      'VALIDATION'
    )
  }
}

// Readable recovery code (no ambiguous chars), e.g. "K7QF-3RMP-9XA2-TJ6H".
const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateRecoveryCode(): string {
  const bytes = randomBytes(16)
  let s = ''
  for (let i = 0; i < 16; i++) s += RC_ALPHABET[bytes[i] % RC_ALPHABET.length]
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}`
}
function normalizeRecovery(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
}

/**
 * Creates the first account on first run. Becomes **Super Admin** only when the
 * vendor setup code is supplied (you, SkyTech); otherwise an **Admin** — the
 * customer's business owner.
 */
export async function bootstrap(input: {
  fullName: string
  username: string
  password: string
  email?: string
  setupCode?: string
}): Promise<{ session: SessionInfo; recoveryCode: string }> {
  if (!(await isBootstrapNeeded())) {
    throw new AuthError('Application is already set up.', 'CONFLICT')
  }
  validatePassword(input.password)
  const username = input.username.trim().toLowerCase()
  if (!username) throw new AuthError('Username is required.', 'VALIDATION')

  const role: Role = isVendorSetupCode(input.setupCode) ? 'super_admin' : 'admin'
  const recoveryCode = generateRecoveryCode()

  const row = await getDb()
    .insert(users)
    .values({
      username,
      fullName: input.fullName.trim(),
      email: input.email?.trim() || null,
      passwordHash: bcrypt.hashSync(input.password, BCRYPT_ROUNDS),
      recoveryCodeHash: bcrypt.hashSync(normalizeRecovery(recoveryCode), BCRYPT_ROUNDS),
      role,
      isActive: true
    })
    .returning()
    .get()

  await audit({ userId: row.id, username, action: 'auth.bootstrap', entityType: 'user', entityId: row.id, details: { role } })
  return { session: await createSession(row), recoveryCode }
}

/** Reset a password using the one-time recovery code; returns a NEW code. */
export async function resetPasswordWithRecovery(
  usernameRaw: string,
  recoveryCode: string,
  newPassword: string
): Promise<{ recoveryCode: string }> {
  const username = usernameRaw.trim().toLowerCase()
  const row = await getDb().select().from(users).where(eq(users.username, username)).get()
  if (!row || !row.isActive || row.deletedAt || !row.recoveryCodeHash) {
    throw new AuthError('Invalid username or recovery code.', 'UNAUTHENTICATED')
  }
  // Lockout shared with login: brute-forcing the recovery code is throttled too.
  if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60000)
    throw new AuthError(`Too many attempts. Try again in ${mins} minute(s).`, 'UNAUTHENTICATED')
  }
  if (!bcrypt.compareSync(normalizeRecovery(recoveryCode), row.recoveryCodeHash)) {
    const failed = row.failedLoginCount + 1
    const lock = failed >= MAX_FAILED_ATTEMPTS
    await getDb()
      .update(users)
      .set({
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_DURATION_MS) : null
      })
      .where(eq(users.id, row.id))
    await audit({ userId: row.id, username, action: 'auth.recovery_failed' })
    throw new AuthError('Invalid username or recovery code.', 'UNAUTHENTICATED')
  }
  validatePassword(newPassword)
  const newCode = generateRecoveryCode()
  await getDb()
    .update(users)
    .set({
      passwordHash: bcrypt.hashSync(newPassword, BCRYPT_ROUNDS),
      recoveryCodeHash: bcrypt.hashSync(normalizeRecovery(newCode), BCRYPT_ROUNDS),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: new Date()
    })
    .where(eq(users.id, row.id))
  await audit({ userId: row.id, username, action: 'auth.password_recovered' })
  return { recoveryCode: newCode }
}

/** Generate a fresh recovery code for the signed-in user. */
export async function regenerateRecoveryCode(userId: string): Promise<{ recoveryCode: string }> {
  const code = generateRecoveryCode()
  await getDb()
    .update(users)
    .set({ recoveryCodeHash: bcrypt.hashSync(normalizeRecovery(code), BCRYPT_ROUNDS), updatedAt: new Date() })
    .where(eq(users.id, userId))
  return { recoveryCode: code }
}

/** Update the signed-in user's own name/email. */
export async function updateProfile(
  userId: string,
  input: { fullName: string; email?: string | null }
): Promise<AuthUser> {
  const fullName = input.fullName.trim()
  if (!fullName) throw new AuthError('Full name is required.', 'VALIDATION')
  await getDb()
    .update(users)
    .set({ fullName, email: input.email?.trim() || null, updatedAt: new Date() })
    .where(eq(users.id, userId))
  const row = await getDb().select().from(users).where(eq(users.id, userId)).get()
  if (!row) throw new AuthError('User not found.', 'NOT_FOUND')
  await audit({ userId, username: row.username, action: 'auth.profile_updated' })
  return toAuthUser(row)
}

async function createSession(user: typeof users.$inferSelect): Promise<SessionInfo> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_TTL_MS
  await getDb()
    .insert(sessions)
    .values({ token, userId: user.id, expiresAt: new Date(expiresAt), createdAt: new Date() })
  await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
  return { token, user: toAuthUser(user), expiresAt }
}

export async function login(usernameRaw: string, password: string): Promise<SessionInfo> {
  const username = usernameRaw.trim().toLowerCase()
  const row = await getDb().select().from(users).where(eq(users.username, username)).get()

  // Still run a hash compare on the no-user path to blunt username enumeration.
  if (!row) {
    bcrypt.compareSync(password, '$2a$12$0000000000000000000000000000000000000000000000000000')
    throw new AuthError('Invalid username or password.', 'UNAUTHENTICATED')
  }
  if (!row.isActive || row.deletedAt) {
    throw new AuthError('This account is disabled.', 'UNAUTHENTICATED')
  }
  if (row.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((row.lockedUntil.getTime() - Date.now()) / 60000)
    throw new AuthError(`Account locked. Try again in ${mins} minute(s).`, 'UNAUTHENTICATED')
  }

  if (!bcrypt.compareSync(password, row.passwordHash)) {
    const failed = row.failedLoginCount + 1
    const lock = failed >= MAX_FAILED_ATTEMPTS
    await getDb()
      .update(users)
      .set({
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_DURATION_MS) : null
      })
      .where(eq(users.id, row.id))
    await audit({ userId: row.id, username, action: 'auth.login_failed' })
    throw new AuthError('Invalid username or password.', 'UNAUTHENTICATED')
  }

  await getDb()
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null })
    .where(eq(users.id, row.id))
  await audit({ userId: row.id, username, action: 'auth.login' })
  return createSession(row)
}

export async function logout(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.token, token))
}

/** Remove expired sessions (called at startup) so the table can't grow forever. */
export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date()))
  } catch (err) {
    console.error('[auth] session cleanup failed:', err)
  }
}

/** Validate a session token; returns the live AuthUser or null. */
export async function resolveSession(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token) return null
  const session = await getDb().select().from(sessions).where(eq(sessions.token, token)).get()
  if (!session) return null
  if (session.expiresAt.getTime() < Date.now()) {
    await getDb().delete(sessions).where(eq(sessions.token, token))
    return null
  }
  const row = await getDb().select().from(users).where(eq(users.id, session.userId)).get()
  if (!row || !row.isActive || row.deletedAt) return null
  return toAuthUser(row)
}

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  const row = await getDb().select().from(users).where(eq(users.id, userId)).get()
  if (!row) throw new AuthError('User not found.', 'NOT_FOUND')
  if (!bcrypt.compareSync(oldPassword, row.passwordHash)) {
    throw new AuthError('Current password is incorrect.', 'UNAUTHENTICATED')
  }
  validatePassword(newPassword)
  await getDb()
    .update(users)
    .set({
      passwordHash: bcrypt.hashSync(newPassword, BCRYPT_ROUNDS),
      mustChangePassword: false,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId))
  await audit({ userId, username: row.username, action: 'auth.password_changed' })
}
