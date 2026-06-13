import { app, type BrowserWindow, type Rectangle } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'

/** Persists the main window's size/position across launches (a basic UX expectation). */
interface WinState {
  bounds?: Rectangle
  maximized?: boolean
}

function file(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

export function loadWindowState(): WinState {
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as WinState
  } catch {
    return {}
  }
}

export function saveWindowState(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return
    const state: WinState = { maximized: win.isMaximized() }
    if (!state.maximized) state.bounds = win.getBounds()
    writeFileSync(file(), JSON.stringify(state), 'utf8')
  } catch {
    /* ignore */
  }
}
