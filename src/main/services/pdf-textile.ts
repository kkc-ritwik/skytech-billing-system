import { amountInWordsINR, toRupees } from '@shared/money'
import { format } from 'date-fns'

/**
 * The trade's own tax-invoice layout, reproducing the printed bills:
 *
 *   !! Shree Ganeshaya Namah !!
 *   <FIRM NAME>*                              GSTIN / PAN
 *   TAX INVOICE
 *   Buyer block | Bill no / Challan / Date / Order no
 *   Consignee | Agent | LR / Transport / Station / Case / Weight / Freight
 *   SR DESCRIPTION [PACKING] PCS [CUT] MTS RATE AMOUNT
 *   SUB TOTAL ... DISCOUNT/SCHEME (pre-tax) ... IGST ... Invoice Value
 *   amount in words | bank details | terms | e-way bill
 *
 * The CUT and PACKING columns appear only when some line carries them, which is
 * what makes one template cover both real bills: the 37/GST sheet prints CUT,
 * the 39/GST sheet prints PACKING.
 */

export interface TextileLine {
  description: string
  packing: string | null
  quantity: number // PCS
  cutLength: number // metres per piece
  unitPrice: number // RATE per piece, paise
  taxableValue: number // paise (PCS x RATE, less line discount)
}

export interface TextileModel {
  docTypeLabel: string
  number: string
  issueDate: number
  company: Record<string, any> | null
  party: Record<string, any> | null
  placeOfSupply: string | null
  isInterState: boolean

  challanNo: string | null
  orderNo: string | null
  agentName: string | null
  consigneeName: string | null
  consigneeGstin: string | null
  lrNo: string | null
  lrDate: number | null
  transportName: string | null
  transportStation: string | null
  caseNo: string | null
  weight: number
  freight: number
  ewayBillNo: string | null
  transporterId: string | null
  dueDays: number

  hsnCode: string | null
  lines: TextileLine[]
  totals: {
    subTotal: number
    schemeAmount: number
    taxableValue: number
    cgstTotal: number
    sgstTotal: number
    igstTotal: number
    roundOff: number
    grandTotal: number
    totalPcs: number
    totalMetres: number
  }
  schemeLabel: string | null
  schemePct: number // basis points
  taxRateBps: number // dominant GST rate, for the tax line caption
  terms: string | null
  invocation: string | null
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** Plain 1,234.00 — the bills print bare numbers in the grid, no rupee glyph. */
const num = (paise: number): string =>
  toRupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const dec = (n: number, places = 2): string =>
  n.toLocaleString('en-IN', { minimumFractionDigits: places, maximumFractionDigits: places })

const dmy = (ts: number | null): string => (ts ? format(new Date(ts), 'dd/MM/yy') : '')

export function renderTextileInvoiceHtml(m: TextileModel): string {
  const c = m.company ?? {}
  const p = m.party ?? {}

  // Only print the columns this bill actually uses.
  const showPacking = m.lines.some((l) => !!l.packing)
  const showCut = m.lines.some((l) => l.cutLength > 0)

  const addr = [p.billingAddressLine1, p.billingAddressLine2, p.billingCity]
    .filter(Boolean)
    .map((x: string) => `<div>${esc(x)}</div>`)
    .join('')

  const companyAddr = [c.addressLine1, c.addressLine2, [c.city, c.state].filter(Boolean).join(', ')]
    .filter(Boolean)
    .join(', ')

  const rows = m.lines
    .map((l, i) => {
      const metres = Math.round(l.quantity * l.cutLength * 100) / 100
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(l.description)}</td>
        ${showPacking ? `<td class="c">${esc(l.packing ?? '')}</td>` : ''}
        <td class="r">${dec(l.quantity, 0)}</td>
        ${showCut ? `<td class="r">${l.cutLength ? dec(l.cutLength) : ''}</td>` : ''}
        <td class="r">${metres ? dec(metres) : ''}</td>
        <td class="r">${num(l.unitPrice)}</td>
        <td class="r">${num(l.taxableValue)}</td>
      </tr>`
    })
    .join('')

  // Keep the grid a constant height so the totals block sits at the same place
  // on every bill, the way a pre-printed stationery pad would.
  const filler = Math.max(0, 18 - m.lines.length)
  const blanks = Array.from(
    { length: filler },
    () => `<tr class="blank"><td colspan="${4 + (showPacking ? 1 : 0) + (showCut ? 1 : 0) + 2}">&nbsp;</td></tr>`
  ).join('')

  const taxLabel = m.isInterState ? 'IGST' : 'CGST+SGST'
  const taxTotal = m.isInterState ? m.totals.igstTotal : m.totals.cgstTotal + m.totals.sgstTotal

  const schemeRow =
    m.totals.schemeAmount > 0
      ? `<div class="tline">
           <span>${esc(m.schemeLabel || 'DISCOUNT')} -&gt; ${num(m.totals.subTotal)} X&nbsp;${dec(-m.schemePct / 100)}&nbsp;%</span>
           <span>-${num(m.totals.schemeAmount)}</span>
         </div>`
      : ''

  const taxRow = `<div class="tline">
      <span>${taxLabel} @&nbsp;${dec(m.taxRateBps / 100)}% on Taxable Value ${num(m.totals.taxableValue)}</span>
      <span>${num(taxTotal)}</span>
    </div>`

  const freightRow =
    m.freight > 0
      ? `<div class="tline"><span>FREIGHT</span><span>${num(m.freight)}</span></div>`
      : ''

  const roundRow =
    m.totals.roundOff !== 0
      ? `<div class="tline"><span>ROUND OFF</span><span>${num(m.totals.roundOff)}</span></div>`
      : ''

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing:border-box; }
    body { font-family:'Courier New',monospace; font-size:9.5pt; color:#000; margin:0; }
    .sheet { border:1px solid #000; }
    .invocation { text-align:center; font-size:8pt; padding:2px; }
    .top { text-align:center; border-bottom:1px solid #000; padding:2px 6px 4px; position:relative; }
    .firm { font-size:17pt; font-weight:700; letter-spacing:.5px; }
    .sub { font-size:8pt; }
    .corner { position:absolute; font-size:7.5pt; }
    .corner.l { left:6px; top:4px; } .corner.r { right:6px; top:4px; }
    .title { text-align:center; font-size:13pt; font-weight:700; letter-spacing:2px;
             border-bottom:1px solid #000; padding:2px; }
    .grid2 { display:flex; border-bottom:1px solid #000; }
    .grid2 > div { padding:3px 6px; }
    .grid2 .left { flex:1.35; border-right:1px solid #000; }
    .grid2 .right { flex:1; }
    /* Labels must never wrap their colon onto the next line. */
    .kv { display:flex; gap:4px; }
    .kv .k { width:92px; flex:none; white-space:nowrap; }
    .kv .v { flex:1; font-weight:600; }
    .buyer { font-weight:700; text-transform:uppercase; }
    .dispatch { display:grid; grid-template-columns:1fr 1fr; column-gap:8px; align-content:start; }
    .dispatch .k { width:74px; }
    table { width:100%; border-collapse:collapse; }
    thead th { border-bottom:1px solid #000; border-top:1px solid #000; font-size:8.5pt;
               padding:3px 4px; text-align:left; font-weight:700; }
    tbody td { padding:1.5px 4px; font-size:9pt; vertical-align:top; }
    .r { text-align:right; } .c { text-align:center; }
    thead th.r { text-align:right; } thead th.c { text-align:center; }
    .blank td { height:14px; }
    .subtotal td { border-top:1px solid #000; border-bottom:1px solid #000; font-weight:700; padding:3px 4px; }
    .totals { display:flex; border-bottom:1px solid #000; }
    .totals .notes { flex:1; border-right:1px solid #000; padding:4px 6px; font-size:8pt; }
    /* Wider + smaller type than the notes column: the tax caption carries a
       long "on Taxable Value <amount>" string that must not wrap mid-number. */
    .totals .calc { flex:1.05; padding:4px 6px; font-size:8pt; }
    /* The caption may wrap, but the amount must stay on the caption's first
       line and never let a stray "%" break away from its number. */
    .tline { display:flex; justify-content:space-between; gap:10px; padding:1px 0; align-items:baseline; }
    .tline > span:first-child { flex:1; min-width:0; }
    .tline > span:last-child { flex:none; white-space:nowrap; text-align:right; }
    .tline.grand { border-top:1px solid #000; margin-top:3px; padding-top:3px; font-weight:700; font-size:11pt; }
    .words { border-bottom:1px solid #000; padding:3px 6px; font-weight:700; text-transform:uppercase; font-size:9pt; }
    .foot { display:flex; }
    .foot .terms { flex:1.35; border-right:1px solid #000; padding:4px 6px; font-size:7.5pt; }
    .foot .sign { flex:1; padding:4px 6px; text-align:right; display:flex;
                  flex-direction:column; justify-content:space-between; min-height:62px; }
    .eway { border-top:1px solid #000; padding:3px 6px; font-size:8pt; display:flex; justify-content:space-between; }
    ol { margin:2px 0 0 14px; padding:0; }
  </style></head><body>
  <div class="sheet">
    ${m.invocation ? `<div class="invocation">!! ${esc(m.invocation)} !!</div>` : ''}

    <div class="top">
      ${c.phone ? `<div class="corner l">PHONES : ${esc(c.phone)}</div>` : ''}
      ${c.pan ? `<div class="corner r">PAN NO. : ${esc(c.pan)}</div>` : ''}
      <div class="firm">${esc(c.tradeName || c.legalName || '')}</div>
      ${c.gstin ? `<div class="sub">GSTIN : ${esc(c.gstin)}</div>` : ''}
      <div class="sub">${esc(companyAddr)}</div>
    </div>

    <div class="title">${esc(m.docTypeLabel)}</div>

    <div class="grid2">
      <div class="left">
        <div class="kv"><span class="k">Buyer :</span><span class="v buyer">${esc(p.name ?? '')}</span></div>
        <div style="padding-left:78px">${addr}</div>
        <div style="padding-left:78px">${esc(p.billingPincode ? '-' + p.billingPincode : '')}</div>
        <div class="kv"><span class="k">GSTIN :</span><span class="v">${esc(p.gstin ?? '')}
          &nbsp;&nbsp;Place of Supply : ${esc(m.placeOfSupply ?? '')}</span></div>
      </div>
      <div class="right">
        <div class="kv"><span class="k">BILL NO. :</span><span class="v">${esc(m.number)}</span></div>
        <div class="kv"><span class="k">CHALLAN :</span><span class="v">${esc(m.challanNo ?? m.number)}</span></div>
        <div class="kv"><span class="k">DATE :</span><span class="v">${dmy(m.issueDate)}</span></div>
        <div class="kv"><span class="k">ORDER NO :</span><span class="v">${esc(m.orderNo ?? '')}</span></div>
      </div>
    </div>

    <div class="grid2">
      <div class="left">
        <div class="kv"><span class="k">Consignee :</span><span class="v">${esc(m.consigneeName ?? '')}</span></div>
        <div class="kv"><span class="k">GSTIN :</span><span class="v">${esc(m.consigneeGstin ?? '')}</span></div>
        <div class="kv"><span class="k">AGENT :</span><span class="v">${esc(m.agentName ?? '')}</span></div>
      </div>
      <!-- Two sub-columns, as on the printed pad: dispatch on the left,
           weight/freight figures aligned on the right. -->
      <div class="right dispatch">
        <div class="kv"><span class="k">L.R. NO. :</span><span class="v">${esc(m.lrNo ?? '')}</span></div>
        <div class="kv"><span class="k">LR DATE :</span><span class="v">${dmy(m.lrDate)}</span></div>
        <div class="kv"><span class="k">TRANSPORT :</span><span class="v">${esc(m.transportName ?? '')}</span></div>
        <div class="kv"><span class="k">WEIGHT :</span><span class="v">${dec(m.weight, 3)}</span></div>
        <div class="kv"><span class="k">STATION :</span><span class="v">${esc(m.transportStation ?? '')}</span></div>
        <div class="kv"><span class="k">FREIGHT :</span><span class="v">${num(m.freight)}</span></div>
        <div class="kv"><span class="k">CASE NO :</span><span class="v">${esc(m.caseNo ?? '')}</span></div>
        <div class="kv"><span class="k">HSN :</span><span class="v">${esc(m.hsnCode ?? '')}</span></div>
      </div>
    </div>

    <table>
      <thead><tr>
        <th class="c" style="width:24px">SR.</th>
        <th>DESCRIPTION</th>
        ${showPacking ? '<th class="c" style="width:60px">PACKING</th>' : ''}
        <th class="r" style="width:44px">PCS</th>
        ${showCut ? '<th class="r" style="width:44px">CUT</th>' : ''}
        <th class="r" style="width:60px">MTS.</th>
        <th class="r" style="width:74px">RATE</th>
        <th class="r" style="width:84px">AMOUNT</th>
      </tr></thead>
      <tbody>
        ${rows}
        ${blanks}
        <tr class="subtotal">
          <td colspan="${showPacking ? 3 : 2}">SUB TOTAL</td>
          <td class="r">${dec(m.totals.totalPcs, 0)}</td>
          ${showCut ? '<td></td>' : ''}
          <td class="r">${dec(m.totals.totalMetres)}</td>
          <td></td>
          <td class="r">${num(m.totals.subTotal)}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="notes">
        ${c.bankName || c.bankAccountNo ? `<div>BANK A/C No. : OUR ${esc(c.bankName ?? '')} A/C NO. ${esc(c.bankAccountNo ?? '')}
          &nbsp;-&nbsp; IFSC Code: ${esc(c.bankIfsc ?? '')}</div>` : ''}
        <div style="margin-top:6px">REMARK :</div>
        <div style="margin-top:10px">DUE DAYS : ${m.dueDays}</div>
      </div>
      <div class="calc">
        ${schemeRow}
        ${taxRow}
        ${freightRow}
        ${roundRow}
        <div class="tline grand"><span>Invoice Value</span><span>${num(m.totals.grandTotal)}</span></div>
      </div>
    </div>

    <div class="words">${esc(amountInWordsINR(m.totals.grandTotal).replace(/ Rupees/, '').toUpperCase())}</div>

    <div class="foot">
      <div class="terms">
        <div style="font-weight:700">TERMS &amp; CONDITIONS :-</div>
        ${
          m.terms
            ? `<ol>${m.terms
                .split('\n')
                .filter((t) => t.trim())
                .map((t) => `<li>${esc(t.trim())}</li>`)
                .join('')}</ol>`
            : ''
        }
      </div>
      <div class="sign">
        <div style="font-weight:700">FOR ${esc((c.tradeName || c.legalName || '').toUpperCase())}</div>
        <div>AUTH. SIGN</div>
      </div>
    </div>

    <div class="eway">
      <span>CHECKED BY</span>
      <span>DELIVERED BY</span>
      <span>E-WAY BILL No: ${esc(m.ewayBillNo ?? '')}</span>
      <span>Transporter ID: ${esc(m.transporterId ?? '')}</span>
    </div>
  </div>
  </body></html>`
}
