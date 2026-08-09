import { integer, real, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { id, timestamps, softDelete } from './common'
import { parties } from './parties'
import { items } from './items'
import { users } from './auth'

/**
 * Unified sales document header. One table for every outbound document so the
 * conversion chain (order -> proforma -> invoice -> challan) and returns share
 * one consistent shape. `docType` discriminates behaviour.
 *
 * docType ∈ sales_order | proforma | invoice | challan | sales_return
 * status  ∈ draft | confirmed | partially_delivered | delivered | cancelled
 *           (invoices also use payment status fields below)
 *
 * All money fields are paise. Tax is split CGST/SGST (intra-state) OR IGST
 * (inter-state) based on company vs party state code.
 */
export const salesDocuments = sqliteTable(
  'sales_documents',
  {
    id: id(),
    docType: text('doc_type').notNull(),
    number: text('number').notNull(), // INV/2025-26/0001
    partyId: text('party_id')
      .notNull()
      .references(() => parties.id),
    // Links a document to the one it was created from (e.g. invoice -> order).
    parentId: text('parent_id'),
    issueDate: integer('issue_date', { mode: 'timestamp_ms' }).notNull(),
    dueDate: integer('due_date', { mode: 'timestamp_ms' }),
    referenceNo: text('reference_no'), // customer PO no, etc.
    placeOfSupply: text('place_of_supply'), // state code
    isInterState: integer('is_inter_state', { mode: 'boolean' }).notNull().default(false),

    status: text('status').notNull().default('draft'),

    // Totals (paise)
    subTotal: integer('sub_total').notNull().default(0), // sum of line taxable values
    discountTotal: integer('discount_total').notNull().default(0),
    cgstTotal: integer('cgst_total').notNull().default(0),
    sgstTotal: integer('sgst_total').notNull().default(0),
    igstTotal: integer('igst_total').notNull().default(0),
    cessTotal: integer('cess_total').notNull().default(0),
    // Invoice-level adjustments applied after line tax (e.g. freight, special discount).
    extraChargesLabel: text('extra_charges_label'),
    extraCharges: integer('extra_charges').notNull().default(0),
    extraDiscount: integer('extra_discount').notNull().default(0),
    roundOff: integer('round_off').notNull().default(0),
    grandTotal: integer('grand_total').notNull().default(0),

    // ---- Invoice-level trade scheme, applied BEFORE tax ----
    // Printed on the bill as "DISCOUNT -> 52126.00 X -2.00 % : -1,042.52" (the
    // label is the trader's wording: DISCOUNT, SCHEME, ...). GST is charged on
    // the value net of this, so it cannot reuse the post-tax extraDiscount.
    schemeLabel: text('scheme_label'),
    schemePct: integer('scheme_pct').notNull().default(0), // basis points, 200 = 2.00%
    schemeAmount: integer('scheme_amount').notNull().default(0), // paise, derived

    // ---- Dispatch / transport block printed on the invoice head ----
    challanNo: text('challan_no'),
    orderNo: text('order_no'),
    agentName: text('agent_name'),
    /**
     * Shop floor staff credited with this sale.
     *
     * One per bill: the shop wants to know who sold what, and at a saree
     * counter a single bill is normally one customer being served by one
     * person. Nullable, because a bill raised from the back office has nobody
     * on the floor to credit.
     */
    salespersonId: text('salesperson_id'),

    consigneeName: text('consignee_name'),
    consigneeGstin: text('consignee_gstin'),
    lrNo: text('lr_no'),
    lrDate: integer('lr_date', { mode: 'timestamp_ms' }),
    transportName: text('transport_name'),
    transportStation: text('transport_station'),
    caseNo: text('case_no'),
    weight: real('weight').notNull().default(0),
    freight: integer('freight').notNull().default(0), // paise
    ewayBillNo: text('eway_bill_no'),
    transporterId: text('transporter_id'),
    dueDays: integer('due_days').notNull().default(0),

    // Payment tracking (invoices / sales_returns). paidAmount is maintained in
    // the same transaction as payment allocations.
    paidAmount: integer('paid_amount').notNull().default(0),
    paymentStatus: text('payment_status').notNull().default('unpaid'), // unpaid|partial|paid

    notes: text('notes'),
    termsAndConditions: text('terms'),
    createdBy: text('created_by').references(() => users.id),
    ...timestamps,
    ...softDelete
  },
  (t) => ({
    numUq: uniqueIndex('sales_doc_num_uq').on(t.docType, t.number),
    partyIdx: index('sales_doc_party_idx').on(t.partyId),
    typeIdx: index('sales_doc_type_idx').on(t.docType),
    dateIdx: index('sales_doc_date_idx').on(t.issueDate)
  })
)

export const salesDocumentLines = sqliteTable(
  'sales_document_lines',
  {
    id: id(),
    documentId: text('document_id')
      .notNull()
      .references(() => salesDocuments.id),
    itemId: text('item_id').references(() => items.id),
    description: text('description').notNull(),
    hsnCode: text('hsn_code'),
    batchNo: text('batch_no'),
    expiryDate: integer('expiry_date', { mode: 'timestamp_ms' }),
    // PCS on the printed bill. `unitPrice` is the RATE **per piece**, so
    // lineTotal = quantity x unitPrice (metres never enter the money math).
    quantity: real('quantity').notNull(),
    // Metres in one piece; MTS on the bill is derived as quantity x cutLength.
    cutLength: real('cut_length').notNull().default(0),
    packing: text('packing'),
    unitPrice: integer('unit_price').notNull(), // paise, exclusive of tax
    discountPct: integer('discount_pct').notNull().default(0), // basis points
    discountAmount: integer('discount_amount').notNull().default(0), // paise
    taxRateBps: integer('tax_rate_bps').notNull().default(0),
    taxableValue: integer('taxable_value').notNull().default(0),
    cgstAmount: integer('cgst_amount').notNull().default(0),
    sgstAmount: integer('sgst_amount').notNull().default(0),
    igstAmount: integer('igst_amount').notNull().default(0),
    cessAmount: integer('cess_amount').notNull().default(0),
    lineTotal: integer('line_total').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0)
  },
  (t) => ({ docIdx: index('sales_line_doc_idx').on(t.documentId) })
)

export type SalesDocument = typeof salesDocuments.$inferSelect
export type SalesDocumentLine = typeof salesDocumentLines.$inferSelect
