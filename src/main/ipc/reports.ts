import { route } from './router'
import { withValidation } from './_validate'
import {
  dashboardStats,
  salesRegister,
  receivables,
  gstSummary,
  profitAndLoss,
  recentInvoices,
  lowStockList,
  salesTrend,
  gstr3b,
  hsnWise,
  overdueInvoices
} from '../services/reports'
import { exportGstr1Csv } from '../services/export'

export function registerReportRoutes(): void {
  route<void, unknown>('reports:dashboard', 'dashboard:view', () => dashboardStats())
  route<void, unknown>('reports:recent', 'dashboard:view', () => recentInvoices())
  route<void, unknown>('reports:lowstock', 'dashboard:view', () => lowStockList())
  route<void, unknown>('reports:trend', 'dashboard:view', () => salesTrend())
  route<{ from: number; to: number }, unknown>('reports:salesRegister', 'reports:view', (p) =>
    salesRegister(p.from, p.to)
  )
  route<void, unknown>('reports:receivables', 'reports:view', () => receivables())
  route<{ from: number; to: number }, unknown>('reports:gst', 'reports:financial', (p) =>
    gstSummary(p.from, p.to)
  )
  route<{ from: number; to: number }, unknown>('reports:pnl', 'reports:financial', (p) =>
    profitAndLoss(p.from, p.to)
  )
  route<{ from: number; to: number }, unknown>('reports:gstr3b', 'reports:financial', (p) =>
    gstr3b(p.from, p.to)
  )
  route<{ from: number; to: number }, unknown>('reports:hsn', 'reports:financial', (p) =>
    hsnWise(p.from, p.to)
  )
  route<void, unknown>('reports:overdue', 'reports:view', () => overdueInvoices())
  route<{ from: number; to: number }, { path: string }>('reports:gstExport', 'reports:financial', (p, ctx) =>
    withValidation(() => exportGstr1Csv(p.from, p.to, ctx.user))
  )
}
