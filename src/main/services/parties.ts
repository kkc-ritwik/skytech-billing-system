import { and, desc, eq, isNull, like, or } from 'drizzle-orm'
import { getDb } from '../db/client'
import { parties } from '../db/schema'
import { partyInputSchema, type PartyInput } from '@shared/dto'
import type { AuthUser } from '@shared/ipc'
import { audit } from './audit'
import { partyBalances } from './ledger'

export async function listParties(filter?: {
  search?: string
  partyType?: 'customer' | 'vendor'
  activeOnly?: boolean
}) {
  const conds = [isNull(parties.deletedAt)]
  if (filter?.activeOnly) conds.push(eq(parties.isActive, true))
  if (filter?.partyType) {
    // 'both' parties appear under either tab.
    conds.push(or(eq(parties.partyType, filter.partyType), eq(parties.partyType, 'both'))!)
  }
  if (filter?.search) {
    const q = `%${filter.search}%`
    conds.push(or(like(parties.name, q), like(parties.phone, q), like(parties.gstin, q))!)
  }
  const rows = await getDb()
    .select({
      id: parties.id,
      partyType: parties.partyType,
      name: parties.name,
      displayCode: parties.displayCode,
      gstin: parties.gstin,
      contactPerson: parties.contactPerson,
      phone: parties.phone,
      email: parties.email,
      billingCity: parties.billingCity,
      billingState: parties.billingState,
      // Needed by the POS to decide IGST vs CGST/SGST. Without it every bill
      // silently falls back to intra-state.
      billingStateCode: parties.billingStateCode,
      creditLimit: parties.creditLimit,
      creditDays: parties.creditDays,
      dateOfBirth: parties.dateOfBirth,
      anniversaryDate: parties.anniversaryDate,
      openingBalance: parties.openingBalance,
      isActive: parties.isActive
    })
    .from(parties)
    .where(and(...conds))
    .orderBy(desc(parties.createdAt))

  const balances = await partyBalances()
  return rows.map((r) => ({ ...r, balance: balances.get(r.id) ?? r.openingBalance }))
}

export async function getParty(id: string) {
  return getDb().select().from(parties).where(eq(parties.id, id)).get()
}

export async function saveParty(input: PartyInput, user: AuthUser): Promise<string> {
  const d = partyInputSchema.parse(input)
  const db = getDb()
  const now = new Date()
  const values = {
    partyType: d.partyType,
    name: d.name,
    displayCode: d.displayCode ?? null,
    gstin: d.gstin ?? null,
    pan: d.pan ?? null,
    contactPerson: d.contactPerson ?? null,
    phone: d.phone ?? null,
    email: d.email ?? null,
    billingAddressLine1: d.billingAddressLine1 ?? null,
    billingAddressLine2: d.billingAddressLine2 ?? null,
    billingCity: d.billingCity ?? null,
    billingState: d.billingState ?? null,
    billingStateCode: d.billingStateCode ?? null,
    billingPincode: d.billingPincode ?? null,
    shippingAddressLine1: d.shippingAddressLine1 ?? null,
    shippingAddressLine2: d.shippingAddressLine2 ?? null,
    shippingCity: d.shippingCity ?? null,
    shippingState: d.shippingState ?? null,
    shippingPincode: d.shippingPincode ?? null,
    creditLimit: d.creditLimit,
    creditDays: d.creditDays,
    dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
    anniversaryDate: d.anniversaryDate ? new Date(d.anniversaryDate) : null,
    notes: d.notes ?? null,
    isActive: d.isActive,
    updatedAt: now
  }

  if (d.id) {
    await db.update(parties).set(values).where(eq(parties.id, d.id))
    await audit({ userId: user.id, username: user.username, action: 'party.update', entityType: 'party', entityId: d.id })
    return d.id
  }
  const row = await db
    .insert(parties)
    .values({ ...values, openingBalance: d.openingBalance, openingBalanceAt: now })
    .returning({ id: parties.id })
    .get()
  await audit({ userId: user.id, username: user.username, action: 'party.create', entityType: 'party', entityId: row.id })
  return row.id
}

export async function deleteParty(id: string, user: AuthUser): Promise<void> {
  await getDb().update(parties).set({ deletedAt: new Date(), isActive: false }).where(eq(parties.id, id))
  await audit({ userId: user.id, username: user.username, action: 'party.delete', entityType: 'party', entityId: id })
}
