import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import {
  createPublicKey,
  verify as cryptoVerify,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync
} from 'crypto'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { licenseState } from '../db/schema'
import { getMachineFingerprint } from './machine'
import { audit } from './audit'
import type { LicenseStatus } from '@shared/ipc'
import { TRIAL_DAYS, GRACE_DAYS, LICENSE_KEY_PREFIX } from '@shared/app-config'

/**
 * Public key embedded in the app. The matching PRIVATE key lives ONLY on your
 * admin portal and signs activation keys. Replace this constant if you rotate
 * keys (and re-issue customer keys).
 */
const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAtDWnMtnMyzX+t3zDxUshsY/jEtfPMsjaN3HAXr82u8s=
-----END PUBLIC KEY-----`

const DAY_MS = 24 * 60 * 60 * 1000
const KEY_PREFIX = LICENSE_KEY_PREFIX

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

interface KeyPayload {
  v: number
  to: string // licensed to
  fp: string // bound machine fingerprint
  ed: string // edition
  exp: number | null // expiry epoch ms, null = perpetual
  iat: number // issued at
}

export class LicenseError extends Error {
  constructor(message: string) {
    super(message)
  }
}

/** Verify an activation key offline against the embedded public key. */
export function verifyLicenseKey(key: string): KeyPayload {
  const parts = key.trim().split('.')
  if (parts.length !== 3 || parts[0] !== KEY_PREFIX) {
    throw new LicenseError('Invalid license key format.')
  }
  const [, payloadB64, sigB64] = parts
  const payloadBuf = b64urlDecode(payloadB64)
  const signature = b64urlDecode(sigB64)
  const pub = createPublicKey(LICENSE_PUBLIC_KEY_PEM)
  // ed25519 => algorithm must be null
  const valid = cryptoVerify(null, payloadBuf, pub, signature)
  if (!valid) throw new LicenseError('License key signature is invalid.')

  const payload = JSON.parse(payloadBuf.toString('utf8')) as KeyPayload
  if (payload.v !== 1) throw new LicenseError('Unsupported license key version.')
  return payload
}

// ---- Anti-tamper lock file (so deleting the DB doesn't reset the trial) ----

function lockFilePath(): string {
  return join(app.getPath('userData'), '.ll_license.lock')
}

function lockKey(): Buffer {
  return scryptSync(getMachineFingerprint() + ':ledgerline', 'll-lic-salt', 32)
}

function writeLock(data: object): void {
  try {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', lockKey(), iv)
    const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    writeFileSync(lockFilePath(), Buffer.concat([iv, tag, enc]).toString('base64'), 'utf8')
  } catch (err) {
    console.error('[license] failed to write lock file:', err)
  }
}

function readLock(): { trialStartedAt?: number; trialEndsAt?: number; reactivateBy?: number } | null {
  try {
    if (!existsSync(lockFilePath())) return null
    const buf = Buffer.from(readFileSync(lockFilePath(), 'utf8'), 'base64')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const enc = buf.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', lockKey(), iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(enc), decipher.final()])
    return JSON.parse(dec.toString('utf8'))
  } catch {
    return null
  }
}

async function getRow() {
  return getDb().select().from(licenseState).where(eq(licenseState.id, 'singleton')).get()
}

/**
 * Re-verify the stored activation key. Returns the payload only if the key is
 * genuinely signed by us AND bound to this machine.
 *
 * This is the heart of the licensing, and it runs on EVERY status read — not
 * just at activation. The `status` column is only a cache: anyone can open the
 * SQLite file and set it to 'active', but nobody can forge an Ed25519 signature
 * without the private key, which never leaves the vendor. So the key is the
 * source of truth and the column is treated as a hint.
 */
function verifyStoredLicense(row: LicenseRow | undefined): KeyPayload | null {
  if (!row?.licenseKey) return null
  try {
    const payload = verifyLicenseKey(row.licenseKey)
    if (payload.fp.toUpperCase() !== getMachineFingerprint().toUpperCase()) return null
    return payload
  } catch {
    // Unsigned, altered, truncated, or from an older build that stored only a
    // hash — none of which we can trust.
    return null
  }
}

/**
 * Builds up to and including 0.1.0 stored only a SHA-256 *hash* of the
 * activation key, which cannot be re-verified against the signature.
 *
 * A shop that activated on one of those builds would otherwise be locked out
 * the moment it updated — mid-trade, through no fault of its own. So a legacy
 * hash earns a bounded grace period instead: the app keeps working while it
 * asks, plainly, for the key to be entered once more. The same key works, since
 * it is bound to a machine ID that has not changed.
 */
function isLegacyHashedKey(key: string | null | undefined): boolean {
  return !!key && /^[0-9a-f]{64}$/i.test(key.trim())
}

/** Days an already-activated install keeps working after updating to signed keys. */
const REACTIVATION_GRACE_DAYS = 30

/**
 * Deadline for re-entering the key, anchored in the encrypted lock file rather
 * than the database so it cannot be extended by editing a column. Set once, on
 * the first run that meets a legacy activation.
 */
function reactivationDeadline(now: number): number {
  const lock = readLock() ?? {}
  if (typeof lock.reactivateBy === 'number') return lock.reactivateBy
  const due = now + REACTIVATION_GRACE_DAYS * DAY_MS
  writeLock({ ...lock, reactivateBy: due })
  return due
}

/** Called once at startup. Establishes/reconciles trial & detects clock tamper. */
export async function initLicense(): Promise<void> {
  const fp = getMachineFingerprint()
  const now = Date.now()
  const row = await getRow()

  if (!row) {
    const lock = readLock()
    const trialStart = lock?.trialStartedAt ?? now
    const trialEnd = lock?.trialEndsAt ?? now + TRIAL_DAYS * DAY_MS
    await getDb()
      .insert(licenseState)
      .values({
        id: 'singleton',
        status: 'trial',
        machineFingerprint: fp,
        trialStartedAt: new Date(trialStart),
        trialEndsAt: new Date(trialEnd),
        lastSeenAt: new Date(now),
        updatedAt: new Date(now)
      })
    writeLock({ trialStartedAt: trialStart, trialEndsAt: trialEnd })
    return
  }

  // Clock-tamper: if wall clock moved meaningfully backwards, don't trust it.
  const lastSeen = row.lastSeenAt?.getTime() ?? now
  const patch: Partial<typeof licenseState.$inferInsert> = {
    lastSeenAt: new Date(Math.max(now, lastSeen)),
    updatedAt: new Date(now)
  }
  if (now < lastSeen - DAY_MS) {
    // Suspicious rollback — fall back to grace unless genuinely activated+valid.
    const payload = verifyStoredLicense(row)
    const stillValid = row.status === 'active' && !!payload && (payload.exp === null || payload.exp > lastSeen)
    if (!stillValid) patch.status = 'grace'
  }
  await getDb().update(licenseState).set(patch).where(eq(licenseState.id, 'singleton'))

  // Keep the lock file in sync (in case it was deleted).
  if (row.trialStartedAt && row.trialEndsAt) {
    writeLock({
      trialStartedAt: row.trialStartedAt.getTime(),
      trialEndsAt: row.trialEndsAt.getTime()
    })
  }
}

export async function getStatus(): Promise<LicenseStatus> {
  const fp = getMachineFingerprint()
  const row = await getRow()
  const now = Date.now()

  if (!row) {
    return {
      status: 'trial',
      isUsable: true,
      daysRemaining: TRIAL_DAYS,
      licensedTo: null,
      edition: null,
      expiresAt: null,
      machineFingerprint: fp,
      message: 'Trial starting.'
    }
  }

  // Explicitly deactivated/expired → locked, regardless of any remaining trial.
  if (row.status === 'expired') {
    return locked(row, fp, 'This device has been deactivated. Enter a license key to activate.')
  }

  // Activated license path — only ever entered with a cryptographically valid
  // key for THIS machine. A hand-edited status column will not get you here.
  if (row.status === 'active') {
    const payload = verifyStoredLicense(row)
    if (!payload) {
      // Activated on a build that stored only a hash: keep the shop trading,
      // but ask for the key once, with a visible deadline.
      if (isLegacyHashedKey(row.licenseKey) && row.machineFingerprint?.toUpperCase() === fp.toUpperCase()) {
        const due = reactivationDeadline(now)
        const daysLeft = Math.ceil((due - now) / DAY_MS)
        if (daysLeft > 0) {
          return {
            ...usable(row, daysLeft, ''),
            needsReactivation: true,
            message:
              `Please enter your licence key once to finish this update. ` +
              `Your Machine ID has not changed, so the key you already have will work. ` +
              `${daysLeft} day(s) remaining.`
          }
        }
        return locked(
          row,
          fp,
          'This update needs your licence key entered once. Your Machine ID has not changed, so the key you already have will work.'
        )
      }
      return locked(
        row,
        fp,
        'This licence could not be verified on this computer. Please enter your licence key again.'
      )
    }

    // Expiry comes from the signed payload, never from the editable column.
    if (payload.exp === null) {
      return usable(row, null, 'Licensed (perpetual).')
    }
    const remaining = Math.ceil((payload.exp - now) / DAY_MS)
    if (remaining > 0) return usable(row, remaining, `Licensed. ${remaining} day(s) remaining.`)
    // expired subscription -> grace then locked
    const sinceExpiry = now - payload.exp
    if (sinceExpiry <= GRACE_DAYS * DAY_MS) {
      return {
        ...base(row, fp),
        status: 'grace',
        isUsable: true,
        daysRemaining: Math.ceil((GRACE_DAYS * DAY_MS - sinceExpiry) / DAY_MS),
        message: 'License expired — in grace period. Please renew.'
      }
    }
    return locked(row, fp, 'Your license has expired. Please renew to continue.')
  }

  // Trial path
  if (row.trialEndsAt) {
    const remaining = Math.ceil((row.trialEndsAt.getTime() - now) / DAY_MS)
    if (remaining > 0 && row.status !== 'grace') {
      return {
        ...base(row, fp),
        status: 'trial',
        isUsable: true,
        daysRemaining: remaining,
        message: `Free trial — ${remaining} day(s) remaining.`
      }
    }
  }
  return locked(row, fp, 'Your free trial has ended. Activate a license to continue.')
}

type LicenseRow = NonNullable<Awaited<ReturnType<typeof getRow>>>

function base(row: LicenseRow, fp: string) {
  return {
    licensedTo: row.licensedTo,
    edition: row.edition,
    expiresAt: row.expiresAt?.getTime() ?? null,
    machineFingerprint: fp
  }
}
function usable(row: LicenseRow, daysRemaining: number | null, message: string): LicenseStatus {
  return { ...base(row, getMachineFingerprint()), status: 'active', isUsable: true, daysRemaining, message }
}
function locked(row: LicenseRow, fp: string, message: string): LicenseStatus {
  return { ...base(row, fp), status: 'expired', isUsable: false, daysRemaining: 0, message }
}

/** Activate with a key issued by the admin portal for THIS machine. */
export async function activate(key: string): Promise<LicenseStatus> {
  const fp = getMachineFingerprint()
  const payload = verifyLicenseKey(key)

  if (payload.fp.toUpperCase() !== fp.toUpperCase()) {
    throw new LicenseError(
      'This license key was issued for a different computer. Share your Machine ID with us to get the correct key.'
    )
  }
  if (payload.exp !== null && payload.exp < Date.now()) {
    throw new LicenseError('This license key has already expired.')
  }

  // Store the signed key VERBATIM. A hash proves nothing on later reads, and
  // re-verifying the signature on every status check is what stops someone
  // simply setting status='active' in the database. The key is bound to this
  // machine's fingerprint, so keeping it here leaks nothing usable elsewhere.
  const now = Date.now()
  const existing = await getRow()
  const values = {
    id: 'singleton' as const,
    status: 'active' as const,
    machineFingerprint: fp,
    licenseKey: key.trim(),
    licensedTo: payload.to,
    edition: payload.ed,
    activatedAt: new Date(now),
    expiresAt: payload.exp ? new Date(payload.exp) : null,
    lastSeenAt: new Date(now),
    updatedAt: new Date(now),
    trialStartedAt: existing?.trialStartedAt ?? null,
    trialEndsAt: existing?.trialEndsAt ?? null
  }
  if (existing) {
    await getDb().update(licenseState).set(values).where(eq(licenseState.id, 'singleton'))
  } else {
    await getDb().insert(licenseState).values(values)
  }
  await audit({
    action: 'license.activate',
    entityType: 'license',
    details: { licensedTo: payload.to, edition: payload.ed }
  })
  return getStatus()
}

/**
 * Deactivate this device so the customer can move the license to a new computer.
 * Reverts to the locked state and returns a confirmation code they send to you
 * as proof the seat was freed (offline transfer — you then issue a key for the
 * new machine).
 */
export async function deactivate(): Promise<{ status: LicenseStatus; confirmationCode: string }> {
  const fp = getMachineFingerprint()
  const now = Date.now()
  const existing = await getRow()
  const licensedTo = existing?.licensedTo ?? ''

  if (existing) {
    await getDb()
      .update(licenseState)
      .set({
        status: 'expired',
        licenseKey: null,
        licensedTo: null,
        edition: null,
        activatedAt: null,
        expiresAt: null,
        lastSeenAt: new Date(now),
        updatedAt: new Date(now)
      })
      .where(eq(licenseState.id, 'singleton'))
  }

  // A simple, human-verifiable confirmation token (not secret — just proof).
  const confirmationCode = `DEACT-${fp.slice(0, 12)}-${now.toString(36).toUpperCase()}`
  await audit({ action: 'license.deactivate', entityType: 'license', details: { licensedTo, confirmationCode } })
  return { status: await getStatus(), confirmationCode }
}
