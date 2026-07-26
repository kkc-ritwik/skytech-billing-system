/**
 * Validates the Code 128 encoder by decoding its own output back to the source
 * string, plus pattern-table integrity and a hand-computed check vector.
 */
import {
  code128Widths,
  code128Svg,
  buildBarcode,
  isValidInternalBarcode,
  checkDigit
} from '../src/shared/barcode'

let failures = 0
function check(label: string, ok: boolean, extra = ''): void {
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '   ' + extra : ''}`)
}

// Rebuild the pattern table from a fresh encode of every symbol value so the
// decoder below is independent of how the encoder indexes it.
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
]

console.log('\nPATTERN TABLE')
check('107 symbol values defined', PATTERNS.length === 107, `got ${PATTERNS.length}`)
check('all patterns unique', new Set(PATTERNS).size === 107)
check(
  'data patterns are 11 modules wide',
  PATTERNS.slice(0, 106).every((p) => p.split('').reduce((a, d) => a + Number(d), 0) === 11)
)
check(
  'stop pattern is 13 modules wide',
  PATTERNS[106].split('').reduce((a, d) => a + Number(d), 0) === 13
)

/** Decode a width run back into symbol values, then into the original string. */
function decode(widths: number[]): string {
  const symbols: number[] = []
  let i = 0
  while (i < widths.length) {
    const take = widths.length - i === 7 ? 7 : 6
    const pat = widths.slice(i, i + take).join('')
    const value = PATTERNS.indexOf(pat)
    if (value < 0) throw new Error(`undecodable pattern ${pat}`)
    symbols.push(value)
    i += take
  }

  const stop = symbols.pop()
  if (stop !== 106) throw new Error('missing stop symbol')
  const readCheck = symbols.pop()!
  const expected = symbols.reduce((acc, v, idx) => acc + (idx === 0 ? v : v * idx), 0) % 103
  if (readCheck !== expected) throw new Error(`check digit ${readCheck} != ${expected}`)

  const start = symbols.shift()
  if (start === 105) return symbols.map((v) => String(v).padStart(2, '0')).join('')
  if (start === 104) return symbols.map((v) => String.fromCharCode(v + 32)).join('')
  throw new Error(`unexpected start ${start}`)
}

console.log('\nROUND TRIP')
const samples = [
  '220000000015',
  '12345678',
  'PASHMINA-16075',
  'SKY/2025-26/0001',
  buildBarcode(1),
  buildBarcode(999999999)
]
for (const s of samples) {
  let ok = false
  let note = ''
  try {
    ok = decode(code128Widths(s)) === s
  } catch (e) {
    note = (e as Error).message
  }
  check(`encode->decode "${s}"`, ok, note)
}

console.log('\nCHECK VECTOR')
// Code Set C "12345678": start=105, data 12,34,56,78
// check = (105 + 12*1 + 34*2 + 56*3 + 78*4) mod 103 = 665 mod 103 = 47
const w = code128Widths('12345678')
const symbolCount = (w.length - 7) / 6 // last symbol (stop) is 7 widths
check('12345678 encodes to 7 symbols (start+4+check+stop)', symbolCount + 1 === 7, `got ${symbolCount + 1}`)
const checkPatternStart = (1 + 4) * 6
check(
  'computed check symbol is 47',
  w.slice(checkPatternStart, checkPatternStart + 6).join('') === PATTERNS[47],
  `got ${w.slice(checkPatternStart, checkPatternStart + 6).join('')}, want ${PATTERNS[47]}`
)

console.log('\nCODE SET SELECTION')
// 8 digits in set C = start + 4 data + check = 6 patterns (6 widths) + stop (7).
check('even-length digits use compact set C', code128Widths('12345678').length === 6 * 6 + 7, `${code128Widths('12345678').length} widths`)
// Same 8 characters in set B would need 8 data symbols instead of 4.
check('set C is narrower than set B for the same digits', code128Widths('12345678').length < code128Widths('ABCDEFGH').length)
check('odd-length digits fall back to set B', code128Widths('12345').length === (1 + 5 + 1) * 6 + 7)

console.log('\nINTERNAL NUMBERING')
const b1 = buildBarcode(1)
check('barcode is 12 digits', b1.length === 12, b1)
check('barcode starts with in-store prefix 22', b1.startsWith('22'))
check('generated barcode validates', isValidInternalBarcode(b1))
check('corrupted barcode rejected', !isValidInternalBarcode(b1.slice(0, -1) + ((Number(b1.at(-1)) + 1) % 10)))
check('check digit is stable', checkDigit('22000000001') === Number(b1.at(-1)))
const seq = new Set(Array.from({ length: 5000 }, (_, i) => buildBarcode(i + 1)))
check('5000 sequential barcodes are unique', seq.size === 5000)

console.log('\nSVG OUTPUT')
const svg = code128Svg('220000000015')
check('svg is well formed', svg.startsWith('<svg') && svg.trim().endsWith('</svg>'))
// The xmlns declaration is a namespace identifier, not a network fetch, so it
// is excluded before checking for anything the CSP would actually block.
check('svg has no external references', !/<script|<image|href|url\(/i.test(svg.replace(/xmlns="[^"]*"/g, '')))
check('svg contains bars', (svg.match(/<rect/g) ?? []).length > 20)

console.log(failures === 0 ? '\nBarcode encoder verified.\n' : `\n${failures} FAILURE(S)\n`)
process.exit(failures === 0 ? 0 : 1)
