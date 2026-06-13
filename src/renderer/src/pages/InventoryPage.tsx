import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertTriangle, SlidersHorizontal, Plus, Trash2 } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { useApp } from '@renderer/store/app'
import { formatINR, formatQty, toPaise, formatDate } from '@renderer/lib/format'
import type { StockAdjustmentInput } from '@shared/dto'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Dialog } from '@renderer/components/ui/dialog'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'

interface StockRow {
  id: string; sku: string; name: string; unitSymbol: string | null
  currentStock: number; reorderLevel: number; stockValue: number; isLow: boolean
}
interface ExpRow {
  itemId: string; itemName: string; sku: string; unitSymbol: string | null
  batchNo: string | null; remaining: number; expiry: number | null; daysToExpiry: number | null
}
interface ItemOpt { id: string; name: string; sku: string }
interface AdjLine { itemId: string; qtyDelta: string; unitCost: string }

export function InventoryPage(): JSX.Element {
  const canAdjust = useApp((s) => s.has('inventory:adjust'))
  const [rows, setRows] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ItemOpt[]>([])
  const [reason, setReason] = useState<StockAdjustmentInput['reason']>('count_correction')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<AdjLine[]>([{ itemId: '', qtyDelta: '', unitCost: '' }])
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'stock' | 'expiry'>('stock')
  const [expiry, setExpiry] = useState<ExpRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (view === 'stock') setRows(await invoke<StockRow[]>('inventory:summary'))
      else setExpiry(await invoke<ExpRow[]>('inventory:expiry'))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [view])

  useEffect(() => { void load() }, [load])

  async function openAdjust(): Promise<void> {
    try {
      setItems(await invoke<ItemOpt[]>('items:list', { activeOnly: true }))
    } catch { /* ignore */ }
    setReason('count_correction')
    setNote('')
    setLines([{ itemId: '', qtyDelta: '', unitCost: '' }])
    setOpen(true)
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const payload: StockAdjustmentInput = {
        reason,
        note: note || null,
        adjustedAt: Date.now(),
        lines: lines
          .filter((l) => l.itemId && Number(l.qtyDelta))
          .map((l) => ({ itemId: l.itemId, qtyDelta: Number(l.qtyDelta), unitCost: toPaise(l.unitCost || '0') }))
      }
      if (payload.lines.length === 0) { toast.error('Add at least one item with a non-zero quantity.'); setSaving(false); return }
      await invoke('inventory:adjust', payload)
      toast.success('Stock adjusted.')
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Adjustment failed.')
    } finally {
      setSaving(false)
    }
  }

  const totalValue = rows.reduce((a, r) => a + r.stockValue, 0)
  const lowCount = rows.filter((r) => r.isLow).length

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle="Live stock levels, valuation and low-stock alerts."
        actions={canAdjust ? <Button onClick={() => void openAdjust()}><SlidersHorizontal /> Adjust stock</Button> : null}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Stock value</p><p className="mt-1 text-2xl font-bold">{formatINR(totalValue)}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">SKUs tracked</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Low stock</p><p className="mt-1 text-2xl font-bold text-warning">{lowCount}</p></CardContent></Card>
      </div>

      <div className="mb-4 inline-flex gap-1 rounded-lg border bg-card p-1">
        {(['stock', 'expiry'] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            {v === 'stock' ? 'Stock summary' : 'Batch expiry'}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="animate-spin" /> Loading…</div>
        ) : view === 'expiry' ? (
          expiry.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No batch/expiry stock recorded. Add a Batch &amp; Expiry on purchase (GRN) line items.</div>
          ) : (
            <Table>
              <THead><TR><TH>Item</TH><TH>Batch</TH><TH className="text-right">Remaining</TH><TH>Expiry</TH><TH>Status</TH></TR></THead>
              <TBody>
                {expiry.map((e, i) => (
                  <TR key={i}>
                    <TD className="font-medium">{e.itemName}</TD>
                    <TD className="font-mono text-xs">{e.batchNo}</TD>
                    <TD className="text-right">{formatQty(e.remaining)} {e.unitSymbol ?? ''}</TD>
                    <TD>{e.expiry ? formatDate(e.expiry) : '—'}</TD>
                    <TD>
                      {e.daysToExpiry == null ? '—' : e.daysToExpiry < 0 ? (
                        <span className="font-semibold text-destructive">Expired</span>
                      ) : e.daysToExpiry <= 90 ? (
                        <span className="font-semibold text-warning">In {e.daysToExpiry}d</span>
                      ) : (
                        <span className="text-muted-foreground">In {e.daysToExpiry}d</span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )
        ) : (
          <Table>
            <THead>
              <TR><TH>SKU</TH><TH>Item</TH><TH className="text-right">In stock</TH><TH className="text-right">Reorder</TH><TH className="text-right">Value</TH></TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.sku}</TD>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="text-right">
                    <span className={r.isLow ? 'inline-flex items-center gap-1 font-semibold text-warning' : ''}>
                      {r.isLow && <AlertTriangle className="size-3.5" />}
                      {formatQty(r.currentStock)} {r.unitSymbol ?? ''}
                    </span>
                  </TD>
                  <TD className="text-right text-muted-foreground">{formatQty(r.reorderLevel)}</TD>
                  <TD className="text-right">{formatINR(r.stockValue)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Stock adjustment"
        description="Correct stock for damage, expiry or a physical count. Use negative quantities to reduce."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onChange={(e) => setReason(e.target.value as StockAdjustmentInput['reason'])}>
              <option value="count_correction">Physical count correction</option>
              <option value="damage">Damage</option>
              <option value="expiry">Expiry</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div className="mt-4 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs">Item</Label>
                <Select value={l.itemId} onChange={(e) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, itemId: e.target.value } : x))}>
                  <option value="">Select…</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>)}
                </Select>
              </div>
              <div className="w-28 space-y-1.5"><Label className="text-xs">Qty (+/-)</Label><Input type="number" step="0.01" value={l.qtyDelta} onChange={(e) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, qtyDelta: e.target.value } : x))} /></div>
              <div className="w-28 space-y-1.5"><Label className="text-xs">Unit cost ₹</Label><Input type="number" step="0.01" value={l.unitCost} onChange={(e) => setLines((ls) => ls.map((x, idx) => idx === i ? { ...x, unitCost: e.target.value } : x))} /></div>
              <Button variant="ghost" size="icon" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { itemId: '', qtyDelta: '', unitCost: '' }])}><Plus /> Add item</Button>
        </div>
      </Dialog>
    </div>
  )
}
