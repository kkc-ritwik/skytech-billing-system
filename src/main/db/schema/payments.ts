import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { id, timestamps, softDelete } from './common'
import { parties } from './parties'
import { users } from './auth'

/**
 * A money movement recorded in the software AFTER it actually happened in the
 * bank/UPI (payment is always out-of-band). direction:
 *   - 'inbound'  : customer paid us  -> generates a Receipt Voucher
 *   - 'outbound' : we paid a vendor  -> generates a Payment Voucher
 *
 * A payment is allocated against one or more documents via paymentAllocations.
 * Any unallocated remainder sits as an on-account advance for that party.
 */
export const payments = sqliteTable(
  'payments',
  {
    id: id(),
    number: text('number').notNull(),
    direction: text('direction').notNull(), // inbound | outbound
    partyId: text('party_id')
      .notNull()
      .references(() => parties.id),
    amount: integer('amount').notNull(), // paise
    allocatedAmount: integer('allocated_amount').notNull().default(0),
    /**
     * Cash discount the party allowed for settling now, in paise.
     *
     * The money that changed hands is `amount`; the bill is settled for
     * `amount + cashDiscount`. Kept separately so the books show what was
     * actually paid and what was written off, rather than pretending the
     * larger figure was received.
     */
    cashDiscount: integer('cash_discount').notNull().default(0),
    paidAt: integer('paid_at', { mode: 'timestamp_ms' }).notNull(),
    mode: text('mode').notNull(), // upi | bank_transfer | cash | cheque | card | other
    referenceNo: text('reference_no'), // UTR / cheque no / txn id
    bankAccount: text('bank_account'),
    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id),
    ...timestamps,
    ...softDelete
  },
  (t) => ({
    numUq: uniqueIndex('payment_num_uq').on(t.number),
    partyIdx: index('payment_party_idx').on(t.partyId),
    dirIdx: index('payment_dir_idx').on(t.direction)
  })
)

/**
 * Links a payment to a specific document (invoice / purchase / return). Updating
 * a document's paidAmount happens in the same transaction as inserting here.
 * refType ∈ sales | purchase
 */
export const paymentAllocations = sqliteTable(
  'payment_allocations',
  {
    id: id(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id),
    refType: text('ref_type').notNull(),
    documentId: text('document_id').notNull(),
    amount: integer('amount').notNull() // paise applied to this document
  },
  (t) => ({
    payIdx: index('alloc_payment_idx').on(t.paymentId),
    docIdx: index('alloc_doc_idx').on(t.documentId)
  })
)

export type Payment = typeof payments.$inferSelect
export type PaymentAllocation = typeof paymentAllocations.$inferSelect
