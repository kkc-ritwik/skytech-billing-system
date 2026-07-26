import { dialog, shell } from 'electron'
import { writeFileSync } from 'fs'
import { format } from 'date-fns'
import { route, AppError } from './router'
import { listAudit, auditFacets, audit, type AuditFilter, type AuditRow } from '../services/audit'

/**
 * Read-only access to the append-only audit trail.
 *
 * There is deliberately no write, edit or delete channel: the log is evidence,
 * and the only way it changes is by the services appending to it.
 */
export function registerAuditRoutes(): void {
  route<AuditFilter | undefined, { rows: AuditRow[]; total: number }>('audit:list', 'audit:view', (p) =>
    listAudit(p ?? {})
  )

  route<void, { modules: string[]; users: string[] }>('audit:facets', 'audit:view', () => auditFacets())

  /** Export the current filter's results as CSV for an accountant or auditor. */
  route<AuditFilter | undefined, { path: string; rows: number }>('audit:export', 'audit:view', async (p, ctx) => {
    // Export the whole filtered set, not just the page being viewed.
    const { rows } = await listAudit({ ...(p ?? {}), limit: 500, offset: 0 })
    if (!rows.length) throw new AppError('Nothing to export for this filter.', 'VALIDATION')

    const esc = (v: unknown): string => {
      const s = v == null ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['When', 'User', 'Action', 'Entity type', 'Entity id', 'Host', 'Details']
    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push(
        [
          format(new Date(r.createdAt), 'yyyy-MM-dd HH:mm:ss'),
          r.username ?? '',
          r.action,
          r.entityType ?? '',
          r.entityId ?? '',
          r.ipOrHost ?? '',
          r.details ?? ''
        ]
          .map(esc)
          .join(',')
      )
    }

    const res = await dialog.showSaveDialog({
      title: 'Export audit trail',
      defaultPath: `audit-trail-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (res.canceled || !res.filePath) throw new AppError('Export cancelled.', 'VALIDATION')

    // BOM so Excel opens the UTF-8 correctly.
    writeFileSync(res.filePath, '﻿' + lines.join('\r\n'), 'utf8')
    await audit({
      userId: ctx.user.id,
      username: ctx.user.username,
      action: 'audit.export',
      entityType: 'audit',
      details: { rows: rows.length }
    })
    void shell.openPath(res.filePath)
    return { path: res.filePath, rows: rows.length }
  })
}
