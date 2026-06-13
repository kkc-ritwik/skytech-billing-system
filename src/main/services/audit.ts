import { hostname } from 'os'
import { getDb } from '../db/client'
import { auditLog } from '../db/schema'

export interface AuditEntry {
  userId?: string | null
  username?: string | null
  action: string
  entityType?: string
  entityId?: string
  details?: unknown
}

/**
 * Append an immutable audit record. Best-effort: an audit failure must never
 * break the user's operation, but it is logged to the console.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await getDb()
      .insert(auditLog)
      .values({
        userId: entry.userId ?? null,
        username: entry.username ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        details: entry.details === undefined ? null : JSON.stringify(entry.details),
        ipOrHost: hostname(),
        createdAt: new Date()
      })
  } catch (err) {
    console.error('[audit] failed to write audit log:', err)
  }
}
