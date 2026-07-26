/**
 * Builds the illustrated Shailee-GRMS user guide as a PDF.
 *
 * Screenshots are captured beforehand (see the QA capture script) and embedded
 * as data URIs so the PDF is self-contained. A sample tax invoice is rendered
 * live from the real template so the guide always shows the current bill layout.
 *
 * Run:  npx electron scripts/make-user-guide.mjs [shotsDir] [outFile]
 */
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const SHOTS =
  process.argv[2] && !process.argv[2].startsWith('--')
    ? process.argv[2]
    : join(root, 'guide-shots')
const OUT =
  process.argv[3] && !process.argv[3].startsWith('--')
    ? process.argv[3]
    : join(root, 'Shailee-Billing-Complete-Guide.pdf')

/** Find a screenshot by the descriptive part of its name. */
const files = existsSync(SHOTS) ? readdirSync(SHOTS).filter((f) => f.endsWith('.png')) : []

/** The official brand lockup, embedded on the cover. */
function brandLogo() {
  for (const f of ['logo-full.png', 'logo-full.jpg', 'logo-mark.png']) {
    const p = join(root, 'src', 'renderer', 'src', 'assets', f)
    if (existsSync(p)) {
      const mime = f.endsWith('.jpg') ? 'image/jpeg' : 'image/png'
      return `<img class="brand" src="data:${mime};base64,${readFileSync(p).toString('base64')}" alt="Shailee-GRMS"/>`
    }
  }
  return ''
}
function shotFile(key) {
  const f = files.find((x) => x.replace(/^\d+-/, '').replace(/\.png$/, '') === key)
  return f ? join(SHOTS, f) : null
}
const cache = new Map()
function img(key, caption) {
  if (!cache.has(key)) {
    const f = shotFile(key)
    cache.set(key, f ? 'data:image/png;base64,' + readFileSync(f).toString('base64') : null)
  }
  const src = cache.get(key)
  if (!src) return `<div class="missing">[screenshot "${key}" not captured]</div>`
  return `<figure><img src="${src}" alt="${caption ?? key}"/>${
    caption ? `<figcaption>${caption}</figcaption>` : ''
  }</figure>`
}

// ---------------------------------------------------------------------------
// A sample bill, laid out exactly as the real textile template prints it.
// Figures are the genuine 37/GST invoice so the arithmetic in the guide is real.
// ---------------------------------------------------------------------------
// The complete 37/GST invoice, so the sample bill in section 23 totals exactly
// the same ₹52,126 → ₹53,638 that section 20 walks through step by step.
const LINES = [
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

function sampleBillTable() {
  const CUT = 6.3
  let pcs = 0
  let amt = 0
  const rows = LINES.map(([name, p, rate], i) => {
    pcs += p
    amt += p * rate
    return `<tr><td class="c">${i + 1}</td><td>${name}</td><td class="r">${p}</td>
      <td class="r">${CUT.toFixed(2)}</td><td class="r">${(p * CUT).toFixed(2)}</td>
      <td class="r">${rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
      <td class="r">${(p * rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>`
  }).join('')
  const scheme = Math.round(amt * 0.02 * 100) / 100
  const taxable = Math.round((amt - scheme) * 100) / 100
  const igst = Math.round(taxable * 0.05 * 100) / 100
  const grand = Math.round(taxable + igst)
  const n = (v) => v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `
  <div class="bill">
    <div class="bill-head">
      <div class="inv">!! Shree Ganeshaya Namah !!</div>
      <div class="firm">KRISHNA GANGA CREATION</div>
      <div class="sub">GSTIN : 24ACNPB0084A1ZB &nbsp;&nbsp; PAN : ACNPB0084A</div>
      <div class="sub">SHOP-107, DADU TEXTILE MARKET, RING ROAD, UMARWADA, SURAT</div>
    </div>
    <div class="bill-title">TAX INVOICE</div>
    <div class="bill-grid">
      <div><b>Buyer :</b> RAJESHWARI SHREE<br/>KALAM BAGH ROAD, MUZAFFARPUR - 842001<br/>
        <b>GSTIN :</b> 10AZJPK4799G1Z6 &nbsp; <b>Place of Supply :</b> 10-Bihar</div>
      <div><b>BILL NO :</b> INV/2026-27/0001<br/><b>DATE :</b> 11/07/26<br/>
        <b>TRANSPORT :</b> ANCHAL LOGISTICS<br/><b>HSN :</b> 5407</div>
    </div>
    <table class="bill-table">
      <thead><tr><th>SR.</th><th>DESCRIPTION</th><th class="r">PCS</th><th class="r">CUT</th>
        <th class="r">MTS.</th><th class="r">RATE</th><th class="r">AMOUNT</th></tr></thead>
      <tbody>${rows}
        <tr class="sub-total"><td colspan="2">SUB TOTAL</td><td class="r">${pcs}</td><td></td>
          <td class="r">${(pcs * CUT).toFixed(2)}</td><td></td><td class="r">${n(amt)}</td></tr>
      </tbody>
    </table>
    <div class="bill-totals">
      <div class="tl"><span>DISCOUNT -&gt; ${n(amt)} X -2.00 %</span><span>-${n(scheme)}</span></div>
      <div class="tl"><span>IGST @ 5.00% on Taxable Value ${n(taxable)}</span><span>${n(igst)}</span></div>
      <div class="tl grand"><span>Invoice Value</span><span>${n(grand)}</span></div>
    </div>
  </div>`
}

// ---------------------------------------------------------------------------

const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; }
* { box-sizing: border-box; }
body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; color: #1f2937; font-size: 10.5pt; line-height: 1.55; margin: 0; }
h1 { font-size: 21pt; color: #5B2D8E; margin: 0 0 4px; }
h2 { font-size: 15pt; color: #5B2D8E; margin: 0 0 10px; padding-bottom: 5px; border-bottom: 2px solid #EADDF5; page-break-after: avoid; }
h3 { font-size: 12pt; margin: 16px 0 6px; color: #111827; page-break-after: avoid; }
p { margin: 0 0 9px; }
ul, ol { margin: 0 0 10px; padding-left: 20px; }
li { margin-bottom: 4px; }
figure { margin: 10px 0 14px; page-break-inside: avoid; }
figure img { width: 100%; border: 1px solid #d1d5db; border-radius: 5px; display: block; }
figcaption { font-size: 8.5pt; color: #6b7280; margin-top: 4px; font-style: italic; }
.missing { border: 1px dashed #d1d5db; padding: 14px; color: #9ca3af; font-size: 9pt; text-align: center; }
.section { page-break-before: always; }
.tip, .warn, .note { border-left: 4px solid; padding: 9px 12px; margin: 10px 0; border-radius: 0 5px 5px 0; page-break-inside: avoid; font-size: 10pt; }
.tip  { background: #ecfdf5; border-color: #10b981; }
.warn { background: #fff7ed; border-color: #f59e0b; }
.note { background: #eff6ff; border-color: #3b82f6; }
.tip b, .warn b, .note b { display: block; margin-bottom: 2px; }
table.data { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 9.5pt; page-break-inside: avoid; }
table.data th { background: #f3f4f6; text-align: left; padding: 6px 8px; border: 1px solid #e5e7eb; font-size: 9pt; }
table.data td { padding: 6px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
code { background: #f3f4f6; padding: 1px 5px; border-radius: 3px; font-family: Consolas, monospace; font-size: 9.5pt; }
.steps { counter-reset: s; list-style: none; padding-left: 0; }
.steps > li { counter-increment: s; position: relative; padding-left: 30px; margin-bottom: 8px; }
.steps > li::before { content: counter(s); position: absolute; left: 0; top: 1px; width: 21px; height: 21px;
  background: #5B2D8E; color: #fff; border-radius: 50%; text-align: center; font-size: 9pt; line-height: 21px; font-weight: 700; }

/* Cover */
.cover { height: 247mm; display: flex; flex-direction: column; justify-content: center; text-align: center; }
.cover .brand { display: block; width: 118mm; max-width: 100%; margin: 0 auto 14px; }
.cover h1 { font-size: 32pt; margin-bottom: 6px; }
.cover .tag { color: #6b7280; font-size: 13pt; margin-bottom: 26px; }
.cover .for { font-size: 14pt; font-weight: 600; margin-bottom: 6px; }
.cover .meta { color: #9ca3af; font-size: 10pt; margin-top: 30px; }

/* TOC */
.toc { column-count: 2; column-gap: 26px; font-size: 10pt; }
.toc div { margin-bottom: 3px; break-inside: avoid; }
.toc .num { display: inline-block; width: 26px; color: #5B2D8E; font-weight: 700; }
.toc .part { font-weight: 700; color: #5B2D8E; margin: 10px 0 4px; break-after: avoid; }

/* Sample bill */
.bill { border: 1px solid #000; font-family: 'Courier New', monospace; font-size: 7.5pt; margin: 10px 0 14px; page-break-inside: avoid; }
.bill-head { text-align: center; border-bottom: 1px solid #000; padding: 3px; }
.bill-head .inv { font-size: 7pt; }
.bill-head .firm { font-size: 14pt; font-weight: 700; }
.bill-head .sub { font-size: 7pt; }
.bill-title { text-align: center; font-weight: 700; letter-spacing: 2px; border-bottom: 1px solid #000; padding: 2px; font-size: 10pt; }
.bill-grid { display: flex; border-bottom: 1px solid #000; }
.bill-grid > div { flex: 1; padding: 4px 6px; }
.bill-grid > div:first-child { border-right: 1px solid #000; }
.bill-table { width: 100%; border-collapse: collapse; }
.bill-table th { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2px 4px; text-align: left; font-size: 7pt; }
.bill-table td { padding: 1px 4px; }
.bill-table .r, .bill-table th.r { text-align: right; }
.bill-table .c { text-align: center; }
.bill-table .sub-total td { border-top: 1px solid #000; border-bottom: 1px solid #000; font-weight: 700; }
.bill-totals { padding: 4px 6px; }
.bill-totals .tl { display: flex; justify-content: space-between; }
.bill-totals .grand { border-top: 1px solid #000; margin-top: 3px; padding-top: 3px; font-weight: 700; font-size: 9pt; }
.hl { background: #fef08a; padding: 0 3px; }
`

const TOC = [
  ['PART 1', 'Getting started'],
  [1, 'What this software does for a saree business'],
  [2, 'Installing on a new computer'],
  [3, 'First run — creating your owner account'],
  [4, 'Your recovery code'],
  [5, 'Signing in every day'],
  ['PART 2', 'One-time setup'],
  [6, 'Your company profile'],
  [7, 'Choosing the saree (textile) bill format'],
  [8, 'Setting your shop defaults'],
  [9, 'Staff accounts and what each role can do'],
  ['PART 3', 'Building your stock list'],
  [10, 'Adding saree designs'],
  [11, 'Generating barcodes'],
  [12, 'Printing and sticking barcode labels'],
  [13, 'Adding customers and suppliers'],
  ['PART 4', 'Buying stock'],
  [14, 'Receiving goods (GRN)'],
  [15, 'Purchase orders'],
  [16, 'Checking your inventory'],
  ['PART 5', 'Selling — the counter'],
  [17, 'The POS screen'],
  [18, 'Scanning sarees with a barcode machine'],
  [19, 'Understanding PCS, CUT and MTS'],
  [20, 'Discount / scheme before GST'],
  [21, 'IGST vs CGST + SGST'],
  [22, 'Saving and printing the tax invoice'],
  [23, 'The printed bill explained'],
  ['PART 6', 'Other documents & money'],
  [24, 'Proforma, challan, order and credit note'],
  [25, 'Recording payments'],
  ['PART 7', 'Reports & administration'],
  [26, 'Dashboard'],
  [27, 'All seven reports'],
  [28, 'Activity log'],
  [29, 'Backups — protecting your data'],
  [30, 'Licence and machine transfer'],
  [31, 'Help & support'],
  ['PART 8', 'Reference'],
  [32, 'Barcode scanner setup & tips'],
  [33, 'The account menu & changing your password'],
  [34, 'Your daily / weekly / monthly routine'],
  [35, 'Updating and uninstalling'],
  [36, 'Troubleshooting'],
  [37, 'Glossary']
]

function toc() {
  return TOC.map(([n, t]) =>
    typeof n === 'string'
      ? `<div class="part">${n} — ${t}</div>`
      : `<div><span class="num">${n}.</span>${t}</div>`
  ).join('')
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shailee-GRMS — Complete Guide</title>
<style>${CSS}</style></head><body>

<!-- ============================ COVER ============================ -->
<div class="cover">
  ${brandLogo()}
  <div class="for">Complete User Guide</div>
  <p style="color:#6b7280;max-width:118mm;margin:0 auto">
    Written for a saree wholesaler or retailer — from installing on a brand-new
    computer, through barcoding your stock and scanning at the counter, to GST
    invoices, payments and reports.
  </p>
  <div class="meta">Version 0.1.0 &nbsp;·&nbsp; Covers every screen and every button</div>
</div>

<!-- ============================ TOC ============================ -->
<div class="section">
  <h2>What's in this guide</h2>
  <div class="toc">${toc()}</div>
  <div class="note"><b>How to read this</b>
    Every screen in this guide is a real screenshot of the working software, not a
    drawing. Follow it front to back the first time; afterwards use the contents
    above to jump to whatever you need.</div>
</div>

<!-- ==================== PART 1 ==================== -->
<div class="section">
  <h2>1. What this software does for a saree business</h2>
  <p>Shailee-GRMS runs entirely on your own computer. There is no internet
  requirement, no monthly cloud fee, and your customer list and sales figures
  never leave your shop.</p>

  <p>It is built around how saree trading actually works:</p>
  <table class="data">
    <tr><th style="width:34%">What you do today</th><th>How the software handles it</th></tr>
    <tr><td>Every saree is a fixed cut, usually 6.30 metres</td><td>Each design stores its <b>CUT</b>; metres are worked out for you</td></tr>
    <tr><td>You price per piece, not per metre</td><td><b>RATE</b> is per piece — Amount = PCS × RATE</td></tr>
    <tr><td>You give a 2% scheme or discount off the bill</td><td>Applied <b>before</b> GST, exactly as on your printed bills</td></tr>
    <tr><td>Selling Surat → Bihar means IGST</td><td>Chosen automatically from the two state codes</td></tr>
    <tr><td>You count pieces by hand at the counter</td><td>Scan a barcode; the piece count adds itself</td></tr>
    <tr><td>Bills are typed again in a separate book</td><td>One bill updates stock, ledger, GST and reports together</td></tr>
  </table>

  <h3>A normal day, in order</h3>
  <ol class="steps">
    <li>Stock arrives from the mill → record a <b>GRN</b> (Part 4)</li>
    <li>Print barcode labels and stick one on each design's pile (Part 3)</li>
    <li>Customer picks sarees → scan them at the <b>POS</b> (Part 5)</li>
    <li>Press <b>Save &amp; print bill</b> → GST invoice comes out (Part 5)</li>
    <li>Money arrives → record the <b>receipt</b> against the bill (Part 6)</li>
    <li>Month end → open <b>Reports</b> for GST and profit (Part 7)</li>
  </ol>
</div>

<div class="section">
  <h2>2. Installing on a new computer</h2>
  <p>You need a Windows 10 or 11 computer. Nothing else — no SQL server, no
  Office, no internet connection.</p>
  <ol class="steps">
    <li>Copy <code>Shailee-GRMS-Setup-0.1.0.exe</code> onto the computer (pen drive is fine).</li>
    <li>Double-click it.</li>
    <li>If Windows shows a blue <b>"Windows protected your PC"</b> box, click
      <b>More info</b> then <b>Run anyway</b>. This appears because the installer is
      not yet code-signed; it is not a virus warning.</li>
    <li>Choose the install folder (the default is fine) and click <b>Install</b>.</li>
    <li>Tick <b>Create desktop shortcut</b> so staff can find it.</li>
    <li>Click <b>Finish</b>. The app opens by itself.</li>
  </ol>
  <div class="note"><b>Where your data lives</b>
    Everything is stored in one file on this computer at
    <code>C:\\Users\\&lt;you&gt;\\AppData\\Roaming\\shailee-grms\\ledgerline.db</code>.
    That single file is your whole business — Part 7 shows how to back it up.</div>
  <div class="warn"><b>One computer, one copy</b>
    Do not put the data file on a shared drive and open it from two computers.
    The licence is per-computer, and two copies writing at once will corrupt your
    records. To move to a new PC, use Backup → Restore (section 29).</div>
</div>

<div class="section">
  <h2>3. First run — creating your owner account</h2>
  <p>The very first time the app opens it has no users at all. It asks you to
  create the owner account — the master login that controls everything.</p>
  ${img('login', 'The sign-in screen you will see from the second run onwards')}
  <ol class="steps">
    <li><b>Full name</b> — your name, printed nowhere; it just labels your actions in the log.</li>
    <li><b>Username</b> — what you type to log in. Short and lowercase is easiest, e.g. <code>owner</code>.</li>
    <li><b>Email</b> — optional.</li>
    <li><b>Password</b> — at least 8 characters. Use something staff cannot guess.</li>
    <li><b>Confirm</b> — type it again.</li>
    <li>Click <b>Create account &amp; continue</b>.</li>
  </ol>
  <div class="tip"><b>Advanced setup</b>
    Ignore this unless Shailee gave you a setup code. Without a code the account
    is created as <b>Admin</b> — full control of your business — which is what you want.</div>
</div>

<div class="section">
  <h2>4. Your recovery code</h2>
  <p>Immediately after the account is made, the app shows a
  <b>one-time recovery code</b> that looks like <code>9UH6-9BUN-NGT7-TPEX</code>.</p>
  <div class="warn"><b>Write this down now — it is shown only once</b>
    If you forget your password, this code is the only way back into your own
    data. There is no "email me a reset" because there is no server. Keep it in
    your safe or with your CA, not in a file on the same computer.</div>
  <p>Click <b>I've saved it — continue</b> to enter the app. You can generate a
  fresh code later from the account menu (top-right); doing so cancels the old one.</p>
</div>

<div class="section">
  <h2>5. Signing in every day</h2>
  <p>From now on the app opens on the sign-in screen. Type your username and
  password and press <b>Enter</b>.</p>
  <ul>
    <li><b>Forgot password?</b> — asks for your recovery code, then lets you set a new password.</li>
    <li>Five wrong recovery attempts lock the account, to stop guessing.</li>
    <li>Your trial days remaining are shown as an orange badge.</li>
  </ul>
</div>

<!-- ==================== PART 2 ==================== -->
<div class="section">
  <h2>6. Your company profile</h2>
  <p>Go to <b>Settings</b> in the left sidebar. What you type here is printed on
  every invoice, so type it exactly as it should appear on a GST bill.</p>
  ${img('settings-company', 'Settings → Company profile. This becomes the header of every bill.')}
  <table class="data">
    <tr><th style="width:30%">Field</th><th>What to put</th></tr>
    <tr><td><b>Legal name</b> (required)</td><td>The name on your GST certificate, e.g. KRISHNA GANGA CREATION</td></tr>
    <tr><td>Trade name</td><td>The name customers know, if different. This is what prints big at the top.</td></tr>
    <tr><td><b>GSTIN</b></td><td>Your 15-character number. Checked as you save — a wrong format is refused.</td></tr>
    <tr><td>PAN</td><td>10 characters. Prints in the top-right of the bill.</td></tr>
    <tr><td>Address 1 / 2, City, State</td><td>Shop address as it should print</td></tr>
    <tr><td><b>State code (GST)</b></td><td>Two digits — <b>24</b> for Gujarat, <b>27</b> Maharashtra, <b>10</b> Bihar. <b>Get this right</b> — it decides IGST vs CGST+SGST on every bill.</td></tr>
    <tr><td>Phone</td><td>Prints in the top-left of the bill</td></tr>
    <tr><td>Bank name / Account / IFSC</td><td>Prints at the foot so customers can pay</td></tr>
    <tr><td>UPI ID</td><td>If filled, a scan-to-pay QR is added to the bill</td></tr>
    <tr><td>Default terms</td><td>One condition per line; they print numbered at the bottom</td></tr>
  </table>
  <p>Click <b>Save</b> (top right). You can also upload your shop logo with
  <b>Upload</b> — it appears on PDFs.</p>
</div>

<div class="section">
  <h2>7. Choosing the saree (textile) bill format</h2>
  <p>Scroll down in Settings to <b>Preferences</b>.</p>
  ${img('settings-preferences', 'Preferences — switch Invoice template to "Textile GST" for saree billing')}
  <p>Set <b>Invoice template</b> to <b>Textile GST (PCS / CUT / MTS)</b>. This is
  the format with the PCS / CUT / MTS / RATE columns and the transport block —
  the layout saree traders use. Leaving it on <i>Standard GST</i> gives a plain
  GST invoice instead.</p>
  <div class="tip"><b>Both are kept</b>
    Switching does not delete anything. You can move between the two formats at
    any time and reprint an old bill in either.</div>
</div>

<div class="section">
  <h2>8. Setting your shop defaults</h2>
  <p>Choosing the textile template reveals five extra boxes. Filling them once
  saves typing on every single bill.</p>
  <table class="data">
    <tr><th style="width:32%">Setting</th><th>Example</th><th>What it does</th></tr>
    <tr><td>Invocation line</td><td>Shree Ganeshaya Namah</td><td>Prints centred above your firm name</td></tr>
    <tr><td>Default transport</td><td>ANCHAL LOGISTICS</td><td>Pre-filled on the POS and on new bills</td></tr>
    <tr><td>Default scheme label</td><td>DISCOUNT</td><td>The word printed before the discount line. Some shops print SCHEME.</td></tr>
    <tr><td>Default scheme %</td><td>2</td><td>Your usual trade discount, applied before GST</td></tr>
    <tr><td>Default cut</td><td>6.30</td><td>Metres in one saree. New designs start with this filled in.</td></tr>
  </table>
  <p>Each box saves as soon as you click away from it.</p>
  <h3>Prevent negative stock</h3>
  <p>Tick this to stop staff billing more pieces than you actually have. The
  invoice is refused with a message like <i>"Not enough stock for PASHMINA SILK
  16075. Available: 19, required: 25."</i> Recommended once your opening stock is
  entered correctly.</p>
</div>

<div class="section">
  <h2>9. Staff accounts and what each role can do</h2>
  <p>Open <b>Users</b> under Administration.</p>
  ${img('users-list', 'Users — one account per person who touches the system')}
  ${img('users-new-dialog', 'Creating a staff account. Choose the role carefully.')}
  <table class="data">
    <tr><th>Role</th><th>Can do</th><th>Cannot do</th></tr>
    <tr><td><b>Super Admin</b></td><td>Everything including licence management</td><td>—</td></tr>
    <tr><td><b>Admin</b> (you)</td><td>All business work, staff, settings, backups</td><td>Vendor-only licence controls</td></tr>
    <tr><td><b>Manager</b></td><td>Billing, purchases, payments, all reports, approvals</td><td>Create users, change settings, take backups</td></tr>
    <tr><td><b>Operator</b> (counter staff)</td><td>Bill at the POS, add customers, record payments, see stock</td><td>See profit reports, change prices policy, users, settings, licence, activity log</td></tr>
  </table>
  <div class="tip"><b>Give counter staff an Operator account</b>
    They get the POS and nothing that could damage your data. The restriction is
    enforced inside the program, not just hidden on screen — an Operator cannot
    reach admin functions even if they try.</div>
  <div class="note"><b>First login for staff</b>
    You set a temporary password. The first time they sign in, the app forces
    them to choose their own — so you never know their password.</div>
</div>

<!-- ==================== PART 3 ==================== -->
<div class="section">
  <h2>10. Adding saree designs</h2>
  <p><b>Items</b> is your design master — one row per quality/design, not per
  piece. Six pieces of the same design is one row with 6 in stock.</p>
  ${img('items-list', 'The Items list — every design with HSN, prices, tax and stock')}
  <p>Click <b>New item</b>:</p>
  ${img('items-new-dialog', 'Adding a design. Cut is pre-filled from your shop default.')}
  <table class="data">
    <tr><th style="width:28%">Field</th><th>For a saree</th></tr>
    <tr><td><b>SKU</b> (required)</td><td>Your own short code, e.g. <code>PASHMINA-16075</code>. Must be unique — a repeat is refused.</td></tr>
    <tr><td><b>Item name</b> (required)</td><td>Exactly as it should print on the bill, e.g. <code>PASHMINA SILK 16075</code></td></tr>
    <tr><td>HSN / SAC</td><td><b>5407</b> for woven man-made fabric sarees. Ask your CA if unsure.</td></tr>
    <tr><td>Barcode</td><td>Leave blank — section 11 generates them in bulk</td></tr>
    <tr><td><b>Cut</b></td><td>Metres in one piece, normally <b>6.30</b></td></tr>
    <tr><td>Packing</td><td>Only for box goods, e.g. <code>BOX</code>. Prints instead of the CUT column.</td></tr>
    <tr><td><b>Category</b></td><td>Your own grouping — <code>Saree</code>, <code>Salwar Suit</code>, <code>Lehenga</code>, <code>Dupatta</code>. Type a new one and it is created; type an existing one and it is reused. This is how you separate product types, <b>not</b> the barcode number.</td></tr>
    <tr><td>GST tax rate</td><td><b>GST 5%</b> for most sarees</td></tr>
    <tr><td>Purchase price</td><td>What the mill charges you per piece (used for profit reports)</td></tr>
    <tr><td><b>Selling price</b></td><td>Your rate <b>per piece</b> — this is the RATE on the bill</td></tr>
    <tr><td>Reorder level</td><td>Warn me below this many pieces</td></tr>
    <tr><td>Opening stock</td><td>Pieces you already have today, with their total value</td></tr>
  </table>
  <p>Use the <b>pencil</b> to edit a design and the <b>bin</b> to remove one.
  Deleting only hides it — past bills keep working.</p>
  ${img('items-delete-confirm', 'Deleting always asks first, and explains what will happen')}
</div>

<div class="section">
  <h2>11. Generating barcodes</h2>
  <p>Every design needs a barcode before it can be scanned. You do <b>not</b>
  type these — the software issues them.</p>
  <ol class="steps">
    <li>On the Items page, click <b>Generate barcodes</b> (top right).</li>
    <li>Every design that has no barcode gets one. A message confirms how many.</li>
    <li>Run it again after adding new designs — existing codes are never changed.</li>
  </ol>
  ${img('items-edit-barcode', 'Open any design to see its barcode and a live preview of the printed label')}
  <div class="note"><b>What the number means</b>
    Codes look like <code>220000000019</code>. They start with <b>22</b>, the range
    reserved worldwide for a shop's own internal use, so they can never clash with
    a manufacturer's barcode. The middle digits are simply the next number in
    line. The last digit is a check digit — if a scanner misreads, the software
    rejects it instead of billing the wrong saree.</div>

  <h3>Do sarees and salwar suits get different barcode numbers?</h3>
  <p><b>No — and deliberately so.</b> Barcodes are issued in plain sequence, in the
  order designs are added. A saree might get <code>220000000019</code> and the
  salwar suit added next gets <code>220000000026</code>. The number itself carries
  no meaning about the product.</p>
  <p>This is how shop barcodes are meant to work. The barcode is only a
  <b>label pointing at a record</b> — the record holds the name, category, HSN,
  rate and cut. Scanning fetches all of it instantly.</p>
  <table class="data">
    <tr><th style="width:30%">To separate product types, use</th><th>Why that, and not the barcode</th></tr>
    <tr><td><b>Category</b> — Saree, Salwar Suit, Lehenga</td><td>Groups and filters your list, and can be changed any time without reprinting a single label</td></tr>
    <tr><td><b>HSN code</b> — 5407 saree, 6204 readymade suit</td><td>This is what actually decides your GST treatment and appears in the HSN Summary report</td></tr>
    <tr><td><b>SKU</b> — <code>SAREE-16075</code>, <code>SALWAR-001</code></td><td>Your own readable code, printed on the label under the bars</td></tr>
  </table>
  <div class="warn"><b>Why numbers should not encode the product type</b>
    If <code>22<u>01</u>…</code> meant "saree" and <code>22<u>02</u>…</code> meant
    "salwar suit", then the day you re-classify an item the barcode would be
    telling a lie — and you would have to reprint and re-stick every label to
    correct it. Keeping the number meaningless means a design can change category,
    price, HSN or rate freely and the sticker on the piece stays valid for life.</div>
  <div class="tip"><b>You can still use your own numbers</b>
    If you already have a barcode scheme, type it into the <b>Barcode</b> box on
    the item instead of generating one. The app accepts any Code 128 value —
    digits, letters, or both — and shows a live preview of the printed label.</div>
  <div class="tip"><b>One barcode per design</b>
    All six pieces of PASHMINA SILK 16075 share one barcode. At the counter you
    scan it six times (or scan once and type 6). This is far faster than serial-
    numbering every piece.</div>
</div>

<div class="section">
  <h2>12. Printing and sticking barcode labels</h2>
  <ol class="steps">
    <li>On the Items page, use the search box if you only want some designs.</li>
    <li>Click <b>Print labels</b>.</li>
    <li>Choose where to save the PDF; it opens automatically.</li>
    <li>Print it on A4 label sheets (65 labels per sheet, 38.1 × 21.2 mm — the common address-label size from any stationery shop).</li>
    <li>Stick one label on each piece, or on the fold of each pile.</li>
  </ol>
  <p>Each label carries the design name, the barcode, its digits, the SKU and the
  selling price.</p>
  <div class="warn"><b>Printing tips</b>
    Print at <b>100% / Actual size</b> — never "Fit to page", which shrinks the
    bars until scanners cannot read them. Use a laser printer if you have one;
    inkjet bars can smudge and fail to scan.</div>
</div>

<div class="section">
  <h2>13. Adding customers and suppliers</h2>
  <p>Open <b>Clients &amp; Vendors</b>. The two tabs are separate lists —
  <b>Clients</b> are who you sell to, <b>Vendors</b> are who you buy from.</p>
  ${img('parties-clients', 'The client list, with outstanding balance per party')}
  ${img('parties-new-dialog', 'Adding a client. State code decides the GST type on their bills.')}
  <table class="data">
    <tr><th style="width:30%">Field</th><th>Why it matters</th></tr>
    <tr><td><b>Type</b></td><td>Client, Vendor, or Both. Set automatically from the tab you are on.</td></tr>
    <tr><td><b>Name</b> (required)</td><td>Prints as the Buyer on the bill</td></tr>
    <tr><td>GSTIN</td><td>Prints on the bill and feeds your GSTR-1. Format is validated.</td></tr>
    <tr><td>Billing address, City, State</td><td>Prints under the buyer name</td></tr>
    <tr><td><b>State code (GST)</b></td><td><b>The most important field.</b> Compared with your state code to choose IGST or CGST+SGST. Bihar = 10.</td></tr>
    <tr><td>Credit limit</td><td>Warns you when a new bill would push them over</td></tr>
    <tr><td>Credit days</td><td>Sets the due date on their invoices automatically</td></tr>
    <tr><td>Opening balance</td><td>What they already owe you today</td></tr>
  </table>
  ${img('parties-vendors', 'The Vendors tab — the button and form switch to vendor automatically')}
  <p>The <b>book</b> icon on each row opens their full ledger — every bill and
  payment — which you can export as a statement PDF to send them.</p>
</div>

<!-- ==================== PART 4 ==================== -->
<div class="section">
  <h2>14. Receiving goods (GRN)</h2>
  <p>When a bundle arrives from the mill, record a <b>Goods Received Note</b>.
  This is what actually puts pieces into your stock.</p>
  ${img('purchases-grn-list', 'Purchases → Goods Received (GRN)')}
  ${img('purchases-new-grn', 'Recording goods in. Pick the vendor, then add a line per design.')}
  <ol class="steps">
    <li><b>Purchases</b> → <b>Goods Received (GRN)</b> tab → <b>New</b>.</li>
    <li>Choose the <b>Vendor</b>.</li>
    <li>Enter their bill number under <b>Supplier invoice no</b>.</li>
    <li>On each line pick the design, type <b>Qty</b> (pieces) and the <b>Rate</b> you paid.</li>
    <li>Click <b>Add line</b> for the next design.</li>
    <li>Tick <b>Inter-state supply</b> if the mill is in another state.</li>
    <li><b>Save</b>. Stock goes up immediately.</li>
  </ol>
  <div class="tip"><b>Check it worked</b>
    Open <b>Inventory</b> — the pieces should now appear against each design.</div>
</div>

<div class="section">
  <h2>15. Purchase orders</h2>
  <p>A <b>Purchase Order</b> is what you send the mill <i>before</i> goods arrive.</p>
  ${img('purchases-po-list', 'The Purchase Orders tab')}
  <div class="note"><b>A PO does not change stock</b>
    That is deliberate — you have ordered, not received. When the bundle actually
    turns up, use the <b>Convert</b> action on the PO row to turn it into a GRN in
    one click, and stock moves then.</div>
</div>

<div class="section">
  <h2>16. Checking your inventory</h2>
  ${img('inventory-summary', 'Inventory → Stock summary: pieces on hand and their value')}
  <p><b>Stock summary</b> shows every design, pieces in hand, and stock value.
  Low-stock designs are highlighted so you know what to reorder.</p>
  <h3>Correcting a count</h3>
  <p>If a physical count does not match — damage, a sample given away, a
  miscount — use <b>Adjust stock</b>.</p>
  ${img('inventory-adjust', 'Stock adjustment: record why the count changed')}
  <p>Pick a <b>Reason</b> (damage, expiry, count correction, other), choose the
  design, and enter the change: <code>-2</code> to remove two pieces,
  <code>5</code> to add five. Always leave a note — the adjustment is permanent
  in the record.</p>
</div>

<!-- ==================== PART 5 ==================== -->
<div class="section">
  <h2>17. The POS screen</h2>
  <p><b>Point of Sale</b> is the counter screen. It is designed so a bill can be
  made without touching the mouse.</p>
  ${img('pos-empty', 'The POS before anything is scanned')}
  <table class="data">
    <tr><th style="width:30%">Part of the screen</th><th>What it is for</th></tr>
    <tr><td><b>Scan barcode</b> box</td><td>Where the scanner types. Keep the cursor here.</td></tr>
    <tr><td>The middle table</td><td>The sarees on this bill, with PCS / CUT / MTS / RATE / AMOUNT</td></tr>
    <tr><td><b>Customer</b></td><td>Who you are billing. Sets IGST or CGST+SGST.</td></tr>
    <tr><td><b>Scheme label</b> / <b>Scheme %</b></td><td>Trade discount for this bill, taken off before GST</td></tr>
    <tr><td><b>Transport</b> / <b>Case no</b></td><td>Transporter and bundle number, printed on the bill</td></tr>
    <tr><td>Totals panel</td><td>Live sub total, discount, taxable value, GST and final amount</td></tr>
    <tr><td><b>Save &amp; print bill</b></td><td>Saves the invoice and produces the PDF</td></tr>
  </table>
</div>

<div class="section">
  <h2>18. Scanning sarees with a barcode machine</h2>
  <div class="note"><b>No driver, no setup</b>
    A USB barcode scanner behaves exactly like a keyboard: it types the number
    then sends Enter (or Tab — both are accepted). Plug it into any USB port and
    it works. There is nothing to install, and nothing to set up inside the app.</div>
  <ol class="steps">
    <li>Choose the <b>Customer</b> at the top right.</li>
    <li>Click once inside the <b>Scan barcode</b> box.</li>
    <li>Scan a saree's label. It appears in the table with 1 piece.</li>
    <li>Scan the same label again for a second piece — the count becomes 2.</li>
    <li>Carry on for every saree the customer is taking.</li>
  </ol>
  ${img('pos-scanned-cart', 'Four designs scanned: 16 pieces, 100.80 metres, IGST applied, total ₹21,955')}
  <h3>Correcting mistakes</h3>
  <ul>
    <li><b>−</b> and <b>+</b> change the piece count without rescanning.</li>
    <li>The <b>bin</b> icon removes a line completely.</li>
    <li>Type over the <b>RATE</b> box to give a special price on this bill only. The design's normal price is not changed.</li>
    <li><b>Clear cart</b> abandons the whole bill.</li>
  </ul>
  <h3>If a barcode is not recognised</h3>
  ${img('pos-unknown-barcode', 'An unknown barcode is refused clearly — nothing is added to the bill')}
  <p>Usually one of: the design was never given a barcode (run <b>Generate
  barcodes</b>), the label is from another shop's system, or the design was
  deleted. You can also type the <b>SKU</b> into the same box and press Enter —
  useful when a label is torn.</p>
  <div class="tip"><b>Keep the cursor in the scan box</b>
    A scanner types wherever the cursor happens to be. If you click into another
    field the next scan lands there. The box re-focuses itself, but check it if a
    scan seems to do nothing.</div>
</div>

<div class="section">
  <h2>19. Understanding PCS, CUT and MTS</h2>
  <p>These three columns confuse people at first. They are simple:</p>
  <table class="data">
    <tr><th style="width:16%">Column</th><th>Meaning</th><th>Where it comes from</th></tr>
    <tr><td><b>PCS</b></td><td>Number of sarees</td><td>How many times you scanned</td></tr>
    <tr><td><b>CUT</b></td><td>Metres in one saree</td><td>The design's Cut, normally 6.30</td></tr>
    <tr><td><b>MTS</b></td><td>Total metres</td><td>Worked out: PCS × CUT</td></tr>
    <tr><td><b>RATE</b></td><td>Price of one saree</td><td>The design's selling price</td></tr>
    <tr><td><b>AMOUNT</b></td><td>Line total</td><td>Worked out: <b>PCS × RATE</b></td></tr>
  </table>
  <div class="warn"><b>Money is per piece, never per metre</b>
    6 pieces at ₹1,398 is <b>6 × 1,398 = ₹8,388</b>. The 37.80 metres is printed
    for the transporter and for your own records — it is never multiplied into
    the price. This matches how your existing bills are calculated.</div>
</div>

<div class="section">
  <h2>20. Discount / scheme before GST</h2>
  <p>Trade discount is taken off the whole bill <b>before</b> GST is worked out.
  Order of operations:</p>
  <ol class="steps">
    <li>Add up every line → <b>SUB TOTAL</b></li>
    <li>Take off the scheme % → <b>Taxable Value</b></li>
    <li>Charge GST on the taxable value</li>
    <li>Round to the nearest rupee → <b>Invoice Value</b></li>
  </ol>
  <p>A real example from a ₹52,126 bill at 2%:</p>
  <table class="data">
    <tr><td>SUB TOTAL</td><td class="r">₹52,126.00</td></tr>
    <tr><td>DISCOUNT @ 2%</td><td class="r">− ₹1,042.52</td></tr>
    <tr><td><b>Taxable Value</b></td><td class="r"><b>₹51,083.48</b></td></tr>
    <tr><td>IGST @ 5%</td><td class="r">₹2,554.17</td></tr>
    <tr><td>Round off</td><td class="r">₹0.35</td></tr>
    <tr><td><b>Invoice Value</b></td><td class="r"><b>₹53,638.00</b></td></tr>
  </table>
  <p>Change <b>Scheme %</b> to 0 for a bill with no discount. Change the
  <b>Scheme label</b> if you print the word SCHEME rather than DISCOUNT.</p>
</div>

<div class="section">
  <h2>21. IGST vs CGST + SGST</h2>
  <p>You never choose this — the software compares your state code with the
  customer's:</p>
  <table class="data">
    <tr><th>Situation</th><th>Tax charged</th><th>Shown on the POS as</th></tr>
    <tr><td>Surat (24) → Bihar (10) — different states</td><td><b>IGST</b> 5% as one line</td><td>Inter-state — IGST (24 → 10)</td></tr>
    <tr><td>Surat (24) → Surat (24) — same state</td><td><b>CGST</b> 2.5% + <b>SGST</b> 2.5%</td><td>Intra-state — CGST + SGST</td></tr>
  </table>
  <div class="warn"><b>If the customer has no state code</b>
    The POS shows an orange warning instead of guessing. Charging the wrong type
    of GST is a filing problem, so fix the customer's record before billing:
    Clients &amp; Vendors → edit → State code.</div>
</div>

<div class="section">
  <h2>22. Saving and printing the tax invoice</h2>
  <ol class="steps">
    <li>Check the customer and the totals panel.</li>
    <li>Click <b>Save &amp; print bill</b>.</li>
    <li>The invoice is saved and given its number, e.g. <code>INV/2026-27/0001</code>.</li>
    <li>A save box appears — choose where to keep the PDF.</li>
    <li>The PDF opens; press <b>Ctrl+P</b> to print it.</li>
    <li>The cart clears, ready for the next customer.</li>
  </ol>
  <div class="note"><b>Numbering</b>
    Numbers run in an unbroken series per financial year — <code>INV/2026-27/0001</code>,
    <code>0002</code> and so on. Gapless numbering is a GST requirement and is handled
    for you.</div>
  <p>Everything the bill touched is updated in the same instant: stock reduces,
  the customer's outstanding rises, and the sale enters your GST reports.</p>
</div>

<div class="section">
  <h2>23. The printed bill explained</h2>
  <p>This is the layout you get with the Textile GST template:</p>
  ${sampleBillTable()}
  <table class="data">
    <tr><th style="width:32%">Part of the bill</th><th>Where it comes from</th></tr>
    <tr><td>Invocation line</td><td>Settings → Invocation line</td></tr>
    <tr><td>Firm name, GSTIN, PAN, address, phone</td><td>Settings → Company profile</td></tr>
    <tr><td>Buyer block and Place of Supply</td><td>The customer's record</td></tr>
    <tr><td>Bill no, Challan, Date</td><td>Generated on save</td></tr>
    <tr><td>Transport, Station, Case no, L.R., Weight, Freight</td><td>POS boxes, or the invoice's Dispatch section</td></tr>
    <tr><td>HSN</td><td>From the designs on the bill</td></tr>
    <tr><td>The grid</td><td>The lines you scanned</td></tr>
    <tr><td>SUB TOTAL row</td><td>Total pieces, total metres, total amount</td></tr>
    <tr><td>Bank details</td><td>Settings → Bank &amp; payment details</td></tr>
    <tr><td>Amount in words</td><td>Worked out from the invoice value</td></tr>
    <tr><td>Terms &amp; conditions</td><td>Settings → Default invoice terms</td></tr>
    <tr><td>E-Way Bill no, Transporter ID</td><td>The invoice's Dispatch section</td></tr>
  </table>
  <h3>Adding transport details to a bill</h3>
  <p>The POS covers Transport and Case no. For the full set — L.R. number, e-way
  bill, transporter ID, weight, freight, consignee, agent — open the invoice from
  <b>Sales</b> and expand <b>Dispatch &amp; transport details</b>.</p>
  ${img('sales-dispatch-block', 'The dispatch block — everything the transporter needs on the bill')}
</div>

<!-- ==================== PART 6 ==================== -->
<div class="section">
  <h2>24. Proforma, challan, order and credit note</h2>
  <p><b>Sales</b> holds five kinds of document. They all fill in the same way;
  only their meaning differs.</p>
  ${img('sales-invoice-list', 'Sales → Invoices, with the actions available on each row')}
  <table class="data">
    <tr><th style="width:24%">Tab</th><th>Use it for</th><th>Moves stock?</th></tr>
    <tr><td><b>Invoices</b></td><td>The real GST bill</td><td><b>Yes</b> — stock out</td></tr>
    <tr><td><b>Proforma</b></td><td>A quotation before the customer commits</td><td>No</td></tr>
    <tr><td><b>Delivery Challan</b></td><td>Goods sent without a bill yet (approval, job work)</td><td>No</td></tr>
    <tr><td><b>Orders</b></td><td>A confirmed order to supply later</td><td>No</td></tr>
    <tr><td><b>Returns (Credit Note)</b></td><td>Goods coming back from a customer</td><td><b>Yes</b> — stock back in</td></tr>
  </table>
  ${img('sales-new-invoice', 'Raising a document by hand — same editor for all five types')}
  ${img('sales-tab-Proforma', 'Proforma — a quotation, with no effect on stock')}
  ${img('sales-tab-Delivery-Challan', 'Delivery Challan — goods out, bill to follow')}
  ${img('sales-tab-Orders', 'Orders — confirmed orders waiting to be supplied')}
  ${img('sales-tab-Returns-Credit-Note-', 'Returns (Credit Note) — goods coming back, stock restored')}
  <h3>Turning one into another</h3>
  <p>Use the <b>Convert</b> action on a row: an Order or Proforma becomes an
  Invoice in one click, carrying every line, the scheme and all the transport
  details across. No retyping.</p>
  <h3>The buttons on each row</h3>
  ${img('sales-row-actions', 'Every saved document carries the same six actions')}
  <table class="data">
    <tr><td><b>Export PDF (A4)</b></td><td>The full tax invoice for printing or emailing</td></tr>
    <tr><td><b>Thermal receipt (80mm)</b></td><td>Short receipt for a counter-top roll printer</td></tr>
    <tr><td><b>GST e-Invoice / e-Way</b></td><td>The JSON payload for the government portal</td></tr>
    <tr><td><b>Share on WhatsApp</b></td><td>Sends the bill details to the customer</td></tr>
    <tr><td><b>Edit</b></td><td>Change a bill — blocked once a payment is recorded</td></tr>
    <tr><td><b>Delete</b></td><td>Cancels the bill and puts the stock back</td></tr>
  </table>
</div>

<div class="section">
  <h2>25. Recording payments</h2>
  <p>Open <b>Payments</b>. <b>Receipts</b> is money in from clients;
  <b>Payments</b> is money out to vendors.</p>
  ${img('payments-list', 'The Payments screen')}
  <ol class="steps">
    <li>Click <b>Record receipt</b>.</li>
    <li>Choose the <b>Client</b>. Their unpaid bills appear underneath.</li>
    <li>Type the <b>Amount</b> received.</li>
    <li>Set the <b>Mode</b> — UPI, bank transfer, cash, cheque, card.</li>
    <li>Put the UTR or cheque number in <b>Reference</b>.</li>
    <li>Click <b>Auto-allocate</b> to settle the oldest bills first, or type against each bill yourself.</li>
    <li><b>Save</b>.</li>
  </ol>
  ${img('payments-allocate', 'Allocating a receipt against open bills, oldest first')}
  <p>The bills move from <b>unpaid</b> to <b>partial</b> or <b>paid</b>, and the
  customer's outstanding drops straight away.</p>
  <div class="tip"><b>Money on account</b>
    You can save a receipt without allocating it. It sits against the customer and
    can be applied to a bill later.</div>
</div>

<!-- ==================== PART 7 ==================== -->
<div class="section">
  <h2>26. Dashboard</h2>
  ${img('dashboard', 'The Dashboard — the first thing you see each morning')}
  <ul>
    <li><b>Sales this month</b> — billed value so far</li>
    <li><b>Receivables</b> — total your customers owe you</li>
    <li><b>Low-stock items</b> — designs at or below their reorder level</li>
    <li><b>Unpaid invoices</b> — how many bills are still open</li>
    <li>A six-month sales chart, recent invoices, and a low-stock list</li>
  </ul>
</div>

<div class="section">
  <h2>27. All seven reports</h2>
  <p><b>Reports</b> has seven tabs. Each can be exported for your CA.</p>
  ${img('report-Receivables-Aging-', 'Receivables (Aging) — who owes you, and for how long')}
  <table class="data">
    <tr><th style="width:28%">Report</th><th>Answers</th></tr>
    <tr><td><b>Receivables (Aging)</b></td><td>Who owes money, bucketed by 0–30 / 31–60 / 61–90 / 90+ days</td></tr>
    <tr><td><b>Payment Reminders</b></td><td>Which customers to chase today</td></tr>
    <tr><td><b>Sales Register</b></td><td>Every bill in a date range — the classic sales book</td></tr>
    <tr><td><b>Profit &amp; Loss</b></td><td>Sales minus cost of goods sold, using weighted-average cost</td></tr>
    <tr><td><b>GST Summary</b></td><td>Tax collected, split by rate, for your return</td></tr>
    <tr><td><b>GSTR-3B</b></td><td>Figures laid out as the 3B return expects</td></tr>
    <tr><td><b>HSN Summary</b></td><td>Sales grouped by HSN code, required in GSTR-1</td></tr>
  </table>
  ${img('report-Payment-Reminders', 'Payment Reminders — who to chase today')}
  ${img('report-Sales-Register', 'Sales Register — every bill in the period')}
  ${img('report-Profit-Loss', 'Profit & Loss — real margin, not just turnover')}
  ${img('report-GST-Summary', 'GST Summary — hand this to your CA at filing time')}
  ${img('report-GSTR-B', 'GSTR-3B — figures arranged as the return expects')}
  ${img('report-HSN-Summary', 'HSN Summary — sales grouped by HSN, required in GSTR-1')}
  <div class="tip"><b>At filing time</b>
    Open GST Summary, set the month, and export the CSV. It carries the invoice
    register your CA needs for GSTR-1.</div>
</div>

<div class="section">
  <h2>28. Activity log</h2>
  <p><b>Administration → Activity Log</b> records every change ever made: who
  did it, what they did, when, and on which computer.</p>
  ${img('audit-log', 'The Activity Log — a permanent, unchangeable record of every action')}
  <ul>
    <li><b>Search</b> by action, user or record</li>
    <li><b>Area</b> — narrow to sales, purchases, items, auth and so on</li>
    <li><b>User</b> — see everything one person did</li>
    <li><b>From / To</b> — restrict to a date range</li>
    <li>Click any row to see the technical detail behind it</li>
    <li><b>Export CSV</b> for your CA or an auditor</li>
  </ul>
  <div class="note"><b>It cannot be edited</b>
    Entries are only ever added — there is no way to change or delete one from
    anywhere in the program. That is what makes it usable as evidence.</div>
  <div class="tip"><b>What it answers</b>
    "Who deleted that invoice?" · "Who changed this rate?" · "Did the counter
    staff log in on Sunday?" · "When did this customer's GSTIN change?"</div>
</div>

<div class="section">
  <h2>29. Backups — protecting your data</h2>
  <div class="warn"><b>Your whole business is one file on one computer</b>
    A failed hard disk with no backup means losing every bill, customer and stock
    figure. This section is the most important in the guide.</div>
  <h3>Backup now</h3>
  <p><b>Settings</b> → <b>Create backup…</b> → choose a pen drive or a
  cloud-synced folder. Take one at the end of every trading day.</p>
  <h3>Automatic daily backups</h3>
  <p><b>Enable</b> under "Automatic daily backups", then pick a folder — ideally a
  Google Drive or OneDrive folder so a copy leaves the building. The app then
  backs up by itself once a day.</p>
  <h3>Restoring</h3>
  <p><b>Restore from backup…</b>, pick the file, and confirm. This
  <b>overwrites everything</b> currently in the app and restarts it. You will be
  asked to confirm in plain words first.</p>
  <h3>Moving to a new computer</h3>
  <ol class="steps">
    <li>Create a backup on the old computer.</li>
    <li>Install Shailee-GRMS on the new one.</li>
    <li>Create the owner account, then use <b>Restore from backup</b>.</li>
    <li>On the old computer, open <b>License</b> → <b>Deactivate this device</b>.</li>
    <li>Send Shailee the confirmation code; they issue a key for the new machine.</li>
  </ol>
</div>

<div class="section">
  <h2>30. Licence — trial, activation and transfer</h2>
  <p>The app runs free for <b>14 days</b> from the moment you first open it.
  Everything works during the trial — nothing is crippled or hidden. The sidebar
  shows an orange <b>Trial · N d left</b> badge so you always know where you stand.</p>

  <h3>What happens as the trial runs out</h3>
  <table class="data">
    <tr><th style="width:26%">Stage</th><th>What you see</th><th>Can you still work?</th></tr>
    <tr><td>Days 1–14</td><td>Orange <b>Trial</b> badge counting down</td><td><b>Yes</b> — everything</td></tr>
    <tr><td>Trial ends</td><td><b>Renew soon</b> warning</td><td><b>Yes</b> — 3-day grace period</td></tr>
    <tr><td>After the grace period</td><td>Activation screen on launch</td><td>Billing locks until you activate</td></tr>
    <tr><td>Activated</td><td>Green <b>Licensed</b> badge</td><td><b>Yes</b> — everything</td></tr>
  </table>
  <div class="tip"><b>Your data is never touched</b>
    If the trial lapses, nothing is deleted — not one invoice, customer or stock
    figure. The moment a valid key is entered everything is exactly as you left it.
    You are never at risk of losing work by being slow to pay.</div>

  <h3>Activating — the whole process</h3>
  <p>Activation is <b>fully offline</b>. Your computer never contacts a licence
  server, so it works in a shop with no internet at all. It is a two-message
  exchange over WhatsApp, email or phone.</p>
  ${img('license', 'The License screen. Your Machine ID is the long code in the middle.')}
  <ol class="steps">
    <li>Open <b>License</b> under Administration (or <b>Help &amp; Support</b>).</li>
    <li>Find <b>Machine ID</b> — 32 letters and digits, e.g.
      <code>F23DA50ECF2B630B091BA60B397C4C5F</code>.</li>
    <li>Press the <b>copy</b> button beside it and send it to Shailee with your payment.
      <b>Use the copy button</b> — typing it by hand almost always introduces a mistake.</li>
    <li>Shailee send back a licence key starting <code>LL1.</code> It is long — that is normal.</li>
    <li>Paste the whole key into the activation box on the <b>License</b> screen.</li>
    <li>Click <b>Activate</b>.</li>
    <li>The badge turns green and your firm's name and expiry date appear.</li>
  </ol>
  <div class="note"><b>Why we need the Machine ID</b>
    Your key is mathematically locked to that one computer. It cannot be copied to
    another PC or shared, which is what lets us sell a per-computer licence without
    any online check. Nobody needs remote access to your machine to activate it.</div>
  <div class="note"><b>Is the Machine ID private?</b>
    No — it is safe to send. It is a scrambled one-way code made from your
    computer's name and processor type. It holds no personal or business
    information and cannot be turned back into anything about you.</div>

  <h3>If activation is refused</h3>
  <table class="data">
    <tr><th style="width:44%">Message</th><th>What to do</th></tr>
    <tr><td>"This license key was issued for a different computer"</td><td>The Machine ID sent did not match this PC — usually a typo, or it was read from a different computer. Copy it again with the button and ask for a fresh key.</td></tr>
    <tr><td>"This license key has already expired"</td><td>The validity period ended. Ask Shailee for a renewal key.</td></tr>
    <tr><td>"Invalid license key"</td><td>The key was cut short or altered when pasting. Copy the <b>entire</b> string, including the <code>LL1.</code> at the front, with no spaces or line breaks.</td></tr>
  </table>

  <h3>Renewing</h3>
  <p>If your licence has an expiry date, Shailee send a new key before it runs
  out. Paste it in exactly as the first time — same screen, same button. Nothing
  is reinstalled and no data moves.</p>

  <h3>Moving to a new computer</h3>
  <p>Because a key is tied to one PC, changing computers is a short handover.
  <b>Do this before disposing of the old machine.</b></p>
  <ol class="steps">
    <li>On the <b>old</b> PC: <b>Settings</b> → <b>Create backup…</b> and save to a pen drive.</li>
    <li>Still on the old PC: <b>License</b> → <b>Deactivate this device</b>.</li>
    <li>The app shows a <b>confirmation code</b>. Send it to Shailee — it proves the old computer released the licence.</li>
    <li>Install Shailee-GRMS on the <b>new</b> PC and create your owner account.</li>
    <li><b>Settings</b> → <b>Restore from backup…</b> and pick the file from the pen drive.</li>
    <li>Send Shailee the <b>new</b> Machine ID; they issue a replacement key.</li>
    <li>Activate on the new PC.</li>
  </ol>
  <div class="warn"><b>If the old computer has died</b>
    You cannot produce a confirmation code from a dead machine. Call Shailee and
    explain — they can issue a key for the new computer. Your data comes back from
    your most recent backup, which is exactly why section 29 matters.</div>
</div>

<div class="section">
  <h2>31. Help &amp; support</h2>
  ${img('help', 'Help & Support — version, Machine ID and shortcuts to your data')}
  <ul>
    <li><b>Version</b> and <b>Machine ID</b> — quote both when contacting support</li>
    <li><b>Open data &amp; backups folder</b> — jumps straight to your database file</li>
    <li><b>Open logs folder</b> — technical logs support may ask for</li>
    <li>Email, phone and WhatsApp for Shailee</li>
  </ul>
</div>

<!-- ==================== PART 8 ==================== -->
<div class="section">
  <h2>32. Barcode scanner setup &amp; tips</h2>
  <h3>Buying one</h3>
  <p>Any <b>USB "keyboard wedge"</b> scanner works — that is nearly all of them,
  from about ₹1,200. Look for <b>1D / Code 128</b> support (the labels this app
  prints). You do not need a 2D/QR scanner, though one will also work.</p>
  <h3>Setting it up</h3>
  <ol class="steps">
    <li>Plug it into a USB port. Windows sets it up by itself.</li>
    <li>Open Notepad and scan a label — the digits should appear, then a new line.</li>
    <li>If they do, the scanner is ready. There is nothing to configure in the app.</li>
  </ol>
  <div class="tip"><b>Enter or Tab — both work</b>
    Most scanners send <b>Enter</b> after the digits; some are factory-set to send
    <b>Tab</b>. Shailee-GRMS accepts either, so there is normally nothing to
    configure. If your scanner sends <i>neither</i> (the digits appear but nothing
    happens), scan the "Add Enter / CR suffix" configuration barcode printed in
    its manual.</div>
  <div class="note"><b>Scan as fast as you like</b>
    Pieces are counted even when labels are scanned back-to-back with no pause,
    and two designs scanned alternately still group into one line each.</div>
  <h3>At the counter</h3>
  <ul>
    <li>Keep the cursor in the <b>Scan barcode</b> box.</li>
    <li>Hold the scanner 10–20 cm from the label, square on.</li>
    <li>Torn or smudged label? Type the <b>SKU</b> and press Enter instead.</li>
    <li>Scanning fast is fine — the app queues scans and will not drop one.</li>
  </ul>
</div>

<div class="section">
  <h2>33. The account menu &amp; changing your password</h2>
  <p>Your name sits in the <b>top-right corner</b> of every screen. Click it for:</p>
  <table class="data">
    <tr><td><b>Change password</b></td><td>Set a new password for yourself. Asks for the current one first.</td></tr>
    <tr><td><b>New recovery code</b></td><td>Issues a fresh code and <b>cancels the old one immediately</b>. Write the new one down before closing the box.</td></tr>
    <tr><td><b>Sign out</b></td><td>Locks the app and returns to the sign-in screen</td></tr>
  </table>
  <p>Beside it is the <b>moon / sun</b> button, which switches between light and
  dark appearance. Dark is easier on the eyes in a dim shop; the choice is
  remembered for next time.</p>
  <div class="tip"><b>Sign out at closing time</b>
    Especially if staff share a counter computer. It takes two seconds and keeps
    the activity log meaningful — every action is recorded against whoever was
    signed in.</div>
</div>

<div class="section">
  <h2>34. Your daily / weekly / monthly routine</h2>
  <p>Once set up, this is all the software asks of you.</p>
  <h3>Every day</h3>
  <ul>
    <li>Sign in; glance at the <b>Dashboard</b> for receivables and low stock.</li>
    <li>Bill customers at the <b>POS</b> as they buy.</li>
    <li>Record any <b>GRN</b> for stock that arrived.</li>
    <li>Record <b>receipts</b> as money comes in.</li>
    <li><b>At closing: Settings → Create backup</b> to a pen drive.</li>
  </ul>
  <h3>Every week</h3>
  <ul>
    <li><b>Reports → Payment Reminders</b> — chase overdue customers.</li>
    <li><b>Inventory</b> — check low stock and reorder.</li>
    <li>Spot-check a few designs' physical count against the system.</li>
  </ul>
  <h3>Every month</h3>
  <ul>
    <li><b>Reports → GST Summary</b> and <b>HSN Summary</b> — export for your CA.</li>
    <li><b>Reports → Profit &amp; Loss</b> — check your real margin.</li>
    <li><b>Reports → Receivables (Aging)</b> — review anything past 60 days.</li>
    <li>Take a backup you keep <b>off the premises</b>.</li>
  </ul>
  <div class="tip"><b>The one habit that matters</b>
    If you do nothing else from this list, take the daily backup. Everything else
    can be reconstructed; a lost database cannot.</div>
</div>

<div class="section">
  <h2>35. Updating and uninstalling</h2>
  <h3>Installing an update</h3>
  <ol class="steps">
    <li>Take a backup first (<b>Settings → Create backup</b>).</li>
    <li>Close Shailee-GRMS.</li>
    <li>Run the new <code>Shailee-GRMS-Setup-x.x.x.exe</code>.</li>
    <li>Install over the top — do <b>not</b> uninstall first.</li>
    <li>Open the app. Your data, licence and settings are all still there.</li>
  </ol>
  <div class="note"><b>Updates never touch your data</b>
    The installer only replaces program files. Your database sits in a separate
    folder and is upgraded automatically if the new version needs it.</div>

  <h3>Uninstalling</h3>
  <p>Windows <b>Settings → Apps → Installed apps</b> → Shailee-GRMS →
  <b>Uninstall</b>.</p>
  <div class="warn"><b>Uninstalling deliberately leaves your data behind</b>
    Your database stays in
    <code>C:\\Users\\&lt;you&gt;\\AppData\\Roaming\\shailee-grms\\</code> so that
    reinstalling brings everything back. If you are selling or scrapping the
    computer and want the business data gone, take a backup first, then delete
    that folder by hand.</div>
  <div class="warn"><b>Deactivate before wiping a computer</b>
    Go to <b>License → Deactivate this device</b> first (section 30). Otherwise
    the licence stays tied to a machine you no longer have.</div>
</div>

<div class="section">
  <h2>36. Troubleshooting</h2>
  <table class="data">
    <tr><th style="width:38%">Problem</th><th>Fix</th></tr>
    <tr><td>"Windows protected your PC" when installing</td><td>Click <b>More info</b> → <b>Run anyway</b>. Appears because the installer is not code-signed yet.</td></tr>
    <tr><td>Scan does nothing</td><td>Click into the Scan barcode box first. Test the scanner in Notepad.</td></tr>
    <tr><td>"No item matches …"</td><td>That design has no barcode. Items → <b>Generate barcodes</b>.</td></tr>
    <tr><td>Bill shows CGST+SGST but should be IGST</td><td>The customer's <b>State code</b> is missing or matches yours. Fix it in Clients &amp; Vendors.</td></tr>
    <tr><td>"Not enough stock for …"</td><td>Working as intended. Record the GRN for goods received, or turn off <i>Prevent negative stock</i> in Settings.</td></tr>
    <tr><td>Cannot edit an invoice</td><td>A payment is recorded against it. Delete the receipt first, or raise a credit note.</td></tr>
    <tr><td>Barcode labels will not scan</td><td>Reprint at <b>100% / Actual size</b>, not "Fit to page".</td></tr>
    <tr><td>Forgot the password</td><td><b>Forgot password?</b> on the sign-in screen, then your recovery code.</td></tr>
    <tr><td>Staff member cannot see Reports or Settings</td><td>They are an Operator. Change the role in Users if they should have more.</td></tr>
    <tr><td>Wrong amounts on a saved bill</td><td>Sales → <b>Edit</b> the invoice (if unpaid), correct it, and save. Numbering does not change.</td></tr>
    <tr><td>"License key was issued for a different computer"</td><td>The Machine ID did not match. Copy it again with the button and ask for a fresh key (section 30).</td></tr>
    <tr><td>Trial expired and billing is locked</td><td>Send Shailee your Machine ID and activate. <b>No data is lost</b> — everything returns the moment a key is entered.</td></tr>
    <tr><td>App will not start after moving the data file</td><td>Put the file back in <code>AppData\Roaming\shailee-grms\</code>. Use Backup/Restore to move data, never copy the file by hand.</td></tr>
    <tr><td>Two people need to bill at once</td><td>Not supported — one computer, one copy. Running two copies on a shared file will corrupt your records.</td></tr>
  </table>
</div>

<div class="section">
  <h2>37. Glossary</h2>
  <table class="data">
    <tr><td><b>CUT</b></td><td>Metres in one saree, normally 6.30</td></tr>
    <tr><td><b>PCS</b></td><td>Number of pieces (sarees)</td></tr>
    <tr><td><b>MTS</b></td><td>Total metres = PCS × CUT. Printed for reference only.</td></tr>
    <tr><td><b>RATE</b></td><td>Price of one piece</td></tr>
    <tr><td><b>SKU</b></td><td>Your own code for a design</td></tr>
    <tr><td><b>HSN</b></td><td>Government product code. 5407 for most woven sarees.</td></tr>
    <tr><td><b>GRN</b></td><td>Goods Received Note — records stock coming in</td></tr>
    <tr><td><b>PO</b></td><td>Purchase Order — what you ask the mill to send</td></tr>
    <tr><td><b>Proforma</b></td><td>A quotation; not a tax invoice</td></tr>
    <tr><td><b>Challan</b></td><td>Goods sent without billing yet</td></tr>
    <tr><td><b>Credit Note</b></td><td>Goods returned by a customer</td></tr>
    <tr><td><b>IGST</b></td><td>GST on sales to another state, charged as one figure</td></tr>
    <tr><td><b>CGST + SGST</b></td><td>GST within your own state, split in half</td></tr>
    <tr><td><b>Taxable Value</b></td><td>Bill value after discount, before GST</td></tr>
    <tr><td><b>Scheme</b></td><td>Trade discount taken off before GST</td></tr>
    <tr><td><b>E-Way Bill</b></td><td>Transport permit for consignments above the state threshold</td></tr>
    <tr><td><b>Machine ID</b></td><td>This computer's fingerprint; your licence is tied to it</td></tr>
    <tr><td><b>Reorder level</b></td><td>Stock level at which the app warns you</td></tr>
  </table>
  <div class="note" style="margin-top:22px"><b>Need help?</b>
    Email <b>robin@skytechdevelopments.com</b> or call <b>+91 76318 69625</b>.
    Have your <b>Version</b> and <b>Machine ID</b> ready (Help &amp; Support screen).</div>
</div>

</body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })

  // Load from a temp file, never a data: URL. With ~40 embedded screenshots the
  // document is tens of megabytes, and encodeURIComponent-ing that into a URL
  // hangs the renderer.
  const tmp = join(app.getPath('temp'), `shailee-guide-${Date.now()}.html`)
  writeFileSync(tmp, html, 'utf8')
  await win.loadFile(tmp)

  // Give embedded images a moment to decode before printing.
  await new Promise((r) => setTimeout(r, 3000))
  const pdf = await win.webContents.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#9ca3af;padding:0 14mm;display:flex;justify-content:space-between">' +
      '<span>Shailee-GRMS — Complete User Guide</span>' +
      '<span class="pageNumber"></span></div>'
  })
  writeFileSync(OUT, pdf)
  const kb = Math.round(pdf.length / 1024)
  console.log(`\nGuide written: ${OUT}  (${kb} KB, ${cache.size} screenshots embedded)`)
  try {
    rmSync(tmp, { force: true })
  } catch {
    /* temp file is disposable */
  }
  win.destroy()
  app.quit()
})
