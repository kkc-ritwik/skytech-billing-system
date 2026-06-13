#!/usr/bin/env node
/**
 * SkyTech Billing — license key signer (ADMIN/PORTAL SIDE ONLY).
 *
 * This script signs activation keys with your PRIVATE key. NEVER ship it or the
 * private key with the desktop app. Keep license-signing-key.private.pem secret.
 *
 * Usage:
 *   # one-time: generate a keypair (then paste the public key into
 *   # src/main/services/license.ts -> LICENSE_PUBLIC_KEY_PEM)
 *   node scripts/license-keygen.mjs init
 *
 *   # issue a key for a customer machine:
 *   node scripts/license-keygen.mjs sign \
 *     --to "Delhi Public School" \
 *     --fp <MACHINE_ID_FROM_CUSTOMER> \
 *     --edition professional \
 *     --days 365            # omit --days for a perpetual license
 */
import { generateKeyPairSync, createPrivateKey, sign as cryptoSign } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const PRIV_PATH = 'license-signing-key.private.pem'

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]?.replace(/^--/, '')
    if (k) out[k] = argv[i + 1]
  }
  return out
}

const cmd = process.argv[2]

if (cmd === 'init') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  writeFileSync(PRIV_PATH, privateKey.export({ type: 'pkcs8', format: 'pem' }))
  console.log('Saved private key to', PRIV_PATH, '(KEEP SECRET)\n')
  console.log('Paste this PUBLIC key into LICENSE_PUBLIC_KEY_PEM in src/main/services/license.ts:\n')
  console.log(publicKey.export({ type: 'spki', format: 'pem' }))
  process.exit(0)
}

if (cmd === 'sign') {
  if (!existsSync(PRIV_PATH)) {
    console.error(`Missing ${PRIV_PATH}. Run "node scripts/license-keygen.mjs init" first.`)
    process.exit(1)
  }
  const args = parseArgs(process.argv.slice(3))
  if (!args.to || !args.fp) {
    console.error('Required: --to "<Customer Name>" --fp <MachineId>  [--edition standard] [--days N]')
    process.exit(1)
  }
  const payload = {
    v: 1,
    to: args.to,
    fp: String(args.fp).toUpperCase(),
    ed: args.edition || 'standard',
    exp: args.days ? Date.now() + Number(args.days) * 86400000 : null,
    iat: Date.now()
  }
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8')
  const priv = createPrivateKey(readFileSync(PRIV_PATH))
  const signature = cryptoSign(null, payloadBuf, priv)
  const key = `LL1.${b64url(payloadBuf)}.${b64url(signature)}`
  console.log('\nLicense key for', args.to, '\n')
  console.log(key, '\n')
  console.log('Bound to machine:', payload.fp)
  console.log('Expires:', payload.exp ? new Date(payload.exp).toISOString() : 'never (perpetual)')
  process.exit(0)
}

console.error('Unknown command. Use "init" or "sign". See header of this file for usage.')
process.exit(1)
