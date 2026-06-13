// Builds the client-facing, screenshot-rich PDF manual from the captured page
// screenshots (release/brochure/*.png). Structured so a client can install the
// .exe and operate the whole app on their own.
// Run AFTER scripts/capture.mjs and scripts/rasterize-bill.mjs:
//   env -u ELECTRON_RUN_AS_NODE npx electron scripts/make-brochure.mjs
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'

app.disableHardwareAcceleration()
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'release', 'brochure')
const EMAIL = 'robin@skytechdevelopments.com'
const PHONE = '+91 76318 69625'
const WEB = 'skytechdevelopments.com'

const img = (name) => (existsSync(join(dir, name)) ? 'data:image/png;base64,' + readFileSync(join(dir, name)).toString('base64') : null)

// [part, file, title, intro, [steps]]
const TOPICS = [
  ['Getting started', '01-first-run-setup.png', 'Install &amp; create your account',
    'After installing and opening <b>SkyTech Billing</b> for the first time, you create the owner account. This account controls your whole business.',
    ['Double-click <b>SkyTech-Billing-Setup.exe</b>. If Windows shows a blue "Windows protected your PC" notice, click <b>More info → Run anyway</b> (this appears for new software and is safe).',
     'Choose where to install and finish the wizard — a desktop &amp; Start-menu shortcut is created.',
     'On first launch, enter your <b>Full name</b>, a <b>Username</b> and a <b>Password</b> (min 8 characters), then click <b>Create account &amp; continue</b>.',
     'You will be shown a one-time <b>Recovery code</b> — write it down and keep it safe. It is the only way to reset your password if you forget it.']],
  ['Getting started', '00-login.png', 'Signing in',
    'On every later launch you sign in with your username and password.',
    ['Type your <b>Username</b> and <b>Password</b> and click <b>Sign in</b>.',
     'Forgot your password? Click <b>Forgot password?</b>, enter your username and your saved recovery code, and set a new password.',
     'For security, the account locks for 15 minutes after 5 wrong attempts. The trial / licensed status is shown on this screen.']],
  ['Getting started', '02-dashboard.png', 'Finding your way around',
    'After signing in you land on the Dashboard. The left sidebar is your main menu, grouped into Overview, Masters, Operations, Insights and Administration.',
    ['<b>Top KPIs</b> show sales this month, receivables, low-stock items and unpaid invoices.',
     'The <b>6-month sales chart</b>, recent invoices and low-stock list give a quick health-check.',
     'Top-right: switch <b>light/dark theme</b>, and open your <b>profile menu</b> (change password, recovery code, sign out). The bottom of the sidebar shows your trial/licence badge.']],

  ['One-time setup', '19-settings.png', 'Step 1 — Your company &amp; logo',
    'Set this up once. Your company identity prints on every invoice.',
    ['Open <b>Settings</b> from the sidebar.',
     'Fill in your <b>legal/trade name, GSTIN, PAN, address and state code</b> (the state code decides CGST+SGST vs IGST).',
     'Click <b>Upload</b> to add your <b>logo</b> (shown on invoices &amp; PDFs).',
     'Add your <b>bank details and UPI ID</b> (a UPI QR is printed on invoices) and default invoice terms, then click <b>Save</b>.',
     'Optionally turn on <b>Prevent negative stock</b> and set up <b>Automatic daily backups</b> here.']],
  ['One-time setup', '03-items.png', 'Step 2 — Add your items',
    'Items are the products/services you buy and sell.',
    ['Open <b>Items → New item</b>.',
     'Enter <b>SKU, name, HSN/SAC code, GST rate, purchase &amp; selling price</b>.',
     'For stock-tracked goods, set <b>opening stock</b>, its value and a <b>reorder level</b> (items below it are flagged).',
     'Click <b>Save</b>. Use the search box to find items later; click the pencil to edit.']],
  ['One-time setup', '04-clients.png', 'Step 3 — Add clients (customers)',
    'Your customers — schools, colleges and other buyers.',
    ['Open <b>Clients &amp; Vendors</b>, stay on the <b>Clients</b> tab, click <b>New customer</b>.',
     'Enter the <b>name, GSTIN/PAN, contact, address &amp; state code</b>, and optional <b>credit limit/days</b>.',
     'Click <b>Save</b>. The <b>Balance</b> column shows live outstanding (Dr = they owe you).']],
  ['One-time setup', '05-vendors.png', 'Step 3b — Add vendors (suppliers)',
    'Your suppliers, captured the same way under the Vendors tab.',
    ['Switch to the <b>Vendors</b> tab and click <b>New vendor</b>.',
     'Fill in their details and <b>Save</b>. Their balance (Cr = you owe them) updates from purchases &amp; payments.']],

  ['Daily billing', '09-purchases.png', 'Step 4 — Bring stock in (Purchase / GRN)',
    'Record goods received from a vendor — this increases your stock.',
    ['Open <b>Purchases</b>, choose the <b>Goods Received (GRN)</b> tab, click <b>New</b>.',
     'Select the <b>vendor</b>, tick <b>Inter-state</b> if the vendor is in another state, and add the items with quantity, rate and GST.',
     'Optionally record a <b>batch number &amp; expiry</b> per line, then <b>Save</b>. Stock goes up automatically.',
     'Tip: create a Purchase Order first and <b>convert</b> it to a GRN in one click when goods arrive.']],
  ['Daily billing', '11-invoice-editor.png', 'Step 5 — Create a GST invoice',
    'This is the heart of the software — raising a tax invoice for a client.',
    ['Open <b>Sales → Invoices → New</b>.',
     'Pick the <b>client</b>, set the <b>date</b> and optional due date / reference.',
     'Add <b>line items</b> — choosing an item auto-fills its price &amp; tax; set quantity, rate, discount and GST rate per line.',
     'Optionally add <b>additional charges</b> (freight/packing) or an extra discount; totals (CGST/SGST or IGST, round-off, grand total) update live.',
     'Click <b>Save</b>. Stock is reduced automatically and the invoice gets a unique number (e.g. INV/2025-26/0001).']],
  ['Daily billing', 'bill.png', 'Your professional GST invoice',
    'Every invoice produces a clean, GST-compliant PDF you can email, print or share.',
    ['It includes your <b>logo, GSTIN and bill-to details</b>.',
     'Each line shows <b>per-item CGST/SGST</b>, plus an <b>HSN summary</b> and <b>amount in words</b>.',
     'Your <b>bank details and a UPI QR code</b> are printed so the customer can pay instantly.']],
  ['Daily billing', '10-sales.png', 'Step 6 — Print &amp; share',
    'From the Sales list, each invoice row has quick actions.',
    ['<b>PDF (A4)</b> — save/print a full tax invoice.',
     '<b>Thermal</b> — an 80mm POS receipt for a thermal printer.',
     '<b>GST e-Invoice / e-Way JSON</b> — export the government-schema file for the portal.',
     '<b>WhatsApp</b> — share invoice details with the customer. Use the date filter to find past invoices.']],
  ['Daily billing', '12-payments.png', 'Step 7 — Record payments',
    'When money arrives (UPI/bank/cash), record it and match it to bills.',
    ['Open <b>Payments → Receipts</b> (for clients) and click <b>Record receipt</b>.',
     'Choose the <b>client</b>, enter the <b>amount, date, mode and reference</b> (UTR/cheque no).',
     'Click <b>Auto-allocate</b> to apply it to open invoices, then <b>Save</b>. The invoice shows Paid / Partial automatically.',
     'Use the <b>Payments</b> tab the same way to record money paid to vendors.']],

  ['Inventory', '07-inventory.png', 'Inventory — stock &amp; valuation',
    'See exactly what you have and what it is worth.',
    ['Open <b>Inventory</b> for live stock, total <b>stock value</b> and low-stock count.',
     'Click <b>Adjust stock</b> to correct for damage, expiry or a physical count.']],
  ['Inventory', '08-batch-expiry.png', 'Inventory — batch &amp; expiry',
    'Track shelf life for batch-managed items.',
    ['Switch to the <b>Batch expiry</b> tab.',
     'See remaining quantity per batch and the nearest expiry — items expiring within 90 days are highlighted.']],

  ['Parties &amp; money', '06-party-statement.png', 'Customer / vendor statements',
    "View a party's complete account with a running balance, and share it.",
    ['On <b>Clients &amp; Vendors</b>, click the <b>statement (book)</b> icon on any row.',
     'See every invoice, purchase, return and payment with a running balance.',
     'Click <b>Download PDF</b> to send the statement to the customer.']],
  ['Parties &amp; money', '14-reports-reminders.png', 'Payment reminders',
    'Chase overdue money in one click.',
    ['Open <b>Reports → Payment Reminders</b>.',
     'See every overdue invoice with how many days late it is.',
     'Click <b>Remind</b> to open WhatsApp with a polite, pre-filled reminder message.']],

  ['Reports', '13-reports-receivables.png', 'Receivables aging',
    'Know who owes you and for how long.',
    ['Open <b>Reports → Receivables (Aging)</b> for outstanding amounts bucketed 0-30 / 31-60 / 61-90 / 90+ days, with the total.']],
  ['Reports', '15-reports-pnl.png', 'Profit &amp; Loss',
    'Understand profitability for any period.',
    ['Open <b>Reports → Profit &amp; Loss</b> and choose a date range.',
     'See net revenue, cost of goods sold (weighted-average cost), gross profit and margin.']],
  ['Reports', '16-reports-gstr3b.png', 'GST reports (GSTR-1 / 3B / HSN)',
    'Everything you (or your CA) need to file GST.',
    ['<b>GST Summary</b> — GSTR-1 figures with a <b>CSV export</b>.',
     '<b>GSTR-3B</b> — outward-supply tax summary.',
     '<b>HSN Summary</b> — tax grouped by HSN code.']],

  ['Administration', '17-users.png', 'Users &amp; roles',
    'Give your staff their own logins with the right access.',
    ['Open <b>Users → New user</b>.',
     'Set their name, username, password and <b>role</b>: <b>Operator</b> (billing &amp; data entry), <b>Manager</b> (+ reports/approvals) or <b>Admin</b> (full control).',
     'Each person sees only what their role allows. New staff set their own password at first login.']],
  ['Administration', '19-settings.png', 'Backups (very important)',
    'Your data lives only on this PC — back it up regularly.',
    ['In <b>Settings → Backup &amp; restore</b>, click <b>Create backup…</b> to save a copy (USB / cloud-synced folder recommended).',
     'Turn on <b>Automatic daily backups</b> and pick a folder — the app keeps the latest 10.',
     'To recover, use <b>Restore from backup…</b> (the app safely snapshots current data first, then restarts).']],
  ['Administration', '20-help.png', 'Help &amp; support',
    'Everything you need to get help is one click away.',
    ['Open <b>Help &amp; Support</b> for the app version, your licence and <b>Machine ID</b>.',
     'Reach SkyTech by email, phone or WhatsApp.',
     'Use <b>Open data &amp; backups folder</b> / <b>Open logs folder</b> if support asks for a file.']],

  ['Licence', '18-license.png', 'Free trial &amp; activation',
    'Every install includes a 14-day free trial with all features. After that, activate a licence to continue.',
    ['Open <b>License</b> and copy your <b>Machine ID</b>.',
     `Send it to SkyTech (<b>${EMAIL}</b> / <b>${PHONE}</b>) with payment.`,
     'We send you a key bound to your computer — paste it and click <b>Activate</b>. It works offline, instantly.',
     'Moving to a new PC? Click <b>Deactivate this device</b>, restore your backup on the new PC, and we issue a fresh key.']]
]

function topicHtml([part, file, title, intro, steps]) {
  const src = img(file)
  return `<div class="topic">
    <div class="part">${part}</div>
    <h2>${title}</h2>
    <p class="intro">${intro}</p>
    ${src ? `<img src="${src}" />` : ''}
    <div class="how"><b>How to:</b><ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol></div>
  </div>`
}

function toc() {
  let cur = ''
  let out = ''
  TOPICS.forEach(([part, , title], i) => {
    if (part !== cur) { out += `<div class="tocpart">${part}</div>`; cur = part }
    out += `<div class="tocrow"><span>${title.replace(/<[^>]+>/g, '')}</span><span class="dots"></span><span>${i + 5}</span></div>`
  })
  return out
}

function buildHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing:border-box; }
  body { font-family:'Segoe UI',Arial,sans-serif; color:#1f2937; margin:0; font-size:12px; }
  .cover { height:1040px; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;
           background:linear-gradient(135deg,#2563eb,#1e3a8a); color:#fff; padding:40px; }
  .cover .logo { width:108px;height:108px;border-radius:26px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:58px;margin-bottom:22px; }
  .cover h1 { font-size:46px; margin:0; }
  .cover .tag { font-size:20px; opacity:.92; margin:6px 0 22px; }
  .cover .meta { font-size:14px; opacity:.88; line-height:1.7; }
  .cover .shot { margin-top:26px; width:72%; border-radius:10px; box-shadow:0 18px 50px rgba(0,0,0,.4); }
  .page { page-break-before: always; padding:34px 44px; }
  h1.section { color:#1e3a8a; font-size:26px; margin:0 0 12px; }
  .tocpart { color:#2563eb; font-weight:700; margin:16px 0 6px; font-size:13px; text-transform:uppercase; letter-spacing:.5px; }
  .tocrow { display:flex; align-items:baseline; gap:8px; padding:3px 0; font-size:13px; }
  .tocrow .dots { flex:1; border-bottom:1px dotted #cbd5e1; }
  .topic { page-break-before: always; padding:30px 44px; }
  .topic .part { display:inline-block; background:#eff6ff; color:#2563eb; font-weight:700; font-size:10px;
                 text-transform:uppercase; letter-spacing:.5px; padding:3px 10px; border-radius:999px; }
  .topic h2 { color:#1e3a8a; font-size:20px; margin:8px 0 4px; }
  .topic .intro { color:#374151; margin:0 0 10px; }
  .topic img { width:100%; border:1px solid #e2e8f0; border-radius:10px; box-shadow:0 8px 22px rgba(0,0,0,.10); }
  .how { margin-top:12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 16px; }
  .how ol { margin:6px 0 0 18px; padding:0; } .how li { margin:4px 0; line-height:1.5; }
  ul { line-height:1.7; } table { border-collapse:collapse; margin-top:8px; } td,th { border:1px solid #e2e8f0; padding:6px 12px; text-align:left; }
  code { background:#f1f5f9; padding:1px 5px; border-radius:4px; }
  </style></head><body>

  <div class="cover">
    <div class="logo">🧾</div>
    <h1>SkyTech Billing</h1>
    <div class="tag">Billing that reaches new heights</div>
    <div class="meta">Complete Product Guide &amp; Step-by-Step Manual<br/>by SkyTech Developments · ${EMAIL} · ${PHONE}</div>
    ${img('02-dashboard.png') ? `<img class="shot" src="${img('02-dashboard.png')}" />` : ''}
  </div>

  <div class="page">
    <h1 class="section">What is SkyTech Billing?</h1>
    <p><b>SkyTech Billing</b> is a complete, offline Windows application for <b>GST billing and inventory</b>, built for
    distributors and suppliers (for example, selling to schools &amp; colleges). All your data is stored securely on your
    own computer — no internet is needed for daily use.</p>
    <h2 style="color:#1e3a8a;margin-top:16px">What it does</h2>
    <ul>
      <li><b>Billing:</b> GST tax invoices, proforma, delivery challans, orders, credit/debit notes — A4 PDF, 80mm thermal, WhatsApp share, e-Invoice &amp; e-Way JSON.</li>
      <li><b>Inventory:</b> live stock &amp; valuation, low-stock alerts, batch &amp; expiry, stock adjustments.</li>
      <li><b>Purchases:</b> purchase orders → GRN (stock-in) → returns; vendor bills &amp; payments.</li>
      <li><b>Parties:</b> clients &amp; vendors with GSTIN validation, credit terms, live balances and statements.</li>
      <li><b>Money:</b> receipts &amp; payments with bill allocation; overdue payment reminders.</li>
      <li><b>Reports:</b> dashboard, receivables aging, Profit &amp; Loss, GSTR-1 / 3B / HSN summaries.</li>
      <li><b>Security:</b> role-based users, audit log, password recovery, 14-day trial + machine-locked licence, backups.</li>
    </ul>
    <p style="margin-top:12px;color:#64748b">This manual shows every screen with simple step-by-step instructions, so you can set up and run the software end-to-end on your own.</p>
  </div>

  <div class="page">
    <h1 class="section">Contents</h1>
    ${toc()}
  </div>

  ${TOPICS.map(topicHtml).join('')}

  <div class="page">
    <h1 class="section">Quick FAQ &amp; tips</h1>
    <ul>
      <li><b>Where is my data?</b> On this computer only, in your Windows user folder. Use Backups to keep copies safe.</li>
      <li><b>It asks me to log in after reinstalling — is my data gone?</b> No. Reinstalling keeps your data; you simply sign in again.</li>
      <li><b>Intra-state vs inter-state tax?</b> Set correct GST state codes; same state → CGST+SGST, different state → tick "Inter-state" for IGST.</li>
      <li><b>Multiple staff?</b> Create users with roles so each person sees only what they need.</li>
      <li><b>New computer?</b> Back up → install on the new PC → Restore → deactivate the old licence and activate the new key.</li>
      <li><b>Lost password?</b> Use "Forgot password?" with your recovery code, or ask an admin to reset it.</li>
    </ul>
    <h1 class="section" style="margin-top:24px">Support — SkyTech Developments</h1>
    <table>
      <tr><th>Email</th><td>${EMAIL}</td></tr>
      <tr><th>Phone / WhatsApp</th><td>${PHONE}</td></tr>
      <tr><th>Website</th><td>${WEB}</td></tr>
    </table>
    <p style="margin-top:28px;color:#94a3b8;font-size:10px">© 2026 SkyTech Developments · SkyTech Billing — Billing that reaches new heights.</p>
  </div>
  </body></html>`
}

app.whenReady().then(async () => {
  const html = buildHtml()
  const server = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html) })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const win = new BrowserWindow({ show: false, width: 1000, height: 1200 })
  await win.loadURL(`http://127.0.0.1:${port}/`)
  await new Promise((r) => setTimeout(r, 1500))
  const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  writeFileSync(join(root, 'SkyTech-Billing-Brochure.pdf'), pdf)
  server.close()
  console.log('Wrote SkyTech-Billing-Brochure.pdf', `(${(pdf.length / 1024 / 1024).toFixed(2)} MB)`)
  app.quit()
})
