import { formatINR, amountInWordsINR } from '@shared/money'
import { PRODUCT_NAME, TAGLINE } from '@shared/app-config'
import { format } from 'date-fns'

export interface PdfLine {
  description: string
  hsnCode: string | null
  batchNo?: string | null
  expiryDate?: number | null
  quantity: number
  unitPrice: number
  discountAmount: number
  taxRateBps: number
  taxableValue: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  lineTotal: number
}

export interface PdfModel {
  docTypeLabel: string
  number: string
  issueDate: number
  dueDate: number | null
  isInterState: boolean
  company: Record<string, any> | null
  logoDataUrl: string | null
  party: Record<string, any> | null
  lines: PdfLine[]
  totals: {
    subTotal: number
    discountTotal: number
    cgstTotal: number
    sgstTotal: number
    igstTotal: number
    extraCharges: number
    extraDiscount: number
    roundOff: number
    grandTotal: number
  }
  extraChargesLabel: string | null
  upiQrDataUrl: string | null
  hsnSummary: { hsn: string; taxable: number; cgst: number; sgst: number; igst: number }[]
  notes: string | null
  terms: string | null
  paperSize: 'A4' | 'A5'
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

const qty = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2))
const pct = (bps: number): string => `${bps / 100}%`

function addressBlock(p: Record<string, any> | null, billing = true): string {
  if (!p) return ''
  const l1 = billing ? p.billingAddressLine1 ?? p.addressLine1 : p.addressLine1
  const l2 = billing ? p.billingAddressLine2 ?? p.addressLine2 : p.addressLine2
  const city = billing ? p.billingCity ?? p.city : p.city
  const state = billing ? p.billingState ?? p.state : p.state
  const pin = billing ? p.billingPincode ?? p.pincode : p.pincode
  const parts = [l1, l2, [city, state, pin].filter(Boolean).join(', ')].filter(Boolean)
  return parts.map((x) => `<div>${esc(x)}</div>`).join('')
}

export interface StatementModel {
  company: Record<string, any> | null
  logoDataUrl: string | null
  party: { name: string; gstin: string | null }
  openingBalance: number
  entries: { date: number; type: string; number: string; debit: number; credit: number; balance: number }[]
  totalDebit: number
  totalCredit: number
  closingBalance: number
}

function balanceLabel(paise: number): string {
  if (paise === 0) return '₹0.00'
  return `${formatINR(Math.abs(paise))} ${paise > 0 ? 'Dr' : 'Cr'}`
}

export function renderStatementHtml(m: StatementModel): string {
  const c = m.company ?? {}
  const rows = m.entries
    .map(
      (e) => `<tr>
        <td>${format(new Date(e.date), 'dd MMM yyyy')}</td>
        <td>${esc(e.type)}</td>
        <td>${esc(e.number)}</td>
        <td class="r">${e.debit ? formatINR(e.debit) : '-'}</td>
        <td class="r">${e.credit ? formatINR(e.credit) : '-'}</td>
        <td class="r">${balanceLabel(e.balance)}</td>
      </tr>`
    )
    .join('')

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font-family:'Segoe UI',Arial,sans-serif; color:#1f2937; font-size:12px; margin:0; padding:24px; }
    .head { display:flex; justify-content:space-between; border-bottom:2px solid #2563eb; padding-bottom:10px; }
    h1 { margin:0; font-size:18px; } .muted{ color:#6b7280; }
    h2 { color:#2563eb; font-size:20px; margin:0; text-align:right; }
    .box { border:1px solid #e5e7eb; border-radius:8px; padding:10px; margin:14px 0; }
    table { width:100%; border-collapse:collapse; margin-top:8px; }
    th { background:#f3f4f6; text-align:left; padding:7px 6px; font-size:10px; text-transform:uppercase; color:#374151; }
    td { padding:6px; border-bottom:1px solid #f1f5f9; }
    .r { text-align:right; }
    .tot td { font-weight:700; border-top:2px solid #2563eb; }
  </style></head><body>
    <div class="head">
      <div>
        ${m.logoDataUrl ? `<img src="${m.logoDataUrl}" style="max-height:54px;max-width:200px;margin-bottom:4px"/>` : ''}
        <h1>${esc(c.tradeName || c.legalName || 'Your Company')}</h1>
        ${c.gstin ? `<div class="muted">GSTIN: ${esc(c.gstin)}</div>` : ''}
      </div>
      <div><h2>STATEMENT</h2><div class="muted">As on ${format(new Date(), 'dd MMM yyyy')}</div></div>
    </div>
    <div class="box">
      <div class="muted" style="font-size:10px;text-transform:uppercase">Statement for</div>
      <div style="font-weight:600;font-size:14px">${esc(m.party.name)}</div>
      ${m.party.gstin ? `<div class="muted">GSTIN: ${esc(m.party.gstin)}</div>` : ''}
    </div>
    <table>
      <thead><tr><th>Date</th><th>Particulars</th><th>Document</th><th class="r">Debit</th><th class="r">Credit</th><th class="r">Balance</th></tr></thead>
      <tbody>
        <tr><td colspan="5"><b>Opening balance</b></td><td class="r"><b>${balanceLabel(m.openingBalance)}</b></td></tr>
        ${rows}
        <tr class="tot"><td colspan="3">Totals</td><td class="r">${formatINR(m.totalDebit)}</td><td class="r">${formatINR(m.totalCredit)}</td><td class="r">${balanceLabel(m.closingBalance)}</td></tr>
      </tbody>
    </table>
    <p style="margin-top:14px"><b>Closing balance: ${balanceLabel(m.closingBalance)}</b>
      <span class="muted"> (${m.closingBalance >= 0 ? 'receivable — party owes you' : 'payable — you owe party'})</span></p>
    <div style="margin-top:24px;text-align:center;color:#94a3b8;font-size:9px">Generated with ${esc(PRODUCT_NAME)} — ${esc(TAGLINE)}</div>
  </body></html>`
}

/** Thermal/POS receipt (80mm roll). Uses preferCSSPageSize for continuous length. */
export function renderThermalHtml(m: PdfModel): string {
  const c = m.company ?? {}
  const p = m.party ?? {}
  const rows = m.lines
    .map(
      (l) => `<div class="it">
        <div class="nm">${esc(l.description)}</div>
        <div class="qr"><span>${qty(l.quantity)} x ${formatINR(l.unitPrice)}${l.taxRateBps ? ` (+${pct(l.taxRateBps)})` : ''}</span><span>${formatINR(l.lineTotal)}</span></div>
      </div>`
    )
    .join('')
  const taxLine = m.isInterState
    ? `<div class="row"><span>IGST</span><span>${formatINR(m.totals.igstTotal)}</span></div>`
    : `<div class="row"><span>CGST</span><span>${formatINR(m.totals.cgstTotal)}</span></div><div class="row"><span>SGST</span><span>${formatINR(m.totals.sgstTotal)}</span></div>`

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: 76mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body { width: 76mm; margin: 0; padding: 4mm 3mm; font-family: 'Consolas','Courier New',monospace; font-size: 11px; color: #000; }
    .c { text-align: center; }
    .b { font-weight: 700; }
    .lg { font-size: 14px; }
    .hr { border-top: 1px dashed #000; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; }
    .it { margin: 2px 0; }
    .it .nm { font-weight: 600; }
    .it .qr { display: flex; justify-content: space-between; color: #222; }
    .tot { font-size: 13px; font-weight: 700; }
    img { display: block; margin: 4px auto 0; }
  </style></head><body>
    <div class="c b lg">${esc(c.tradeName || c.legalName || 'Your Company')}</div>
    ${[c.addressLine1, c.city].filter(Boolean).length ? `<div class="c">${esc([c.addressLine1, c.city].filter(Boolean).join(', '))}</div>` : ''}
    ${c.phone ? `<div class="c">Ph: ${esc(c.phone)}</div>` : ''}
    ${c.gstin ? `<div class="c">GSTIN: ${esc(c.gstin)}</div>` : ''}
    <div class="hr"></div>
    <div class="c b">${esc(m.docTypeLabel)}</div>
    <div class="row"><span>No: ${esc(m.number)}</span><span>${format(new Date(m.issueDate), 'dd/MM/yy')}</span></div>
    <div>To: ${esc(p.name ?? 'Walk-in')}</div>
    <div class="hr"></div>
    ${rows}
    <div class="hr"></div>
    <div class="row"><span>Subtotal</span><span>${formatINR(m.totals.subTotal)}</span></div>
    ${m.totals.discountTotal ? `<div class="row"><span>Discount</span><span>- ${formatINR(m.totals.discountTotal)}</span></div>` : ''}
    ${taxLine}
    ${m.totals.extraCharges ? `<div class="row"><span>${esc(m.extraChargesLabel || 'Charges')}</span><span>${formatINR(m.totals.extraCharges)}</span></div>` : ''}
    ${m.totals.extraDiscount ? `<div class="row"><span>Extra disc</span><span>- ${formatINR(m.totals.extraDiscount)}</span></div>` : ''}
    ${m.totals.roundOff ? `<div class="row"><span>Round off</span><span>${formatINR(m.totals.roundOff)}</span></div>` : ''}
    <div class="hr"></div>
    <div class="row tot"><span>TOTAL</span><span>${formatINR(m.totals.grandTotal)}</span></div>
    <div class="hr"></div>
    ${m.upiQrDataUrl ? `<img src="${m.upiQrDataUrl}" width="120" height="120"/><div class="c">Scan to pay (UPI)</div>` : c.upiId ? `<div class="c">UPI: ${esc(c.upiId)}</div>` : ''}
    <div class="c" style="margin-top:6px">${esc(amountInWordsINR(m.totals.grandTotal))}</div>
    <div class="hr"></div>
    <div class="c">Thank you! Visit again.</div>
    <div class="c" style="font-size:8px;color:#666;margin-top:4px">${esc(PRODUCT_NAME)}</div>
  </body></html>`
}

/** GST HSN/SAC summary table (B2B requirement). Returns '' when no HSN data. */
function hsnSummaryHtml(m: PdfModel, interState: boolean): string {
  if (!m.hsnSummary || m.hsnSummary.length === 0) return ''
  const taxCols = interState ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'
  const rows = m.hsnSummary
    .map((h) => {
      const tax = interState
        ? `<td class="r">${formatINR(h.igst)}</td>`
        : `<td class="r">${formatINR(h.cgst)}</td><td class="r">${formatINR(h.sgst)}</td>`
      return `<tr><td>${esc(h.hsn || '-')}</td><td class="r">${formatINR(h.taxable)}</td>${tax}<td class="r">${formatINR(h.cgst + h.sgst + h.igst)}</td></tr>`
    })
    .join('')
  return `<div style="margin-top:14px">
    <div class="muted" style="font-size:10px;text-transform:uppercase;margin-bottom:3px">HSN / SAC summary</div>
    <table><thead><tr><th>HSN/SAC</th><th class="r">Taxable</th>${taxCols}<th class="r">Total Tax</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </div>`
}

export function renderDocumentHtml(m: PdfModel): string {
  const c = m.company ?? {}
  const p = m.party ?? {}
  const interState = m.isInterState

  const rows = m.lines
    .map((l, i) => {
      const tax = interState
        ? `<td class="r">${formatINR(l.igstAmount)}<br><span class="muted">${pct(l.taxRateBps)}</span></td>`
        : `<td class="r">${formatINR(l.cgstAmount)}<br><span class="muted">${pct(l.taxRateBps / 2)}</span></td>
           <td class="r">${formatINR(l.sgstAmount)}<br><span class="muted">${pct(l.taxRateBps / 2)}</span></td>`
      const batchInfo = [l.batchNo ? `Batch: ${esc(l.batchNo)}` : '', l.expiryDate ? `Exp: ${format(new Date(l.expiryDate), 'MM/yyyy')}` : '']
        .filter(Boolean)
        .join(' · ')
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(l.description)}${batchInfo ? `<br><span class="muted" style="font-size:9px">${batchInfo}</span>` : ''}</td>
        <td>${esc(l.hsnCode ?? '')}</td>
        <td class="r">${qty(l.quantity)}</td>
        <td class="r">${formatINR(l.unitPrice)}</td>
        <td class="r">${l.discountAmount ? formatINR(l.discountAmount) : '-'}</td>
        <td class="r">${formatINR(l.taxableValue)}</td>
        ${tax}
        <td class="r">${formatINR(l.lineTotal)}</td>
      </tr>`
    })
    .join('')

  const taxHead = interState
    ? '<th class="r">IGST</th>'
    : '<th class="r">CGST</th><th class="r">SGST</th>'

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 12px; margin: 0; padding: 24px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; }
    .brand h1 { margin: 0; font-size: 20px; color: #111827; }
    .brand .muted, .muted { color: #6b7280; }
    .title { text-align: right; }
    .title h2 { margin: 0; font-size: 22px; color: #2563eb; letter-spacing: 1px; }
    .meta { margin-top: 4px; font-size: 12px; }
    .parties { display: flex; gap: 16px; margin: 16px 0; }
    .box { flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
    .box .label { font-size: 10px; text-transform: uppercase; color: #6b7280; letter-spacing: .5px; margin-bottom: 4px; }
    .box .name { font-weight: 600; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f3f4f6; text-align: left; padding: 7px 6px; font-size: 10px; text-transform: uppercase; color: #374151; border-bottom: 1px solid #e5e7eb; }
    td { padding: 7px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .r { text-align: right; }
    .totals { margin-top: 12px; display: flex; justify-content: flex-end; }
    .totals table { width: 300px; }
    .totals td { border: none; padding: 3px 6px; }
    .grand td { font-weight: 700; font-size: 14px; border-top: 2px solid #2563eb; padding-top: 6px; }
    .words { margin-top: 10px; font-style: italic; color: #374151; }
    .foot { display: flex; justify-content: space-between; margin-top: 24px; }
    .bank { font-size: 11px; }
    .sign { text-align: right; font-size: 11px; }
    .terms { margin-top: 16px; font-size: 10px; color: #6b7280; white-space: pre-wrap; border-top: 1px dashed #e5e7eb; padding-top: 8px; }
  </style></head><body>
    <div class="head">
      <div class="brand">
        ${m.logoDataUrl ? `<img src="${m.logoDataUrl}" alt="logo" style="max-height:64px; max-width:220px; margin-bottom:6px;" />` : ''}
        <h1>${esc(c.tradeName || c.legalName || 'Your Company')}</h1>
        ${addressBlock(c, false)}
        <div class="muted">${c.phone ? 'Ph: ' + esc(c.phone) : ''} ${c.email ? ' · ' + esc(c.email) : ''}</div>
        ${c.gstin ? `<div><b>GSTIN:</b> ${esc(c.gstin)}</div>` : ''}
      </div>
      <div class="title">
        <h2>${esc(m.docTypeLabel)}</h2>
        <div class="meta"><b>No:</b> ${esc(m.number)}</div>
        <div class="meta"><b>Date:</b> ${format(new Date(m.issueDate), 'dd MMM yyyy')}</div>
        ${m.dueDate ? `<div class="meta"><b>Due:</b> ${format(new Date(m.dueDate), 'dd MMM yyyy')}</div>` : ''}
      </div>
    </div>

    <div class="parties">
      <div class="box">
        <div class="label">Bill To</div>
        <div class="name">${esc(p.name ?? '')}</div>
        ${addressBlock(p, true)}
        ${p.gstin ? `<div><b>GSTIN:</b> ${esc(p.gstin)}</div>` : ''}
        ${p.phone ? `<div class="muted">Ph: ${esc(p.phone)}</div>` : ''}
      </div>
    </div>

    <table>
      <thead><tr>
        <th>#</th><th>Description</th><th>HSN</th><th class="r">Qty</th>
        <th class="r">Rate</th><th class="r">Disc</th><th class="r">Taxable</th>
        ${taxHead}<th class="r">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    ${hsnSummaryHtml(m, interState)}

    <div class="totals"><table>
      <tr><td>Subtotal</td><td class="r">${formatINR(m.totals.subTotal)}</td></tr>
      ${m.totals.discountTotal ? `<tr><td>Discount</td><td class="r">- ${formatINR(m.totals.discountTotal)}</td></tr>` : ''}
      ${interState
        ? `<tr><td>IGST</td><td class="r">${formatINR(m.totals.igstTotal)}</td></tr>`
        : `<tr><td>CGST</td><td class="r">${formatINR(m.totals.cgstTotal)}</td></tr>
           <tr><td>SGST</td><td class="r">${formatINR(m.totals.sgstTotal)}</td></tr>`}
      ${m.totals.extraCharges ? `<tr><td>${esc(m.extraChargesLabel || 'Additional charges')}</td><td class="r">${formatINR(m.totals.extraCharges)}</td></tr>` : ''}
      ${m.totals.extraDiscount ? `<tr><td>Additional discount</td><td class="r">- ${formatINR(m.totals.extraDiscount)}</td></tr>` : ''}
      ${m.totals.roundOff ? `<tr><td>Round off</td><td class="r">${formatINR(m.totals.roundOff)}</td></tr>` : ''}
      <tr class="grand"><td>Grand Total</td><td class="r">${formatINR(m.totals.grandTotal)}</td></tr>
    </table></div>

    <div class="words"><b>Amount in words:</b> ${esc(amountInWordsINR(m.totals.grandTotal))}</div>

    <div class="foot">
      <div class="bank">
        ${c.bankName ? `<div><b>Bank:</b> ${esc(c.bankName)}</div>` : ''}
        ${c.bankAccountNo ? `<div><b>A/C:</b> ${esc(c.bankAccountNo)}</div>` : ''}
        ${c.bankIfsc ? `<div><b>IFSC:</b> ${esc(c.bankIfsc)}</div>` : ''}
        ${c.upiId ? `<div><b>UPI:</b> ${esc(c.upiId)}</div>` : ''}
        ${m.upiQrDataUrl ? `<div style="margin-top:6px"><img src="${m.upiQrDataUrl}" width="110" height="110" alt="Scan to pay"/><div class="muted" style="font-size:9px">Scan to pay via any UPI app</div></div>` : ''}
      </div>
      <div class="sign">
        <div style="height:48px"></div>
        <div>For <b>${esc(c.tradeName || c.legalName || '')}</b></div>
        <div class="muted">Authorised Signatory</div>
      </div>
    </div>

    ${m.notes ? `<div class="terms"><b>Notes:</b> ${esc(m.notes)}</div>` : ''}
    ${m.terms ? `<div class="terms"><b>Terms &amp; Conditions:</b>\n${esc(m.terms)}</div>` : ''}

    <div style="margin-top:18px; text-align:center; color:#94a3b8; font-size:9px;">
      Generated with ${esc(PRODUCT_NAME)} — ${esc(TAGLINE)}
    </div>
  </body></html>`
}
