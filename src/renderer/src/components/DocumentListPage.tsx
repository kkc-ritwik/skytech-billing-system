import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, FileDown, Loader2, FileText, ArrowRightLeft, MessageCircle, Printer, FileCode2 } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { useApp } from '@renderer/store/app'
import { formatINR, formatDate } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import type { Permission } from '@shared/permissions'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Card } from '@renderer/components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'
import { DocumentEditor } from './DocumentEditor'

interface DocRow {
  id: string
  number: string
  issueDate: number
  partyName: string
  status: string
  grandTotal: number
  paidAmount: number
  paymentStatus: string
}

const payVariant: Record<string, 'success' | 'warning' | 'secondary'> = {
  paid: 'success',
  partial: 'warning',
  unpaid: 'secondary'
}

/** Allowed conversions per source doc type. */
const CONVERSIONS: Record<string, { target: string; label: string }[]> = {
  sales_order: [
    { target: 'invoice', label: 'Convert to Invoice' },
    { target: 'proforma', label: 'Convert to Proforma' }
  ],
  proforma: [{ target: 'invoice', label: 'Convert to Invoice' }],
  purchase_order: [{ target: 'grn', label: 'Convert to GRN (receive)' }]
}

export function DocumentListPage({
  title,
  subtitle,
  mode,
  tabs,
  createPerm,
  deletePerm
}: {
  title: string
  subtitle: string
  mode: 'sales' | 'purchase'
  tabs: { docType: string; label: string }[]
  createPerm: Permission
  deletePerm: Permission
}): JSX.Element {
  const has = useApp((s) => s.has)
  const [active, setActive] = useState(tabs[0].docType)
  const [rows, setRows] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editId, setEditId] = useState<string | undefined>()
  const [convertMenu, setConvertMenu] = useState<string | null>(null)
  const [gstMenu, setGstMenu] = useState<string | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const listChannel = mode === 'sales' ? 'sales:list' : 'purchases:list'
  const deleteChannel = mode === 'sales' ? 'sales:delete' : 'purchases:delete'
  const convertChannel = mode === 'sales' ? 'sales:convert' : 'purchases:convert'
  const convOptions = CONVERSIONS[active] ?? []

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const payload: { docType: string; from?: number; to?: number } = { docType: active }
      if (from) payload.from = new Date(from).getTime()
      if (to) payload.to = new Date(to).getTime() + 86399000
      setRows(await invoke<DocRow[]>(listChannel, payload))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [active, listChannel, from, to])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate(): void {
    setEditId(undefined)
    setEditorOpen(true)
  }
  function openEdit(id: string): void {
    setEditId(id)
    setEditorOpen(true)
  }
  async function exportPdf(id: string, format: 'a4' | 'thermal' = 'a4'): Promise<void> {
    try {
      await invoke('documents:pdf', { type: mode, id, format })
      toast.success(format === 'thermal' ? 'Receipt saved.' : 'PDF saved.')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION') return // cancelled
      toast.error(err instanceof ApiError ? err.message : 'PDF failed.')
    }
  }
  async function convert(id: string, target: string): Promise<void> {
    setConvertMenu(null)
    try {
      const res = await invoke<{ number: string }>(convertChannel, { id, targetDocType: target })
      toast.success(`Created ${res.number}.`)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Conversion failed.')
    }
  }

  async function exportGstJson(id: string, kind: 'einvoice' | 'eway'): Promise<void> {
    setGstMenu(null)
    try {
      await invoke(kind === 'einvoice' ? 'documents:einvoice' : 'documents:eway', { id })
      toast.success(kind === 'einvoice' ? 'e-Invoice JSON saved.' : 'e-Way JSON saved.')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION' && /cancel/i.test(err.message)) return
      toast.error(err instanceof ApiError ? err.message : 'Export failed.')
    }
  }

  function shareWhatsApp(row: DocRow): void {
    const msg =
      `Hello ${row.partyName},\n\n` +
      `Here are the details of your ${active === 'invoice' ? 'invoice' : 'document'} ${row.number} ` +
      `dated ${formatDate(row.issueDate)} for ${formatINR(row.grandTotal)}.\n` +
      `Payment status: ${row.paymentStatus}.\n\n` +
      `(The PDF is attached separately.) Thank you for your business.`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  async function remove(row: DocRow): Promise<void> {
    if (!confirm(`Delete ${row.number}? Stock effects will be reversed.`)) return
    try {
      await invoke(deleteChannel, { id: row.id })
      toast.success('Deleted.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed.')
    }
  }

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={has(createPerm) ? <Button onClick={openCreate}><Plus /> New</Button> : null}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {tabs.map((t) => (
            <button
              key={t.docType}
              onClick={() => setActive(t.docType)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                active === t.docType ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" title="From date" />
          <span className="text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" title="To date" />
          {(from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo('') }}>Clear</Button>
          )}
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
            <FileText className="size-10 text-primary/50" />
            <p className="text-lg font-medium text-foreground">Nothing here yet</p>
            {has(createPerm) && <Button onClick={openCreate} className="mt-2"><Plus /> Create one</Button>}
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Number</TH><TH>Date</TH><TH>Party</TH>
                <TH className="text-right">Total</TH><TH>Payment</TH><TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.number}</TD>
                  <TD>{formatDate(r.issueDate)}</TD>
                  <TD className="font-medium">{r.partyName}</TD>
                  <TD className="text-right">{formatINR(r.grandTotal)}</TD>
                  <TD><Badge variant={payVariant[r.paymentStatus] ?? 'secondary'}>{r.paymentStatus}</Badge></TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {convOptions.length > 0 && has(createPerm) && (
                        <div className="relative">
                          <Button variant="ghost" size="icon" title="Convert" onClick={() => setConvertMenu(convertMenu === r.id ? null : r.id)}>
                            <ArrowRightLeft className="size-4" />
                          </Button>
                          {convertMenu === r.id && (
                            <div className="absolute right-0 top-10 z-20 w-48 rounded-md border bg-card p-1 shadow-lg" onMouseLeave={() => setConvertMenu(null)}>
                              {convOptions.map((o) => (
                                <button key={o.target} onClick={() => void convert(r.id, o.target)} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent">
                                  {o.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <Button variant="ghost" size="icon" title="Export PDF (A4)" onClick={() => void exportPdf(r.id, 'a4')}><FileDown className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Thermal receipt (80mm)" onClick={() => void exportPdf(r.id, 'thermal')}><Printer className="size-4" /></Button>
                      {mode === 'sales' && active === 'invoice' && (
                        <div className="relative">
                          <Button variant="ghost" size="icon" title="GST e-Invoice / e-Way" onClick={() => setGstMenu(gstMenu === r.id ? null : r.id)}><FileCode2 className="size-4" /></Button>
                          {gstMenu === r.id && (
                            <div className="absolute right-0 top-10 z-20 w-44 rounded-md border bg-card p-1 shadow-lg" onMouseLeave={() => setGstMenu(null)}>
                              <button onClick={() => void exportGstJson(r.id, 'einvoice')} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent">e-Invoice JSON</button>
                              <button onClick={() => void exportGstJson(r.id, 'eway')} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent">e-Way bill JSON</button>
                            </div>
                          )}
                        </div>
                      )}
                      {mode === 'sales' && <Button variant="ghost" size="icon" title="Share on WhatsApp" onClick={() => shareWhatsApp(r)}><MessageCircle className="size-4 text-success" /></Button>}
                      {has(createPerm) && <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(r.id)}><Pencil className="size-4" /></Button>}
                      {has(deletePerm) && <Button variant="ghost" size="icon" title="Delete" onClick={() => void remove(r)}><Trash2 className="size-4 text-destructive" /></Button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <DocumentEditor
        mode={mode}
        docType={active}
        editId={editId}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  )
}
