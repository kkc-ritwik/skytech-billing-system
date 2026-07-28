import { z } from 'zod'

/**
 * Validation schemas shared by the main process (authoritative validation) and
 * the renderer (form typing + optimistic client checks). One definition, no
 * drift. Money fields are integer paise; quantities are numbers.
 */

/**
 * Upper bounds on quantities and money.
 *
 * Money is held as integer paise in JavaScript numbers, which are exact only up
 * to 2^53. Without a ceiling, a fat-fingered quantity can produce a line total
 * that overflows SQLite's 64-bit integer column — the document saves but can no
 * longer be read back. These limits are far above anything a garment business
 * will ever bill (10 lakh pieces, ₹1 crore a piece) while keeping every
 * arithmetic result comfortably exact.
 */
export const MAX_QTY = 1_000_000
export const MAX_MONEY_PAISE = 100_000_000_00 // ₹1 crore
export const MAX_DOC_LINES = 500

const optionalText = z.string().trim().max(500).optional().nullable()
const money = z.number().int().min(0).max(MAX_MONEY_PAISE)

// ---- Reusable format validators (lenient: empty/null always allowed) ----
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const PHONE_RE = /^[0-9+\-\s()]{7,15}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function pattern(re: RegExp, msg: string, opts: { max?: number; upper?: boolean } = {}) {
  const max = opts.max ?? 60
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .refine((v) => v == null || v === '' || re.test(opts.upper ? v.toUpperCase() : v), { message: msg })
}

export const gstinField = pattern(GSTIN_RE, 'Enter a valid 15-character GSTIN (e.g. 07AABCA1234A1Z5)', { max: 15, upper: true })
export const panField = pattern(PAN_RE, 'Enter a valid PAN (e.g. AABCA1234A)', { max: 10, upper: true })
export const phoneField = pattern(PHONE_RE, 'Enter a valid phone number', { max: 15 })
export const emailField = pattern(EMAIL_RE, 'Enter a valid email address', { max: 120 })

export const itemInputSchema = z.object({
  id: z.string().optional(),
  sku: z.string().trim().min(1, 'SKU is required').max(60),
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: optionalText,
  categoryId: z.string().optional().nullable(),
  /**
   * Free-typed category, e.g. "Saree" or "Salwar Suit". Takes precedence over
   * categoryId: the shop types a name and it is created on first use, so there
   * is no separate screen to manage a category list.
   */
  categoryName: z.string().trim().max(60).optional().nullable(),
  unitId: z.string().optional().nullable(),
  hsnCode: optionalText,
  taxRateId: z.string().optional().nullable(),
  purchasePrice: money,
  sellingPrice: money,
  sellingPriceIsInclusive: z.boolean(),
  trackInventory: z.boolean(),
  reorderLevel: z.number().min(0),
  openingStock: z.number().min(0),
  openingStockValue: money,
  barcode: optionalText,
  isActive: z.boolean(),
  // Textile: metres in one piece (the CUT). 0 = not a cut-based item.
  cutLength: z.number().min(0).max(1000).default(0),
  packing: z.string().trim().max(30).optional().nullable()
})
export type ItemInput = z.infer<typeof itemInputSchema>

export const companyInputSchema = z.object({
  legalName: z.string().trim().min(1, 'Company name is required').max(200),
  tradeName: optionalText,
  gstin: gstinField,
  pan: panField,
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: optionalText,
  stateCode: z.string().trim().max(2).optional().nullable(),
  pincode: z.string().trim().max(10).optional().nullable(),
  phone: phoneField,
  email: emailField,
  website: optionalText,
  bankName: optionalText,
  bankAccountNo: z.string().trim().max(30).optional().nullable(),
  bankIfsc: z.string().trim().max(20).optional().nullable(),
  bankBranch: optionalText,
  upiId: z.string().trim().max(80).optional().nullable(),
  defaultTermsAndConditions: z.string().trim().max(2000).optional().nullable()
})
export type CompanyInput = z.infer<typeof companyInputSchema>

// ---- Transaction documents (sales + purchase share the line shape) ----

export const docLineSchema = z.object({
  itemId: z.string().optional().nullable(),
  description: z.string().trim().min(1, 'Line description is required').max(300),
  hsnCode: optionalText,
  batchNo: optionalText,
  expiryDate: z.number().optional().nullable(),
  // PCS on the printed bill.
  quantity: z
    .number()
    .positive('Quantity must be greater than 0')
    .max(MAX_QTY, `Quantity cannot exceed ${MAX_QTY.toLocaleString('en-IN')}`),
  // RATE per piece, in paise, exclusive of tax.
  unitPrice: z.number().int().min(0).max(MAX_MONEY_PAISE, 'Rate is too large'),
  discountPct: z.number().int().min(0).max(10000).default(0),
  discountAmount: z.number().int().min(0).max(MAX_MONEY_PAISE).default(0),
  taxRateBps: z.number().int().min(0).default(0)
})
export type DocLineInput = z.infer<typeof docLineSchema>

/**
 * Sales lines additionally carry the textile presentation fields. These live
 * only on the sales side because `purchase_document_lines` has no such columns
 * — keeping them off `docLineSchema` stops purchase paperwork inheriting them.
 */
export const salesDocLineSchema = docLineSchema.extend({
  // Metres per piece; MTS is derived as quantity x cutLength for display only.
  cutLength: z.number().min(0).max(1000).default(0),
  packing: z.string().trim().max(30).optional().nullable()
})
export type SalesDocLineInput = z.infer<typeof salesDocLineSchema>

export const SALES_DOC_TYPES = ['sales_order', 'proforma', 'invoice', 'challan', 'sales_return'] as const
export const PURCHASE_DOC_TYPES = ['purchase_order', 'grn', 'purchase_return'] as const

export const salesDocInputSchema = z.object({
  id: z.string().optional(),
  docType: z.enum(SALES_DOC_TYPES),
  partyId: z.string().min(1, 'Select a client'),
  parentId: z.string().optional().nullable(),
  issueDate: z.number(),
  dueDate: z.number().optional().nullable(),
  referenceNo: optionalText,
  isInterState: z.boolean(),
  extraChargesLabel: optionalText,
  extraCharges: z.number().int().min(0).default(0),
  extraDiscount: z.number().int().min(0).default(0),

  // Invoice-level trade scheme applied BEFORE GST (200 bps = 2.00%).
  schemeLabel: z.string().trim().max(30).optional().nullable(),
  schemePct: z.number().int().min(0).max(10000).default(0),

  // Dispatch / transport block printed on the invoice head.
  challanNo: optionalText,
  orderNo: optionalText,
  agentName: optionalText,
  consigneeName: optionalText,
  consigneeGstin: gstinField,
  lrNo: optionalText,
  lrDate: z.number().optional().nullable(),
  transportName: optionalText,
  transportStation: optionalText,
  caseNo: optionalText,
  weight: z.number().min(0).default(0),
  freight: z.number().int().min(0).default(0),
  ewayBillNo: z.string().trim().max(20).optional().nullable(),
  transporterId: z.string().trim().max(20).optional().nullable(),
  dueDays: z.number().int().min(0).max(3650).default(0),

  notes: z.string().trim().max(2000).optional().nullable(),
  termsAndConditions: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(salesDocLineSchema).min(1, 'Add at least one line item').max(MAX_DOC_LINES, `A document cannot have more than ${MAX_DOC_LINES} lines`)
})
export type SalesDocInput = z.infer<typeof salesDocInputSchema>

export const purchaseDocInputSchema = z.object({
  id: z.string().optional(),
  docType: z.enum(PURCHASE_DOC_TYPES),
  partyId: z.string().min(1, 'Select a vendor'),
  parentId: z.string().optional().nullable(),
  issueDate: z.number(),
  dueDate: z.number().optional().nullable(),
  supplierInvoiceNo: optionalText,
  supplierInvoiceDate: z.number().optional().nullable(),
  isInterState: z.boolean(),
  extraChargesLabel: optionalText,
  extraCharges: z.number().int().min(0).default(0),
  extraDiscount: z.number().int().min(0).default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(docLineSchema).min(1, 'Add at least one line item').max(MAX_DOC_LINES, `A document cannot have more than ${MAX_DOC_LINES} lines`)
})
export type PurchaseDocInput = z.infer<typeof purchaseDocInputSchema>

// ---- Payments ----

export const paymentAllocationSchema = z.object({
  refType: z.enum(['sales', 'purchase']),
  documentId: z.string().min(1),
  amount: z.number().int().min(1)
})

export const paymentInputSchema = z.object({
  direction: z.enum(['inbound', 'outbound']),
  partyId: z.string().min(1, 'Select a party'),
  amount: z.number().int().min(1, 'Amount must be greater than 0'),
  paidAt: z.number(),
  mode: z.enum(['upi', 'bank_transfer', 'cash', 'cheque', 'card', 'other']),
  referenceNo: optionalText,
  bankAccount: optionalText,
  notes: optionalText,
  allocations: z.array(paymentAllocationSchema).default([])
})
export type PaymentInput = z.infer<typeof paymentInputSchema>

// ---- Inventory adjustments ----

export const stockAdjustmentInputSchema = z.object({
  reason: z.enum(['damage', 'expiry', 'count_correction', 'other']),
  note: optionalText,
  adjustedAt: z.number(),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qtyDelta: z.number().refine((n) => n !== 0, 'Quantity change cannot be zero'),
        unitCost: z.number().int().min(0).default(0)
      })
    )
    .min(1, 'Add at least one item')
})
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentInputSchema>

// ---- Users / staff accounts ----

export const USER_ROLES = ['super_admin', 'admin', 'manager', 'operator'] as const

export const userInputSchema = z.object({
  id: z.string().optional(),
  fullName: z.string().trim().min(1, 'Full name is required').max(120),
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(40),
  email: z.string().trim().max(120).optional().nullable(),
  role: z.enum(USER_ROLES),
  isActive: z.boolean(),
  // Required on create; optional on edit (acts as a password reset when present).
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal(''))
})
export type UserInput = z.infer<typeof userInputSchema>

export const PARTY_TYPES = ['customer', 'vendor', 'both'] as const

export const partyInputSchema = z.object({
  id: z.string().optional(),
  partyType: z.enum(PARTY_TYPES),
  name: z.string().trim().min(1, 'Name is required').max(200),
  displayCode: optionalText,
  gstin: gstinField,
  pan: panField,
  contactPerson: optionalText,
  phone: phoneField,
  email: emailField,
  billingAddressLine1: optionalText,
  billingAddressLine2: optionalText,
  billingCity: optionalText,
  billingState: optionalText,
  billingStateCode: z.string().trim().max(2).optional().nullable(),
  billingPincode: z.string().trim().max(10).optional().nullable(),
  shippingAddressLine1: optionalText,
  shippingAddressLine2: optionalText,
  shippingCity: optionalText,
  shippingState: optionalText,
  shippingPincode: z.string().trim().max(10).optional().nullable(),
  creditLimit: z.number().int().min(0),
  creditDays: z.number().int().min(0),
  openingBalance: z.number().int(),
  notes: optionalText,
  isActive: z.boolean()
})
export type PartyInput = z.infer<typeof partyInputSchema>
