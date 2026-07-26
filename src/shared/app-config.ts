/**
 * Central product/licensing configuration. These are BUILD-TIME settings the
 * vendor controls — change them here and rebuild. They are not editable by the
 * end customer (that would defeat the trial/licensing).
 *
 * Keep the values here in sync with the admin portal (admin-portal/) which
 * issues the keys.
 */

/** ---- Branding (single source of truth) ---- */
export const COMPANY_NAME = 'Shailee'
export const PRODUCT_NAME = 'Shailee-GRMS'
export const PRODUCT_SUBTITLE = 'Garment Retail Management System'
export const TAGLINE = 'Manage Fashion. Grow Your Business.'
export const COPYRIGHT_HOLDER = 'Shailee'

/** Brand palette, mirrored by the CSS variables in styles/globals.css. */
export const BRAND = {
  purple: '#5B2D8E',
  magenta: '#C2186B',
  purpleDark: '#3F1F63',
  magentaLight: '#E0489A'
} as const

/** ---- Support / sales contact (shown for upgrades & activation) ---- */
export const SUPPORT_EMAIL = 'robin@skytechdevelopments.com'
export const SUPPORT_PHONE = '+91 76318 69625'
export const SUPPORT_WEBSITE = 'skytechdevelopments.com'

/** App/window name shown to users. */
export const APP_NAME = PRODUCT_NAME

/** Length of the free trial, in days, from first launch. */
export const TRIAL_DAYS = 14

/** Days a subscription keeps working after expiry before hard-lock. */
export const GRACE_DAYS = 3

/** License key format prefix (bump if you change the key schema). */
export const LICENSE_KEY_PREFIX = 'LL1'

export interface Edition {
  id: string
  label: string
}

/** Sellable editions. Recorded in the key; can gate features later. */
export const EDITIONS: Edition[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'professional', label: 'Professional' },
  { id: 'enterprise', label: 'Enterprise' }
]

export function editionLabel(id: string | null | undefined): string {
  if (!id) return '—'
  return EDITIONS.find((e) => e.id === id)?.label ?? id
}

/**
 * VENDOR SETUP CODE — Super Admin gate.
 *
 * On first-run setup, the account is created as a normal **Admin** (the
 * customer's owner) UNLESS the secret vendor code is entered, in which case it
 * becomes **Super Admin**. Use it on YOUR machine; customers leave it blank.
 *
 * Only the SHA-256 HASH of the code is stored here, so the plaintext code never
 * ships inside the app. To change the code: run
 *   node -e "console.log(require('crypto').createHash('sha256').update('YOUR-CODE').digest('hex'))"
 * and paste the result below. The comparison happens in the main process
 * (src/main/services/auth.ts).
 */
export const VENDOR_SETUP_CODE_SHA256 =
  '2945cd360ef3cc2822503dac47c350b5d96fd10794fc3d2b10bf70aa3d131833'
