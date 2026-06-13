import { useCallback, useEffect, useState } from 'react'
import { Loader2, FileDown, MessageCircle } from 'lucide-react'
import { startOfMonth, endOfMonth } from 'date-fns'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { useApp } from '@renderer/store/app'
import { formatINR, formatDate } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'

interface Pnl { revenue: number; cogs: number; grossProfit: number; marginBps: number }
interface Gstr3b { invoices: number; taxableValue: number; igst: number; cgst: number; sgst: number; cess: number; totalTax: number }
type Tab = 'receivables' | 'reminders' | 'sales' | 'pnl' | 'gst' | 'gstr3b' | 'hsn'

const NO_RANGE: Tab[] = ['receivables', 'reminders']

export function ReportsPage(): JSX.Element {
  const canFinancial = useApp((s) => s.has('reports:financial'))
  const [tab, setTab] = useState<Tab>('receivables')
  const [from, setFrom] = useState(() => startOfMonth(new Date()).toISOString().slice(0, 10))
  const [to, setTo] = useState(() => endOfMonth(new Date()).toISOString().slice(0, 10))
  const [data, setData] = useState<any[]>([])
  const [pnl, setPnl] = useState<Pnl | null>(null)
  const [g3b, setG3b] = useState<Gstr3b | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const range = (): { from: number; to: number } => ({
    from: new Date(from).getTime(),
    to: new Date(to).getTime() + 86399000
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'receivables') setData(await invoke<any[]>('reports:receivables'))
      else if (tab === 'reminders') setData(await invoke<any[]>('reports:overdue'))
      else if (tab === 'sales') setData(await invoke<any[]>('reports:salesRegister', range()))
      else if (tab === 'gst') setData(await invoke<any[]>('reports:gst', range()))
      else if (tab === 'hsn') setData(await invoke<any[]>('reports:hsn', range()))
      else if (tab === 'pnl') setPnl(await invoke<Pnl>('reports:pnl', range()))
      else if (tab === 'gstr3b') setG3b(await invoke<Gstr3b>('reports:gstr3b', range()))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load report.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, from, to])

  useEffect(() => { void load() }, [load])

  async function exportGst(): Promise<void> {
    setExporting(true)
    try {
      await invoke('reports:gstExport', range())
      toast.success('GSTR-1 CSV exported.')
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'VALIDATION')) toast.error(err instanceof ApiError ? err.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'receivables', label: 'Receivables (Aging)', show: true },
    { key: 'reminders', label: 'Payment Reminders', show: true },
    { key: 'sales', label: 'Sales Register', show: true },
    { key: 'pnl', label: 'Profit & Loss', show: canFinancial },
    { key: 'gst', label: 'GST Summary', show: canFinancial },
    { key: 'gstr3b', label: 'GSTR-3B', show: canFinancial },
    { key: 'hsn', label: 'HSN Summary', show: canFinancial }
  ]

  return (
    <div>
      <PageHeader title="Reports" subtitle="Profitability, outstanding money, sales register and GST filing data." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium transition-colors', tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {tab === 'gst' && canFinancial && (
            <Button variant="outline" size="sm" onClick={() => void exportGst()} disabled={exporting}>
              {exporting ? <Loader2 className="animate-spin" /> : <FileDown />} Export CSV
            </Button>
          )}
          {!NO_RANGE.includes(tab) && (
            <>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
              <span className="text-muted-foreground">to</span>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </>
          )}
        </div>
      </div>

      {loading ? (
        <Card><div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="animate-spin" /> Loading…</div></Card>
      ) : tab === 'pnl' ? (
        <PnlView pnl={pnl} />
      ) : tab === 'gstr3b' ? (
        <Gstr3bView g={g3b} />
      ) : tab === 'reminders' ? (
        <Card><RemindersTable rows={data} /></Card>
      ) : tab === 'hsn' ? (
        <Card><HsnTable rows={data} /></Card>
      ) : (
        <Card>
          {tab === 'receivables' ? <ReceivablesTable rows={data} /> : tab === 'sales' ? <SalesRegisterTable rows={data} /> : <GstTable rows={data} />}
        </Card>
      )}
    </div>
  )
}

function Gstr3bView({ g }: { g: Gstr3b | null }): JSX.Element {
  if (!g) return <Card><div className="py-20 text-center text-muted-foreground">No data.</div></Card>
  return (
    <Card>
      <div className="p-6">
        <p className="mb-3 text-sm font-medium">3.1(a) Outward taxable supplies (net of returns)</p>
        <Table>
          <THead><TR><TH>Description</TH><TH className="text-right">Taxable Value</TH><TH className="text-right">IGST</TH><TH className="text-right">CGST</TH><TH className="text-right">SGST</TH><TH className="text-right">Cess</TH></TR></THead>
          <TBody>
            <TR>
              <TD>Outward taxable supplies ({g.invoices} invoices)</TD>
              <TD className="text-right font-medium">{formatINR(g.taxableValue)}</TD>
              <TD className="text-right">{formatINR(g.igst)}</TD>
              <TD className="text-right">{formatINR(g.cgst)}</TD>
              <TD className="text-right">{formatINR(g.sgst)}</TD>
              <TD className="text-right">{formatINR(g.cess)}</TD>
            </TR>
            <TR>
              <TD className="font-semibold">Total tax payable</TD>
              <TD></TD>
              <TD colSpan={4} className="text-right font-bold">{formatINR(g.totalTax)}</TD>
            </TR>
          </TBody>
        </Table>
        <p className="mt-3 text-xs text-muted-foreground">Use these figures for GSTR-3B Table 3.1(a). Verify against your books before filing.</p>
      </div>
    </Card>
  )
}

function HsnTable({ rows }: { rows: any[] }): JSX.Element {
  return (
    <Table>
      <THead><TR><TH>HSN/SAC</TH><TH className="text-right">Qty</TH><TH className="text-right">Taxable</TH><TH className="text-right">CGST</TH><TH className="text-right">SGST</TH><TH className="text-right">IGST</TH><TH className="text-right">Total Tax</TH></TR></THead>
      <TBody>
        {rows.map((r, i) => (
          <TR key={i}>
            <TD className="font-mono text-xs">{r.hsn}</TD>
            <TD className="text-right">{r.qty}</TD>
            <TD className="text-right">{formatINR(r.taxable)}</TD>
            <TD className="text-right">{formatINR(r.cgst)}</TD>
            <TD className="text-right">{formatINR(r.sgst)}</TD>
            <TD className="text-right">{formatINR(r.igst)}</TD>
            <TD className="text-right font-semibold">{formatINR(r.totalTax)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

function RemindersTable({ rows }: { rows: any[] }): JSX.Element {
  function remind(r: any): void {
    const msg =
      `Dear ${r.partyName},\n\nThis is a gentle reminder that invoice ${r.number} for ${formatINR(r.outstanding)} ` +
      `is overdue by ${r.daysOverdue} day(s) (due ${formatDate(r.dueDate)}). Please arrange the payment at your earliest. Thank you.`
    const phone = (r.partyPhone || '').replace(/[^0-9]/g, '')
    const wa = phone.length >= 10 ? `https://wa.me/91${phone.slice(-10)}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(wa, '_blank')
  }
  if (rows.length === 0) return <div className="py-16 text-center text-muted-foreground">No overdue invoices. 🎉</div>
  return (
    <Table>
      <THead><TR><TH>Invoice</TH><TH>Client</TH><TH>Due</TH><TH>Overdue</TH><TH className="text-right">Outstanding</TH><TH></TH></TR></THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD className="font-mono text-xs">{r.number}</TD>
            <TD className="font-medium">{r.partyName}</TD>
            <TD>{formatDate(r.dueDate)}</TD>
            <TD><Badge variant={r.daysOverdue > 30 ? 'destructive' : 'warning'}>{r.daysOverdue}d</Badge></TD>
            <TD className="text-right font-semibold">{formatINR(r.outstanding)}</TD>
            <TD className="text-right">
              <Button variant="outline" size="sm" onClick={() => remind(r)}><MessageCircle className="size-4 text-success" /> Remind</Button>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

function PnlView({ pnl }: { pnl: Pnl | null }): JSX.Element {
  if (!pnl) return <Card><div className="py-20 text-center text-muted-foreground">No data.</div></Card>
  const margin = (pnl.marginBps / 100).toFixed(1)
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Net Revenue (excl. GST)</p><p className="mt-1 text-2xl font-bold">{formatINR(pnl.revenue)}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Cost of Goods Sold</p><p className="mt-1 text-2xl font-bold">{formatINR(pnl.cogs)}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Gross Profit</p><p className={cn('mt-1 text-2xl font-bold', pnl.grossProfit >= 0 ? 'text-success' : 'text-destructive')}>{formatINR(pnl.grossProfit)}</p></CardContent></Card>
      <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Gross Margin</p><p className="mt-1 text-2xl font-bold">{margin}%</p></CardContent></Card>
    </div>
  )
}

function ReceivablesTable({ rows }: { rows: any[] }): JSX.Element {
  const total = rows.reduce((a, r) => a + r.outstanding, 0)
  return (
    <Table>
      <THead><TR><TH>Invoice</TH><TH>Client</TH><TH>Date</TH><TH>Days overdue</TH><TH>Bucket</TH><TH className="text-right">Outstanding</TH></TR></THead>
      <TBody>
        {rows.map((r) => (
          <TR key={r.id}>
            <TD className="font-mono text-xs">{r.number}</TD>
            <TD className="font-medium">{r.partyName}</TD>
            <TD>{formatDate(r.issueDate)}</TD>
            <TD>{r.daysOverdue}</TD>
            <TD><Badge variant={r.bucket === '0-30' ? 'success' : r.bucket === '90+' ? 'destructive' : 'warning'}>{r.bucket}</Badge></TD>
            <TD className="text-right font-semibold">{formatINR(r.outstanding)}</TD>
          </TR>
        ))}
        {rows.length > 0 && (
          <TR><TD colSpan={5} className="text-right font-semibold">Total outstanding</TD><TD className="text-right font-bold">{formatINR(total)}</TD></TR>
        )}
      </TBody>
    </Table>
  )
}

function SalesRegisterTable({ rows }: { rows: any[] }): JSX.Element {
  return (
    <Table>
      <THead><TR><TH>Invoice</TH><TH>Date</TH><TH>Client</TH><TH className="text-right">Taxable</TH><TH className="text-right">CGST</TH><TH className="text-right">SGST</TH><TH className="text-right">IGST</TH><TH className="text-right">Total</TH></TR></THead>
      <TBody>
        {rows.map((r, i) => (
          <TR key={i}>
            <TD className="font-mono text-xs">{r.number}</TD>
            <TD>{formatDate(r.issueDate)}</TD>
            <TD className="font-medium">{r.partyName}</TD>
            <TD className="text-right">{formatINR(r.taxable)}</TD>
            <TD className="text-right">{formatINR(r.cgst)}</TD>
            <TD className="text-right">{formatINR(r.sgst)}</TD>
            <TD className="text-right">{formatINR(r.igst)}</TD>
            <TD className="text-right font-semibold">{formatINR(r.grandTotal)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}

function GstTable({ rows }: { rows: any[] }): JSX.Element {
  return (
    <Table>
      <THead><TR><TH>Type</TH><TH className="text-right">Invoices</TH><TH className="text-right">Taxable</TH><TH className="text-right">CGST</TH><TH className="text-right">SGST</TH><TH className="text-right">IGST</TH><TH className="text-right">Total</TH></TR></THead>
      <TBody>
        {rows.map((r, i) => (
          <TR key={i}>
            <TD className="font-medium uppercase">{r.docType}</TD>
            <TD className="text-right">{r.count}</TD>
            <TD className="text-right">{formatINR(r.taxable)}</TD>
            <TD className="text-right">{formatINR(r.cgst)}</TD>
            <TD className="text-right">{formatINR(r.sgst)}</TD>
            <TD className="text-right">{formatINR(r.igst)}</TD>
            <TD className="text-right font-semibold">{formatINR(r.total)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}
