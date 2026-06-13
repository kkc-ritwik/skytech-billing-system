import bcrypt from 'bcryptjs'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { getDb } from '../db/client'
import { users } from '../db/schema'
import { userInputSchema, type UserInput } from '@shared/dto'
import type { AuthUser } from '@shared/ipc'
import { audit } from './audit'

const BCRYPT_ROUNDS = 12

function fail(message: string, code: 'VALIDATION' | 'CONFLICT' | 'FORBIDDEN' | 'NOT_FOUND'): never {
  throw Object.assign(new Error(message), { code })
}

export async function listUsers() {
  return getDb()
    .select({
      id: users.id,
      fullName: users.fullName,
      username: users.username,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
}

async function activeSuperAdminCount(excludeId?: string): Promise<number> {
  const rows = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'super_admin'), eq(users.isActive, true), isNull(users.deletedAt)))
  return rows.filter((r) => r.id !== excludeId).length
}

export async function saveUser(input: UserInput, actor: AuthUser): Promise<string> {
  const d = userInputSchema.parse(input)
  const db = getDb()
  const username = d.username.trim().toLowerCase()

  // Only a super admin may create or grant the super_admin role.
  if (d.role === 'super_admin' && actor.role !== 'super_admin') {
    fail('Only a Super Admin can assign the Super Admin role.', 'FORBIDDEN')
  }

  // Unique username among non-deleted users.
  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, username), isNull(users.deletedAt)))
    .get()
  if (clash && clash.id !== d.id) fail(`Username "${username}" is already taken.`, 'CONFLICT')

  if (d.id) {
    const existing = await db.select().from(users).where(eq(users.id, d.id)).get()
    if (!existing) fail('User not found.', 'NOT_FOUND')

    // Guard: don't let the last active super admin be demoted or deactivated.
    const losingSuper =
      existing.role === 'super_admin' && (d.role !== 'super_admin' || !d.isActive)
    if (losingSuper && (await activeSuperAdminCount(existing.id)) === 0) {
      fail('There must be at least one active Super Admin.', 'VALIDATION')
    }

    await db
      .update(users)
      .set({
        fullName: d.fullName.trim(),
        username,
        email: d.email?.trim() || null,
        role: d.role,
        isActive: d.isActive,
        ...(d.password ? { passwordHash: bcrypt.hashSync(d.password, BCRYPT_ROUNDS), mustChangePassword: true } : {}),
        updatedAt: new Date()
      })
      .where(eq(users.id, d.id))
    await audit({ userId: actor.id, username: actor.username, action: 'user.update', entityType: 'user', entityId: d.id })
    return d.id
  }

  if (!d.password) fail('A password is required for a new user.', 'VALIDATION')
  const row = await db
    .insert(users)
    .values({
      fullName: d.fullName.trim(),
      username,
      email: d.email?.trim() || null,
      role: d.role,
      isActive: d.isActive,
      passwordHash: bcrypt.hashSync(d.password, BCRYPT_ROUNDS),
      mustChangePassword: true
    })
    .returning({ id: users.id })
    .get()
  await audit({ userId: actor.id, username: actor.username, action: 'user.create', entityType: 'user', entityId: row.id })
  return row.id
}

export async function deleteUser(id: string, actor: AuthUser): Promise<void> {
  if (id === actor.id) fail('You cannot delete your own account.', 'VALIDATION')
  const existing = await getDb().select().from(users).where(eq(users.id, id)).get()
  if (!existing) fail('User not found.', 'NOT_FOUND')
  if (existing.role === 'super_admin' && (await activeSuperAdminCount(id)) === 0) {
    fail('There must be at least one active Super Admin.', 'VALIDATION')
  }
  await getDb()
    .update(users)
    .set({ deletedAt: new Date(), isActive: false, username: `${existing.username}#deleted#${Date.now()}` })
    .where(eq(users.id, id))
  await audit({ userId: actor.id, username: actor.username, action: 'user.delete', entityType: 'user', entityId: id })
}
