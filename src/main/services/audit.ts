import { hostname } from 'os'
import { and, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm'
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

// ---------------------------------------------------------------------------
// Reading the trail
// ---------------------------------------------------------------------------

export interface AuditFilter {
  /** Free text across action, username, entity type and entity id. */
  search?: string
  /** Coarse grouping: the part before the first dot, e.g. "sales", "auth". */
  module?: string
  username?: string
  from?: number
  to?: number
  limit?: number
  offset?: number
}

export interface AuditRow {
  id: string
  userId: string | null
  username: string | null
  action: string
  entityType: string | null
  entityId: string | null
  details: string | null
  ipOrHost: string | null
  createdAt: number
}

function buildConditions(f: AuditFilter) {
  const conds = []
  if (f.search) {
    const q = `%${f.search}%`
    conds.push(
      or(
        like(auditLog.action, q),
        like(auditLog.username, q),
        like(auditLog.entityType, q),
        like(auditLog.entityId, q)
      )!
    )
  }
  // Actions are namespaced "<module>.<verb>", so a module filter is a prefix match.
  if (f.module) conds.push(like(auditLog.action, `${f.module}.%`))
  if (f.username) conds.push(eq(auditLog.username, f.username))
  if (f.from) conds.push(gte(auditLog.createdAt, new Date(f.from)))
  if (f.to) conds.push(lte(auditLog.createdAt, new Date(f.to)))
  return conds
}

/**
 * Page through the audit trail, newest first. The log is append-only and is
 * never exposed for mutation — this is the only way to read it.
 */
export async function listAudit(filter: AuditFilter = {}): Promise<{ rows: AuditRow[]; total: number }> {
  const limit = Math.min(500, Math.max(1, filter.limit ?? 100))
  const offset = Math.max(0, filter.offset ?? 0)
  const conds = buildConditions(filter)
  const where = conds.length ? and(...conds) : undefined

  const rows = await getDb()
    .select()
    .from(auditLog)
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset)

  const counted = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(auditLog)
    .where(where)
    .get()

  return {
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.getTime() : (r.createdAt as unknown as number)
    })),
    total: Number(counted?.n ?? 0)
  }
}

/** Distinct modules and users present in the log, for the filter dropdowns. */
export async function auditFacets(): Promise<{ modules: string[]; users: string[] }> {
  const rows = await getDb().select({ action: auditLog.action, username: auditLog.username }).from(auditLog)
  const modules = new Set<string>()
  const users = new Set<string>()
  for (const r of rows) {
    modules.add(r.action.split('.')[0])
    if (r.username) users.add(r.username)
  }
  return { modules: [...modules].sort(), users: [...users].sort() }
}
