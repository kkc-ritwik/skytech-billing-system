// Generates build/icon.png (512x512) for Shailee-GRMS.
//
//   npx electron scripts/make-icon.mjs
//
// If build/logo.png exists (drop the official Shailee-GRMS logo there) it is
// used directly on a white tile. Otherwise a simplified brand mark is drawn —
// the same purple→magenta palette and draped silhouette, reduced to shapes that
// stay readable at 32px in the taskbar.
//
// electron-builder converts this PNG into the Windows .ico automatically.
import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Any of these, first match wins — set by `npm run brand:logo`.
const LOGO = ['logo.png', 'logo.jpg', 'logo.jpeg', 'logo.webp']
  .map((f) => join(root, 'build', f))
  .find((f) => existsSync(f))

const PURPLE = '#5B2D8E'
const PURPLE_DARK = '#3F1F63'
const MAGENTA = '#C2186B'
const MAGENTA_LIGHT = '#E0489A'

/** The official logo on a white rounded tile. */
function fromLogoFile() {
  const b64 = readFileSync(LOGO).toString('base64')
  const mime = LOGO.endsWith('.webp')
    ? 'image/webp'
    : /\.jpe?g$/.test(LOGO)
      ? 'image/jpeg'
      : 'image/png'
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#ffffff"/>
  <image href="data:${mime};base64,${b64}" x="20" y="20" width="472" height="472"
         preserveAspectRatio="xMidYMid meet"/>
</svg>`
}

/**
 * Fallback mark: gradient tile, brand ring, and a draped figure suggesting a
 * saree fall with a hanger hook — the logo reduced to its essentials so it
 * still reads when Windows shrinks it to a taskbar icon.
 */
function generatedMark() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PURPLE_DARK}"/>
      <stop offset="0.55" stop-color="${PURPLE}"/>
      <stop offset="1" stop-color="${MAGENTA}"/>
    </linearGradient>
    <linearGradient id="drape" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="${MAGENTA_LIGHT}"/>
    </linearGradient>
  </defs>

  <rect width="512" height="512" rx="112" fill="url(#bg)"/>

  <circle cx="256" cy="256" r="176" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="16"/>

  <!-- hanger hook -->
  <path d="M330 150 c0 -26 -22 -40 -42 -30 c-16 8 -18 28 -6 40"
        fill="none" stroke="#ffffff" stroke-width="15" stroke-linecap="round"/>

  <!-- head -->
  <circle cx="214" cy="168" r="42" fill="#ffffff"/>

  <!-- shoulder and flowing drape -->
  <path d="M214 214
           c-52 0 -84 34 -92 82
           c-8 50 6 104 34 140
           c14 18 40 22 58 8
           c26 -20 40 -56 44 -96
           c4 -44 -8 -88 -44 -134 z"
        fill="url(#drape)"/>

  <!-- pallu sweep -->
  <path d="M268 232
           c44 22 66 66 62 116
           c-4 44 -30 80 -68 96
           c22 -40 30 -84 24 -128
           c-4 -32 -12 -60 -18 -84 z"
        fill="#ffffff" fill-opacity="0.85"/>
</svg>`
}

const usingLogo = !!LOGO
const svg = usingLogo ? fromLogoFile() : generatedMark()

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
  await new Promise((r) => setTimeout(r, 700))
  const image = await win.webContents.capturePage()
  mkdirSync(join(root, 'build'), { recursive: true })
  writeFileSync(join(root, 'build', 'icon.png'), image.toPNG())
  console.log(
    usingLogo
      ? 'build/icon.png written from build/logo.png'
      : 'build/icon.png written from the generated brand mark — drop the official logo at build/logo.png and re-run to use it'
  )
  app.quit()
})
