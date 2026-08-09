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
  /** Shop floor staff credited with the sale. */
  salespersonId: z.string().optional().nullable(),
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

/**
 * Purchase lines additionally carry the repricing a buyer does at goods-in:
 * the margin applied over the purchase rate, and the resulting selling price.
 * Both are written back onto the item when the goods are received, so the next
 * purchase of the same design starts from what it was priced at last time.
 */
export const purchaseDocLineSchema = docLineSchema.extend({
  marginBps: z.number().int().min(0).max(1_000_000).optional(),
  sellingPrice: z.number().int().min(0).max(MAX_MONEY_PAISE, 'Selling price is too large').optional()
})
export type PurchaseDocLineInput = z.infer<typeof purchaseDocLineSchema>

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
  /** Discount on the whole bill, applied BEFORE tax. Percentage form. */
  schemePct: z.number().int().min(0).max(10000).default(0),
  /** Discount on the whole bill, applied BEFORE tax. Flat rupee form, in paise. */
  schemeAmount: z.number().int().min(0).max(MAX_MONEY_PAISE).default(0),
  /** Batch / lot number for the whole consignment. */
  batchNo: optionalText,
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(purchaseDocLineSchema).min(1, 'Add at least one line item').max(MAX_DOC_LINES, `A document cannot have more than ${MAX_DOC_LINES} lines`)
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
  /** Discount allowed for settling now. Settles amount + this against the bill. */
  cashDiscount: z.number().int().min(0).max(MAX_MONEY_PAISE).default(0),
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
  /** Birthday and wedding anniversary, for greetings. Both optional. */
  dateOfBirth: z.number().optional().nullable(),
  anniversaryDate: z.number().optional().nullable(),
  openingBalance: z.number().int(),
  notes: optionalText,
  isActive: z.boolean()
})
export type PartyInput = z.infer<typeof partyInputSchema>

// ---------------------------------------------------------------------------
// Barcode label sheets
// ---------------------------------------------------------------------------

/** Most labels a single print job may produce, to keep the PDF renderable. */
export const MAX_LABELS_PER_JOB = 5000
/** Copies of one item on one job. A shop tagging a full bale needs hundreds. */
export const MAX_LABEL_COPIES = 1000

/** A millimetre measurement on a label sheet. */
const mm = (min: number, max: number, what: string): z.ZodNumber =>
  z
    .number({ invalid_type_error: `${what} must be a number in mm` })
    .min(min, `${what} must be at least ${min} mm`)
    .max(max, `${what} cannot exceed ${max} mm`)

export const labelSheetSchema = z
  .object({
    pageWidthMm: mm(20, 1000, 'Sheet width'),
    pageHeightMm: mm(20, 1000, 'Sheet height'),
    marginTopMm: mm(0, 200, 'Top margin'),
    marginRightMm: mm(0, 200, 'Right margin'),
    marginBottomMm: mm(0, 200, 'Bottom margin'),
    marginLeftMm: mm(0, 200, 'Left margin'),
    labelWidthMm: mm(10, 1000, 'Label width'),
    labelHeightMm: mm(6, 1000, 'Label height'),
    columnGapMm: mm(0, 100, 'Gap between columns'),
    rowGapMm: mm(0, 100, 'Gap between rows'),
    showName: z.boolean(),
    showSku: z.boolean(),
    showPrice: z.boolean(),
    /**
     * Labels to leave blank at the start, so a part-used sheet can be fed back
     * through the printer instead of thrown away.
     */
    skipLabels: z.number().int().min(0).max(1000)
  })
  .superRefine((s, ctx) => {
    const usableW = s.pageWidthMm - s.marginLeftMm - s.marginRightMm
    const usableH = s.pageHeightMm - s.marginTopMm - s.marginBottomMm
    if (s.labelWidthMm > usableW + 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['labelWidthMm'],
        message: `A ${s.labelWidthMm} mm label does not fit in ${usableW.toFixed(1)} mm of usable width. Reduce the label width or the side margins.`
      })
    }
    if (s.labelHeightMm > usableH + 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['labelHeightMm'],
        message: `A ${s.labelHeightMm} mm label does not fit in ${usableH.toFixed(1)} mm of usable height. Reduce the label height or the top/bottom margins.`
      })
    }
  })
export type LabelSheet = z.infer<typeof labelSheetSchema>

export const labelRequestSchema = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        copies: z.number().int().min(1, 'Print at least 1 label').max(MAX_LABEL_COPIES, `At most ${MAX_LABEL_COPIES} copies of one item`)
      })
    )
    .min(1, 'Select at least one item')
    .max(1000, 'Too many different items in one job'),
  sheet: labelSheetSchema
})
export type LabelRequestInput = z.infer<typeof labelRequestSchema>

// ---------------------------------------------------------------------------
// Salespersons — shop floor staff credited with a sale
// ---------------------------------------------------------------------------

export const salespersonInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: phoneField,
  code: z.string().trim().max(30).optional().nullable(),
  /** Incentive rate in basis points; 250 = 2.5%. */
  incentiveBps: z.number().int().min(0).max(10000, 'Incentive cannot exceed 100%').default(0),
  notes: z.string().trim().max(500).optional().nullable(),
  isActive: z.boolean()
})
export type SalespersonInput = z.infer<typeof salespersonInputSchema>
