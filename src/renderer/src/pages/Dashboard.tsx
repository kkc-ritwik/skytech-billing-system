import { useEffect, useState } from 'react'
import { IndianRupee, TrendingUp, AlertTriangle, FileClock, Package } from 'lucide-react'
import { useApp } from '@renderer/store/app'
import { invoke } from '@renderer/lib/api'
import { formatINR, formatDate, formatQty } from '@renderer/lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'

interface Stats {
  salesThisMonth: number
  receivables: number
  payables: number
  lowStockCount: number
  unpaidInvoices: number
}
interface RecentInvoice { id: string; number: string; issueDate: number; partyName: string; grandTotal: number; paymentStatus: string }
interface LowStock { id: string; name: string; currentStock: number; reorderLevel: number; unitSymbol: string | null }
interface TrendPoint { label: string; total: number }

const payVariant: Record<string, 'success' | 'warning' | 'secondary'> = { paid: 'success', partial: 'warning', unpaid: 'secondary' }

export function Dashboard(): JSX.Element {
  const user = useApp((s) => s.user)
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<RecentInvoice[]>([])
  const [lowStock, setLowStock] = useState<LowStock[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  useEffect(() => {
    void invoke<Stats>('reports:dashboard').then(setStats).catch(() => undefined)
    void invoke<RecentInvoice[]>('reports:recent').then(setRecent).catch(() => undefined)
    void invoke<LowStock[]>('reports:lowstock').then(setLowStock).catch(() => undefined)
    void invoke<TrendPoint[]>('reports:trend').then(setTrend).catch(() => undefined)
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {greeting}, {user?.fullName?.split(' ')[0]} 👋
        </h1>
        <p className="text-muted-foreground">Here's a snapshot of your business.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Sales this month" value={stats ? formatINR(stats.salesThisMonth) : '—'} icon={IndianRupee} accent="text-success" />
        <Stat title="Receivables" value={stats ? formatINR(stats.receivables) : '—'} icon={TrendingUp} accent="text-primary" />
        <Stat title="Low-stock items" value={stats ? String(stats.lowStockCount) : '—'} icon={AlertTriangle} accent="text-warning" />
        <Stat title="Unpaid invoices" value={stats ? String(stats.unpaidInvoices) : '—'} icon={FileClock} accent="text-destructive" />
      </div>

      <Card>
        <CardHeader><CardTitle>Sales — last 6 months</CardTitle></CardHeader>
        <CardContent>
          <SalesTrendChart data={trend} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Recent invoices</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No invoices yet.</p>
            ) : (
              <Table>
                <THead><TR><TH>Number</TH><TH>Client</TH><TH>Date</TH><TH className="text-right">Total</TH><TH></TH></TR></THead>
                <TBody>
                  {recent.map((r) => (
                    <TR key={r.id}>
                      <TD className="font-mono text-xs">{r.number}</TD>
                      <TD className="max-w-32 truncate font-medium">{r.partyName}</TD>
                      <TD className="text-muted-foreground">{formatDate(r.issueDate)}</TD>
                      <TD className="text-right">{formatINR(r.grandTotal)}</TD>
                      <TD><Badge variant={payVariant[r.paymentStatus] ?? 'secondary'}>{r.paymentStatus}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="size-4 text-warning" /> Low stock</CardTitle></CardHeader>
          <CardContent className="pt-0">
            {lowStock.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Everything is well stocked. 🎉</p>
            ) : (
              <Table>
                <THead><TR><TH>Item</TH><TH className="text-right">In stock</TH><TH className="text-right">Reorder at</TH></TR></THead>
                <TBody>
                  {lowStock.map((s) => (
                    <TR key={s.id}>
                      <TD className="font-medium"><Package className="mr-1 inline size-3.5 text-muted-foreground" />{s.name}</TD>
                      <TD className="text-right font-semibold text-warning">{formatQty(s.currentStock)} {s.unitSymbol ?? ''}</TD>
                      <TD className="text-right text-muted-foreground">{formatQty(s.reorderLevel)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. Add your company details under <strong>Settings</strong> (logo, GSTIN, bank/UPI).</p>
          <p>2. Create your <strong>Items</strong> and <strong>Clients/Vendors</strong>.</p>
          <p>3. Record a <strong>Purchase (GRN)</strong> to bring stock in, then raise a <strong>Sales Invoice</strong>.</p>
          <p>4. Record payments as they hit your bank/UPI, then explore <strong>Reports</strong>.</p>
        </CardContent>
      </Card>
    </div>
  )
}

function SalesTrendChart({ data }: { data: TrendPoint[] }): JSX.Element {
  if (data.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">No sales data yet.</div>
  const max = Math.max(1, ...data.map((d) => d.total))
  return (
    <div className="flex h-44 items-end gap-3">
      {data.map((d) => {
        const pct = Math.round((d.total / max) * 100)
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] font-medium text-muted-foreground">{d.total > 0 ? formatINR(d.total).replace('.00', '') : ''}</span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-primary/60 to-primary transition-all"
              style={{ height: `${Math.max(2, pct)}%` }}
              title={`${d.label}: ${formatINR(d.total)}`}
            />
            <span className="text-xs text-muted-foreground">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function Stat({
  title,
  value,
  icon: Icon,
  accent
}: {
  title: string
  value: string
  icon: typeof IndianRupee
  accent: string
}): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className={`flex size-11 items-center justify-center rounded-xl bg-muted ${accent}`}>
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  )
}
