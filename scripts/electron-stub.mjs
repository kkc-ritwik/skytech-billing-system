// Minimal Electron stand-in so the real main-process service code can run under
// plain Node for integration testing. Only the surface our services touch.
import os from 'os'

export const app = {
  getPath: () => os.tmpdir(),
  getAppPath: () => process.cwd(),
  isPackaged: false,
  getName: () => 'LedgerLine',
  getVersion: () => '0.0.0-test'
}
export class BrowserWindow {}
export const dialog = {}
export const shell = {}
export const ipcMain = { handle() {} }
export default { app, BrowserWindow, dialog, shell, ipcMain }
