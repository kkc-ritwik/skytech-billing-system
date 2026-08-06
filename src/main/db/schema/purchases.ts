import { integer, real, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { id, timestamps, softDelete } from './common'
import { parties } from './parties'
import { items } from './items'
import { users } from './auth'

/**
 * Unified purchase document header (mirror of salesDocuments for the inbound
 * side).
 *
 * docType ∈ purchase_order | grn | purchase_return
 *   - grn (Goods Received Note) is what actually increases inventory.
 *   - purchase_return decreases inventory and creates a debit note.
 * status  ∈ draft | confirmed | partially_received | received | cancelled
 */
export const purchaseDocuments = sqliteTable(
  'purchase_documents',
  {
    id: id(),
    docType: text('doc_type').notNull(),
    number: text('number').notNull(),
    partyId: text('party_id')
      .notNull()
      .references(() => parties.id),
    parentId: text('parent_id'),
    issueDate: integer('issue_date', { mode: 'timestamp_ms' }).notNull(),
    dueDate: integer('due_date', { mode: 'timestamp_ms' }),
    supplierInvoiceNo: text('supplier_invoice_no'),
    supplierInvoiceDate: integer('supplier_invoice_date', { mode: 'timestamp_ms' }),
    isInterState: integer('is_inter_state', { mode: 'boolean' }).notNull().default(false),
    status: text('status').notNull().default('draft'),

    subTotal: integer('sub_total').notNull().default(0),
    discountTotal: integer('discount_total').notNull().default(0),
    cgstTotal: integer('cgst_total').notNull().default(0),
    sgstTotal: integer('sgst_total').notNull().default(0),
    igstTotal: integer('igst_total').notNull().default(0),
    cessTotal: integer('cess_total').notNull().default(0),
    extraChargesLabel: text('extra_charges_label'),
    extraCharges: integer('extra_charges').notNull().default(0),
    extraDiscount: integer('extra_discount').notNull().default(0),

    // ---- Bill-level discount from the vendor, applied BEFORE tax ----
    // Vendors quote this either as a percentage off the bill or as a flat
    // rupee figure, and GST is charged on what is left after it. Both forms are
    // kept: the percentage as entered, and the rupee amount it worked out to.
    schemePct: integer('scheme_pct').notNull().default(0), // basis points
    schemeAmount: integer('scheme_amount').notNull().default(0), // paise

    /** Batch / lot number covering the whole consignment. */
    batchNo: text('batch_no'),

    roundOff: integer('round_off').notNull().default(0),
    grandTotal: integer('grand_total').notNull().default(0),

    paidAmount: integer('paid_amount').notNull().default(0),
    paymentStatus: text('payment_status').notNull().default('unpaid'),

    notes: text('notes'),
    createdBy: text('created_by').references(() => users.id),
    ...timestamps,
    ...softDelete
  },
  (t) => ({
    numUq: uniqueIndex('purchase_doc_num_uq').on(t.docType, t.number),
    partyIdx: index('purchase_doc_party_idx').on(t.partyId),
    typeIdx: index('purchase_doc_type_idx').on(t.docType),
    dateIdx: index('purchase_doc_date_idx').on(t.issueDate)
  })
)

export const purchaseDocumentLines = sqliteTable(
  'purchase_document_lines',
  {
    id: id(),
    documentId: text('document_id')
      .notNull()
      .references(() => purchaseDocuments.id),
    itemId: text('item_id').references(() => items.id),
    description: text('description').notNull(),
    hsnCode: text('hsn_code'),
    batchNo: text('batch_no'),
    expiryDate: integer('expiry_date', { mode: 'timestamp_ms' }),
    quantity: real('quantity').notNull(),
    unitPrice: integer('unit_price').notNull(),
    discountPct: integer('discount_pct').notNull().default(0),
    discountAmount: integer('discount_amount').notNull().default(0),
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    taxableValue: integer('taxable_value').notNull().default(0),
    cgstAmount: integer('cgst_amount').notNull().default(0),
    sgstAmount: integer('sgst_amount').notNull().default(0),
    igstAmount: integer('igst_amount').notNull().default(0),
    cessAmount: integer('cess_amount').notNull().default(0),
    lineTotal: integer('line_total').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0)
  },
  (t) => ({ docIdx: index('purchase_line_doc_idx').on(t.documentId) })
)

export type PurchaseDocument = typeof purchaseDocuments.$inferSelect
export type PurchaseDocumentLine = typeof purchaseDocumentLines.$inferSelect
