/**
 * Money is represented everywhere as an integer number of paise (1 INR = 100
 * paise). This module is the ONLY place currency math/formatting lives so the
 * convention can never drift.
 */

export type Paise = number

/** Parse a rupee string/number from the UI into integer paise. */
export function toPaise(rupees: number | string): Paise {
  const n = typeof rupees === 'string' ? Number(rupees.replace(/[^0-9.-]/g, '')) : rupees
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

/** Convert integer paise to a number of rupees (for display/PDF only). */
export function toRupees(paise: Paise): number {
  return Math.round(paise) / 100
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function formatINR(paise: Paise): string {
  return inrFormatter.format(toRupees(paise))
}

/** Apply a basis-point rate to a paise amount, rounded half-up to paise. */
export function applyBps(amount: Paise, bps: number): Paise {
  return Math.round((amount * bps) / 10000)
}

/** Round a grand total to the nearest rupee; returns the rounding delta too. */
export function roundToRupee(paise: Paise): { rounded: Paise; roundOff: Paise } {
  const rounded = Math.round(paise / 100) * 100
  return { rounded, roundOff: rounded - paise }
}

const ones = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen'
]
const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ones[n]
  return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`
}

/** Indian-system amount-in-words for invoices, e.g. "One Lakh Twenty..." */
export function amountInWordsINR(paise: Paise): string {
  const rupees = Math.floor(Math.abs(paise) / 100)
  const paiseRem = Math.abs(paise) % 100
  if (rupees === 0 && paiseRem === 0) return 'Zero Rupees Only'

  const parts: string[] = []
  const crore = Math.floor(rupees / 10000000)
  const lakh = Math.floor((rupees % 10000000) / 100000)
  const thousand = Math.floor((rupees % 100000) / 1000)
  const hundred = Math.floor((rupees % 1000) / 100)
  const rest = rupees % 100

  if (crore) parts.push(`${twoDigits(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (hundred) parts.push(`${ones[hundred]} Hundred`)
  if (rest) parts.push(twoDigits(rest))

  let words = parts.join(' ').trim() + ' Rupees'
  if (paiseRem) words += ` and ${twoDigits(paiseRem)} Paise`
  return `${paise < 0 ? 'Minus ' : ''}${words} Only`
}
