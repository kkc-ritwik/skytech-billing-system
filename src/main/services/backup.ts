import { dialog } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, unlinkSync } from 'fs'
import { eq } from 'drizzle-orm'
import { format } from 'date-fns'
import { getClient, getDb } from '../db/client'
import { settings } from '../db/schema'
import { getSettings } from './settings'
import { audit } from './audit'
import type { AuthUser } from '@shared/ipc'

const KEEP = 10 // how many auto-backups to retain
const DUE_MS = 20 * 60 * 60 * 1000 // create at most ~once/day on launch
const PREFIX = 'Shailee-AutoBackup-'

/** Direct setting write (no audit/user needed — safe to call at startup). */
async function putSetting(key: string, value: unknown): Promise<void> {
  const now = new Date()
  const existing = await getDb().select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get()
  if (existing) {
    await getDb().update(settings).set({ value: JSON.stringify(value), updatedAt: now }).where(eq(settings.key, key))
  } else {
    await getDb().insert(settings).values({ key, value: JSON.stringify(value), updatedAt: now })
  }
}

export async function getAutoBackup(): Promise<{ dir: string | null; lastAt: number | null }> {
  const s = await getSettings()
  return { dir: (s.autoBackupDir as string) || null, lastAt: (s.autoBackupLastAt as number) || null }
}

async function writeBackup(dir: string): Promise<void> {
  if (!existsSync(dir)) return
  const file = join(dir, `${PREFIX}${format(new Date(), 'yyyyMMdd-HHmmss')}.db`)
  await getClient().execute({ sql: 'VACUUM INTO ?', args: [file] })
  // Retention: keep newest KEEP, delete the rest.
  const backups = readdirSync(dir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith('.db'))
    .sort()
  while (backups.length > KEEP) {
    const old = backups.shift()
    if (old) try { unlinkSync(join(dir, old)) } catch { /* ignore */ }
  }
  await putSetting('autoBackupLastAt', Date.now())
}

/** Run once on startup if enabled and a day has passed since the last backup. */
export async function runAutoBackupIfDue(): Promise<void> {
  try {
    const { dir, lastAt } = await getAutoBackup()
    if (!dir) return
    if (lastAt && Date.now() - lastAt < DUE_MS) return
    await writeBackup(dir)
  } catch (err) {
    console.error('[auto-backup] failed:', err)
  }
}

/** User picks a folder → enables auto-backup and writes one immediately. */
export async function chooseAutoBackupDir(user: AuthUser): Promise<{ dir: string | null; lastAt: number | null }> {
  const res = await dialog.showOpenDialog({
    title: 'Choose a folder for automatic backups',
    properties: ['openDirectory', 'createDirectory']
  })
  if (res.canceled || res.filePaths.length === 0) return getAutoBackup()
  await putSetting('autoBackupDir', res.filePaths[0])
  await writeBackup(res.filePaths[0])
  await audit({ userId: user.id, username: user.username, action: 'backup.auto_enable', details: { dir: res.filePaths[0] } })
  return getAutoBackup()
}

export async function disableAutoBackup(user: AuthUser): Promise<void> {
  await putSetting('autoBackupDir', null)
  await audit({ userId: user.id, username: user.username, action: 'backup.auto_disable' })
}
