// Generates build/icon.png (512x512) from an inline SVG using Electron's
// renderer. Run: env -u ELECTRON_RUN_AS_NODE npx electron scripts/make-icon.mjs
// electron-builder converts this PNG into the Windows .ico automatically.
import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#1e40af"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#g)"/>
  <g transform="translate(140 96)">
    <path d="M16 0 h168 a16 16 0 0 1 16 16 v300 l-32 -22 -32 22 -32 -22 -32 22 -32 -22 -32 22 v-300 a16 16 0 0 1 16 -16 z"
          fill="#ffffff"/>
    <rect x="40" y="70" width="120" height="20" rx="10" fill="#bfdbfe"/>
    <rect x="40" y="120" width="120" height="20" rx="10" fill="#bfdbfe"/>
    <rect x="40" y="170" width="78" height="20" rx="10" fill="#bfdbfe"/>
    <text x="100" y="285" font-family="Segoe UI, Arial, sans-serif" font-size="120" font-weight="700"
          text-anchor="middle" fill="#1e40af">&#8377;</text>
  </g>
</svg>`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:512px;height:512px;overflow:hidden;background:transparent}
</style></head><body>${svg}</body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    useContentSize: true,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: false }
  })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  await new Promise((r) => setTimeout(r, 400))
  const image = await win.webContents.capturePage()
  mkdirSync(join(root, 'build'), { recursive: true })
  writeFileSync(join(root, 'build', 'icon.png'), image.toPNG())
  console.log('Wrote build/icon.png', image.getSize())
  app.quit()
})
