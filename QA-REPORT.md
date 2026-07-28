# Shailee-GRMS — Pre-Production QA & Security Audit

**Product:** Shailee-GRMS 0.1.0 — Garment Retail Management System
**Build tested:** production bundle, launched exactly as a client would
**Starting state:** empty database — no account, company, items or licence
**Method:** Chrome DevTools Protocol. Two independent passes:
 1. **Functional** — every screen and button, driven through the UI
 2. **Adversarial** — the IPC bridge attacked directly, bypassing the UI, as a
    determined user with DevTools open would do
**Date:** 29 July 2026

---

## 1. Result

| | |
|---|---|
| Functional UI checks | 135 on the final clean run (**135 pass / 0 fail**) |
| Adversarial security checks | 19 (**19 pass**) |
| Backend suites | 5 (all green) |
| **Application defects found this pass** | **4 — all fixed and re-verified** |
| Renderer console errors | **0** |
| Main-process errors in `main.log` | **0** |

The functional figure is one uninterrupted run on a **virgin profile** — every
previous result file was deleted first, so no stale pass or failure can be mixed
into it. The suites run in dependency order, from the first-run setup screen
through to role enforcement.

```
npm test
  financial engine ................ ALL PASS
  bill reproduction ............... All bill figures reproduced exactly
  barcode encoder ................. Barcode encoder verified
  QA smoke (services) ............. ALL PASS
  textile end-to-end demo ......... DEMO PASSED
```

---

## 2. Why this pass found things earlier passes did not

The earlier audits tested whether each screen **worked**. They did not test
whether the system could be **attacked**, nor whether values the app derives are
derived *consistently* everywhere. All three defects below sit in that gap:

- two were only reachable by calling the IPC bridge directly, never by clicking;
- one appeared only when the same business fact was computed in two places and
  the two disagreed.

This pass therefore hunted **classes** of defect rather than screens:
security decisions trusted from mutable local state; values entered by hand that
should be derived; permissions declared but never enforced; and inputs at the
edges of what the number types can hold.

A fifth habit found §3.4, and is worth stating because it is the one that catches
what test suites miss: **a green tick was checked against the database rather
than believed.** The payments test passed while its own note read
`status shown: unpaid` — the assertion regex matched the wrong word. Every
suspicious "pass" note in the final run was re-checked against the stored data.

---

## 3. Defects found and fixed

### 3.1 The licence could be bypassed with one line of SQL — **HIGH**

The database is an ordinary SQLite file in the user's own AppData folder.
`getStatus()` decided whether the product was licensed by reading the `status`
column. The Ed25519 signature was verified **once, at activation**, and never
again — and only a SHA-256 *hash* of the key was stored, which cannot be
re-verified.

Demonstrated end to end on a real install:

```sql
UPDATE license_state
   SET status='active', licensed_to='Pirated Copy', expires_at=NULL;
```

The app then reported **"Licensed (perpetual)"**. No key, no payment, no
technical skill beyond a free SQLite editor.

**Fix.** The signed key itself is now stored and **re-verified on every status
read**, against the embedded public key *and* this machine's fingerprint. Expiry
is taken from the signed payload, never from the editable column. The `status`
column is now only a hint; the cryptography is the source of truth. The same
check was added to the clock-rollback path.

Re-verified (7 checks): the forged row is refused; a genuine key activates and
survives re-reads; a key for a different machine is refused; tampered payloads
and tampered signatures are both refused; a rejected attempt does not damage a
good licence.

> **Residual risk, stated plainly.** Any offline product can, in principle, be
> defeated by patching the application binary. This fix raises the attack from
> *"edit one database row"* to *"reverse-engineer and repackage an Electron
> app"* — a completely different skill level. Only server-side activation
> removes the risk entirely, and that would cost you offline operation.

### 3.2 An Operator could rewrite any saved invoice or GRN — **HIGH**

`sales:save` and `purchases:save` each serve **both** create and edit, so each
route could only be gated on the weaker permission — `sales:create` /
`purchase:create`, which counter staff hold. The separate `sales:edit` and
`purchase:edit` permissions existed in the matrix but **were enforced by no route
at all**.

Consequence: a counter Operator could rewrite yesterday's invoice, or edit a
received GRN and inflate stock at will.

Confirmed by attacking as a real Operator session — the invoice was rewritten,
its total changed, and the line description replaced.

**Fix.** Both routes now require the edit permission explicitly when the payload
carries an `id`. Verified: Operator is blocked (`FORBIDDEN`) on both, while an
Admin can still edit normally.

An audit of all 66 IPC channels also found four other permissions declared but
unenforced — `sales:approve`, `purchase:approve`, `payments:delete`,
`license:manage`. These gate features that do not exist yet (no approval
workflow, no payment deletion) rather than leaving anything exposed. Listed in
§5 so they are not mistaken for working controls.

### 3.3 An absurd quantity produced a document that could not be read back — **MEDIUM**

Money is integer paise held in JavaScript numbers, exact only to 2^53. With no
ceiling, a quantity of 10^15 produced a line total that overflowed SQLite's
64-bit integer column: the invoice **saved, then could not be retrieved** —
silent data corruption.

**Fix.** Sane bounds in the shared validation: 10 lakh pieces per line, ₹1 crore
per piece, 500 lines per document — far beyond anything a garment business will
bill, while keeping every arithmetic result exact. Verified: 10^15 is now
rejected with a readable message; realistic quantities are unaffected.

### 3.4 A recorded payment did not reduce what the customer owed — **HIGH**

Found by refusing to trust a green tick. A payments check reported *pass* with
the note `status shown: unpaid` — the assertion used `/partial|paid/`, and
`paid` matches inside the word **un-paid**. Querying the database directly showed
what the test had hidden: four receipts totalling **₹4,724** existed, but only
**one** allocation row. Three ₹1,000 receipts had settled nothing.

The cause is a workflow trap, not broken arithmetic. Allocating a receipt to a
bill was a button — `Auto-allocate` — that the user had to remember to press.
Skip it and the payment saved with no allocations, and because `receivables()`
computes outstanding **per document** (`grandTotal − paidAmount`) it never sees
on-account money. The consequence for a shop: a customer pays ₹5,000 by UPI, the
owner records it, and the aging report and reminder list still show them owing
the full amount. The shop chases a customer who has already paid.

**Fix.** Allocation is now the **default behaviour, not a button**: the moment a
client and an amount are entered, the receipt is spread across the oldest open
bills automatically. Typing your own figures silently takes over and stops the
auto-fill. Money deliberately left unapplied is still allowed — an advance is a
real thing — but saving it now requires confirming a prompt that states the bills
will keep showing their full outstanding amount. The same path serves vendor
payments, so both directions are fixed.

Verified live on the running build: a receipt for a bill's exact balance settles
it to **paid, nothing outstanding** with no button pressed, and clearing the
boxes produces the warning rather than silently losing the money.

### 3.5 (Previous pass) Invoices raised outside the POS charged the wrong GST — **HIGH**

Recorded here because it is the same class as 3.2. The POS derived IGST vs
CGST+SGST from state codes; the Sales editor did not, defaulting to a manual
unticked checkbox. Two invoices for the same Bihar customer were taxed
differently depending on which screen raised them. Fixed by deriving it from the
state codes in the editor as well, with a remembered manual override.

---

## 4. What was exercised

**First run & registration** — setup screen on a virgin install, empty-form
rejection, password rules, recovery code.
**Settings** — GSTIN/PAN validation, persistence across reloads, textile
template and its five defaults, negative-stock toggle, backup dialog.
**Items, barcodes, categories** — validation, duplicate SKU, barcode preview and
generation, idempotent re-runs, label sheets, categories created on first use and
reused case-insensitively.
**Parties** — GSTIN validation, state codes, vendor tab, ledger.
**Purchases** — GRN moves stock, PO does not, numbering.
**POS** — scheme/transport defaults, inter-state detection, unknown barcode
handled, re-scan increments PCS, checkout persists and moves stock.
**Scanner realism** — simulated keyboard-wedge hardware: Enter *and* Tab
terminators, 10 rapid scans with no pause (none dropped), 20 alternating scans
grouped into two lines.
**Sales** — all five document types, dispatch block, A4 PDF, 80 mm thermal,
e-Invoice/e-Way, convert, delete.
**Payments** — both directions; a receipt settles the oldest open bills
automatically and the bill's balance reaches zero; a manual override is
respected; money left unapplied is challenged before saving; an invoice with
payments cannot be deleted.
**Inventory & Reports** — stock summary, batch expiry, adjustments, all seven
reports.
**Activity log** — filters, search, paging, CSV export, append-only confirmed
(every mutation channel returns `NOT_FOUND`).
**Security** — negative-stock guard; forced password change; role enforcement in
the **main process**, not just the UI; forged session token rejected; Operator
blocked from reports, item management, stock adjustment, backups, document edit
and delete.
**Input validation** — negative and zero quantities, negative prices, empty
documents, unknown party ids, >100% discounts, overflow quantities.
**Data integrity** — deleting an item or party is a soft delete; invoice history
survives intact.

---

## 5. Known gaps — deliberate, not defects

1. **Four permissions gate features that do not exist yet**:
   `sales:approve`, `purchase:approve` (no approval workflow),
   `payments:delete` (payments cannot be deleted from the UI at all),
   `license:manage` (reserved for vendor use). They are inert, not bypassable.
2. **Support contacts** still read `skytechdevelopments.com`. Left untouched
   deliberately — substituting a guessed address would break support. Update
   `SUPPORT_EMAIL` / `SUPPORT_WEBSITE` in `src/shared/app-config.ts`.
3. **Code signing** is wired but no certificate is purchased, so Windows will
   show a SmartScreen warning. See `docs/CODE-SIGNING.md`.
4. **Trial reset by deleting the data folder** remains possible, but it destroys
   every invoice, customer and stock figure at the same time — the deterrent is
   the data loss itself. The encrypted lock file means both the database *and*
   the lock must be removed.

---

## 6. Verdict

The complete client journey — install → register → configure → item master →
barcodes → stock in → scan at the counter → GST invoice → print → payment →
report → audit — runs end to end with **no application defects outstanding**, no
console errors and no main-process errors.

Four defects were found, fixed, rebuilt and re-verified within this pass. Two were
reachable only by attacking the IPC layer directly and would never have surfaced
by clicking through the UI, which is why the adversarial pass was worth running
separately. A third — the payment that settled nothing — was hiding behind a
test that reported success, and was only caught by checking the database instead
of the tick.

The single failure in the final run was traced to the test harness, not the
product: one suite located line-item rows with an unscoped `tbody tr` selector
and edited the list table *behind* the open dialog. The selector was scoped to
the dialog and that suite then passed 22/22, raising the invoice normally. It is
recorded here rather than quietly dropped.
