// Generates SkyTech-Billing-User-Guide.pdf from an HTML manual using Electron's
// renderer (printToPDF). Run: npm run make:docs
import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const EMAIL = 'robin@skytechdevelopments.com'
const PHONE = '+91 76318 69625'

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; font-size: 12px; line-height: 1.55; margin: 0; }
  h1,h2,h3 { color: #1e3a8a; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 26px 0 8px; border-bottom: 2px solid #dbeafe; padding-bottom: 4px; }
  h3 { font-size: 14px; margin: 16px 0 4px; }
  p, li { font-size: 12px; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  th, td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: left; font-size: 11px; vertical-align: top; }
  th { background: #eff6ff; }
  .cover { height: 980px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; background: linear-gradient(135deg,#2563eb,#1e3a8a); color: #fff; }
  .cover h1 { color: #fff; font-size: 40px; }
  .cover .tag { font-size: 18px; opacity: .9; margin-bottom: 30px; }
  .cover .meta { font-size: 13px; opacity: .85; }
  .logo { width: 96px; height: 96px; border-radius: 22px; background: #fff; display: flex; align-items: center; justify-content: center; font-size: 52px; margin-bottom: 20px; }
  .section { page-break-before: always; padding: 28px 36px; }
  .note { background: #f0f9ff; border-left: 4px solid #2563eb; padding: 8px 12px; margin: 10px 0; }
  .warn { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 8px 12px; margin: 10px 0; }
  .step { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; margin:8px 0; }
  .step b { color:#1e3a8a; }
  ul { margin: 4px 0 4px 18px; padding: 0; }
</style></head><body>

<div class="cover">
  <div class="logo">🧾</div>
  <h1>SkyTech Billing</h1>
  <div class="tag">Billing that reaches new heights</div>
  <div class="meta">User Guide &amp; Demo Walkthrough · Version 0.1.0</div>
  <div class="meta" style="margin-top:40px">by SkyTech Developments</div>
  <div class="meta">${EMAIL} · ${PHONE}</div>
</div>

<div class="section">
  <h1>1. What is SkyTech Billing?</h1>
  <p><b>SkyTech Billing</b> is an offline, Windows desktop application for GST billing
  and inventory management — built for distributors and suppliers (e.g. selling to
  schools &amp; colleges). All data is stored locally on the user's PC; no internet
  is required for daily use.</p>
  <h3>Highlights</h3>
  <ul>
    <li>GST invoices, proforma, delivery challans, orders and returns — with PDF export.</li>
    <li>Inventory with live stock, valuation, low-stock alerts and adjustments.</li>
    <li>Purchases (PO → GRN → returns), Sales, and Payments with bill allocation.</li>
    <li>Reports: dashboard, receivables aging, sales register, Profit &amp; Loss, GST summary + CSV export.</li>
    <li>Role-based access, audit log, automatic &amp; manual backups.</li>
    <li>14-day free trial, then a machine-bound license you activate.</li>
  </ul>

  <h2>2. Installation &amp; first run</h2>
  <div class="step"><b>Step 1.</b> Run <code>SkyTech-Billing-Setup-0.1.0.exe</code>. If Windows shows
  "Windows protected your PC", click <b>More info → Run anyway</b> (the app is safe; this
  appears for software that isn't code-signed yet).</div>
  <div class="step"><b>Step 2.</b> On first launch you create the first account.</div>
  <table>
    <tr><th>Field</th><th>Example</th></tr>
    <tr><td>Full name</td><td>Ritwik Singh</td></tr>
    <tr><td>Username</td><td>admin</td></tr>
    <tr><td>Email</td><td>you@yourbusiness.com</td></tr>
    <tr><td>Password</td><td>SkyTech@123</td></tr>
  </table>
  <div class="step"><b>Step 3.</b> After creating the account you'll see a one-time
  <b>recovery code</b> (e.g. <code>KUYK-AW9G-2D63-GX3C</code>). <b>Write it down</b> — it's the only
  way to reset your password if you forget it (offline app, so there's no email reset).</div>
  <div class="warn"><b>For SkyTech (vendor) only:</b> click <b>Advanced setup</b> and enter your
  private <b>vendor setup code</b> to create a <b>Super Admin</b>. Customers leave this blank and
  become <b>Admin</b> (full business control, but not Super Admin). Keep the code secret.</div>

  <h3>Passwords &amp; account recovery</h3>
  <ul>
    <li><b>Change password / edit profile:</b> click your name (top-right) → My profile / Change password.</li>
    <li><b>Forgot password:</b> on the sign-in screen click <b>Forgot password?</b>, enter your username
    and recovery code, set a new password (you'll get a fresh recovery code).</li>
    <li><b>New staff:</b> when an admin creates a user, that user is asked to set their own password at first login.</li>
    <li><b>Admin reset:</b> an Admin/Super Admin can reset any staff member's password from the Users page.</li>
  </ul>

  <h2>3. Roles &amp; access</h2>
  <table>
    <tr><th>Role</th><th>Who</th><th>Can do</th></tr>
    <tr><td>Super Admin</td><td>SkyTech (you)</td><td>Everything + reserved vendor controls. Created only with the setup code.</td></tr>
    <tr><td>Admin</td><td>Customer's owner</td><td>Full business, manage staff users, activate the license. Cannot create Super Admins.</td></tr>
    <tr><td>Manager</td><td>Senior staff</td><td>Operate + financial reports + approvals.</td></tr>
    <tr><td>Operator</td><td>Data-entry staff</td><td>Day-to-day billing, stock and payments only.</td></tr>
  </table>
  <p>The menu and buttons automatically change based on the signed-in user's role.</p>
</div>

<div class="section">
  <h1>4. Licensing &amp; activation</h1>
  <p>Every install starts with a <b>14-day free trial</b> — all features unlocked. After 14
  days the app locks to an activation screen until a license key is entered.</p>
  <h3>How a customer activates</h3>
  <div class="step"><b>1.</b> Open <b>License</b> (or the activation screen) and copy the <b>Machine ID</b>.</div>
  <div class="step"><b>2.</b> Send it to SkyTech with payment: <b>${EMAIL}</b> / <b>${PHONE}</b>.</div>
  <div class="step"><b>3.</b> SkyTech sends back a key; paste it and click <b>Activate</b>. Works offline, instantly.</div>
  <div class="note">The key is <b>bound to that one computer</b> and cannot be reused elsewhere.
  Only SkyTech can create keys (they are cryptographically signed) — customers can only activate.</div>
  <h3>Moving to a new PC (transfer)</h3>
  <p>On the old PC: <b>License → Deactivate this device</b> → note the confirmation code and send
  it to SkyTech. On the new PC: install, <b>restore your backup</b> (below), then activate the new key.</p>
  <h3>Issuing keys (SkyTech only)</h3>
  <p>Run the admin portal: <code>npm run portal</code> → open <code>http://localhost:8787</code> →
  paste the customer's Machine ID → choose validity → generate the key.</p>
</div>

<div class="section">
  <h1>5. Page-by-page reference</h1>
  <h3>Dashboard</h3><p>At-a-glance KPIs (sales this month, receivables, low-stock, unpaid invoices), a <b>6-month sales trend chart</b>, recent invoices and a low-stock list. Light &amp; dark themes.</p>
  <h3>Items</h3><p>Your products/services master: SKU, name, HSN/SAC, unit, GST rate, purchase &amp; selling price, opening stock and reorder level. Low stock is flagged automatically.</p>
  <h3>Clients &amp; Vendors</h3><p>Two tabs. Clients are your customers (schools/colleges); Vendors are suppliers. Stores GSTIN, addresses, contact, credit limit/days and opening balance — with on-entry validation of GSTIN/PAN/phone/email. Each row shows the <b>live outstanding balance</b> (Dr = owes you, Cr = you owe), and the 📖 button opens a full <b>Statement of Account</b> (running balance) you can export to PDF.</p>
  <h3>Inventory</h3><p>Live stock, total stock value and low-stock count, plus a <b>Batch expiry</b> view (batch-wise remaining stock with nearest expiry, flagged when expiring within 90 days). <b>Adjust stock</b> for damage, expiry or physical-count corrections. Capture batch no + expiry on purchase (GRN) and sale lines.</p>
  <h3>Purchases</h3><p>Purchase Orders, <b>GRN</b> (Goods Received — increases stock) and Purchase Returns. Convert a PO to a GRN in one click.</p>
  <h3>Sales</h3><p>Invoices, Proforma, Delivery Challan, Sales Orders and Returns. Live GST totals (CGST/SGST or IGST), line + invoice-level discounts, additional charges (freight/packing), due dates, and rounding. PDF invoices include an <b>HSN/SAC summary</b> and a <b>UPI "scan to pay" QR code</b>. One-click <b>Share on WhatsApp</b>, convert Order/Proforma → Invoice, and a <b>credit-limit warning</b> when a customer exceeds their limit. Date-range filters on every list.</p>
  <h3>Payments</h3><p>Record receipts (from clients) and payments (to vendors), then allocate them to specific bills. Invoice status updates to Paid/Partial automatically.</p>
  <h3>Reports</h3><p>Receivables aging, <b>Payment Reminders</b> (overdue invoices with one-click WhatsApp reminder), Sales Register, <b>Profit &amp; Loss</b> (COGS at weighted-average cost), <b>GST Summary</b> (+CSV), <b>GSTR-3B</b> outward-supply summary, and <b>HSN-wise</b> summary. Invoices also export <b>e-Invoice JSON</b> (IRP schema) and <b>e-Way bill JSON</b>, and print as A4 or <b>80mm thermal receipt</b>.</p>
  <h3>Users</h3><p>Create and manage staff accounts and their roles (with safeguards: can't remove the last admin, etc.).</p>
  <h3>License</h3><p>View status/expiry/Machine ID, activate a key, or deactivate to transfer.</p>
  <h3>Settings</h3><p>Company profile + <b>logo</b> (shown on invoices), bank/UPI details, invoice paper size, prevent-negative-stock toggle, and <b>backup/restore + automatic backups</b>.</p>
  <h3>Help &amp; Support</h3><p>App version &amp; license, your <b>Machine ID</b>, SkyTech contact (email / phone / WhatsApp), and shortcuts to open your <b>data &amp; backups folder</b> and <b>logs folder</b>.</p>
</div>

<div class="section">
  <h1>6. Guided demo (copy-paste this data)</h1>
  <p>Follow in order to see the full flow end-to-end.</p>

  <h3>A. Settings → Company profile</h3>
  <table>
    <tr><th>Field</th><th>Value</th></tr>
    <tr><td>Legal name</td><td>Acme School Supplies Pvt Ltd</td></tr>
    <tr><td>GSTIN / State code</td><td>07AABCA1234A1Z5 / 07</td></tr>
    <tr><td>City / State</td><td>New Delhi / Delhi</td></tr>
    <tr><td>Bank / UPI</td><td>HDFC Bank, A/C 50100123456789, IFSC HDFC0000123 / acme@hdfcbank</td></tr>
  </table>
  <p>Upload any PNG/JPG as the <b>logo</b> — it will appear on invoices.</p>

  <h3>B. Items (add these)</h3>
  <table>
    <tr><th>SKU</th><th>Name</th><th>HSN</th><th>GST</th><th>Purchase ₹</th><th>Selling ₹</th><th>Opening stock</th><th>Opening value ₹</th></tr>
    <tr><td>NB-A4-200</td><td>A4 Notebook 200 Pages</td><td>4820</td><td>12%</td><td>35</td><td>60</td><td>500</td><td>17500</td></tr>
    <tr><td>PEN-BL-10</td><td>Blue Gel Pen (Pack of 10)</td><td>9608</td><td>18%</td><td>45</td><td>80</td><td>300</td><td>13500</td></tr>
    <tr><td>GEO-BOX</td><td>Geometry Box</td><td>9017</td><td>18%</td><td>90</td><td>150</td><td>100</td><td>9000</td></tr>
  </table>

  <h3>C. Clients &amp; Vendors</h3>
  <table>
    <tr><th>Type</th><th>Name</th><th>GSTIN</th><th>City / State code</th><th>Credit</th></tr>
    <tr><td>Client</td><td>Delhi Public School, R.K. Puram</td><td>07AAACD1234F1Z2</td><td>New Delhi / 07</td><td>₹2,00,000 / 30 days</td></tr>
    <tr><td>Vendor</td><td>National Paper Mills</td><td>06AAACN9999P1Z4</td><td>Gurgaon / 06</td><td>15 days</td></tr>
  </table>

  <h3>D. Purchase → GRN (brings stock in)</h3>
  <p>Vendor <b>National Paper Mills</b>, tick <b>Inter-state</b> (Haryana≠Delhi → IGST). Lines:
  A4 Notebook ×1000 @35 (12%), Blue Gel Pen ×500 @45 (18%). Save.</p>

  <h3>E. Sales → Invoice</h3>
  <p>Client <b>Delhi Public School</b> (intra-state → CGST+SGST). Lines:
  A4 Notebook ×200 @60 (12%), Blue Gel Pen ×100 @80 (18%), Geometry Box ×50 @150 (18%).</p>
  <div class="note">Expected totals: <b>Subtotal ₹27,500 · CGST ₹2,115 · SGST ₹2,115 · Grand ₹31,730.</b>
  Save, then click the download icon to get the branded PDF invoice.</div>

  <h3>F. Payment → Receipt</h3>
  <p>Receipts tab → client Delhi Public School → amount <b>31730</b> → mode UPI → <b>Auto-allocate</b> → Save.
  The invoice now shows <b>Paid</b>.</p>

  <h3>G. Explore Reports</h3>
  <p>Dashboard shows the sale &amp; KPIs. Reports → <b>Profit &amp; Loss</b> shows Revenue ₹27,500,
  COGS and Gross Profit. Reports → <b>GST Summary → Export CSV</b> for filing.</p>

  <h3>H. Users</h3>
  <p>Add staff: e.g. <code>riya</code> (Operator), <code>amit</code> (Manager). Sign in as each to see role-based menus.</p>
</div>

<div class="section">
  <h1>7. Complete feature list</h1>
  <h3>Billing documents</h3>
  <ul>
    <li>Tax Invoice (GST), Proforma Invoice, Delivery Challan, Sales Order, Sales Return / Credit Note</li>
    <li>Purchase Order, Goods Received Note (GRN), Purchase Return / Debit Note</li>
    <li>One-click conversion: Order/Proforma → Invoice, PO → GRN</li>
    <li>Auto, gapless, financial-year-wise numbering (e.g. INV/2025-26/0001)</li>
    <li>Line discounts, invoice-level extra charges &amp; discount, auto round-off, amount-in-words</li>
    <li>Intra-state CGST+SGST or inter-state IGST (auto by state code), multiple GST rates per invoice</li>
    <li>Batch number &amp; expiry per line</li>
  </ul>
  <h3>Printing &amp; sharing</h3>
  <ul>
    <li>Branded A4 PDF (company logo, bank details, UPI QR, HSN summary, terms)</li>
    <li>80mm thermal/POS receipt</li>
    <li>Share on WhatsApp; e-Invoice JSON (IRP schema) &amp; e-Way bill JSON export</li>
  </ul>
  <h3>Inventory</h3>
  <ul>
    <li>Live stock &amp; valuation (weighted-average cost), low-stock alerts, reorder levels</li>
    <li>Stock adjustments (damage / expiry / count), opening stock, batch-wise expiry report</li>
    <li>Optional "prevent negative stock" guard</li>
  </ul>
  <h3>Parties, payments &amp; money</h3>
  <ul>
    <li>Clients &amp; vendors with GSTIN/PAN validation, credit limits, opening balance</li>
    <li>Live outstanding balance + full Statement of Account (PDF) per party</li>
    <li>Receipts &amp; payments with allocation to bills; partial/paid tracking</li>
    <li>Payment reminders for overdue invoices (one-click WhatsApp)</li>
  </ul>
  <h3>Reports</h3>
  <ul>
    <li>Dashboard KPIs + 6-month sales trend chart</li>
    <li>Receivables aging, Sales Register, Profit &amp; Loss (with COGS)</li>
    <li>GST: GSTR-1 (CSV), GSTR-3B summary, HSN-wise summary</li>
  </ul>
  <h3>Security, licensing &amp; data</h3>
  <ul>
    <li>Role-based access (Super Admin / Admin / Manager / Operator), audit log</li>
    <li>Password recovery code, forced first-login password change, account lockout</li>
    <li>14-day trial → machine-bound offline license activation; deactivate/transfer</li>
    <li>Manual + automatic daily backups; one-click restore; light &amp; dark themes</li>
  </ul>
</div>

<div class="section">
  <h1>8. Backup, restore &amp; data safety</h1>
  <p>All data is stored locally, so backups are important.</p>
  <ul>
    <li><b>Manual backup:</b> Settings → Backup &amp; restore → <b>Create backup…</b> (save to USB / cloud-synced folder).</li>
    <li><b>Automatic backups:</b> pick a folder under <b>Automatic daily backups</b> — the app keeps the latest 10.</li>
    <li><b>Restore:</b> Settings → <b>Restore from backup…</b> → pick the file → app restarts with that data.</li>
    <li><b>New PC:</b> backup on the old PC → install on the new PC → restore → deactivate the old license and activate the new key.</li>
  </ul>

  <h1>9. Support</h1>
  <p>SkyTech Developments — we issue licenses and help with setup.</p>
  <table>
    <tr><th>Email</th><td>${EMAIL}</td></tr>
    <tr><th>Phone</th><td>${PHONE}</td></tr>
  </table>
  <p style="margin-top:30px; color:#94a3b8; font-size:10px;">© 2026 SkyTech Developments. SkyTech Billing — Billing that reaches new heights.</p>
</div>

</body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 600))
  const pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
  const out = join(root, 'SkyTech-Billing-User-Guide.pdf')
  writeFileSync(out, pdf)
  console.log('Wrote', out, `(${(pdf.length / 1024).toFixed(0)} KB)`)
  app.quit()
})
