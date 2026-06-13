// GUI screenshot harness — runs the REAL built app, drives the first-run +
// auth flows, and captures each screen to release/shots/. Run:
//   env -u ELECTRON_RUN_AS_NODE npx electron scripts/shots.mjs
import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shotsDir = join(root, 'release', 'shots')
mkdirSync(shotsDir, { recursive: true })

await import(pathToFileURL(join(root, 'out', 'main', 'index.js')).href)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getWin() {
  for (let i = 0; i < 40; i++) {
    const w = BrowserWindow.getAllWindows()[0]
    if (w && !w.webContents.isLoading()) return w
    await sleep(250)
  }
  throw new Error('window not ready')
}
async function shot(win, name) {
  await sleep(900)
  const img = await win.webContents.capturePage()
  writeFileSync(join(shotsDir, name), img.toPNG())
  console.log('shot', name)
}
async function waitForSelector(win, sel) {
  for (let i = 0; i < 40; i++) {
    const ok = await win.webContents.executeJavaScript(`!!document.querySelector('${sel}')`).catch(() => false)
    if (ok) return true
    await sleep(250)
  }
  return false
}
const clickByText = (txt) => `(function(){
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim().toLowerCase().includes(${JSON.stringify(txt.toLowerCase())}));
  if(b){b.click();return true} return false })()`

const FILL_SETUP = `(function(){
  function set(el,v){ el.value=v; const t=el._valueTracker; if(t)t.setValue(''); el.dispatchEvent(new Event('input',{bubbles:true})); }
  const i=[...document.querySelectorAll('input')];
  set(i[0],'Ritwik Singh');set(i[1],'admin');set(i[2],'admin@acme.test');set(i[3],'SkyTech@123');set(i[4],'SkyTech@123');
  document.querySelector('button[type=submit]').click();return 'filled '+i.length;})()`

app.whenReady().then(async () => {
  try {
    const win = await getWin()
    win.webContents.on('console-message', (_e, _lvl, msg) => console.log('RENDERER:', msg))
    win.setSize(1280, 820)
    await waitForSelector(win, 'input')
    await shot(win, '01-first-run-setup.png')

    const fillRes = await win.webContents.executeJavaScript(FILL_SETUP).catch((e) => 'FILL_ERR:' + e.message)
    console.log('fill result:', fillRes)
    await sleep(2200)
    await shot(win, '02-recovery-code.png') // one-time recovery code screen

    await win.webContents.executeJavaScript(clickByText("continue"))
    await sleep(1500)
    await shot(win, '03-dashboard.png')

    for (const [hash, name] of [
      ['#/items', '04-items.png'],
      ['#/sales', '05-sales.png'],
      ['#/parties', '06-parties.png'],
      ['#/settings', '07-settings.png'],
      ['#/license', '08-license.png'],
      ['#/users', '09-users-page.png'],
      ['#/help', '12-help.png']
    ]) {
      await win.webContents.executeJavaScript(`location.hash='${hash}'`)
      await shot(win, name)
    }

    // Open the New-invoice editor to capture the new fields (due date, extra
    // charges/discount, totals).
    await win.webContents.executeJavaScript(`location.hash='#/sales'`)
    await sleep(900)
    await win.webContents.executeJavaScript(clickByText('new'))
    await sleep(1200)
    await shot(win, '11-invoice-editor.png')
    // Close the dialog (Escape) before continuing.
    await win.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`)
    await sleep(500)

    // Log out (clear token) and reload → Login screen, then the Forgot view.
    await win.webContents.executeJavaScript(`localStorage.removeItem('ll_token');location.hash='#/';location.reload()`)
    await sleep(2500)
    await waitForSelector(win, 'input')
    await shot(win, '09-login.png')
    await win.webContents.executeJavaScript(clickByText("forgot password"))
    await sleep(600)
    await shot(win, '10-forgot-password.png')

    // Dark mode check
    await win.webContents.executeJavaScript(`localStorage.setItem('ll_theme','dark');location.hash='#/';location.reload()`)
    await sleep(2500)
    await shot(win, '13-dark-dashboard.png')
    await win.webContents.executeJavaScript(`location.hash='#/sales'`)
    await shot(win, '14-dark-sales.png')

    console.log('DONE')
  } catch (e) {
    console.error('SHOTS ERROR', e)
  } finally {
    app.exit(0)
  }
})
