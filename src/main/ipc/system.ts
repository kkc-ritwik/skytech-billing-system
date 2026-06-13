import { app, dialog, shell } from 'electron'
import { copyFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { format } from 'date-fns'
import { CHANNELS } from '@shared/ipc'
import { anonRoute, authedRoute, route, AppError } from './router'
import { getClient, getDatabasePath, closeDatabase } from '../db/client'
import { audit } from '../services/audit'
import { getAutoBackup, chooseAutoBackupDir, disableAutoBackup } from '../services/backup'

export function registerSystemRoutes(): void {
  // Open the local data / logs folders (handy for backups & support).
  authedRoute<void, { ok: true }>('system:openDataFolder', async () => {
    await shell.openPath(app.getPath('userData'))
    return { ok: true }
  })
  authedRoute<void, { ok: true }>('system:openLogs', async () => {
    const dir = join(app.getPath('userData'), 'logs')
    mkdirSync(dir, { recursive: true })
    await shell.openPath(dir)
    return { ok: true }
  })

  route<void, { dir: string | null; lastAt: number | null }>('backup:autoGet', 'backup:manage', () => getAutoBackup())
  route<void, { dir: string | null; lastAt: number | null }>('backup:autoChoose', 'backup:manage', (_p, ctx) => chooseAutoBackupDir(ctx.user))
  route<void, { ok: true }>('backup:autoDisable', 'backup:manage', async (_p, ctx) => {
    await disableAutoBackup(ctx.user)
    return { ok: true }
  })

  anonRoute<void, { name: string; version: string; platform: string }>(
    CHANNELS.appInfo,
    () => ({ name: app.getName(), version: app.getVersion(), platform: process.platform }),
    { bypassLicense: true }
  )

  // One-click hot backup of the live database to a user-chosen location.
  route<void, { path: string }>(CHANNELS.backupCreate, 'backup:manage', async (_p, ctx) => {
    const defaultName = `LedgerLine-Backup-${format(new Date(), 'yyyyMMdd-HHmmss')}.db`
    const res = await dialog.showSaveDialog({
      title: 'Save database backup',
      defaultPath: defaultName,
      filters: [{ name: 'LedgerLine Backup', extensions: ['db'] }]
    })
    if (res.canceled || !res.filePath) throw new AppError('Backup cancelled.', 'VALIDATION')
    // VACUUM INTO writes a consistent, defragmented copy of the live database.
    await getClient().execute({ sql: 'VACUUM INTO ?', args: [res.filePath] })
    await audit({ userId: ctx.user.id, username: ctx.user.username, action: 'backup.create', details: { path: res.filePath } })
    return { path: res.filePath }
  })

  // Restore from a backup file. Replaces the DB and relaunches the app.
  route<void, { restarting: true }>(CHANNELS.backupRestore, 'backup:manage', async (_p, ctx) => {
    const res = await dialog.showOpenDialog({
      title: 'Select a backup to restore',
      properties: ['openFile'],
      filters: [{ name: 'LedgerLine Backup', extensions: ['db'] }]
    })
    if (res.canceled || res.filePaths.length === 0) throw new AppError('Restore cancelled.', 'VALIDATION')
    const confirm = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancel', 'Restore & Restart'],
      defaultId: 0,
      cancelId: 0,
      title: 'Confirm restore',
      message: 'Restoring will OVERWRITE all current data with the backup. This cannot be undone. Continue?'
    })
    if (confirm.response !== 1) throw new AppError('Restore cancelled.', 'VALIDATION')

    const target = getDatabasePath()
    // Safety net: snapshot current data before overwriting, so a bad restore is recoverable.
    try {
      const stamp = format(new Date(), 'yyyyMMdd-HHmmss')
      await getClient().execute({ sql: 'VACUUM INTO ?', args: [`${target}.pre-restore-${stamp}.bak`] })
    } catch (err) {
      console.error('[restore] pre-restore snapshot failed:', err)
    }
    await audit({ userId: ctx.user.id, username: ctx.user.username, action: 'backup.restore', details: { from: res.filePaths[0] } })
    closeDatabase()
    copyFileSync(res.filePaths[0], target)
    // Remove stale WAL/SHM so SQLite doesn't replay the OLD journal over the restored DB.
    rmSync(`${target}-wal`, { force: true })
    rmSync(`${target}-shm`, { force: true })
    app.relaunch()
    app.exit(0)
    return { restarting: true }
  })
}
