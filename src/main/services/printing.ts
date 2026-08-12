import { BrowserWindow } from 'electron'
import { writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

/**
 * Sending documents to a real printer.
 *
 * Everything used to end at "save a PDF", which meant a shop wanting a barcode
 * sticker had to save a file and open it in another program first. This sends
 * the same HTML straight to a chosen printer instead.
 *
 * A shop runs more than one printer — a thermal label printer for stickers, a
 * receipt printer for bills, an A4 printer for reports — so the printer is
 * chosen per purpose and remembered separately for each.
 */

export type PrintPurpose = 'labels' | 'receipt' | 'report'

export interface PrinterInfo {
  name: string
  displayName: string
  description: string
  status: number
  isDefault: boolean
}

/** Page size in millimetres, when the document is not a standard paper size. */
export interface PrintPageSizeMm {
  widthMm: number
  /**
   * Height in millimetres. Omit for a continuous roll: the length of a receipt
   * is however long the shopping was, so it is measured from what rendered
   * rather than guessed at.
   */
  heightMm?: number
}

export interface PrintOptions {
  /** Printer device name. Omitted or unknown => the system default. */
  deviceName?: string
  /** Exact page size. Required for label stock; omit for A4. */
  pageSizeMm?: PrintPageSizeMm
  /** How many copies the printer itself should produce. */
  copies?: number
  /**
   * Skip the operating system's print dialog. True is what a counter wants —
   * press print, sticker comes out.
   */
  silent?: boolean
  landscape?: boolean
}

/** Microns are what Electron's print API expects for a custom page size. */
const MM_TO_MICRON = 1000

/**
 * Load HTML into a hidden window and hand it to the caller.
 *
 * Deliberately not offscreen: offscreen rendering and printing do not reliably
 * co-operate on Windows, and a printed sticker that silently comes out blank is
 * worse than no feature at all.
 */
async function withHiddenWindow<T>(html: string, fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, offscreen: false }
  })
  const tmp = join(tmpdir(), `shailee-print-${randomUUID()}.html`)
  try {
    writeFileSync(tmp, html, 'utf8')
    await win.loadFile(tmp)
    return await fn(win)
  } finally {
    win.destroy()
    try {
      rmSync(tmp, { force: true })
    } catch {
      /* a leftover temp file is harmless */
    }
  }
}

/**
 * Printers visible to this machine right now.
 *
 * Read through a throwaway window because printer enumeration lives on
 * webContents. Returns an empty list rather than throwing when the print
 * spooler is unavailable, so the UI can say "no printers found" instead of
 * showing an error dialog.
 */
export async function listPrinters(): Promise<PrinterInfo[]> {
  try {
    return await withHiddenWindow('<!doctype html><title>printers</title>', async (win) => {
      const printers = await win.webContents.getPrintersAsync()
      return printers.map((p) => ({
        name: p.name,
        displayName: p.displayName || p.name,
        description: p.description ?? '',
        status: p.status ?? 0,
        isDefault: !!p.isDefault
      }))
    })
  } catch (err) {
    console.error('[print] could not list printers:', err)
    return []
  }
}

/**
 * Print HTML on a real printer.
 *
 * Resolves once the spooler has accepted the job. A rejected job carries the
 * reason Electron gave, because "printing failed" on its own tells a shopkeeper
 * nothing about whether the printer is off, out of paper, or simply not chosen.
 */
export async function printHtml(html: string, opts: PrintOptions = {}): Promise<{ printed: true }> {
  return withHiddenWindow(html, async (win) => {
    let pageSize: { width: number; height: number } | undefined
    if (opts.pageSizeMm) {
      const widthMm = opts.pageSizeMm.widthMm
      let heightMm = opts.pageSizeMm.heightMm
      if (!heightMm) {
        // CSS millimetres are a fixed 96 dpi, so measuring the rendered height
        // in pixels converts exactly. A few millimetres of tail keeps the last
        // line off the cut.
        const px = (await win.webContents.executeJavaScript(
          'Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)'
        )) as number
        heightMm = Math.max(40, Math.ceil(Number(px) / (96 / 25.4)) + 4)
      }
      pageSize = {
        width: Math.round(widthMm * MM_TO_MICRON),
        height: Math.round(heightMm * MM_TO_MICRON)
      }
    }

    return new Promise<{ printed: true }>((resolve, reject) => {
      win.webContents.print(
        {
          silent: opts.silent !== false,
          printBackground: true,
          deviceName: opts.deviceName || undefined,
          copies: Math.max(1, Math.min(100, opts.copies ?? 1)),
          landscape: !!opts.landscape,
          margins: { marginType: 'none' },
          ...(pageSize ? { pageSize } : {})
        },
        (success, failureReason) => {
          if (success) return resolve({ printed: true })
          const reason = String(failureReason || '').trim()
          if (/cancel/i.test(reason)) {
            return reject(Object.assign(new Error('Printing cancelled.'), { code: 'VALIDATION' }))
          }
          reject(
            Object.assign(
              new Error(
                reason
                  ? `The printer refused the job: ${reason}. Check that it is switched on, has paper, and is the right printer.`
                  : 'The printer refused the job. Check that it is switched on, has paper, and is the right printer.'
              ),
              { code: 'VALIDATION' }
            )
          )
        }
      )
    })
  })
}

/** Settings key holding the remembered printer for a purpose. */
export function printerSettingKey(purpose: PrintPurpose): string {
  return `printer.${purpose}`
}
