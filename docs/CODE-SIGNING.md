# Code signing — Shailee-GRMS for Windows

Everything on the software side is already wired. What remains is the one step
that cannot be automated: **buying a certificate**, because a Certificate
Authority must legally verify that your business is real before it will issue one.

Without a signature the app installs and runs perfectly — Windows simply shows a
blue **"Windows protected your PC"** SmartScreen warning that the customer must
click through via *More info → Run anyway*. Signing removes that warning.

---

## 1. Which certificate to buy

| | OV (Organisation Validation) | EV (Extended Validation) |
|---|---|---|
| Typical cost | ₹15,000–30,000 / year | ₹25,000–50,000 / year |
| Verification | Business documents | Business documents + stricter checks |
| Delivered as | `.pfx` file you download | Hardware USB token or cloud HSM |
| SmartScreen | Warning fades after reputation builds (some downloads) | **Trusted immediately** |
| Build automation | Easy — a file and a password | Harder — token must be plugged in |

**Recommendation for a first release: OV.** It is cheaper, works with an
automated build, and its reputation builds within a few dozen installs. Choose EV
only if customers must never see a warning even on day one.

Buy from any CA that issues Windows code-signing certificates — DigiCert,
Sectigo, GlobalSign, or an Indian reseller. You will need your GST registration
/ incorporation documents and a verifiable phone listing.

---

## 2. Signing with an OV certificate (`.pfx`)

electron-builder reads two environment variables. **Never put the certificate or
its password in the repository** — the build reads them from the environment.

### One build, from PowerShell

```powershell
$env:CSC_LINK = "C:\secure\skytech-codesign.pfx"
$env:CSC_KEY_PASSWORD = "your-certificate-password"
npm run build:win:signed
npm run verify:signature
```

### From Command Prompt

```cmd
set CSC_LINK=C:\secure\skytech-codesign.pfx
set CSC_KEY_PASSWORD=your-certificate-password
npm run build:win:signed
npm run verify:signature
```

`verify:signature` prints the Authenticode status of every produced `.exe`.
You want **`Valid`** on all rows.

> `build:win:signed` also switches `signAndEditExecutable` on, which embeds the
> app icon into the `.exe` itself. That needs **Developer Mode** enabled
> (Settings → Privacy & security → For developers) or an elevated shell — the
> same requirement signing has anyway.

---

## 3. Signing with an EV certificate (hardware token)

An EV private key cannot leave its token, so `CSC_LINK` does not apply. Build
unsigned first, then sign the artefacts with the token plugged in:

```powershell
npm run build:win           # produces release\<version>\Shailee-GRMS-Setup-<version>.exe

$signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"
& $signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a `
    "release\0.1.0\Shailee-GRMS-Setup-0.1.0.exe"

npm run verify:signature
```

The token's PIN will be requested. Some tokens (SafeNet) can cache the PIN for a
session so a batch of files signs without re-prompting.

---

## 4. Cloud signing (Azure Trusted Signing / DigiCert KeyLocker)

Newer, cheaper than EV, and automatable — the key lives in the CA's HSM and you
authenticate over the network. If your CA offers it, they will supply a
`dlib`/metadata pair for `signtool`:

```powershell
& $signtool sign /v /debug /fd sha256 /tr http://timestamp.digicert.com /td sha256 `
    /dlib "C:\path\to\Azure.CodeSigning.Dlib.dll" `
    /dmdf "C:\path\to\metadata.json" `
    "release\0.1.0\Shailee-GRMS-Setup-0.1.0.exe"
```

---

## 5. What is already configured

In [`electron-builder.yml`](../electron-builder.yml):

- `win.signtoolOptions.signingHashAlgorithms: [sha256]` — SHA-1 is rejected by
  modern Windows.
- `win.signtoolOptions.timeStampServer` / `rfc3161TimeStampServer` —
  **timestamping**, so signatures stay valid after the certificate expires.
  Without this every installer you ever shipped becomes untrusted on the
  certificate's expiry date.
- `signAndEditExecutable` off by default, overridden to `true` by
  `build:win:signed`.

In [`package.json`](../package.json):

- `build:win` — unsigned build, works on any machine.
- `build:win:signed` — signed build.
- `verify:signature` — reports Authenticode status of every artefact.

---

## 6. Checklist before sending a build to a customer

1. `npm test` — all suites pass.
2. `npm run build:win:signed` with `CSC_LINK` / `CSC_KEY_PASSWORD` set.
3. `npm run verify:signature` — every row reads `Valid`.
4. Install on a **clean** Windows machine (or VM) that has never seen the app.
5. Confirm no SmartScreen warning appears.
6. Confirm the installer's Publisher field shows your company name, not
   "Unknown publisher".

---

## 7. Renewal

Certificates last 1–3 years. **Timestamped** builds you already shipped keep
working after expiry — that is what the timestamp server is for. You only need a
valid certificate to sign *new* builds. Set a calendar reminder a month before
expiry; re-validation can take several business days.
