import { applyBps, roundToRupee, type Paise } from './money'

/**
 * Single source of truth for document tax & total computation. Used by the main
 * process (authoritative, persisted) AND the renderer (live totals while
 * editing) so what the user sees equals what is saved.
 *
 * All money is integer paise. Tax split: intra-state => CGST+SGST (half each);
 * inter-state => IGST (full). Determined by isInterState (company vs party
 * state code).
 */

export interface LineInput {
  quantity: number
  unitPrice: Paise // exclusive of tax
  discountPct?: number // basis points (e.g. 1000 = 10%)
  discountAmount?: Paise // absolute; takes precedence over discountPct when > 0
  taxRateBps: number // e.g. 1800 = 18%
  /** Metres in one piece. Display-only: MTS = quantity x cutLength. */
  cutLength?: number
}

export interface LineComputed {
  quantity: number
  unitPrice: Paise
  discountPct: number
  discountAmount: Paise
  taxRateBps: number
  taxableValue: Paise
  cgstAmount: Paise
  sgstAmount: Paise
  igstAmount: Paise
  cessAmount: Paise
  lineTotal: Paise
  /** Share of the invoice-level scheme discount carried by this line. */
  schemeShare: Paise
  /** Derived total metres for the printed bill (never used in money math). */
  metres: number
}

export interface DocumentTotals {
  subTotal: Paise
  discountTotal: Paise
  /** Invoice-level pre-tax scheme discount (positive number). */
  schemeAmount: Paise
  /** subTotal - schemeAmount. This is what GST is charged on. */
  taxableValue: Paise
  cgstTotal: Paise
  sgstTotal: Paise
  igstTotal: Paise
  cessTotal: Paise
  extraCharges: Paise
  extraDiscount: Paise
  roundOff: Paise
  grandTotal: Paise
  /** Total pieces and metres, for the SUB TOTAL row of the printed bill. */
  totalPcs: number
  totalMetres: number
}

export interface DocumentExtras {
  extraCharges?: Paise // post-tax additions (freight, packing…)
  extraDiscount?: Paise // post-tax flat discount
  /** Invoice-level discount in basis points, applied BEFORE tax (200 = 2%). */
  schemePct?: number
}

/**
 * Split `total` across `weights` so the parts sum to exactly `total` (largest
 * remainder). Used to push the invoice-level scheme discount and each GST
 * group's tax back onto individual lines without losing or inventing paise.
 */
function apportion(total: Paise, weights: number[]): Paise[] {
  const sumW = weights.reduce((a, b) => a + b, 0)
  if (sumW <= 0 || total === 0) return weights.map(() => 0)

  const exact = weights.map((w) => (total * w) / sumW)
  const out = exact.map((e) => Math.floor(e))
  let remainder = total - out.reduce((a, b) => a + b, 0)

  // Hand the leftover paise to the lines with the largest fractional parts.
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    out[order[k].i]++
  }
  return out
}

export function computeLine(input: LineInput, isInterState: boolean): LineComputed {
  const qty = input.quantity
  // RATE is per piece: a line's value never depends on its metres.
  const gross = Math.round(qty * input.unitPrice)
  const discountAmount =
    input.discountAmount && input.discountAmount > 0
      ? input.discountAmount
      : applyBps(gross, input.discountPct ?? 0)
  const taxableValue = Math.max(0, gross - discountAmount)
  const tax = applyBps(taxableValue, input.taxRateBps)

  const cgstAmount = isInterState ? 0 : Math.round(tax / 2)
  const sgstAmount = isInterState ? 0 : tax - cgstAmount // ensures cgst+sgst === tax
  const igstAmount = isInterState ? tax : 0

  const cut = input.cutLength ?? 0
  return {
    quantity: qty,
    unitPrice: input.unitPrice,
    discountPct: input.discountPct ?? 0,
    discountAmount,
    taxRateBps: input.taxRateBps,
    taxableValue,
    cgstAmount,
    sgstAmount,
    igstAmount,
    cessAmount: 0,
    lineTotal: taxableValue + tax,
    schemeShare: 0,
    metres: Math.round(qty * cut * 100) / 100
  }
}

/**
 * Compute a whole document.
 *
 * Order of operations matters and mirrors the trade's printed bill:
 *   1. line value            = PCS x RATE, less any line discount
 *   2. SUB TOTAL             = sum of line values
 *   3. SCHEME / DISCOUNT     = SUB TOTAL x schemePct   <- BEFORE tax
 *   4. Taxable Value         = SUB TOTAL - scheme
 *   5. GST                   = rate applied once per tax-rate group, so the
 *                              printed "IGST @ 5.00% on 51,083.48 = 2,554.17"
 *                              is exact rather than a sum of per-line roundings
 *   6. round the grand total to the nearest rupee
 *
 * The scheme discount and each group's tax are pushed back onto lines by
 * largest-remainder apportionment, so line values still sum to the totals.
 */
export function computeDocument(
  lines: LineInput[],
  isInterState: boolean,
  extras: DocumentExtras = {}
): { lines: LineComputed[]; totals: DocumentTotals } {
  const computed = lines.map((l) => computeLine(l, isInterState))
  const sum = (pick: (c: LineComputed) => number): number => computed.reduce((a, c) => a + pick(c), 0)

  const subTotal = sum((c) => c.taxableValue)
  const discountTotal = sum((c) => c.discountAmount)

  // ---- 3 & 4: invoice-level scheme, applied before any GST ----
  const schemePct = Math.max(0, Math.round(extras.schemePct ?? 0))
  const schemeAmount = Math.min(subTotal, applyBps(subTotal, schemePct))
  const schemeShares = apportion(schemeAmount, computed.map((c) => c.taxableValue))
  computed.forEach((c, i) => {
    c.schemeShare = schemeShares[i]
  })
  const netTaxable = subTotal - schemeAmount

  // ---- 5: tax once per rate group, then distributed back to lines ----
  const groups = new Map<number, number[]>()
  computed.forEach((c, i) => {
    const arr = groups.get(c.taxRateBps) ?? []
    arr.push(i)
    groups.set(c.taxRateBps, arr)
  })

  for (const [rateBps, idxs] of groups) {
    const groupNet = idxs.reduce((a, i) => a + computed[i].taxableValue - computed[i].schemeShare, 0)
    const groupTax = applyBps(groupNet, rateBps)
    const perLine = apportion(groupTax, idxs.map((i) => computed[i].taxableValue - computed[i].schemeShare))
    idxs.forEach((i, k) => {
      const c = computed[i]
      const tax = perLine[k]
      c.cgstAmount = isInterState ? 0 : Math.round(tax / 2)
      c.sgstAmount = isInterState ? 0 : tax - c.cgstAmount
      c.igstAmount = isInterState ? tax : 0
      c.lineTotal = c.taxableValue - c.schemeShare + tax
    })
  }

  const cgstTotal = sum((c) => c.cgstAmount)
  const sgstTotal = sum((c) => c.sgstAmount)
  const igstTotal = sum((c) => c.igstAmount)
  const cessTotal = sum((c) => c.cessAmount)
  const extraCharges = Math.max(0, Math.round(extras.extraCharges ?? 0))
  const extraDiscount = Math.max(0, Math.round(extras.extraDiscount ?? 0))

  const beforeRound =
    netTaxable + cgstTotal + sgstTotal + igstTotal + cessTotal + extraCharges - extraDiscount
  const { rounded, roundOff } = roundToRupee(beforeRound)

  return {
    lines: computed,
    totals: {
      subTotal,
      discountTotal,
      schemeAmount,
      taxableValue: netTaxable,
      cgstTotal,
      sgstTotal,
      igstTotal,
      cessTotal,
      extraCharges,
      extraDiscount,
      roundOff,
      grandTotal: rounded,
      totalPcs: Math.round(sum((c) => c.quantity) * 100) / 100,
      totalMetres: Math.round(sum((c) => c.metres) * 100) / 100
    }
  }
}
