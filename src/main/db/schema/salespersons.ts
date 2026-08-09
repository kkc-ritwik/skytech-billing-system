import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { id, timestamps, softDelete } from './common'

/**
 * Shop floor staff credited with a sale.
 *
 * Deliberately separate from `users`: the people who sell sarees on the floor
 * do not log in to the software, and the person operating the till is usually
 * not the person who made the sale. Keeping them apart means a shop can credit
 * ten salespeople while paying for one counter login, and staff turnover does
 * not disturb the login accounts.
 */
export const salespersons = sqliteTable(
  'salespersons',
  {
    id: id(),
    name: text('name').notNull(),
    phone: text('phone'),
    /** Employee/staff code the shop already uses on its own registers. */
    code: text('code'),
    /**
     * Incentive rate in basis points (250 = 2.5%) applied to what they sell.
     * Zero means the shop works out incentives outside the software.
     */
    incentiveBps: integer('incentive_bps').notNull().default(0),
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
    ...softDelete
  },
  (t) => ({ nameIdx: index('salesperson_name_idx').on(t.name) })
)

export type Salesperson = typeof salespersons.$inferSelect
