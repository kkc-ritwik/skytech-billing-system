import { BrowserWindow, dialog, shell } from 'electron'
import { writeFileSync } from 'fs'
import QRCode from 'qrcode'
import { eq } from 'drizzle-orm'
import { getDb } from '../db/client'
import { parties } from '../db/schema'
import { toRupees } from '@shared/money'
import { getCompany, getSettings, getCompanyLogoDataUrl } from './settings'
import { getSalesDoc } from './sales'
import { getPurchaseDoc } from './purchases'
import { renderDocumentHtml, renderStatementHtml, renderThermalHtml, type PdfModel, type PdfLine } from './pdf-template'
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

/** Render to a PDF buffer. 'thermal' uses CSS @page sizing for a continuous roll. */
async function renderPdfBuffer(html: string, paperSize: 'A4' | 'A5' | 'thermal'): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const data =
      paperSize === 'thermal'
        ? await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } })
        : await win.webContents.printToPDF({ pageSize: paperSize, printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } })
    return data
  } finally {
    win.destroy()
  }
}

/** Generate the document PDF, prompt for a save location, and open it. */
export async function exportDocumentPdf(
  type: 'sales' | 'purchase',
  id: string,
  user: AuthUser,
  format: 'a4' | 'thermal' = 'a4'
): Promise<{ path: string }> {
  const { model, number } = await buildModel(type, id)
  const html = format === 'thermal' ? renderThermalHtml(model) : renderDocumentHtml(model)
  const buffer = await renderPdfBuffer(html, format === 'thermal' ? 'thermal' : model.paperSize)

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
