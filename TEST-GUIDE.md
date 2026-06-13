# SkyTech Billing — Install & Full Test Walkthrough

This guide takes you from installing the `.exe` to running a complete billing
cycle, with **ready-made dummy data you can copy-paste** into each screen.

---

## 0. Where is the installer?

```
release/0.1.0/SkyTech-Billing-Setup-0.1.0.exe
```

Double-click it → it installs (you can choose the folder) → creates Start-menu &
desktop shortcuts → launches **SkyTech Billing**.

> Windows may show a blue **SmartScreen** warning ("Windows protected your PC")
> because the app isn't code-signed yet. Click **More info → Run anyway**. This
> is expected for unsigned software; buying a code-signing certificate later
> removes it (see README).

---

## 1. Super Admin vs Admin — read this first

- **On YOUR machine (SkyTech owner):** during first-run setup, click
  **"Advanced setup"** and enter your **private vendor setup code** so you become
  **Super Admin**. Keep this code secret — do not write it in any file you share.
  Only its SHA-256 hash is stored in `src/shared/app-config.ts`
  (`VENDOR_SETUP_CODE_SHA256`); to change the code, hash the new one and replace
  that constant.

- **On a CUSTOMER's machine:** they leave that field blank → they become
  **Admin** (full control of their business + can create their own staff users +
  can activate the license you sell them), but **never Super Admin** and they
  cannot create Super Admins. The power to *issue* licenses is always yours (it
  needs your private signing key, which is never shipped).

---

## 2. First-run setup (creates your account)

| Field | Value to paste |
|---|---|
| Full name | `Ritwik Singh` |
| Username | `superadmin` |
| Email | `you@skytech.example` |
| Password | `SkyTech@123` |
| Confirm | `SkyTech@123` |
| Advanced setup → SkyTech setup code | *your private vendor code (only on your PC)* |

Click **Create account & continue**. You're now Super Admin.

---

## 3. The order to follow

**Settings → Items → Clients/Vendors → Purchase (stock in) → Sales (invoice) →
Payment → Inventory → Reports → Users → License.** Do them top to bottom.

---

## 4. Settings → Company profile

This appears on every invoice/PDF. (Sidebar → **Settings**.)

| Field | Value |
|---|---|
| Legal name | `Acme School Supplies Pvt Ltd` |
| Trade name | `Acme School Supplies` |
| GSTIN | `07AABCA1234A1Z5` |
| PAN | `AABCA1234A` |
| Address line 1 | `12, Industrial Area, Phase 1` |
| City | `New Delhi` |
| State | `Delhi` |
| State code (GST) | `07` |
| Pincode | `110001` |
| Phone | `011-40001234` |
| Email | `sales@acmeschool.example` |
| Website | `www.acmeschool.example` |
| Bank name | `HDFC Bank` |
| Account number | `50100123456789` |
| IFSC | `HDFC0000123` |
| Branch | `Connaught Place` |
| UPI ID | `acme@hdfcbank` |
| Default terms | `1. Goods once sold are not returnable. 2. Payment due in 30 days. 3. Subject to Delhi jurisdiction.` |

Click **Save**. In **Preferences**, optionally tick **Prevent negative stock**.

> Note: the **State code 07 (Delhi)** matters — when the customer is also in
> Delhi you get **CGST+SGST**; when in another state, tick **Inter-state** on the
> document to get **IGST**.

---

## 5. Items (add these 4)

Sidebar → **Items** → **New item**. Tax rate dropdown already has 0/5/12/18/28%.

| SKU | Name | HSN | Unit | GST | Purchase ₹ | Selling ₹ | Reorder | Opening stock | Opening value ₹ |
|---|---|---|---|---|---|---|---|---|---|
| `NB-A4-200` | `A4 Notebook 200 Pages` | `4820` | Pieces | 12% | `35` | `60` | `50` | `500` | `17500` |
| `PEN-BL-10` | `Blue Gel Pen (Pack of 10)` | `9608` | Pack | 18% | `45` | `80` | `30` | `300` | `13500` |
| `GEO-BOX` | `Geometry Box` | `9017` | Pieces | 18% | `90` | `150` | `20` | `100` | `9000` |
| `CHK-WHT` | `White Chalk (Box of 100)` | `9609` | Box | 5% | `25` | `45` | `40` | `200` | `5000` |

(Leave "Track inventory" ✓; leave "inclusive of tax" unticked.)

---

## 6. Clients & Vendors

Sidebar → **Clients & Vendors**.

### Clients tab → New (schools/colleges)

| Field | Client 1 | Client 2 |
|---|---|---|
| Type | Client | Client |
| Name | `Delhi Public School, R.K. Puram` | `St. Xavier's College` |
| GSTIN | `07AAACD1234F1Z2` | `07AAACS5678K1Z9` |
| Contact person | `Mr. Sharma` | `Mrs. D'Souza` |
| Phone | `9810012345` | `9810067890` |
| Display code | `DPS-RKP` | `SXC-DEL` |
| Billing address | `Sector 12, R.K. Puram` | `Civil Lines` |
| City | `New Delhi` | `New Delhi` |
| State | `Delhi` | `Delhi` |
| State code (GST) | `07` | `07` |
| Pincode | `110022` | `110054` |
| Credit limit ₹ | `200000` | `150000` |
| Credit days | `30` | `45` |

### Vendors tab → New (suppliers)

| Field | Vendor 1 (other state) | Vendor 2 (same state) |
|---|---|---|
| Type | Vendor | Vendor |
| Name | `National Paper Mills` | `Capital Stationery Wholesale` |
| GSTIN | `06AAACN9999P1Z4` | `07AAFCC2222Q1Z1` |
| Contact person | `Mr. Gupta` | `Mr. Khanna` |
| Phone | `9899011111` | `9811122233` |
| City | `Gurgaon` | `New Delhi` |
| State | `Haryana` | `Delhi` |
| State code (GST) | `06` | `07` |
| Credit days | `15` | `7` |

---

## 7. Purchases → bring stock IN (GRN)

Sidebar → **Purchases** → tab **Goods Received (GRN)** → **New**.

| Field | Value |
|---|---|
| Vendor | `National Paper Mills` |
| Date | (today) |
| Supplier invoice no | `NPM/2026/0456` |
| **Inter-state supply** | ✓ tick it (Haryana ≠ Delhi → IGST) |

Lines (use the item dropdown — rate auto-fills, you can keep these):

| Item | Qty | Rate | Tax% |
|---|---|---|---|
| A4 Notebook 200 Pages | `1000` | `35` | 12 |
| Blue Gel Pen (Pack of 10) | `500` | `45` | 18 |

**Save.** Stock is now: Notebooks 1500, Pens 800. (Check on **Inventory**.)

---

## 8. Sales → make an INVOICE

Sidebar → **Sales** → tab **Invoices** → **New**.

| Field | Value |
|---|---|
| Client | `Delhi Public School, R.K. Puram` |
| Date | (today) |
| Reference / PO no | `DPS/PO/2026/118` |
| Inter-state supply | ✗ leave unticked (both in Delhi → CGST+SGST) |

Lines:

| Item | Qty | Rate | Tax% |
|---|---|---|---|
| A4 Notebook 200 Pages | `200` | `60` | 12 |
| Blue Gel Pen (Pack of 10) | `100` | `80` | 18 |
| Geometry Box | `50` | `150` | 18 |

You should see live totals: **Subtotal ₹27,500 · CGST ₹2,115 · SGST ₹2,115 ·
Grand Total ₹31,730.** Click **Save**, then the **PDF** (download icon) to see
the branded tax invoice with amount-in-words and the SkyTech footer.

> Try **Convert** (⇄ icon) on a **Sales Order** or **Proforma** later to turn it
> into an Invoice in one click.

---

## 9. Payments → record the receipt

Sidebar → **Payments** → tab **Receipts (from clients)** → **Record receipt**.

| Field | Value |
|---|---|
| Client | `Delhi Public School, R.K. Puram` |
| Amount ₹ | `31730` |
| Date | (today) |
| Mode | UPI |
| Reference / UTR | `UPI-2026-778899` |

Click **Auto-allocate** (fills the invoice), then **Save**. The invoice on the
Sales page now shows **Paid**. (Try `20000` instead to see **Partial**.)

---

## 10. Inventory → view & adjust

Sidebar → **Inventory**: see live stock, valuation, low-stock flags.
Click **Adjust stock**:

| Field | Value |
|---|---|
| Reason | Damage |
| Note | `Water damage in storeroom` |
| Item / Qty (+/-) / Unit cost ₹ | `Geometry Box` / `-5` / `90` |

**Save** → Geometry Box stock drops by 5.

---

## 11. Reports

Sidebar → **Reports**:
- **Receivables (Aging)** — outstanding per client (empty if you paid in full).
- **Sales Register** — your invoices for the date range.
- **Profit & Loss** — Revenue, COGS (weighted-avg cost), Gross Profit & margin.
- **GST Summary** — and **Export CSV** for filing.

The **Dashboard** (top of sidebar) shows sales this month, receivables, low-stock
and unpaid invoices.

---

## 12. Users (staff accounts)

Sidebar → **Users** → **New user**. (As Super Admin you can create any role; an
Admin can create up to Admin.)

| Full name | Username | Role | Password |
|---|---|---|---|
| `Riya Verma` | `riya` | Operator | `Riya@1234` |
| `Amit Singh` | `amit` | Manager | `Amit@1234` |
| `Neha Gupta` | `neha` | Admin | `Neha@1234` |

Sign out and log in as `riya` to see how the menu shrinks for an Operator
(no Users/License/Settings-manage, no delete). That's RBAC working.

---

## 13. License

Sidebar → **License**: shows status (Trial · 14 days), edition, expiry and your
**Machine ID**. To activate, you (SkyTech) generate a key from the portal:

```bash
PORTAL_PASSWORD=secret npm run portal      # → http://localhost:8787
```
Paste the customer's Machine ID, choose validity, generate, send them the key;
they paste it here and click **Activate**. **Deactivate this device** frees the
seat for a transfer to another computer.

---

## Re-building the installer yourself

```bash
npm install
npm run db:generate     # once (migrations)
npm run build:win       # → release/<version>/SkyTech-Billing-Setup-<version>.exe
```

For the embedded **.exe icon**, turn on Windows **Developer Mode**
(Settings → Privacy & security → For developers) and set
`signAndEditExecutable: true` in `electron-builder.yml`.
