import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { id, timestamps, softDelete } from './common'

/**
 * Unified party master. A party can be a customer (school/college), a vendor, or
 * both. `partyType` drives where they appear in the UI; balances are computed
 * from the ledgers, never stored denormalised.
 */
export const PARTY_TYPES = ['customer', 'vendor', 'both'] as const

export const parties = sqliteTable(
  'parties',
  {
    id: id(),
    partyType: text('party_type', { enum: PARTY_TYPES }).notNull().default('customer'),
    name: text('name').notNull(), // Institution / business name
    displayCode: text('display_code'), // short code, e.g. "DPS-NOIDA"
    gstin: text('gstin'),
    pan: text('pan'),
    // Primary contact person
    contactPerson: text('contact_person'),
    phone: text('phone'),
    email: text('email'),
    // Billing address
    billingAddressLine1: text('billing_address_line1'),
    billingAddressLine2: text('billing_address_line2'),
    billingCity: text('billing_city'),
    billingState: text('billing_state'),
    billingStateCode: text('billing_state_code'), // for CGST/SGST vs IGST
    billingPincode: text('billing_pincode'),
    // Shipping address (defaults to billing when null)
    shippingAddressLine1: text('shipping_address_line1'),
    shippingAddressLine2: text('shipping_address_line2'),
    shippingCity: text('shipping_city'),
    shippingState: text('shipping_state'),
    shippingPincode: text('shipping_pincode'),
    // Commercial terms
    creditLimit: integer('credit_limit').notNull().default(0), // paise; 0 = no limit
    creditDays: integer('credit_days').notNull().default(0),
    // Opening balance: positive = party owes us (debit), negative = we owe them
    openingBalance: integer('opening_balance').notNull().default(0),
    openingBalanceAt: integer('opening_balance_at', { mode: 'timestamp_ms' }),
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
    ...softDelete
  },
  (t) => ({
    typeIdx: index('parties_type_idx').on(t.partyType),
    nameIdx: index('parties_name_idx').on(t.name)
  })
)

export type Party = typeof parties.$inferSelect
export type NewParty = typeof parties.$inferInsert
