import { app, dialog } from 'electron'
import { join, extname } from 'path'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { companies, settings } from '../db/schema'
import { companyInputSchema, type CompanyInput } from '@shared/dto'
import type { AuthUser } from '@shared/ipc'
import { audit } from './audit'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

/** The single company row (created during seed). */
export async function getCompany() {
  return getDb().select().from(companies).limit(1).get()
}

export async function saveCompany(input: CompanyInput, user: AuthUser): Promise<void> {
  const d = companyInputSchema.parse(input)
  const existing = await getCompany()
  const now = new Date()
  if (existing) {
    await getDb().update(companies).set({ ...d, updatedAt: now }).where(eq(companies.id, existing.id))
  } else {
    await getDb().insert(companies).values({ ...d, country: 'India' })
  }
  await audit({ userId: user.id, username: user.username, action: 'company.update', entityType: 'company' })
}

/** All app settings as a parsed key/value map. */
export async function getSettings(): Promise<Record<string, unknown>> {
  const rows = await getDb().select().from(settings)
  const out: Record<string, unknown> = {}
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value)
    } catch {
      out[r.key] = r.value
    }
  }
  return out
}

/** Read the saved company logo (if any) as a base64 data URL for UI/PDF. */
export async function getCompanyLogoDataUrl(): Promise<string | null> {
  const company = await getCompany()
  const p = company?.logoPath
  if (!p || !existsSync(p)) return null
  const mime = MIME[extname(p).toLowerCase()] ?? 'image/png'
  return `data:${mime};base64,${readFileSync(p).toString('base64')}`
}

/** Prompt for an image, copy it into userData/branding, and save the path. */
export async function pickCompanyLogo(user: AuthUser): Promise<{ dataUrl: string | null }> {
  const res = await dialog.showOpenDialog({
    title: 'Choose your company logo',
    properties: ['openFile'],
    filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  })
  if (res.canceled || res.filePaths.length === 0) return { dataUrl: await getCompanyLogoDataUrl() }

  const src = res.filePaths[0]
  const dir = join(app.getPath('userData'), 'branding')
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, `logo${extname(src).toLowerCase()}`)
  copyFileSync(src, dest)

  const company = await getCompany()
  if (company) {
    await getDb().update(companies).set({ logoPath: dest, updatedAt: new Date() }).where(eq(companies.id, company.id))
  }
  await audit({ userId: user.id, username: user.username, action: 'company.logo_set' })
  return { dataUrl: await getCompanyLogoDataUrl() }
}

export async function removeCompanyLogo(user: AuthUser): Promise<void> {
  const company = await getCompany()
  if (company) {
    await getDb().update(companies).set({ logoPath: null, updatedAt: new Date() }).where(eq(companies.id, company.id))
  }
  await audit({ userId: user.id, username: user.username, action: 'company.logo_remove' })
}

/** Only these settings keys may be written via IPC (defence in depth). */
const ALLOWED_SETTING_KEYS = new Set([
  'theme',
  'paperSize',
  'lowStockAlerts',
  'defaultTaxInclusive',
  'preventNegativeStock',
  'autoBackupDir',
  'autoBackupLastAt',
  // 'standard' = the generic GST layout; 'textile' = the trade bill format
  // with PCS/CUT/MTS/RATE columns and the dispatch block.
  'invoiceTemplate',
  // Devotional line printed above the firm name, e.g. "Shree Ganeshaya Namah".
  'invoiceInvocation',
  // Defaults pre-filled on a new invoice so the counter does not retype them.
  'defaultSchemeLabel',
  'defaultSchemePct',
  'defaultCutLength',
  'defaultTransportName',
  // Last label sheet used in the barcode label designer, so the millimetre
  // figures are typed once rather than on every print run.
  'labelSheet',
  // Chosen printer per purpose. A shop runs a thermal label printer, a receipt
  // printer and an A4 printer, and each job must go to the right one.
  'printer.labels',
  'printer.receipt',
  'printer.report',
  // Free text printed at the bottom of a retail receipt, a few short lines.
  'receiptFooterLines',
  // Default margin % used to derive selling price from purchase rate.
  'defaultMarginPct',
  // Counter receipt layout. Width is in millimetres so a shop can match
  // whatever roll its printer takes — 79 mm is the common default, but 58 mm
  // and 80 mm printers are both in the field.
  'receiptWidthMm',
  'receiptShowLogo',
  'receiptShowGstBreakup'
])

export async function setSettings(patch: Record<string, unknown>, user: AuthUser): Promise<void> {
  const db = getDb()
  const now = new Date()
  for (const [key, value] of Object.entries(patch)) {
    if (!ALLOWED_SETTING_KEYS.has(key)) {
      throw Object.assign(new Error(`Unknown setting: ${key}`), { code: 'VALIDATION' })
    }
    const existing = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get()
    if (existing) {
      await db.update(settings).set({ value: JSON.stringify(value), updatedAt: now }).where(eq(settings.key, key))
    } else {
      await db.insert(settings).values({ key, value: JSON.stringify(value), updatedAt: now })
    }
  }
  await audit({ userId: user.id, username: user.username, action: 'settings.update', details: Object.keys(patch) })
}
