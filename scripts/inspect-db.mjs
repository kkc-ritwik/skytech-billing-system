import { createClient } from '@libsql/client'
import os from 'os'
import path from 'path'

const dbPath = path.join(os.homedir(), 'AppData/Roaming/ledgerline/ledgerline.db')
const c = createClient({ url: 'file:' + dbPath.replace(/\\/g, '/') })

const t = await c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
console.log('TABLES (' + t.rows.length + '):', t.rows.map((r) => r.name).join(', '))
const tx = await c.execute('SELECT name FROM tax_rates ORDER BY rate_bps')
console.log('TAX RATES:', tx.rows.map((r) => r.name).join(', '))
const u = await c.execute('SELECT symbol FROM units')
console.log('UNITS:', u.rows.map((r) => r.symbol).join(', '))
const lic = await c.execute('SELECT status, machine_fingerprint FROM license_state')
console.log('LICENSE:', JSON.stringify(lic.rows[0]))
const s = await c.execute('SELECT key, value FROM settings')
console.log('SETTINGS:', s.rows.map((r) => `${r.key}=${r.value}`).join(', '))
c.close()
