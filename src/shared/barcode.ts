/**
 * Code 128 barcode encoding — pure TypeScript, zero dependencies.
 *
 * Lives in `shared` because both processes need it: the main process renders
 * label sheets into PDFs, and the renderer previews a label before printing.
 * A dependency-free implementation also keeps the renderer's strict CSP happy
 * (no external script, no canvas/wasm) and keeps the app fully offline.
 *
 * Symbology notes
 * ---------------
 * Every Code 128 symbol is: START, data..., CHECK, STOP.
 * Each pattern is 6 alternating bar/space widths (bar first) totalling 11
 * modules; STOP is 13. The check symbol is
 *   (startValue + sum(position * value)) mod 103.
 *
 * We emit Code Set C (two digits per symbol) for all-numeric even-length data,
 * which halves the printed width — worth it for shelf labels. Anything else
 * falls back to Code Set B, which covers ASCII 32..126.
 */

/** Width patterns for symbol values 0..106, bar-first, alternating. */
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

const START_B = 104
const START_C = 105
const STOP = 106

/** Turn data into the list of Code 128 symbol values, excluding check/stop. */
function encodeSymbols(data: string): number[] {
  const numericEven = /^\d+$/.test(data) && data.length % 2 === 0 && data.length >= 2

  if (numericEven) {
    const out = [START_C]
    for (let i = 0; i < data.length; i += 2) out.push(Number(data.slice(i, i + 2)))
    return out
  }

  const out = [START_B]
  for (const ch of data) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code > 126) {
      throw new Error(`Character "${ch}" cannot be encoded in Code 128 set B`)
    }
    out.push(code - 32)
  }
  return out
}

/**
 * Encode `data` to a run-length list of module widths, alternating bar/space
 * and always starting with a bar. Sum of widths = total symbol width in modules.
 */
export function code128Widths(data: string): number[] {
  if (!data) throw new Error('Barcode data cannot be empty')

  const symbols = encodeSymbols(data)
  const check = symbols.reduce((acc, v, i) => acc + (i === 0 ? v : v * i), 0) % 103
  const all = [...symbols, check, STOP]

  const widths: number[] = []
  for (const value of all) {
    for (const digit of PATTERNS[value]) widths.push(Number(digit))
  }
  return widths
}

export interface BarcodeSvgOptions {
  /** Width of one module in px. 2 is a safe minimum for laser-printed labels. */
  moduleWidth?: number
  /** Height of the bars in px, excluding the caption. */
  height?: number
  /** Print the human-readable digits under the bars. */
  showText?: boolean
  fontSize?: number
  /** Quiet zone in modules. The spec requires >= 10; scanners need it. */
  quietZone?: number
}

/**
 * Render `data` as a self-contained SVG string. Safe to inline in an Electron
 * `printToPDF` document or in the renderer via dangerouslySetInnerHTML — the
 * only dynamic text is the caption, which is escaped.
 */
export function code128Svg(data: string, opts: BarcodeSvgOptions = {}): string {
  const mw = opts.moduleWidth ?? 2
  const height = opts.height ?? 60
  const showText = opts.showText ?? true
  const fontSize = opts.fontSize ?? 12
  const quiet = opts.quietZone ?? 10

  const widths = code128Widths(data)
  const modules = widths.reduce((a, b) => a + b, 0)
  const totalW = (modules + quiet * 2) * mw
  const captionH = showText ? fontSize + 4 : 0
  const totalH = height + captionH

  let x = quiet * mw
  let isBar = true
  const rects: string[] = []
  for (const w of widths) {
    if (isBar) rects.push(`<rect x="${x}" y="0" width="${w * mw}" height="${height}"/>`)
    x += w * mw
    isBar = !isBar
  }

  const caption = showText
    ? `<text x="${totalW / 2}" y="${totalH - 2}" text-anchor="middle" font-family="monospace" ` +
      `font-size="${fontSize}" letter-spacing="1">${escapeXml(data)}</text>`
    : ''

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" ` +
    `viewBox="0 0 ${totalW} ${totalH}" shape-rendering="crispEdges">` +
    `<rect width="${totalW}" height="${totalH}" fill="#fff"/>` +
    `<g fill="#000">${rects.join('')}</g>${caption}</svg>`
  )
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

// ---------------------------------------------------------------------------
// Internal barcode numbering
// ---------------------------------------------------------------------------

/** Prefix 22 = GS1 "restricted distribution", reserved for in-store numbering. */
export const BARCODE_PREFIX = '22'
export const BARCODE_LENGTH = 12

/** EAN-style mod-10 check digit over the given digit string. */
export function checkDigit(digits: string): number {
  let sum = 0
  // Weights alternate 3,1,3,1... reading from the RIGHT of the payload.
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[digits.length - 1 - i])
    sum += i % 2 === 0 ? d * 3 : d
  }
  return (10 - (sum % 10)) % 10
}

/**
 * Build the Nth internal barcode: "22" + 9-digit sequence + check digit.
 * 12 digits total (even) so it always encodes in the compact Code Set C.
 */
export function buildBarcode(sequence: number): string {
  const body = BARCODE_PREFIX + String(sequence).padStart(BARCODE_LENGTH - BARCODE_PREFIX.length - 1, '0')
  return body + checkDigit(body)
}

/** True if `code` is one of our internally generated barcodes and intact. */
export function isValidInternalBarcode(code: string): boolean {
  if (!new RegExp(`^\\d{${BARCODE_LENGTH}}$`).test(code)) return false
  if (!code.startsWith(BARCODE_PREFIX)) return false
  return checkDigit(code.slice(0, -1)) === Number(code[code.length - 1])
}

/**
 * Scanners are keyboard wedges: they may append Enter/Tab and some prepend a
 * symbology id. Strip whitespace and control characters before lookup.
 */
export function normaliseScan(raw: string): string {
  return raw.replace(/[\r\n\t]/g, '').trim()
}
