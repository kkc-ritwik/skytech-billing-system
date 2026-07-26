/**
 * Reproduces the two real KRISHNA GANGA CREATION tax invoices (37/GST and
 * 39/GST) through the shared calc engine and asserts every printed figure.
 * If this passes, the engine matches the trade's actual arithmetic.
 */
import { computeDocument, type LineInput } from '../src/shared/calc'
import { amountInWordsINR, formatINR } from '../src/shared/money'

const R = (rupees: number): number => Math.round(rupees * 100) // rupees -> paise
const CUT = 6.3

let failures = 0
function eq(label: string, actual: number, expected: number): void {
  const ok = actual === expected
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} ${formatINR(actual)}${ok ? '' : `   expected ${formatINR(expected)}`}`
  )
}

// ---------------------------------------------------------------- BILL 37/GST
// PCS | CUT | RATE(per pc). MTS and AMOUNT are derived by the engine.
const bill37: [string, number, number][] = [
  ['PASHMINA SILK 16075', 2, 1675],
  ['44 O. SILK D.NO-22040', 2, 2240],
  ['PASHMINA SILK 13098', 6, 1398],
  ['BRASO RICH PALLU 1407', 6, 853],
  ['BRASO RICH PALLU 1414', 6, 890],
  ['RANGLORI SILK 11050', 6, 1150],
  ['BANARSI SATIN 11000', 6, 1190],
  ['DOLA MINA SILK 8040', 1, 840],
  ['DOLA MINA SILK 8050', 1, 850],
  ['DOLA MINA SILK 8070', 1, 870],
  ['DOLA MINA SILK 8090', 1, 890],
  ['DOLA MINA SILK 8095', 2, 895],
  ['DOLA MINA SILK 8075', 1, 875],
  ['DOLA MINA SILK 8080', 1, 880],
  ['DOLA MINA SILK 11020', 2, 1120],
  ['BANARSI TISSUE 21075', 1, 2175]
]

const lines37: LineInput[] = bill37.map(([, pcs, rate]) => ({
  quantity: pcs,
  unitPrice: R(rate),
  taxRateBps: 500,
  cutLength: CUT
}))

console.log('\nBILL 37/GST  (IGST 5%, DISCOUNT 2%)')
const r37 = computeDocument(lines37, true, { schemePct: 200 })
eq('SUB TOTAL', r37.totals.subTotal, R(52126))
eq('DISCOUNT @ 2%', r37.totals.schemeAmount, R(1042.52))
eq('Taxable Value', r37.totals.taxableValue, R(51083.48))
eq('IGST @ 5%', r37.totals.igstTotal, R(2554.17))
eq('Invoice Value', r37.totals.grandTotal, R(53638))
console.log(`  ---   PCS ${r37.totals.totalPcs} (exp 45)   MTS ${r37.totals.totalMetres} (exp 283.5)`)
console.log(`  ---   ${amountInWordsINR(r37.totals.grandTotal)}`)
if (r37.totals.totalPcs !== 45 || r37.totals.totalMetres !== 283.5) failures++

// ---------------------------------------------------------------- BILL 39/GST
const bill39: [string, number, number][] = [
  ['AAYUSHI', 30, 320],
  ['FLASH LIGHT (HIMANEE)', 8, 595],
  ['NATKHAT GUDIA (HIMANEE)', 16, 720],
  ['GUJARATI (HIMANEE)', 12, 898],
  ['GOLD COVERING (HIMANEE)', 6, 798]
]

const lines39: LineInput[] = bill39.map(([, pcs, rate]) => ({
  quantity: pcs,
  unitPrice: R(rate),
  taxRateBps: 500,
  cutLength: CUT
}))

console.log('\nBILL 39/GST  (IGST 5%, SCHEME 2%)')
const r39 = computeDocument(lines39, true, { schemePct: 200 })
eq('SUB TOTAL', r39.totals.subTotal, R(41444))
eq('SCHEME @ 2%', r39.totals.schemeAmount, R(828.88))
eq('Taxable Value', r39.totals.taxableValue, R(40615.12))
eq('IGST @ 5%', r39.totals.igstTotal, R(2030.76))
eq('Invoice Value', r39.totals.grandTotal, R(42646))
console.log(`  ---   PCS ${r39.totals.totalPcs} (exp 72)   MTS ${r39.totals.totalMetres} (exp 453.6)`)
console.log(`  ---   ${amountInWordsINR(r39.totals.grandTotal)}`)
if (r39.totals.totalPcs !== 72 || r39.totals.totalMetres !== 453.6) failures++

// -------------------------------------------------- invariants that must hold
console.log('\nINVARIANTS')
for (const [name, r] of [['37', r37], ['39', r39]] as const) {
  const lineSum = r.lines.reduce((a, l) => a + l.taxableValue, 0)
  const shareSum = r.lines.reduce((a, l) => a + l.schemeShare, 0)
  const taxSum = r.lines.reduce((a, l) => a + l.igstAmount + l.cgstAmount + l.sgstAmount, 0)
  const ok =
    lineSum === r.totals.subTotal &&
    shareSum === r.totals.schemeAmount &&
    taxSum === r.totals.igstTotal + r.totals.cgstTotal + r.totals.sgstTotal
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  bill ${name}: line values sum exactly to document totals`)
}

// intra-state must split the same tax into CGST+SGST with no paise lost
const intra = computeDocument(lines37, false, { schemePct: 200 })
const splitOk =
  intra.totals.cgstTotal + intra.totals.sgstTotal === r37.totals.igstTotal && intra.totals.igstTotal === 0
if (!splitOk) failures++
console.log(`  ${splitOk ? 'PASS' : 'FAIL'}  intra-state CGST+SGST equals the inter-state IGST`)

console.log(failures === 0 ? '\nAll bill figures reproduced exactly.\n' : `\n${failures} FAILURE(S)\n`)
process.exit(failures === 0 ? 0 : 1)
