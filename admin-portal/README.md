# Shailee-GRMS — Admin Licensing Portal

A tiny **vendor-side** web app to issue license keys without the command line.
Run it on **your** machine only. It signs keys with your private key
(`../license-signing-key.private.pem`), which must never be shared or deployed
where customers can reach it.

## Usage

```bash
# one-time, if you haven't already created your keypair:
node scripts/license-keygen.mjs init
# → paste the printed PUBLIC key into src/main/services/license.ts and rebuild the app

# run the portal (recommended: set a password)
PORTAL_PASSWORD=your-secret npm run portal
# open http://localhost:8787
```

On Windows PowerShell:

```powershell
$env:PORTAL_PASSWORD="your-secret"; npm run portal
```

## Issuing a key

1. The customer opens the app → **License** page → copies their **Machine ID**.
2. In the portal: enter the customer name, paste the Machine ID, pick an edition
   and validity (lifetime / 1 year / custom), click **Generate**.
3. Copy the key and send it to the customer. They paste it on the **License**
   page → **Activate**. Done — offline, bound to that one computer.

## Transfers

If a customer moves to a new PC, they click **Deactivate this device** in the app
and send you the confirmation code. Verify it, then issue a fresh key for their
new machine's Machine ID.

## Notes

- Editions and the `LL1` key prefix must match `src/shared/app-config.ts`.
- The portal binds to `127.0.0.1` (localhost) only. For team access, host it
  behind your own auth — but keep the private key secret.
