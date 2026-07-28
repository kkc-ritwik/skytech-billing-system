# Issuing licence keys — VENDOR ONLY

> **Do not send this document to customers.** It describes how you issue keys.
> The customer-facing instructions are in the user-guide PDF (section 30).

---

## 1. How the licensing works

Activation is **completely offline**. Neither your computer nor the customer's
ever needs to reach a server.

```
   CUSTOMER'S PC                              YOUR PC
   ─────────────                              ───────
   Machine ID  ──────  WhatsApp / phone  ────▶  paste into portal or CLI
   (32 hex chars)                              sign with PRIVATE key
                                                      │
   paste into                                         ▼
   License page  ◀─────  WhatsApp / email  ────  LL1.xxxxx.yyyyy
        │
        ▼
   app verifies the signature with the PUBLIC key
   built into the app, checks the Machine ID matches,
   and unlocks.
```

It rests on an **Ed25519 key pair**:

| | Where it lives | Who has it |
|---|---|---|
| **Private key** | `license-signing-key.private.pem` in this repo folder | **You only.** Git-ignored. Never ships. |
| **Public key** | Compiled into the app (`LICENSE_PUBLIC_KEY_PEM` in `src/main/services/license.ts`) | Every customer |

A key only *verifies* — it cannot be forged without your private key, and the
customer cannot generate one.

> **Back up `license-signing-key.private.pem` today.** If you lose it you cannot
> issue keys for existing customers ever again, and every future build would need
> a new public key. Keep an encrypted copy off this machine.

---

## 2. What a key contains

A key looks like `LL1.eyJ0byI6...` and is three dot-separated parts:
`prefix . base64url(payload) . base64url(Ed25519 signature)`

The payload records:

| Field | Meaning |
|---|---|
| `to` | Customer name, shown on their License screen |
| `fp` | **Machine ID** — the key works on that computer and no other |
| `ed` | Edition: `standard`, `professional` or `enterprise` |
| `exp` | Expiry in ms since epoch, or `null` for a perpetual licence |
| `iat` | When you issued it |

---

## 3. One-time setup

Already done for this repo, but for reference:

```bash
node scripts/license-keygen.mjs init
```

This creates `license-signing-key.private.pem` and prints the matching public
key. Paste that public key into `LICENSE_PUBLIC_KEY_PEM` in
`src/main/services/license.ts` and rebuild.

> A development key pair already exists. **Generate a fresh pair before your
> first real customer**, and keep the private key secret.

---

## 4. Issuing a key — the web portal (recommended)

```bash
PORTAL_PASSWORD=your-secret npm run portal
```

Open <http://localhost:8787>. The portal binds to `127.0.0.1` only, so it is not
reachable from outside your machine.

1. Enter the **customer name** (prints on their License screen).
2. Paste the **Machine ID** they sent you.
3. Choose the **edition**.
4. Set **validity in days** — or leave blank for perpetual.
5. Click generate and copy the key.
6. Send it by WhatsApp or email.

## 5. Issuing a key — the command line

```bash
# One year, Professional
node scripts/license-keygen.mjs sign \
  --to "RAJESHWARI SHREE" \
  --fp A1B2C3D4E5F60718293A4B5C6D7E8F90 \
  --edition professional \
  --days 365

# Perpetual — just omit --days
node scripts/license-keygen.mjs sign \
  --to "RAJESHWARI SHREE" \
  --fp A1B2C3D4E5F60718293A4B5C6D7E8F90 \
  --edition standard
```

The key is printed to the terminal. Copy the whole `LL1....` string.

---

## 6. Getting the Machine ID from the customer

Ask them to open the app and read it from **either**:

- **License** (Administration) → the Machine ID box, or
- **Help & Support** → Machine ID, with a copy button

It is 32 hex characters, e.g. `A1B2C3D4E5F60718293A4B5C6D7E8F90`. Have them use
the copy button and send it on WhatsApp — transcribing it by hand invites typos.

> **It is not secret.** It is a one-way hash of the computer's hostname, OS,
> architecture and CPU model. It contains no personal data and cannot be reversed.

---

## 7. Renewals

Issue a new key for the **same** Machine ID with a new `--days` value. The
customer pastes it on the License screen exactly as the first time. Nothing else
changes and no data is touched.

Set a reminder ~2 weeks before expiry. After expiry the app gives a **3-day
grace period** (`GRACE_DAYS`) and then locks business functions — their data is
never deleted, and a valid key restores everything instantly.

---

## 8. Moving a customer to a new computer

1. On the **old** PC: License → **Deactivate this device**.
2. The app locks and prints a **confirmation code**. They send it to you — it is
   your proof the old seat was freed.
3. They install on the **new** PC, restore their backup, and send you the **new**
   Machine ID.
4. Issue a key for the new Machine ID.

If the old computer is dead or stolen there is no confirmation code. Verify with
the customer and issue a new key at your discretion — the app has no way to check.

---

## 9. Changing trial length, grace period or editions

All in [`src/shared/app-config.ts`](../src/shared/app-config.ts):

```ts
export const TRIAL_DAYS = 14   // free trial from first launch
export const GRACE_DAYS = 3    // working days after expiry before lock
export const EDITIONS = [...]  // sellable editions
```

These are **build-time** settings — change them and rebuild. The customer cannot
edit them.

---

## 10. The vendor setup code (Super Admin)

On first run, an account is created as a normal **Admin** unless the secret
vendor code is typed into **Advanced setup**, which makes it **Super Admin**.
Use it only on your own machines; customers leave it blank.

Only the SHA-256 hash ships in the app. To change the code:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('YOUR-NEW-CODE').digest('hex'))"
```

Paste the result into `VENDOR_SETUP_CODE_SHA256` in `app-config.ts` and rebuild.

---

## 11. Anti-tamper notes

- The trial start is mirrored to an **encrypted lock file** outside the database,
  so deleting or replacing the database does not restart the trial.
- A **clock-rollback check** blocks winding the system date back to extend a trial.
- The licence is stored as a **hash** of the key, so reading the database does not
  reveal a reusable key.
- A key is bound to one Machine ID and is useless on any other computer.

---

## 12. Quick checklist for a new sale

1. Customer installs and runs the 14-day trial.
2. They send you their **Machine ID**.
3. You take payment.
4. You issue the key (portal or CLI) with the agreed edition and validity.
5. You send the key.
6. They paste it into **License → Activate**.
7. Their License screen shows **Licensed**, their name and the expiry date.
