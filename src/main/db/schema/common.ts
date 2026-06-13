import { integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'

/**
 * Conventions used across the whole schema
 * ----------------------------------------
 * - Primary keys are text UUIDs (nanoid). Globally unique -> safe for
 *   backup/restore, export/import, and any future multi-device sync.
 * - MONEY is stored as INTEGER paise (1 rupee = 100 paise). Never store money
 *   as a float. All arithmetic happens on integers; formatting to ₹ happens at
 *   the edge (UI/PDF). See src/shared/money.ts.
 * - QUANTITY is stored as REAL (supports kg / litre fractions). Rounded to a
 *   fixed precision before persistence by the service layer.
 * - Timestamps are INTEGER unix-epoch milliseconds.
 */

export const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => nanoid())

export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
}

/** Soft-delete marker. Records are never hard-deleted in financial software. */
export const softDelete = {
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' })
}
