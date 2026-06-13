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
}

export interface DocumentTotals {
  subTotal: Paise
  discountTotal: Paise
  cgstTotal: Paise
  sgstTotal: Paise
  igstTotal: Paise
  cessTotal: Paise
  extraCharges: Paise
  extraDiscount: Paise
  roundOff: Paise
  grandTotal: Paise
}

export interface DocumentExtras {
  extraCharges?: Paise // post-tax additions (freight, packing…)
  extraDiscount?: Paise // post-tax flat discount
}

export function computeLine(input: LineInput, isInterState: boolean): LineComputed {
  const qty = input.quantity
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
    lineTotal: taxableValue + tax
  }
}

export function computeDocument(
  lines: LineInput[],
  isInterState: boolean,
  extras: DocumentExtras = {}
): { lines: LineComputed[]; totals: DocumentTotals } {
  const computed = lines.map((l) => computeLine(l, isInterState))
  const sum = (pick: (c: LineComputed) => number): number => computed.reduce((a, c) => a + pick(c), 0)

  const subTotal = sum((c) => c.taxableValue)
  const discountTotal = sum((c) => c.discountAmount)
  const cgstTotal = sum((c) => c.cgstAmount)
  const sgstTotal = sum((c) => c.sgstAmount)
  const igstTotal = sum((c) => c.igstAmount)
  const cessTotal = sum((c) => c.cessAmount)
  const extraCharges = Math.max(0, Math.round(extras.extraCharges ?? 0))
  const extraDiscount = Math.max(0, Math.round(extras.extraDiscount ?? 0))

  const beforeRound = subTotal + cgstTotal + sgstTotal + igstTotal + cessTotal + extraCharges - extraDiscount
  const { rounded, roundOff } = roundToRupee(beforeRound)

  return {
    lines: computed,
    totals: { subTotal, discountTotal, cgstTotal, sgstTotal, igstTotal, cessTotal, extraCharges, extraDiscount, roundOff, grandTotal: rounded }
  }
}
