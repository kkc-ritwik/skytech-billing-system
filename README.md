# Shailee-GRMS

> *Manage Fashion. Grow Your Business..* — by **Shailee**

A **production-grade, offline-first billing & inventory desktop application** for
distributors who supply schools, colleges and other institutions. Windows `.exe`,
local SQLite database, role-based access, GST invoicing, and an offline license
system with a 14-day trial.

> Status: **Feature-complete and verified** — all modules built, typechecked,
> built, end-to-end tested and booting. (`Shailee-GRMS` is the product name;
> the codebase/db keep the internal id `ledgerline` for compatibility.)

---

## Tech stack

| Concern | Choice | Why |
|---|---|---|
| Desktop shell | **Electron 33** | True Windows `.exe`, full filesystem access |
| Build tooling | **electron-vite** (Vite 5) | Fast HMR, clean main/preload/renderer split |
| UI | **React 18 + TypeScript + Tailwind** | Modern, maintainable, type-safe |
| Components | shadcn-style primitives (in-repo) | No heavy UI dependency, full control |
| Local DB | **libSQL** (`@libsql/client`) | Real on-disk SQLite, **prebuilt N-API binaries — no C++ compiler needed** |
| ORM | **Drizzle ORM** | Type-safe queries, first-class migrations |
| State | **Zustand** | Tiny, predictable |
| Auth | **bcryptjs** | Pure-JS password hashing |
| Licensing | **Ed25519** (Node `crypto`) | Offline signature verification |
| Packaging | **electron-builder** (NSIS) | Windows installer + auto-update feed |

> **Why libSQL instead of better-sqlite3?** `better-sqlite3` compiles native C++
> on install and needs Visual Studio Build Tools. libSQL ships prebuilt N-API
> binaries that install with zero compilation and run unchanged across Node and
> Electron. Same SQLite, same SQL, durable WAL file — no toolchain required.

---

## Getting started

```bash
npm install            # installs everything (no compiler needed)
npm run db:generate    # generate SQL migrations from the schema (already committed)
npm run dev            # launch the app in development with hot reload
```

First launch shows a **first-run setup** screen to create the Super Admin
account. After that you log in normally.

### Build a Windows installer

```bash
npm run build:win      # produces release/<version>/LedgerLine-Setup-<version>.exe
```

### Useful scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev app with HMR |
| `npm run build` | Type-checked production bundle (`out/`) |
| `npm run build:win` | Full Windows `.exe` installer |
| `npm run typecheck` | Type-check main + renderer |
| `npm run db:generate` | Regenerate migrations after a schema change |
| `node scripts/inspect-db.mjs` | Dump tables/seed data from the local DB (dev) |
| `npm run demo:seed` | Load a saree-shop demo dataset into the app database |
| `npm run demo:textile` | End-to-end proof: barcode scan → invoice → printed bill |
| `npm run make:guide` | Rebuild the illustrated user-guide PDF |
| `npm run build:win:signed` | Signed Windows installer (see docs/CODE-SIGNING.md) |
| `npm run verify:signature` | Report the Authenticode status of every built exe |

---

## Architecture

```
src/
  main/                 Electron main process (Node, trusted)
    db/
      schema/           Drizzle schema, one file per domain
      migrations/       Generated SQL migrations (applied at runtime)
      client.ts         libSQL connection + pragmas (WAL, FK on)
      migrate.ts        Runs migrations on startup
    services/           Business logic (auth, license, items, parties, …)
    ipc/                Secure IPC routes (one file per domain) + router
    index.ts            App bootstrap: DB → migrate → seed → license → routes → window
  preload/              The ONLY bridge to the renderer (contextBridge)
  renderer/src/         React app (untrusted UI)
    components/ui/       Reusable primitives (Button, Input, Dialog, Table…)
    layout/              App shell: sidebar (permission-filtered), top bar, router
    pages/               One page per module
    store/               Zustand stores (app/auth/license, toasts)
    lib/                 api client, formatting, utils
  shared/               Types/logic shared by all three (money, permissions, dto, ipc)
```

### Security model (important)

The renderer is treated as **untrusted**. It can only call
`window.api.invoke(channel, payload)`. Every call flows through one dispatcher in
[`src/main/ipc/router.ts`](src/main/ipc/router.ts) which, for each request:

1. **License gate** — blocks business channels when the license is expired.
2. **Authentication** — resolves the session token to a live user (sessions are
   stored server-side; the renderer only ever holds an opaque token).
3. **Authorization** — checks the route's required permission against the user's
   role ([`src/shared/permissions.ts`](src/shared/permissions.ts)).
4. Runs the handler and returns an `IpcResponse` envelope (errors are values,
   never thrown across the boundary).

Permission checks in the UI only *shape* the interface — they are never the
security boundary.

### Money & quantities

- **Money is always integer paise** (₹1 = 100 paise). All math is on integers;
  formatting to ₹ happens only at the UI/PDF edge. See
  [`src/shared/money.ts`](src/shared/money.ts) (includes Indian amount-in-words).
- **Quantities are real numbers** (kg/litre fractions allowed).

### Data model highlights

- **Unified document tables**: `sales_documents` / `purchase_documents` with a
  `doc_type` discriminator cover invoice, proforma, challan, order, return, GRN,
  PO — sharing one consistent shape and conversion chain (`parent_id`).
- **Append-only `stock_ledger`**: current stock = sum of movements; every
  movement links back to its source document for full traceability.
- **FY-aware gapless numbering** (`document_sequences`): numbers like
  `INV/2025-26/0001`, reserved inside the same transaction that creates the doc.
- **Immutable `audit_log`**: every create/update/delete/auth action recorded.
- **Soft deletes** everywhere (`deleted_at`) — financial records are never
  hard-deleted.

---

## Roles & permissions

| Role | Scope |
|---|---|
| **Super Admin** | Everything, incl. license management & users |
| **Admin** | Full business operation (no license mgmt) |
| **Manager** | Operate + financial reports + approvals; no user/backup/settings control |
| **Operator** | Day-to-day data entry (raise bills, record stock & payments) |

The full matrix is in [`src/shared/permissions.ts`](src/shared/permissions.ts).

---

## Licensing (offline)

A 14-day trial starts on first run. Trial state is mirrored to an **encrypted
lock file** so deleting the database does not reset it, and a clock-rollback
check guards against date tampering.

Activation uses **Ed25519 signatures**: the app embeds a *public* key and
verifies keys fully offline; you keep the *private* key on your portal.

```bash
# one-time: generate a keypair, paste the printed public key into
# src/main/services/license.ts -> LICENSE_PUBLIC_KEY_PEM
node scripts/license-keygen.mjs init

# issue a key for a customer (they give you their Machine ID from the app):
node scripts/license-keygen.mjs sign --to "Delhi Public School" \
  --fp <MACHINE_ID> --edition professional --days 365
# omit --days for a perpetual license
```

The customer enters the key on the activation screen (or the in-app **License**
page); it is bound to their Machine ID and cannot be reused on another computer.

### Admin portal (no command line)

For day-to-day key issuing, run the local web portal instead of the CLI:

```bash
PORTAL_PASSWORD=your-secret npm run portal   # → http://localhost:8787
```

Enter the customer name, paste their Machine ID, choose edition + validity, copy
the key. Signs with your private key, binds to localhost. See
[admin-portal/README.md](admin-portal/README.md).

### In-app License page & transfers

**Administration → License** (Super Admin) shows status, edition, expiry and
Machine ID, with **Activate** and **Deactivate this device**. Deactivation locks
the device and prints a confirmation code the customer sends you, so you can
re-issue a key for their new computer (offline transfer).

### Configuring trial length / editions

Trial length, grace period and editions live in
[src/shared/app-config.ts](src/shared/app-config.ts) (`TRIAL_DAYS`, `GRACE_DAYS`,
`EDITIONS`) — build-time settings the vendor controls. Keep `EDITIONS`/`LL1`
prefix in sync with the admin portal.

> A development keypair is already generated. The private key
> (`license-signing-key.private.pem`) is git-ignored. **Generate a fresh keypair
> for production** and keep the private key secret.

---

## Backup & restore

- **Backup**: one click writes a consistent `VACUUM INTO` copy of the live DB to
  a location you choose.
- **Restore**: pick a backup; the app overwrites the DB and relaunches (with a
  confirmation prompt).

The live database lives in Electron's `userData` folder
(`%APPDATA%/ledgerline/ledgerline.db`), never in the project.

---

## Roadmap

Each remaining module is built with the **same vertical-slice pattern** the
Masters module already demonstrates:

1. `shared/dto.ts` — Zod schema + inferred type (one definition, used both sides)
2. `main/services/<module>.ts` — business logic, validation, audit, transactions
3. `main/ipc/<module>.ts` — routes with `route(channel, permission, handler)`
4. register in `main/ipc/index.ts`
5. `renderer/pages/<Module>Page.tsx` — list + dialog form, wired in `AppLayout`

| Module | Status | Notes |
|---|---|---|
| Company profile & settings | **DONE** | GSTIN, bank/UPI, terms; appears on PDFs |
| Inventory | **DONE** | live stock summary, valuation, low-stock, adjustments |
| Purchases | **DONE** | PO / GRN (stock in) / purchase return, all numbered |
| Sales | **DONE** | order / proforma / invoice / challan / return |
| Document/PDF engine | **DONE** | branded A4 PDFs via Electron `printToPDF` |
| Payments | **DONE** | receipts/payments, allocation to bills, status |
| Reports | **DONE** | dashboard, receivables aging, sales register, GST summary |
| Users admin UI | **DONE** | create/edit staff, roles, password reset, safe-guards |
| Activity log (audit viewer) | **DONE** | searchable/filterable trail + CSV export (Administration → Activity Log) |
| Textile GST bill format | **DONE** | PCS/CUT/MTS/RATE grid, pre-tax scheme, dispatch block |
| Barcodes & POS | **DONE** | Code 128 generation, 65-up label sheets, scan-to-bill counter screen |
| Document conversion | **DONE** | order/proforma → invoice, PO → GRN (one click) |
| Negative-stock guard | **DONE** | optional: block invoices that exceed stock |
| COGS / Profit & Loss | **DONE** | weighted-average cost captured per sale; gross-profit report |
| GSTR-1 export | **DONE** | CSV invoice register for filing (Reports → GST → Export) |
| Backup & restore UI | **DONE** | in Settings (one-click, with restart-on-restore) |
| App icon | **DONE** | `build/icon.png` (regenerate with `npm run make:icon`) |
| Auto-update | **DONE** | `electron-updater` wired; set `publish.url` to your host |
| Code signing | **WIRED**¹ | build scripts, timestamping and verification ready — needs a cert you purchase |

¹ Everything on the software side is done — `npm run build:win:signed`,
SHA-256 hashing, RFC-3161 timestamping and `npm run verify:signature`. The only
remaining step is buying a certificate, which a Certificate Authority must issue
after verifying your business. The app installs and runs **without** signing; a
cert only removes the Windows SmartScreen warning.
See **[docs/CODE-SIGNING.md](docs/CODE-SIGNING.md)** for the full procedure.

### Tests

```bash
npm test            # runs both suites below
npm run test:calc   # financial engine: GST splits, discounts, rounding, words
npm run test:qa     # end-to-end: item → GRN → invoice → payment → reports
```

`test:qa` drives the **real service code** against a throwaway database (Electron
stubbed), exercising the full transactional flow including stock movement,
GST totals, payment allocation and the negative-stock guard.

---

## License

Proprietary / UNLICENSED. © 2026 LedgerLine.
