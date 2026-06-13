import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { id, timestamps } from './common'

/**
 * The company that owns this installation (the seller / your customer).
 * Single row in the common case, but modelled as a table to allow multi-company
 * later (each document references a companyId).
 */
export const companies = sqliteTable('companies', {
  id: id(),
  legalName: text('legal_name').notNull(),
  tradeName: text('trade_name'),
  gstin: text('gstin'),
  pan: text('pan'),
  // Address
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  state: text('state'),
  stateCode: text('state_code'), // GST state code, drives CGST/SGST vs IGST
  pincode: text('pincode'),
  country: text('country').notNull().default('India'),
  // Contact
  phone: text('phone'),
  email: text('email'),
  website: text('website'),
  // Branding / banking shown on documents
  logoPath: text('logo_path'),
  bankName: text('bank_name'),
  bankAccountNo: text('bank_account_no'),
  bankIfsc: text('bank_ifsc'),
  bankBranch: text('bank_branch'),
  upiId: text('upi_id'),
  defaultTermsAndConditions: text('default_terms'),
  ...timestamps
})

/**
 * Free-form key/value app settings (theme, invoice prefix style, default tax,
 * print paper size, low-stock toggle, etc.). Values are JSON-encoded.
 */
export const settings = sqliteTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
  },
  () => ({})
)

/**
 * Indian financial year (1 Apr - 31 Mar). Document numbering is FY-aware and
 * resets each year. Exactly one row should be `isActive`.
 */
export const financialYears = sqliteTable(
  'financial_years',
  {
    id: id(),
    label: text('label').notNull(), // "2025-26"
    startDate: integer('start_date', { mode: 'timestamp_ms' }).notNull(),
    endDate: integer('end_date', { mode: 'timestamp_ms' }).notNull(),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    isClosed: integer('is_closed', { mode: 'boolean' }).notNull().default(false),
    ...timestamps
  },
  (t) => ({
    labelUq: uniqueIndex('fy_label_uq').on(t.label)
  })
)

/**
 * Per-document-type running numbers, scoped by financial year. The service layer
 * increments these inside the same transaction that creates the document, so
 * numbers are gapless and unique even under rapid entry.
 *
 * docType ∈ invoice | proforma | challan | sales_order | sales_return |
 *           purchase_order | grn | purchase_return | credit_note | debit_note |
 *           receipt | payment_voucher | stock_adjustment
 */
export const documentSequences = sqliteTable(
  'document_sequences',
  {
    id: id(),
    docType: text('doc_type').notNull(),
    financialYearId: text('financial_year_id')
      .notNull()
      .references(() => financialYears.id),
    prefix: text('prefix').notNull().default(''), // e.g. "INV"
    nextNumber: integer('next_number').notNull().default(1),
    padding: integer('padding').notNull().default(4), // INV/2025-26/0001
    ...timestamps
  },
  (t) => ({
    seqUq: uniqueIndex('doc_seq_uq').on(t.docType, t.financialYearId)
  })
)

export type Company = typeof companies.$inferSelect
export type FinancialYear = typeof financialYears.$inferSelect
export type DocumentSequence = typeof documentSequences.$inferSelect
