import { dialog, shell } from 'electron'
import { writeFileSync } from 'fs'
import { and, between, eq, isNull } from 'drizzle-orm'
import { format } from 'date-fns'
import { getDb } from '../db/client'
import { salesDocuments, parties } from '../db/schema'
import { toRupees } from '@shared/money'
import type { AuthUser } from '@shared/ipc'
import { audit } from './audit'

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function csvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',')
}

/**
 * Export a GSTR-1-style B2B invoice register as CSV for the period. This is the
 * per-invoice data a tax professional needs to file GSTR-1 (amounts in ₹).
 */
export async function exportGstr1Csv(fromMs: number, toMs: number, user: AuthUser): Promise<{ path: string }> {
  const rows = await getDb()
    .select({
      number: salesDocuments.number,
      issueDate: salesDocuments.issueDate,
      partyName: parties.name,
      gstin: parties.gstin,
      placeOfSupply: parties.billingStateCode,
      isInterState: salesDocuments.isInterState,
      taxable: salesDocuments.subTotal,
      cgst: salesDocuments.cgstTotal,
      sgst: salesDocuments.sgstTotal,
      igst: salesDocuments.igstTotal,
      total: salesDocuments.grandTotal
    })
    .from(salesDocuments)
    .innerJoin(parties, eq(salesDocuments.partyId, parties.id))
    .where(
      and(
        eq(salesDocuments.docType, 'invoice'),
        isNull(salesDocuments.deletedAt),
        between(salesDocuments.issueDate, new Date(fromMs), new Date(toMs))
      )
    )
    .orderBy(salesDocuments.issueDate)

  const header = [
    'GSTIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice Date',
    'Place Of Supply', 'Supply Type', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Invoice Value'
  ]
  const lines = [csvRow(header)]
  let tT = 0, tC = 0, tS = 0, tI = 0, tV = 0
  for (const r of rows) {
    tT += r.taxable; tC += r.cgst; tS += r.sgst; tI += r.igst; tV += r.total
    lines.push(
      csvRow([
        r.gstin ?? '', r.partyName, r.number, format(new Date(r.issueDate), 'dd-MM-yyyy'),
        r.placeOfSupply ?? '', r.isInterState ? 'Inter-State' : 'Intra-State',
        toRupees(r.taxable), toRupees(r.cgst), toRupees(r.sgst), toRupees(r.igst), toRupees(r.total)
      ])
    )
  }
  lines.push(csvRow(['', '', '', '', '', 'TOTAL', toRupees(tT), toRupees(tC), toRupees(tS), toRupees(tI), toRupees(tV)]))

  const res = await dialog.showSaveDialog({
    title: 'Export GSTR-1 (CSV)',
    defaultPath: `GSTR1-${format(new Date(fromMs), 'yyyyMMdd')}-${format(new Date(toMs), 'yyyyMMdd')}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (res.canceled || !res.filePath) throw Object.assign(new Error('Export cancelled.'), { code: 'VALIDATION' })

  writeFileSync(res.filePath, '﻿' + lines.join('\r\n'), 'utf8') // BOM for Excel
  await audit({ userId: user.id, username: user.username, action: 'reports.gstr1_export', details: { count: rows.length } })
  void shell.openPath(res.filePath)
  return { path: res.filePath }
}
