#!/usr/bin/env node
/**
 * Shailee-GRMS — Admin Licensing Portal (VENDOR SIDE ONLY).
 *
 * A tiny zero-dependency local web app to issue license keys without the command
 * line. Run it on YOUR machine; it signs keys with your private key. NEVER deploy
 * this where customers can reach it, and never expose the private key.
 *
 *   PORTAL_PASSWORD=secret node admin-portal/server.mjs
 *   → open http://localhost:8787
 *
 * Env:
 *   PORTAL_PASSWORD        optional gate (recommended). If unset, runs open (local only).
 *   PORTAL_PORT            default 8787
 *   PORTAL_PRIVATE_KEY     path to the PKCS#8 PEM private key
 *                          (default: ../license-signing-key.private.pem)
 */
import { createServer } from 'http'
import { createPrivateKey, sign as cryptoSign } from 'crypto'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORTAL_PORT || 8787)
const PASSWORD = process.env.PORTAL_PASSWORD || ''
const KEY_PATH = process.env.PORTAL_PRIVATE_KEY || join(here, '..', 'license-signing-key.private.pem')
const KEY_PREFIX = 'LL1' // keep in sync with src/shared/app-config.ts
const EDITIONS = [
  { id: 'standard', label: 'Standard' },
  { id: 'professional', label: 'Professional' },
  { id: 'enterprise', label: 'Enterprise' }
]

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signKey({ to, fp, edition, days }) {
  if (!existsSync(KEY_PATH)) {
    throw new Error(`Private key not found at ${KEY_PATH}. Run: node scripts/license-keygen.mjs init`)
  }
  const payload = {
    v: 1,
    to: String(to).trim(),
    fp: String(fp).trim().toUpperCase(),
    ed: edition || 'standard',
    exp: days ? Date.now() + Number(days) * 86400000 : null,
    iat: Date.now()
  }
  if (!payload.to) throw new Error('Customer name is required.')
  if (!payload.fp) throw new Error('Machine ID is required.')
  const payloadBuf = Buffer.from(JSON.stringify(payload), 'utf8')
  const priv = createPrivateKey(readFileSync(KEY_PATH))
  const signature = cryptoSign(null, payloadBuf, priv)
  return {
    key: `${KEY_PREFIX}.${b64url(payloadBuf)}.${b64url(signature)}`,
    expires: payload.exp ? new Date(payload.exp).toISOString().slice(0, 10) : 'Never (perpetual)',
    boundTo: payload.fp,
    to: payload.to,
    edition: payload.ed
  }
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shailee-GRMS — License Portal</title>
<style>
  :root { --b:#2563eb; }
  * { box-sizing:border-box; font-family:'Segoe UI',system-ui,sans-serif; }
  body { margin:0; background:#f1f5f9; color:#0f172a; }
  .wrap { max-width:560px; margin:40px auto; padding:0 16px; }
  .card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; padding:24px; box-shadow:0 1px 3px rgba(0,0,0,.06); }
  h1 { font-size:20px; margin:0 0 4px; display:flex; align-items:center; gap:8px; }
  .sub { color:#64748b; font-size:13px; margin-bottom:20px; }
  label { display:block; font-size:13px; font-weight:600; margin:14px 0 6px; }
  input,select { width:100%; padding:10px 12px; border:1px solid #cbd5e1; border-radius:8px; font-size:14px; }
  .row { display:flex; gap:12px; } .row>div { flex:1; }
  button { margin-top:20px; width:100%; padding:12px; background:var(--b); color:#fff; border:0; border-radius:8px; font-size:15px; font-weight:600; cursor:pointer; }
  button:hover { background:#1d4ed8; }
  .out { margin-top:20px; display:none; }
  .key { word-break:break-all; background:#0f172a; color:#a5f3fc; padding:12px; border-radius:8px; font-family:ui-monospace,monospace; font-size:13px; }
  .meta { font-size:13px; color:#475569; margin-top:8px; }
  .copy { background:#10b981; margin-top:10px; }
  .err { color:#dc2626; font-size:13px; margin-top:12px; }
  .badge { font-size:11px; background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:999px; }
</style></head><body>
<div class="wrap"><div class="card">
  <h1>🧾 Shailee-GRMS — License Portal</h1>
  <div class="sub">Generate a machine-bound activation key for a customer. ${PASSWORD ? '' : '<span class="badge">No password set — local use only</span>'}</div>
  <form id="f">
    ${PASSWORD ? '<label>Portal password</label><input type="password" id="pw" required>' : ''}
    <label>Customer name</label>
    <input id="to" placeholder="e.g. Delhi Public School" required>
    <label>Machine ID (from the customer's app)</label>
    <input id="fp" placeholder="paste the Machine ID" required>
    <div class="row">
      <div>
        <label>Edition</label>
        <select id="edition">${EDITIONS.map((e) => `<option value="${e.id}">${e.label}</option>`).join('')}</select>
      </div>
      <div>
        <label>Validity</label>
        <select id="type">
          <option value="perpetual">Lifetime (perpetual)</option>
          <option value="365">1 year</option>
          <option value="730">2 years</option>
          <option value="90">90 days</option>
          <option value="custom">Custom days…</option>
        </select>
      </div>
    </div>
    <div id="customWrap" style="display:none"><label>Custom days</label><input id="days" type="number" min="1" placeholder="e.g. 180"></div>
    <button type="submit">Generate license key</button>
    <div class="err" id="err"></div>
  </form>
  <div class="out" id="out">
    <label>License key — send this to the customer</label>
    <div class="key" id="key"></div>
    <button class="copy" type="button" id="copy">Copy key</button>
    <div class="meta" id="meta"></div>
  </div>
</div></div>
<script>
  const $ = (id) => document.getElementById(id)
  $('type').onchange = () => { $('customWrap').style.display = $('type').value === 'custom' ? 'block' : 'none' }
  $('f').onsubmit = async (e) => {
    e.preventDefault(); $('err').textContent = ''; $('out').style.display = 'none'
    const t = $('type').value
    const days = t === 'perpetual' ? null : (t === 'custom' ? $('days').value : t)
    const body = { to: $('to').value, fp: $('fp').value, edition: $('edition').value, days, password: ${PASSWORD ? '$("pw").value' : 'null'} }
    const r = await fetch('/sign', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) })
    const j = await r.json()
    if (!r.ok) { $('err').textContent = j.error || 'Failed.'; return }
    $('key').textContent = j.key
    $('meta').innerHTML = '<b>'+j.to+'</b> · '+j.edition+' · expires: '+j.expires+'<br>bound to: '+j.boundTo
    $('out').style.display = 'block'
  }
  $('copy').onclick = () => { navigator.clipboard.writeText($('key').textContent); $('copy').textContent = 'Copied!'; setTimeout(()=>$('copy').textContent='Copy key',1500) }
</script></body></html>`

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    return res.end(PAGE)
  }
  if (req.method === 'POST' && req.url === '/sign') {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        const body = JSON.parse(raw || '{}')
        if (PASSWORD && body.password !== PASSWORD) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          return res.end(JSON.stringify({ error: 'Wrong portal password.' }))
        }
        const result = signKey(body)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })
    return
  }
  res.writeHead(404)
  res.end('Not found')
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\nShailee-GRMS — License Portal → http://localhost:${PORT}`)
  console.log(PASSWORD ? '(password protected)' : '(no password — bind is localhost only)')
  if (!existsSync(KEY_PATH)) console.warn(`\n⚠ Private key missing at ${KEY_PATH}. Run: node scripts/license-keygen.mjs init`)
})
