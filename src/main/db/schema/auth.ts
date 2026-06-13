import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { id, timestamps, softDelete } from './common'

/**
 * Roles are fixed (not user-defined) so we can reason about permissions
 * statically. The permission matrix lives in src/shared/permissions.ts.
 */
export const ROLES = ['super_admin', 'admin', 'manager', 'operator'] as const
export type Role = (typeof ROLES)[number]

export const users = sqliteTable(
  'users',
  {
    id: id(),
    username: text('username').notNull(),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    passwordHash: text('password_hash').notNull(),
    // bcrypt hash of a one-time recovery code (offline "forgot password").
    recoveryCodeHash: text('recovery_code_hash'),
    role: text('role', { enum: ROLES }).notNull().default('operator'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    // Forces a password change on next login (e.g. for the seeded admin).
    mustChangePassword: integer('must_change_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: integer('locked_until', { mode: 'timestamp_ms' }),
    ...timestamps,
    ...softDelete
  },
  (t) => ({
    usernameUq: uniqueIndex('users_username_uq').on(t.username)
  })
)

/**
 * Sessions are kept server-side (main process) so a renderer compromise cannot
 * forge a role. The token is random; the renderer only ever holds the token.
 */
export const sessions = sqliteTable('sessions', {
  id: id(),
  token: text('token').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

/**
 * Immutable audit trail. Every create/update/delete/login/auth-sensitive action
 * is appended here. Non-negotiable for financial software.
 */
export const auditLog = sqliteTable('audit_log', {
  id: id(),
  userId: text('user_id'),
  username: text('username'),
  action: text('action').notNull(), // e.g. "invoice.create", "auth.login"
  entityType: text('entity_type'), // e.g. "invoice"
  entityId: text('entity_id'),
  // JSON snapshot of the change { before, after } for forensics.
  details: text('details'),
  ipOrHost: text('ip_or_host'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull()
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type AuditLogRow = typeof auditLog.$inferSelect
