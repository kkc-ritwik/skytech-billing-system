import { BrowserWindow, dialog, shell } from 'electron'
import { writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import QRCode from 'qrcode'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { parties } from '../db/schema'
import { toRupees } from '@shared/money'
import { getCompany, getSettings, getCompanyLogoDataUrl } from './settings'
import { getSalesDoc } from './sales'
import { getPurchaseDoc } from './purchases'
import { renderDocumentHtml, renderStatementHtml, renderThermalHtml, type PdfModel, type PdfLine } from './pdf-template'
import { renderTextileInvoiceHtml, type TextileModel } from './pdf-textile'
import { printHtml } from './printing'
import { renderLabelSheetHtml, type LabelRequest } from './barcode'
import { partyLedger } from './ledger'
import type { AuthUser } from '@shared/ipc'
import { audit } from './audit'

const LABELS: Record<string, string> = {
  invoice: 'TAX INVOICE',
  proforma: 'PROFORMA INVOICE',
  challan: 'DELIVERY CHALLAN',
  sales_order: 'SALES ORDER',
  sales_return: 'CREDIT NOTE',
  purchase_order: 'PURCHASE ORDER',
  grn: 'GOODS RECEIVED NOTE',
  purchase_return: 'DEBIT NOTE'
}

async function buildModel(type: 'sales' | 'purchase', id: string): Promise<{ model: PdfModel; number: string }> {
  const doc: any = type === 'sales' ? await getSalesDoc(id) : await getPurchaseDoc(id)
  if (!doc) throw Object.assign(new Error('Document not found.'), { code: 'NOT_FOUND' })
  const company = await getCompany()
  const party = await getDb().select().from(parties).where(eq(parties.id, doc.partyId)).get()
  const settings = await getSettings()
  const logoDataUrl = await getCompanyLogoDataUrl()

  const lines: PdfLine[] = doc.lines.map((l: any) => ({
    description: l.description,
    hsnCode: l.hsnCode,
    batchNo: l.batchNo ?? null,
    expiryDate: l.expiryDate ? (l.expiryDate instanceof Date ? l.expiryDate.getTime() : l.expiryDate) : null,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountAmount: l.discountAmount,
    taxRateBps: l.taxRateBps,
    taxableValue: l.taxableValue,
    cgstAmount: l.cgstAmount,
    sgstAmount: l.sgstAmount,
    igstAmount: l.igstAmount,
    lineTotal: l.lineTotal
  }))

  // HSN/SAC summary (group lines by HSN) — only when any line has an HSN.
  const hsnMap = new Map<string, { hsn: string; taxable: number; cgst: number; sgst: number; igst: number }>()
  for (const l of doc.lines as any[]) {
    if (!l.hsnCode) continue
    const e = hsnMap.get(l.hsnCode) ?? { hsn: l.hsnCode, taxable: 0, cgst: 0, sgst: 0, igst: 0 }
    e.taxable += l.taxableValue; e.cgst += l.cgstAmount; e.sgst += l.sgstAmount; e.igst += l.igstAmount
    hsnMap.set(l.hsnCode, e)
  }
  const hsnSummary = [...hsnMap.values()]

  // UPI "scan to pay" QR — only for inbound docs (invoices) with a UPI id + amount.
  let upiQrDataUrl: string | null = null
  if (type === 'sales' && doc.docType === 'invoice' && company?.upiId && doc.grandTotal > 0) {
    const payee = encodeURIComponent(company.tradeName || company.legalName || 'Payee')
    const amt = toRupees(doc.grandTotal).toFixed(2)
    const note = encodeURIComponent(doc.number)
    const upi = `upi://pay?pa=${encodeURIComponent(company.upiId)}&pn=${payee}&am=${amt}&cu=INR&tn=${note}`
    try {
      upiQrDataUrl = await QRCode.toDataURL(upi, { width: 220, margin: 1 })
    } catch {
      upiQrDataUrl = null
    }
  }

  const model: PdfModel = {
    docTypeLabel: LABELS[doc.docType] ?? doc.docType.toUpperCase(),
    number: doc.number,
    issueDate: doc.issueDate instanceof Date ? doc.issueDate.getTime() : doc.issueDate,
    dueDate: doc.dueDate ? (doc.dueDate instanceof Date ? doc.dueDate.getTime() : doc.dueDate) : null,
    isInterState: !!doc.isInterState,
    company: company ?? null,
    logoDataUrl,
    party: party ?? null,
    lines,
    totals: {
      subTotal: doc.subTotal,
      discountTotal: doc.discountTotal,
      cgstTotal: doc.cgstTotal,
      sgstTotal: doc.sgstTotal,
      igstTotal: doc.igstTotal,
      extraCharges: doc.extraCharges ?? 0,
      extraDiscount: doc.extraDiscount ?? 0,
      roundOff: doc.roundOff,
      grandTotal: doc.grandTotal
    },
    extraChargesLabel: doc.extraChargesLabel ?? null,
    upiQrDataUrl,
    hsnSummary,
    notes: doc.notes ?? null,
    terms: doc.termsAndConditions ?? null,
    paperSize: (settings.paperSize as 'A4' | 'A5') ?? 'A4'
  }
  return { model, number: doc.number }
}

/**
 * Build the trade-format model. Only sales documents carry the dispatch and
 * scheme fields, so purchase documents always fall back to the generic layout.
 */
async function buildTextileModel(id: string): Promise<{ model: TextileModel; number: string }> {
  const doc: any = await getSalesDoc(id)
  if (!doc) throw Object.assign(new Error('Document not found.'), { code: 'NOT_FOUND' })
  const company = await getCompany()
  const party = await getDb().select().from(parties).where(eq(parties.id, doc.partyId)).get()
  const settings = await getSettings()

  // The grid prints one GST rate in its caption; use the one carrying the most
  // value so a mixed-rate bill still names its dominant slab.
  const byRate = new Map<number, number>()
  for (const l of doc.lines as any[]) byRate.set(l.taxRateBps, (byRate.get(l.taxRateBps) ?? 0) + l.taxableValue)
  const taxRateBps = [...byRate.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0

  const ts = (v: any): number | null => (v == null ? null : v instanceof Date ? v.getTime() : v)

  const model: TextileModel = {
    docTypeLabel: LABELS[doc.docType] ?? doc.docType.toUpperCase(),
    number: doc.number,
    issueDate: ts(doc.issueDate)!,
    company: company ?? null,
    party: party ?? null,
    placeOfSupply:
      party?.billingStateCode && party?.billingState
        ? `${party.billingStateCode}-${party.billingState}`
        : party?.billingState ?? null,
    isInterState: !!doc.isInterState,

    challanNo: doc.challanNo ?? null,
    orderNo: doc.orderNo ?? null,
    agentName: doc.agentName ?? null,
    consigneeName: doc.consigneeName ?? null,
    consigneeGstin: doc.consigneeGstin ?? null,
    lrNo: doc.lrNo ?? null,
    lrDate: ts(doc.lrDate),
    transportName: doc.transportName ?? null,
    transportStation: doc.transportStation ?? null,
    caseNo: doc.caseNo ?? null,
    weight: doc.weight ?? 0,
    freight: doc.freight ?? 0,
    ewayBillNo: doc.ewayBillNo ?? null,
    transporterId: doc.transporterId ?? null,
    dueDays: doc.dueDays ?? 0,

    hsnCode: (doc.lines as any[]).find((l) => l.hsnCode)?.hsnCode ?? null,
    lines: (doc.lines as any[]).map((l) => ({
      description: l.description,
      packing: l.packing ?? null,
      quantity: l.quantity,
      cutLength: l.cutLength ?? 0,
      unitPrice: l.unitPrice,
      taxableValue: l.taxableValue
    })),
    totals: {
      subTotal: doc.subTotal,
      schemeAmount: doc.schemeAmount ?? 0,
      taxableValue: doc.subTotal - (doc.schemeAmount ?? 0),
      cgstTotal: doc.cgstTotal,
      sgstTotal: doc.sgstTotal,
      igstTotal: doc.igstTotal,
      roundOff: doc.roundOff,
      grandTotal: doc.grandTotal,
      totalPcs: Math.round((doc.lines as any[]).reduce((a, l) => a + l.quantity, 0) * 100) / 100,
      totalMetres:
        Math.round((doc.lines as any[]).reduce((a, l) => a + l.quantity * (l.cutLength ?? 0), 0) * 100) / 100
    },
    schemeLabel: doc.schemeLabel ?? null,
    schemePct: doc.schemePct ?? 0,
    taxRateBps,
    terms: doc.termsAndConditions ?? null,
    invocation: (settings.invoiceInvocation as string) ?? null
  }
  return { model, number: doc.number }
}

/** Render to a PDF buffer. 'thermal' uses CSS @page sizing for a continuous roll. */
async function renderPdfBuffer(
  html: string,
  paperSize: 'A4' | 'A5' | 'thermal' | 'css'
): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true }
  })
  // Load from a temp file rather than a data: URL. A big label run — hundreds of
  // labels, each an inline SVG — makes a data: URL large enough for Chromium to
  // refuse the navigation outright (ERR_FAILED), which would fail the export at
  // exactly the moment a shop is tagging a whole delivery.
  const tmp = join(tmpdir(), `shailee-print-${randomUUID()}.html`)
  try {
    writeFileSync(tmp, html, 'utf8')
    await win.loadFile(tmp)
    // 'css' defers entirely to the document's own @page rule, which is how an
    // arbitrary label size in mm reaches the printer without being coerced to A4.
    const data =
      paperSize === 'thermal' || paperSize === 'css'
        ? await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
        : await win.webContents.printToPDF({ pageSize: paperSize, printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } })
    return data
  } finally {
    win.destroy()
    try {
      rmSync(tmp, { force: true })
    } catch {
      /* a leftover temp file is harmless */
    }
  }
}

/** Generate the document PDF, prompt for a save location, and open it. */
export async function exportDocumentPdf(
  type: 'sales' | 'purchase',
  id: string,
  user: AuthUser,
  format: 'a4' | 'thermal' = 'a4'
): Promise<{ path: string }> {
  // Template choice: the trade layout applies to sales documents only; purchase
  // paperwork keeps the generic form regardless of the setting.
  const settings = await getSettings()
  const useTextile = format !== 'thermal' && type === 'sales' && settings.invoiceTemplate === 'textile'

  let html: string
  let paper: 'A4' | 'A5' | 'thermal'
  let number: string

  if (useTextile) {
    const built = await buildTextileModel(id)
    html = renderTextileInvoiceHtml(built.model)
    paper = 'A4'
    number = built.number
  } else {
    const built = await buildModel(type, id)
    html = format === 'thermal' ? renderThermalHtml(built.model) : renderDocumentHtml(built.model)
    paper = format === 'thermal' ? 'thermal' : built.model.paperSize
    number = built.number
  }

  const buffer = await renderPdfBuffer(html, paper)

  const safeName = number.replace(/[\\/:*?"<>|]/g, '-')
  const res = await dialog.showSaveDialog({
    title: format === 'thermal' ? 'Save thermal receipt' : 'Save PDF',
    defaultPath: `${safeName}${format === 'thermal' ? '-receipt' : ''}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (res.canceled || !res.filePath) throw Object.assign(new Error('Export cancelled.'), { code: 'VALIDATION' })

  writeFileSync(res.filePath, buffer)
  await audit({ userId: user.id, username: user.username, action: `${type}.pdf.${format}`, entityType: type, entityId: id })
  void shell.openPath(res.filePath)
  return { path: res.filePath }
}

/** Generate a sheet of barcode labels (A4, 65-up) and open it for printing. */
/**
 * Send a run of barcode labels straight to a printer.
 *
 * The page size is handed to the printer in millimetres so a 50 x 25 mm roll
 * comes out at 50 x 25 mm, not scaled onto A4.
 */
export async function printBarcodeLabels(
  req: LabelRequest,
  user: AuthUser,
  opts: { deviceName?: string; copies?: number } = {}
): Promise<{ printed: true }> {
  const html = await renderLabelSheetHtml(req)
  const res = await printHtml(html, {
    deviceName: opts.deviceName,
    copies: opts.copies,
    pageSizeMm: { widthMm: req.sheet.pageWidthMm, heightMm: req.sheet.pageHeightMm },
    silent: true
  })
  await audit({
    userId: user.id,
    username: user.username,
    action: 'item.barcode.print',
    entityType: 'item',
    details: {
      items: req.lines.length,
      labels: req.lines.reduce((a, l) => a + l.copies, 0),
      printer: opts.deviceName ?? '(default)',
      labelMm: `${req.sheet.labelWidthMm}x${req.sheet.labelHeightMm}`
    }
  })
  return res
}

export async function exportBarcodeLabels(req: LabelRequest, user: AuthUser): Promise<{ path: string }> {
  const html = await renderLabelSheetHtml(req)
  const buffer = await renderPdfBuffer(html, 'css')

  const res = await dialog.showSaveDialog({
    title: 'Save barcode labels',
    defaultPath: `barcode-labels-${new Date().toISOString().slice(0, 10)}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (res.canceled || !res.filePath) throw Object.assign(new Error('Export cancelled.'), { code: 'VALIDATION' })

  writeFileSync(res.filePath, buffer)
  await audit({
    userId: user.id,
    username: user.username,
    action: 'item.barcode.labels',
    entityType: 'item',
    details: {
      items: req.lines.length,
      labels: req.lines.reduce((a, l) => a + l.copies, 0),
      sheetMm: `${req.sheet.pageWidthMm}x${req.sheet.pageHeightMm}`,
      labelMm: `${req.sheet.labelWidthMm}x${req.sheet.labelHeightMm}`
    }
  })
  void shell.openPath(res.filePath)
  return { path: res.filePath }
}

/** Generate and save a party statement-of-account PDF. */
export async function exportPartyStatement(partyId: string, user: AuthUser): Promise<{ path: string }> {
  const ledger = await partyLedger(partyId)
  const company = await getCompany()
  const logoDataUrl = await getCompanyLogoDataUrl()
  const settings = await getSettings()
  const html = renderStatementHtml({
    company: company ?? null,
    logoDataUrl,
    party: { name: ledger.party.name, gstin: ledger.party.gstin },
    openingBalance: ledger.openingBalance,
    entries: ledger.entries,
    totalDebit: ledger.totalDebit,
    totalCredit: ledger.totalCredit,
    closingBalance: ledger.closingBalance
  })
  const buffer = await renderPdfBuffer(html, (settings.paperSize as 'A4' | 'A5') ?? 'A4')

  const safe = ledger.party.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 40)
  const res = await dialog.showSaveDialog({
    title: 'Save statement',
    defaultPath: `Statement-${safe}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (res.canceled || !res.filePath) throw Object.assign(new Error('Export cancelled.'), { code: 'VALIDATION' })
  writeFileSync(res.filePath, buffer)
  await audit({ userId: user.id, username: user.username, action: 'party.statement_pdf', entityType: 'party', entityId: partyId })
  void shell.openPath(res.filePath)
  return { path: res.filePath }
}
