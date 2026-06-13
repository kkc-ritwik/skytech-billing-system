import { app } from 'electron'
import electronUpdater from 'electron-updater'

const { autoUpdater } = electronUpdater

/**
 * Silent auto-update. Checks the feed configured in electron-builder.yml
 * (publish.url), downloads in the background, and installs on next quit.
 * Only runs in packaged builds — no-op in dev.
 */
export function initAutoUpdate(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => console.error('[updater] error:', err?.message ?? err))
  autoUpdater.on('update-available', (info) => console.log('[updater] update available:', info.version))
  autoUpdater.on('update-downloaded', (info) =>
    console.log('[updater] update downloaded, will install on quit:', info.version)
  )

  // Check shortly after launch, then every 6 hours.
  const check = (): void => {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => console.error('[updater] check failed:', e))
  }
  setTimeout(check, 8000)
  setInterval(check, 6 * 60 * 60 * 1000)
}
