import { computeDocument, computeLine } from '../src/shared/calc'
import { amountInWordsINR, formatINR, toPaise } from '../src/shared/money'

let failures = 0
function expect(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) {
    failures++
    console.error(`✗ ${name}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`)
  } else {
    console.log(`✓ ${name}`)
  }
}

// 1) Intra-state line: 10 units @ ₹100, 18% GST → taxable 1000, CGST 90, SGST 90
const l1 = computeLine({ quantity: 10, unitPrice: toPaise(100), taxRateBps: 1800 }, false)
expect('intra taxable', l1.taxableValue, toPaise(1000))
expect('intra cgst', l1.cgstAmount, toPaise(90))
expect('intra sgst', l1.sgstAmount, toPaise(90))
expect('intra igst', l1.igstAmount, 0)
expect('intra lineTotal', l1.lineTotal, toPaise(1180))

// 2) Inter-state line: same but IGST 180
const l2 = computeLine({ quantity: 10, unitPrice: toPaise(100), taxRateBps: 1800 }, true)
expect('inter igst', l2.igstAmount, toPaise(180))
expect('inter cgst', l2.cgstAmount, 0)

// 3) Discount applied before tax: ₹1000 gross, ₹100 disc, 18% → taxable 900, tax 162
const l3 = computeLine({ quantity: 1, unitPrice: toPaise(1000), discountAmount: toPaise(100), taxRateBps: 1800 }, false)
expect('disc taxable', l3.taxableValue, toPaise(900))
expect('disc tax total', l3.cgstAmount + l3.sgstAmount, toPaise(162))

// 4) Odd tax splits exactly (no lost paise): tax 90.01 → cgst 45.00/45.01 ... ensure sum equals tax
const l4 = computeLine({ quantity: 1, unitPrice: 10001, taxRateBps: 1800 }, false) // taxable 10001 paise, tax=1800.18→1800
expect('split sums to tax', l4.cgstAmount + l4.sgstAmount, Math.round((10001 * 1800) / 10000))

// 5) Document totals + rounding to nearest rupee
const doc = computeDocument(
  [
    { quantity: 3, unitPrice: toPaise(333.33), taxRateBps: 1800 },
    { quantity: 1, unitPrice: toPaise(50), taxRateBps: 500 }
  ],
  false
)
expect('grand total is whole rupees', doc.totals.grandTotal % 100, 0)
console.log('   sample grand total:', formatINR(doc.totals.grandTotal), 'roundOff:', doc.totals.roundOff)

// 5b) Invoice-level extra charges + extra discount (post-tax adjustments)
const docX = computeDocument(
  [{ quantity: 1, unitPrice: toPaise(1000), taxRateBps: 1800 }],
  false,
  { extraCharges: toPaise(100), extraDiscount: toPaise(50) }
)
// taxable 1000 + 18% tax 180 = 1180; +100 charge - 50 discount = 1230
expect('extra charges recorded', docX.totals.extraCharges, toPaise(100))
expect('extra discount recorded', docX.totals.extraDiscount, toPaise(50))
expect('grand total with extras', docX.totals.grandTotal, toPaise(1230))

// 5c) Pre-tax discount on the whole bill, as a percentage AND as a flat amount.
// A vendor may quote either; GST must be charged on what is left AFTER it.
const docPct = computeDocument(
  [{ quantity: 1, unitPrice: toPaise(1000), taxRateBps: 500 }],
  false,
  { schemePct: 1000 } // 10%
)
expect('pre-tax % discount reduces taxable value', docPct.totals.taxableValue, toPaise(900))
expect('tax charged after the % discount', docPct.totals.cgstTotal + docPct.totals.sgstTotal, toPaise(45))

const docFlat = computeDocument(
  [{ quantity: 1, unitPrice: toPaise(1000), taxRateBps: 500 }],
  false,
  { schemeAmount: toPaise(100) }
)
expect('pre-tax flat discount reduces taxable value', docFlat.totals.taxableValue, toPaise(900))
expect('tax charged after the flat discount', docFlat.totals.cgstTotal + docFlat.totals.sgstTotal, toPaise(45))
expect('flat discount recorded as scheme', docFlat.totals.schemeAmount, toPaise(100))

const docBoth = computeDocument(
  [{ quantity: 1, unitPrice: toPaise(1000), taxRateBps: 500 }],
  false,
  { schemePct: 1000, schemeAmount: toPaise(100) }
)
expect('percentage and flat discounts add up', docBoth.totals.schemeAmount, toPaise(200))
expect('taxable value after both', docBoth.totals.taxableValue, toPaise(800))

const docCap = computeDocument(
  [{ quantity: 1, unitPrice: toPaise(1000), taxRateBps: 500 }],
  false,
  { schemeAmount: toPaise(5000) }
)
expect('a discount larger than the bill is capped', docCap.totals.schemeAmount, toPaise(1000))
expect('capped discount cannot make the taxable value negative', docCap.totals.taxableValue, 0)

// A document with no discount at all must be untouched by the new field.
const docNone = computeDocument([{ quantity: 2, unitPrice: toPaise(1675), taxRateBps: 500 }], true)
expect('no discount -> scheme is zero', docNone.totals.schemeAmount, 0)
expect('no discount -> taxable value is the sub total', docNone.totals.taxableValue, docNone.totals.subTotal)

// 6) Amount in words (Indian system)
expect('words 0', amountInWordsINR(0), 'Zero Rupees Only')
expect('words 125000', amountInWordsINR(toPaise(1250)), 'One Thousand Two Hundred Fifty Rupees Only')
expect('words lakh', amountInWordsINR(toPaise(150000)), 'One Lakh Fifty Thousand Rupees Only')
expect('words paise', amountInWordsINR(toPaise(99.5)), 'Ninety Nine Rupees and Fifty Paise Only')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
