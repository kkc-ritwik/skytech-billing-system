import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { computeDocument, type LineInput } from '@shared/calc'
import { formatINR, toPaise, toRupees } from '@renderer/lib/format'
import type { SalesDocInput, PurchaseDocInput } from '@shared/dto'
import { Dialog } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'

interface PartyOpt { id: string; name: string; balance?: number; creditLimit?: number; creditDays?: number }
interface ItemOpt {
  id: string; name: string; sku: string; hsnCode: string | null
  sellingPrice: number; purchasePrice: number; taxRateBps: number | null
}
interface LineRow {
  itemId: string
  batchNo: string
  expiryDate: string
  description: string
  hsnCode: string
  quantity: string
  unitPrice: string // rupees
  discount: string // rupees
  taxRateBps: number
}

const emptyLine: LineRow = { itemId: '', batchNo: '', expiryDate: '', description: '', hsnCode: '', quantity: '1', unitPrice: '', discount: '', taxRateBps: 0 }

export function DocumentEditor({
  mode,
  docType,
  editId,
  open,
  onClose,
  onSaved
}: {
  mode: 'sales' | 'purchase'
  docType: string
  editId?: string
  open: boolean
  onClose: () => void
  onSaved: () => void
}): JSX.Element {
  const isSales = mode === 'sales'
  const [parties, setParties] = useState<PartyOpt[]>([])
  const [items, setItems] = useState<ItemOpt[]>([])
  const [partyId, setPartyId] = useState('')
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  const [isInterState, setIsInterState] = useState(false)
  const [notes, setNotes] = useState('')
  const [extraLabel, setExtraLabel] = useState('')
  const [extraCharges, setExtraCharges] = useState('')
  const [extraDiscount, setExtraDiscount] = useState('')
  const [lines, setLines] = useState<LineRow[]>([{ ...emptyLine }])
  const [saving, setSaving] = useState(false)

  const reset = useCallback(() => {
    setPartyId('')
    setIssueDate(new Date().toISOString().slice(0, 10))
    setDueDate('')
    setReference('')
    setIsInterState(false)
    setNotes('')
    setExtraLabel('')
    setExtraCharges('')
    setExtraDiscount('')
    setLines([{ ...emptyLine }])
  }, [])

  useEffect(() => {
    if (!open) return
    void (async () => {
      try {
        const [pp, ii] = await Promise.all([
          invoke<PartyOpt[]>('parties:list', { partyType: isSales ? 'customer' : 'vendor', activeOnly: true }),
          invoke<ItemOpt[]>('items:list', { activeOnly: true })
        ])
        setParties(pp)
        setItems(ii)
        if (editId) {
          const doc = await invoke<any>(isSales ? 'sales:get' : 'purchases:get', { id: editId })
          if (doc) {
            setPartyId(doc.partyId)
            setIssueDate(new Date(doc.issueDate).toISOString().slice(0, 10))
            setDueDate(doc.dueDate ? new Date(doc.dueDate).toISOString().slice(0, 10) : '')
            setReference(doc.referenceNo ?? doc.supplierInvoiceNo ?? '')
            setIsInterState(!!doc.isInterState)
            setNotes(doc.notes ?? '')
            setExtraLabel(doc.extraChargesLabel ?? '')
            setExtraCharges(doc.extraCharges ? String(toRupees(doc.extraCharges)) : '')
            setExtraDiscount(doc.extraDiscount ? String(toRupees(doc.extraDiscount)) : '')
            setLines(
              doc.lines.map((l: any) => ({
                itemId: l.itemId ?? '',
                batchNo: l.batchNo ?? '',
                expiryDate: l.expiryDate ? new Date(l.expiryDate).toISOString().slice(0, 10) : '',
                description: l.description,
                hsnCode: l.hsnCode ?? '',
                quantity: String(l.quantity),
                unitPrice: String(toRupees(l.unitPrice)),
                discount: l.discountAmount ? String(toRupees(l.discountAmount)) : '',
                taxRateBps: l.taxRateBps
              }))
            )
          }
        } else {
          reset()
        }
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to load editor.')
      }
    })()
  }, [open, editId, isSales, reset])

  const lineInputs: LineInput[] = lines.map((l) => ({
    quantity: Number(l.quantity || 0),
    unitPrice: toPaise(l.unitPrice || '0'),
    discountAmount: toPaise(l.discount || '0'),
    discountPct: 0,
    taxRateBps: l.taxRateBps
  }))
  const { lines: computed, totals } = computeDocument(lineInputs, isInterState, {
    extraCharges: toPaise(extraCharges || '0'),
    extraDiscount: toPaise(extraDiscount || '0')
  })

  // Credit-limit warning (sales only): projected outstanding vs the party's limit.
  const selectedParty = parties.find((p) => p.id === partyId)
  const creditWarning =
    isSales && selectedParty && (selectedParty.creditLimit ?? 0) > 0 && !editId
      ? (selectedParty.balance ?? 0) + totals.grandTotal > (selectedParty.creditLimit ?? 0)
      : false

  function onPartyChange(id: string): void {
    setPartyId(id)
    // Default a due date from the party's credit days (sales), if not already set.
    const p = parties.find((x) => x.id === id)
    if (isSales && p?.creditDays && p.creditDays > 0 && !dueDate) {
      const d = new Date(issueDate)
      d.setDate(d.getDate() + p.creditDays)
      setDueDate(d.toISOString().slice(0, 10))
    }
  }

  function setLine(i: number, patch: Partial<LineRow>): void {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function onPickItem(i: number, itemId: string): void {
    const it = items.find((x) => x.id === itemId)
    if (!it) return setLine(i, { itemId: '' })
    setLine(i, {
      itemId,
      description: it.name,
      hsnCode: it.hsnCode ?? '',
      unitPrice: String(toRupees(isSales ? it.sellingPrice : it.purchasePrice)),
      taxRateBps: it.taxRateBps ?? 0
    })
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const baseLines = lines.map((l) => ({
        itemId: l.itemId || null,
        description: l.description.trim(),
        hsnCode: l.hsnCode || null,
        batchNo: l.batchNo || null,
        expiryDate: l.expiryDate ? new Date(l.expiryDate).getTime() : null,
        quantity: Number(l.quantity || 0),
        unitPrice: toPaise(l.unitPrice || '0'),
        discountPct: 0,
        discountAmount: toPaise(l.discount || '0'),
        taxRateBps: l.taxRateBps
      }))
      const issueMs = new Date(issueDate).getTime()
      const dueMs = dueDate ? new Date(dueDate).getTime() : null
      const extras = {
        extraChargesLabel: extraLabel || null,
        extraCharges: toPaise(extraCharges || '0'),
        extraDiscount: toPaise(extraDiscount || '0')
      }
      if (isSales) {
        const payload: SalesDocInput = {
          id: editId,
          docType: docType as SalesDocInput['docType'],
          partyId,
          issueDate: issueMs,
          dueDate: dueMs,
          referenceNo: reference || null,
          isInterState,
          ...extras,
          notes: notes || null,
          termsAndConditions: null,
          lines: baseLines
        }
        await invoke('sales:save', payload)
      } else {
        const payload: PurchaseDocInput = {
          id: editId,
          docType: docType as PurchaseDocInput['docType'],
          partyId,
          issueDate: issueMs,
          dueDate: dueMs,
          supplierInvoiceNo: reference || null,
          isInterState,
          ...extras,
          notes: notes || null,
          lines: baseLines
        }
        await invoke('purchases:save', payload)
      }
      toast.success('Saved.')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editId ? 'Edit document' : 'New document'}
      className="max-w-4xl"
      footer={
        <>
          <div className="mr-auto text-sm text-muted-foreground">
            Grand total: <span className="text-lg font-bold text-foreground">{formatINR(totals.grandTotal)}</span>
          </div>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving || !partyId}>
            {saving && <Loader2 className="animate-spin" />} Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label>{isSales ? 'Client' : 'Vendor'} *</Label>
          <Select value={partyId} onChange={(e) => onPartyChange(e.target.value)}>
            <option value="">Select…</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Date</Label>
          <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>{isSales ? 'Reference / PO no' : 'Supplier invoice no'}</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isInterState} onChange={(e) => setIsInterState(e.target.checked)} className="size-4" />
        Inter-state supply (IGST instead of CGST + SGST)
      </label>

      {creditWarning && selectedParty && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm text-warning">
          <span>⚠ This will exceed {selectedParty.name}'s credit limit of {formatINR(selectedParty.creditLimit ?? 0)} (current outstanding {formatINR(selectedParty.balance ?? 0)}).</span>
        </div>
      )}

      <div className="mt-4 rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
              <th className="p-2 text-left">Item / Description</th>
              <th className="p-2 text-right">Qty</th>
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Disc</th>
              <th className="p-2 text-right">Tax%</th>
              <th className="p-2 text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-1.5">
                  <Select value={l.itemId} onChange={(e) => onPickItem(i, e.target.value)} className="mb-1 h-8 text-xs">
                    <option value="">— custom —</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>)}
                  </Select>
                  <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description" className="h-8" />
                  <div className="mt-1 flex gap-1">
                    <Input value={l.batchNo} onChange={(e) => setLine(i, { batchNo: e.target.value })} placeholder="Batch (optional)" className="h-7 text-xs" />
                    <Input type="date" value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} title="Expiry" className="h-7 w-32 text-xs" />
                  </div>
                </td>
                <td className="p-1.5 w-20"><Input className="h-8 text-right" type="number" step="0.01" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                <td className="p-1.5 w-28"><Input className="h-8 text-right" type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                <td className="p-1.5 w-24"><Input className="h-8 text-right" type="number" step="0.01" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} /></td>
                <td className="p-1.5 w-20">
                  <Select className="h-8 text-right" value={String(l.taxRateBps)} onChange={(e) => setLine(i, { taxRateBps: Number(e.target.value) })}>
                    {[0, 500, 1200, 1800, 2800].map((b) => <option key={b} value={b}>{b / 100}%</option>)}
                  </Select>
                </td>
                <td className="p-1.5 text-right font-medium">{formatINR(computed[i]?.lineTotal ?? 0)}</td>
                <td className="p-1.5">
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls)}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-2">
          <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { ...emptyLine }])}>
            <Plus /> Add line
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-between gap-4">
        <div className="grid w-80 grid-cols-2 gap-2">
          <div className="col-span-2 text-xs font-medium uppercase text-muted-foreground">Additional charges / discount</div>
          <Input placeholder="Charge label (e.g. Freight)" value={extraLabel} onChange={(e) => setExtraLabel(e.target.value)} className="h-9" />
          <Input type="number" step="0.01" placeholder="Charge ₹" value={extraCharges} onChange={(e) => setExtraCharges(e.target.value)} className="h-9 text-right" />
          <div className="text-sm text-muted-foreground">Discount ₹</div>
          <Input type="number" step="0.01" placeholder="0.00" value={extraDiscount} onChange={(e) => setExtraDiscount(e.target.value)} className="h-9 text-right" />
        </div>

        <div className="w-64 space-y-1 text-sm">
          <Row label="Subtotal" value={formatINR(totals.subTotal)} />
          {totals.discountTotal > 0 && <Row label="Discount" value={`- ${formatINR(totals.discountTotal)}`} />}
          {isInterState ? (
            <Row label="IGST" value={formatINR(totals.igstTotal)} />
          ) : (
            <>
              <Row label="CGST" value={formatINR(totals.cgstTotal)} />
              <Row label="SGST" value={formatINR(totals.sgstTotal)} />
            </>
          )}
          {totals.extraCharges > 0 && <Row label={extraLabel || 'Additional charges'} value={formatINR(totals.extraCharges)} />}
          {totals.extraDiscount > 0 && <Row label="Additional discount" value={`- ${formatINR(totals.extraDiscount)}`} />}
          {totals.roundOff !== 0 && <Row label="Round off" value={formatINR(totals.roundOff)} />}
          <div className="flex justify-between border-t pt-1 text-base font-bold">
            <span>Grand Total</span><span>{formatINR(totals.grandTotal)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span><span className="text-foreground">{value}</span>
    </div>
  )
}
