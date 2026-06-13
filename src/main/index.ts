import { app, shell, dialog, Menu, BrowserWindow } from 'electron'
import { join } from 'path'
import { initDatabase, getClient, closeDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { seedDefaults } from './services/seed'
import { initLicense } from './services/license'
import { initAutoUpdate } from './services/updater'
import { runAutoBackupIfDue } from './services/backup'
import { cleanupExpiredSessions } from './services/auth'
import { installCrashHandlers, log } from './services/logger'
import { loadWindowState, saveWindowState } from './services/window-state'
import { registerAllRoutes } from './ipc'

let mainWindow: BrowserWindow | null = null

// ---- Single-instance lock: protect the local SQLite DB from two app copies ----
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  startApp()
}

function createWindow(): void {
  const saved = loadWindowState()
  mainWindow = new BrowserWindow({
    width: saved.bounds?.width ?? 1280,
    height: saved.bounds?.height ?? 820,
    x: saved.bounds?.x,
    y: saved.bounds?.y,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: 'SkyTech Billing',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // No DevTools in the shipped build (kept on in dev for debugging).
      devTools: !app.isPackaged
    }
  })
  if (saved.maximized) mainWindow.maximize()

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  const persist = (): void => {
    if (mainWindow) saveWindowState(mainWindow)
  }
  mainWindow.on('resize', persist)
  mainWindow.on('move', persist)
  mainWindow.on('close', persist)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Open external links in the browser; never inside the app.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (/^https?:|^mailto:|^tel:/i.test(details.url)) shell.openExternal(details.url)
    return { action: 'deny' }
  })
  // Block in-app navigation to arbitrary URLs (defence in depth).
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const isDev = !!process.env['ELECTRON_RENDERER_URL']
    if (!url.startsWith('file://') && !(isDev && url.startsWith(process.env['ELECTRON_RENDERER_URL']!))) {
      e.preventDefault()
      if (/^https?:/i.test(url)) shell.openExternal(url)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrapBackend(): Promise<void> {
  const db = await initDatabase()
  // Detect a corrupt database early so we can guide the user to a backup.
  try {
    const r = await getClient().execute('PRAGMA quick_check')
    const result = String((r.rows[0] as Record<string, unknown>)?.quick_check ?? '').toLowerCase()
    if (result && result !== 'ok') throw new Error('Database integrity check failed: ' + result)
  } catch (err) {
    log('warn', 'integrity check', err)
    throw err
  }
  await runMigrations(db)
  await seedDefaults()
  await initLicense()
  await cleanupExpiredSessions()
  registerAllRoutes()
  await runAutoBackupIfDue()
}

function startApp(): void {
  installCrashHandlers()
  app.whenReady().then(async () => {
    // No application menu / DevTools in the shipped build.
    if (app.isPackaged) Menu.setApplicationMenu(null)

    try {
      await bootstrapBackend()
    } catch (err) {
      log('error', 'backend bootstrap failed', err)
      const choice = dialog.showMessageBoxSync({
        type: 'error',
        title: 'SkyTech Billing — startup error',
        message: 'The application could not start its database.',
        detail:
          (err instanceof Error ? err.message : String(err)) +
          '\n\nYour data folder may help recover from a backup. Open it, or contact support.',
        buttons: ['Open data folder', 'Quit'],
        defaultId: 0,
        cancelId: 1
      })
      if (choice === 0) await shell.openPath(app.getPath('userData'))
      app.quit()
      return
    }
    createWindow()
    initAutoUpdate()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

// Flush & close the database cleanly on quit (checkpoints the WAL).
let dbClosed = false
app.on('before-quit', () => {
  if (dbClosed) return
  dbClosed = true
  try {
    closeDatabase()
  } catch {
    /* ignore */
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
