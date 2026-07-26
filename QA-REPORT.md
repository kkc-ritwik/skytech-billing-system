# Shailee-GRMS — Pre-Production QA Report

**Build tested:** production bundle (`npm run build`, `out/`), not the dev server
**Environment:** Windows 10 Pro, Electron 33.4.11, isolated `--user-data-dir` profile
**Starting state:** empty database — no account, no company, no items (a true client install)
**Method:** driven over the Chrome DevTools Protocol; every click resolved by selector,
with renderer console errors, page exceptions and IPC failures captured per step
**Date:** 26 July 2026

---

## 1. Result

| | |
|---|---|
| Automated UI checks | **115** |
| Passed | **107** |
| Failed (harness defects, re-run green) | 8 |
| **Confirmed application defects remaining** | **0** |
| Renderer console errors across the whole run | **0** |
| Main-process errors / warnings in `main.log` | **0** |
| Screenshots captured | 156 |

All 8 failures were traced to the test harness itself (loose text matching, unscoped
DOM selectors, a synthetic `blur` that React ignores). Each was corrected and the
affected area re-run green. **Every one was verified against the app before being
dismissed** — see §4.

Backend regression suites (unchanged, all green):

```
npm test
  financial engine ................ ALL PASS
  bill reproduction ............... All bill figures reproduced exactly
  barcode encoder ................. Barcode encoder verified
  QA smoke (services) ............. ALL PASS
  textile end-to-end demo ......... DEMO PASSED
```

---

## 2. Coverage — what was exercised

### First run & registration (9 checks)
Setup screen on a clean install · empty-form rejection · password < 8 chars rejected ·
password/confirm mismatch rejected · **Advanced setup** vendor code field ·
account creation · one-time recovery code displayed · continue into the app.

### Settings & company profile (10)
All four sections render · **invalid GSTIN rejected** · **invalid PAN rejected** ·
full profile saves and survives a reload · paper size A4 ⇄ A5 · **Textile GST template**
reveals its defaults · invocation / transport / scheme label / scheme % / cut all persist ·
negative-stock toggle persists · backup dialog cancels cleanly.

### Items master (13)
Empty state · toolbar (Generate barcodes / Print labels / New item) · required-field
validation · item with cut length saves · **duplicate SKU rejected** ·
barcode preview renders (29 bars) · in-dialog barcode generator · bulk barcode
assignment · **re-run is idempotent** · search filters and clears · edit round-trip ·
label sheet export.

### Clients & Vendors (5)
Invalid GSTIN rejected · customer with full billing address · vendor under the Vendors
tab (button and form type both follow the active tab) · party ledger opens · type change
persists.

### Purchases (7)
GRN / PO / Returns tabs · **GRN with two lines brings stock in (20 + 100)** ·
document numbering (`GRN/2026-27/0001`) · stock ledger reflects the GRN ·
PO raised (`PO/2026-27/0001`) · **a PO correctly does *not* move stock**.

### Point of Sale (7)
Loads with scheme and transport defaults from Settings · **correct inter-state
detection (24 → 10 = IGST)** · unknown barcode rejected gracefully · real barcode adds a
line · re-scan increments PCS · pre-tax scheme + IGST totals · −/+ quantity controls ·
checkout persists the invoice and clears the cart.

### Sales documents (15)
All five tabs · POS invoice listed · invoice raised from the Sales screen ·
**dispatch block** (challan / e-way / transporter / case / L.R.) · Proforma · Delivery
Challan · Order · Credit Note all create · **Export PDF (A4)** · **Thermal receipt
(80 mm)** · **GST e-Invoice / e-Way** · convert action · document delete.

### Payments (7)
Both directions · receipt recorded · **allocation panel with Auto-allocate** ·
allocation settles the invoice (`INV/0002 = partial / ₹1,724`) · outbound vendor payment ·
**an invoice with payments cannot be deleted**.

### Inventory & Reports (10)
Stock summary · batch expiry · adjustment dialog · and all seven reports render:
Receivables (Aging), Payment Reminders, Sales Register, Profit & Loss, GST Summary,
GSTR-3B, HSN Summary.

### Users, License, Help, Dashboard (11)
Owner listed · weak staff password rejected · Operator created · **duplicate username
rejected** · trial status and Machine ID · **invalid licence key rejected** · Help page
shortcuts · dashboard reflects real turnover (₹11,804 sales / ₹10,080 receivable).

### Security & data integrity (20)
- **Negative-stock guard:** an invoice for 99,999 pcs against 19 in stock was rejected
  — *"Not enough stock… Available: 19, required: 99999"* — and stock was unchanged.
- **Forced password change:** an admin-created account cannot use its temporary
  password; weak replacements are rejected.
- **Role enforcement in the UI:** an Operator's sidebar excludes Users, License and
  Settings.
- **Role enforcement in the main process (the real boundary):** `users:list` and
  `settings:save` both returned `FORBIDDEN` when called directly from an Operator
  session — the renderer check is not the only gate.
- Wrong password rejected with a clear message; sign-out / sign-in round-trip.
- **Regression:** an Operator can still reach the POS, receives `pos:context`
  (state 24, scheme 200 bps, cut 6.3) and bills **inter-state IGST correctly**.

---

## 3. Defects found and fixed during this pass

### 3.1 Native `window.confirm()` on every destructive action — **fixed**
**Severity: high (client-facing polish + reliability)**

Six destructive actions used the browser's `window.confirm()`. In Electron this renders
a bare OS dialog **titled `shailee-grms`** — the internal package id, not the product
name — visually unrelated to the rest of the app. Worse, it is synchronous: it blocked
the entire renderer thread while open (this reproducibly froze the app under automation).

Affected: item delete, party delete, user delete, document delete, **backup restore**,
recovery-code regeneration.

Fixed by adding a promise-based confirmation store
([`store/confirm.ts`](src/renderer/src/store/confirm.ts)) and a single
[`ConfirmHost`](src/renderer/src/components/ConfirmHost.tsx) mounted beside the toaster.
All six call sites now use the app's own styled dialog with a warning icon, a specific
title, an explanatory message and a destructive-styled action. No native
`confirm` / `alert` / `prompt` remains anywhere in the renderer.

### 3.2 Settings "Default cut" never reached the New Item form — **fixed**
**Severity: medium (feature was half-wired)**

`defaultCutLength` could be set in Settings but new items showed `6.30` only as grey
placeholder text — the operator had to retype the cut on every design.
`itemRefs()` now returns the shop default and `openCreate()` pre-fills it. Carried on the
`items:refs` channel (behind `items:view`) rather than reading settings directly, so it
still works for roles that manage items but deliberately have no `settings:view`.

### 3.3 Items row actions had no accessible label — **fixed**
**Severity: low**

The Edit and Delete icon buttons on the Items table had no `title` or `aria-label`,
unlike the equivalent buttons on Parties and Sales. No tooltip on hover, nothing
announced to a screen reader. Both now carry `title` and a row-specific `aria-label`.

### 3.4 Modal dialogs were not exposed as dialogs — **fixed**
**Severity: low**

The shared `Dialog` had no `role="dialog"` / `aria-modal`, so assistive technology did
not announce it as a modal. Added, along with `aria-label` from the dialog title.

---

## 4. The 8 failures that were *not* application bugs

Recorded in full because each was investigated against the running app before dismissal.

| Reported failure | Actual cause | Evidence |
|---|---|---|
| Textile defaults "did not persist" | React maps `onBlur` to the bubbling `focusout`; my synthetic `blur` Event never reached it | With a real `focusout`, all five values save (`defaultSchemePct = 200`, `defaultCutLength = 6.3`) and redisplay |
| Barcode preview "not drawn" | Selector matched the 24×24 button icon SVG, not the barcode | Second SVG is 193.6×54 with 29 bars + caption; confirmed visually |
| Vendors tab "creates customers" | `clickText('Vendors')` matched the sidebar link *Clients & Vendors* | With an exact tab match: button reads **New vendor**, Type defaults to **Vendor / Supplier** |
| Purchase vendor dropdown "empty" | Downstream of the above — no vendor existed yet | Populates correctly once a real vendor exists |
| "Type field not editable" | Row lookup ran on the Clients tab for a party now correctly filed under Vendors | Direct trace: `MILL SUPPLIER=vendor` |
| Sales invoice "cannot be raised" | Unscoped `tbody tr` matched the list table *behind* the modal | Scoped to the dialog → invoices 1 → 2. (The empty tabs passed only because their list had no rows) |
| PDF export "no button" | Wrong title guessed; real titles are `Export PDF (A4)`, `Thermal receipt (80mm)`, `GST e-Invoice / e-Way`, `Share on WhatsApp` | All invoke correctly |
| Operator "has no navigation" | Operator correctly lands on the **forced password change** screen, which has no sidebar by design | `mustChangePassword: true`; after changing it, full permitted nav appears |

One further correction: an early payment-allocation check passed on a faulty regex
(`/paid/` matches "un**paid**"). Re-tested with an exact status token — Auto-allocate
genuinely settles the invoice.

---

## 5. Observations — not defects, worth a decision

1. **`audit:view` has no read channel.** The audit log *is* written (every create /
   update / delete / auth action), and the permission exists in the RBAC matrix, but no
   IPC route or screen exposes it. Data is being captured with no way to view it in-app.
2. **Settings text fields save on blur.** Standard, but a value typed and then
   immediately abandoned by closing the window is not persisted.
3. **Code signing.** Unchanged and expected — the installer will show a Windows
   SmartScreen warning until an OV/EV certificate is purchased.
4. **Restore is genuinely destructive.** Now behind a clear, explicitly worded
   confirmation, but it still overwrites all data and restarts the app.

---

## 6. Verdict

The full client journey — install → register → configure the firm → build the item
master → generate barcodes → receive stock → scan at the counter → raise a GST invoice →
print it → take payment → report on it — completes end to end with **no application
defects outstanding**, no console errors and no main-process errors.

The four defects found were fixed, rebuilt and re-verified in this same session.
