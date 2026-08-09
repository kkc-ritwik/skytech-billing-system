import { and, eq, isNull, like, or, desc } from 'drizzle-orm'
import { getDb } from '../db/client'
import { salespersons } from '../db/schema'
import { salespersonInputSchema, type SalespersonInput } from '@shared/dto'
import type { AuthUser } from '@shared/ipc'
import { audit } from './audit'

/** Shop floor staff, newest first, excluding anyone removed. */
export async function listSalespersons(filter?: { search?: string; activeOnly?: boolean }) {
  const conds = [isNull(salespersons.deletedAt)]
  if (filter?.activeOnly) conds.push(eq(salespersons.isActive, true))
  const q = filter?.search?.trim()
  if (q) {
    conds.push(
      or(like(salespersons.name, `%${q}%`), like(salespersons.code, `%${q}%`), like(salespersons.phone, `%${q}%`))!
    )
  }
  return getDb()
    .select({
      id: salespersons.id,
      name: salespersons.name,
      phone: salespersons.phone,
      code: salespersons.code,
      incentiveBps: salespersons.incentiveBps,
      notes: salespersons.notes,
      isActive: salespersons.isActive
    })
    .from(salespersons)
    .where(and(...conds))
    .orderBy(desc(salespersons.createdAt))
}

export async function saveSalesperson(input: SalespersonInput, user: AuthUser): Promise<{ id: string }> {
  const d = salespersonInputSchema.parse(input)
  const db = getDb()
  const now = new Date()

  const values = {
    name: d.name,
    phone: d.phone ?? null,
    code: d.code ?? null,
    incentiveBps: d.incentiveBps,
    notes: d.notes ?? null,
    isActive: d.isActive,
    updatedAt: now
  }

  if (d.id) {
    await db.update(salespersons).set(values).where(eq(salespersons.id, d.id))
    await audit({
      userId: user.id,
      username: user.username,
      action: 'salesperson.update',
      entityType: 'salesperson',
      entityId: d.id,
      details: { name: d.name }
    })
    return { id: d.id }
  }

  const row = await db.insert(salespersons).values(values).returning({ id: salespersons.id }).get()
  await audit({
    userId: user.id,
    username: user.username,
    action: 'salesperson.create',
    entityType: 'salesperson',
    entityId: row.id,
    details: { name: d.name }
  })
  return { id: row.id }
}

/**
 * Remove a salesperson.
 *
 * A soft delete, because bills already credited to them must keep making sense
 * long after they have left. They simply stop being offered at the counter.
 */
export async function deleteSalesperson(id: string, user: AuthUser): Promise<void> {
  const row = await getDb().select().from(salespersons).where(eq(salespersons.id, id)).get()
  if (!row) throw Object.assign(new Error('Salesperson not found.'), { code: 'NOT_FOUND' })
  await getDb()
    .update(salespersons)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(salespersons.id, id))
  await audit({
    userId: user.id,
    username: user.username,
    action: 'salesperson.delete',
    entityType: 'salesperson',
    entityId: id,
    details: { name: row.name }
  })
}
