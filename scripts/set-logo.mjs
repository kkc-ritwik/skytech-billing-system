/**
 * Installs the official Shailee-GRMS logo everywhere the app uses it.
 *
 *   npm run brand:logo -- "C:\path\to\shailee-logo.png"
 *
 * Produces three assets from the one source image:
 *
 *   assets/logo-full.png  the complete lockup (wordmark + strapline) — sign-in hero
 *   assets/logo-mark.png  just the circular emblem, cropped square — sidebar badge
 *   build/icon.png        512x512 Windows icon, built from the emblem
 *
 * The emblem is cropped automatically: the wordmark is unreadable once Windows
 * shrinks an icon to 32px, so the badge and taskbar icon use the emblem alone.
 *
 * Run `npm run build` afterwards, or `npm run build:win` for a new installer.
 */
import { app, BrowserWindow } from 'electron'
import { copyFileSync, existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'fs'
import { join, dirname, extname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = process.argv.find((a, i) => i > 1 && !a.startsWith('--') && /\.(png|jpe?g|webp)$/i.test(a))

if (!src) {
  console.error('Usage: npm run brand:logo -- "C:\\path\\to\\logo.png"')
  process.exit(1)
}
if (!existsSync(src)) {
  console.error(`Not found: ${src}`)
  process.exit(1)
}

const ASSETS = join(root, 'src', 'renderer', 'src', 'assets')
const BUILD = join(root, 'build')
mkdirSync(ASSETS, { recursive: true })
mkdirSync(BUILD, { recursive: true })

const ext = extname(src).toLowerCase()
const mime = ext === '.webp' ? 'image/webp' : /\.jpe?g$/.test(ext) ? 'image/jpeg' : 'image/png'
const dataUrl = `data:${mime};base64,${readFileSync(src).toString('base64')}`

/**
 * Renders the source in an offscreen page, finds the emblem's bounding box by
 * ignoring near-white pixels, and returns both the full image and a square
 * emblem crop as PNG buffers.
 */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#fff}
</style></head><body><script>
window.__run = async () => {
  const img = new Image()
  img.src = ${JSON.stringify(dataUrl)}
  await img.decode()

  const W = img.naturalWidth, H = img.naturalHeight
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  const px = g.getImageData(0, 0, W, H).data

  // The emblem sits above the wordmark. Stop well short of the text baseline —
  // letter ascenders reach higher than you expect and the wordmark is wider
  // than the circle, so including any of it blows the crop out sideways.
  const limit = Math.floor(H * 0.54)
  const isInk = (i) => {
    const r = px[i], gg = px[i+1], b = px[i+2], a = px[i+3]
    if (a < 40) return false
    return !(r > 238 && gg > 238 && b > 238)   // ignore the near-white ground
  }

  let minX = W, minY = H, maxX = 0, maxY = 0
  for (let y = 0; y < limit; y++) {
    for (let x = 0; x < W; x++) {
      if (!isInk((y * W + x) * 4)) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX <= minX || maxY <= minY) { minX = 0; minY = 0; maxX = W - 1; maxY = limit - 1 }

  // The emblem is a circle, so its height is the truthful measure of its size —
  // using the width would inherit any wordmark that crept into the scan band.
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const side = (maxY - minY) * 1.08
  const half = side / 2

  const S = 512
  const mark = document.createElement('canvas')
  mark.width = S; mark.height = S
  const mg = mark.getContext('2d')
  mg.imageSmoothingQuality = 'high'
  mg.fillStyle = '#ffffff'
  mg.fillRect(0, 0, S, S)
  mg.drawImage(img, cx - half, cy - half, side, side, 0, 0, S, S)

  return {
    box: { minX, minY, maxX, maxY, side: Math.round(side) },
    source: { W, H },
    mark: mark.toDataURL('image/png').split(',')[1]
  }
}
</script></body></html>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 900, height: 900, webPreferences: { sandbox: false } })
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(PAGE))
  const res = await win.webContents.executeJavaScript('window.__run()')

  // 1. full lockup, copied as-is
  const full = join(ASSETS, 'logo-full' + ext)
  copyFileSync(src, full)

  // 2. square emblem
  const markBuf = Buffer.from(res.mark, 'base64')
  writeFileSync(join(ASSETS, 'logo-mark.png'), markBuf)

  // 3. windows icon
  writeFileSync(join(BUILD, 'icon.png'), markBuf)
  writeFileSync(join(BUILD, 'logo.png'), markBuf)

  const kb = (n) => Math.round(n / 1024) + ' KB'
  console.log(`source        ${res.source.W}x${res.source.H}  (${kb(statSync(src).size)})`)
  console.log(`emblem found  x${res.box.minX}-${res.box.maxX}  y${res.box.minY}-${res.box.maxY}  → ${res.box.side}px square`)
  console.log('')
  console.log(`  assets/logo-full${ext}      full lockup for the sign-in hero`)
  console.log(`  assets/logo-mark.png      512x512 emblem  (${kb(markBuf.length)})`)
  console.log(`  build/icon.png            windows icon`)
  console.log('')
  console.log('Next:  npm run build        (see it in the app)')
  console.log('       npm run build:win    (installer with the new icon)')

  win.destroy()
  app.quit()
})
