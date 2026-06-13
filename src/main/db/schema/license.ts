import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Single-row license state. The authoritative anti-tamper copy is also written
 * to an encrypted file outside the DB (see services/license.ts) so deleting the
 * DB doesn't reset the trial. This table is the convenient read cache.
 *
 * status ∈ trial | active | expired | grace
 */
export const licenseState = sqliteTable('license_state', {
  id: text('id').primaryKey().default('singleton'),
  status: text('status').notNull().default('trial'),
  machineFingerprint: text('machine_fingerprint').notNull(),
  // Trial
  trialStartedAt: integer('trial_started_at', { mode: 'timestamp_ms' }),
  trialEndsAt: integer('trial_ends_at', { mode: 'timestamp_ms' }),
  // Activation
  licenseKey: text('license_key'),
  licensedTo: text('licensed_to'),
  activatedAt: integer('activated_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }), // null = perpetual
  edition: text('edition'), // standard | professional ...
  // Clock-tamper detection: last seen wall clock; if system clock jumps back
  // significantly we move to grace/expired.
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
})

export type LicenseState = typeof licenseState.$inferSelect
