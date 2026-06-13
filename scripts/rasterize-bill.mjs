// Rasterises the captured A4 invoice PDF to release/brochure/bill.png (clean,
// for the brochure). Run separately so the PDF-viewer window is isolated.
import { app, BrowserWindow } from 'electron'
import { writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'release', 'brochure')
app.whenReady().then(async () => {
  const pdf = join(dir, 'INV-2026-27-0001.pdf')
  if (!existsSync(pdf)) { console.error('no invoice pdf'); app.quit(); return }
  const w = new BrowserWindow({ width: 900, height: 1180, show: false, webPreferences: { plugins: true } })
  await w.loadURL(pathToFileURL(pdf).href)
  await new Promise((r) => setTimeout(r, 3000))
  writeFileSync(join(dir, 'bill.png'), (await w.webContents.capturePage()).toPNG())
  console.log('wrote bill.png')
  app.quit()
})
