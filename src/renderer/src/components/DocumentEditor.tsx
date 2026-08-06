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

interface PartyOpt { id: string; name: string; balance?: number; creditLimit?: number; creditDays?: number; billingStateCode?: string | null }
interface ItemOpt {
  id: string; name: string; sku: string; hsnCode: string | null
  sellingPrice: number; purchasePrice: number; marginBps: number; taxRateBps: number | null
  barcode?: string | null
  cutLength?: number; packing?: string | null
}
/**
 * What a saved purchase reports back, so the list screen can offer to print
 * stickers for exactly the goods that were just received.
 */
export interface SavedPurchase {
  id: string
  number: string
  docType: string
  labelLines: { itemId: string; copies: number }[]
}

interface LineRow {
  itemId: string
  batchNo: string
  expiryDate: string
  description: string
  hsnCode: string
  quantity: string // PCS
  cutLength: string // metres per piece (sales only)
  packing: string // e.g. BOX (sales only)
  unitPrice: string // rupees, per piece
  discount: string // rupees
  /** Purchase only: margin over the vendor's rate, as a percentage. */
  marginPct: string
  /** Purchase only: selling price (MRP) the margin produced, editable. */
  sellingPrice: string
  taxRateBps: number
}

const emptyLine: LineRow = { itemId: '', batchNo: '', expiryDate: '', description: '', hsnCode: '', quantity: '1', cutLength: '', packing: '', unitPrice: '', discount: '', marginPct: '', sellingPrice: '', taxRateBps: 0 }

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
  onSaved: (saved?: SavedPurchase) => void
}): JSX.Element {
  const isSales = mode === 'sales'
  const [parties, setParties] = useState<PartyOpt[]>([])
  const [items, setItems] = useState<ItemOpt[]>([])
  const [partyId, setPartyId] = useState('')
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [reference, setReference] = useState('')
  const [isInterState, setIsInterState] = useState(false)
  // The company's own GST state code, used to derive isInterState from the
  // selected party. Loaded once when the editor opens.
  const [companyStateCode, setCompanyStateCode] = useState<string | null>(null)
  // Set once the user overrides the checkbox by hand, so re-picking a party
  // does not silently undo their decision.
  const [interStateTouched, setInterStateTouched] = useState(false)
  const [notes, setNotes] = useState('')
  const [extraLabel, setExtraLabel] = useState('')
  const [extraCharges, setExtraCharges] = useState('')
  const [extraDiscount, setExtraDiscount] = useState('')
  const [lines, setLines] = useState<LineRow[]>([{ ...emptyLine }])
  const [saving, setSaving] = useState(false)

  // ---- Trade scheme + dispatch block (sales documents only) ----
  const [schemeLabel, setSchemeLabel] = useState('DISCOUNT')
  const [schemePct, setSchemePct] = useState('')
  /** Purchase only: flat rupee discount on the whole bill, before tax. */
  const [schemeAmountInput, setSchemeAmountInput] = useState('')
  /** Purchase only: batch / lot number for the whole consignment. */
  const [batchNo, setBatchNo] = useState('')
  /** Purchase only: settle the vendor's bill as it is entered. */
  const [pay, setPay] = useState({ amount: '', mode: 'cash', reference: '', discountPct: '', discountAmount: '' })
  /** Purchase only: barcode/SKU typed or scanned to add a line. */
  const [scan, setScan] = useState('')
  const [dispatch, setDispatch] = useState({
    challanNo: '', orderNo: '', agentName: '', consigneeName: '', consigneeGstin: '',
    lrNo: '', lrDate: '', transportName: '', transportStation: '', caseNo: '',
    weight: '', freight: '', ewayBillNo: '', transporterId: '', dueDays: ''
  })
  const setD = (k: keyof typeof dispatch) => (e: { target: { value: string } }): void =>
    setDispatch((d) => ({ ...d, [k]: e.target.value }))

  const reset = useCallback(() => {
    setPartyId('')
    setIssueDate(new Date().toISOString().slice(0, 10))
    setDueDate('')
    setReference('')
    setSchemeAmountInput('')
    setBatchNo('')
    setPay({ amount: '', mode: 'cash', reference: '', discountPct: '', discountAmount: '' })
    setScan('')
    setIsInterState(false)
    setInterStateTouched(false)
    setNotes('')
    setExtraLabel('')
    setExtraCharges('')
    setExtraDiscount('')
    setLines([{ ...emptyLine }])
    setSchemeLabel('DISCOUNT')
    setSchemePct('')
    setDispatch({
      challanNo: '', orderNo: '', agentName: '', consigneeName: '', consigneeGstin: '',
      lrNo: '', lrDate: '', transportName: '', transportStation: '', caseNo: '',
      weight: '', freight: '', ewayBillNo: '', transporterId: '', dueDays: ''
    })
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
        try {
          const ctx = await invoke<{ companyStateCode: string | null }>('app:context')
          setCompanyStateCode(ctx.companyStateCode)
        } catch {
          // Without it the checkbox simply stays manual.
        }
        if (editId) {
          const doc = await invoke<any>(isSales ? 'sales:get' : 'purchases:get', { id: editId })
          if (doc) {
            setPartyId(doc.partyId)
            setIssueDate(new Date(doc.issueDate).toISOString().slice(0, 10))
            setDueDate(doc.dueDate ? new Date(doc.dueDate).toISOString().slice(0, 10) : '')
            setReference(doc.referenceNo ?? doc.supplierInvoiceNo ?? '')
            if (!isSales) {
              setSchemePct(doc.schemePct ? String(doc.schemePct / 100) : '')
              setSchemeAmountInput(doc.schemeAmount ? String(toRupees(doc.schemeAmount)) : '')
              setBatchNo(doc.batchNo ?? '')
            }
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
                cutLength: l.cutLength ? String(l.cutLength) : '',
                packing: l.packing ?? '',
                unitPrice: String(toRupees(l.unitPrice)),
                discount: l.discountAmount ? String(toRupees(l.discountAmount)) : '',
                taxRateBps: l.taxRateBps
              }))
            )
            if (isSales) {
              setSchemeLabel(doc.schemeLabel ?? 'DISCOUNT')
              setSchemePct(doc.schemePct ? String(doc.schemePct / 100) : '')
              setDispatch({
                challanNo: doc.challanNo ?? '',
                orderNo: doc.orderNo ?? '',
                agentName: doc.agentName ?? '',
                consigneeName: doc.consigneeName ?? '',
                consigneeGstin: doc.consigneeGstin ?? '',
                lrNo: doc.lrNo ?? '',
                lrDate: doc.lrDate ? new Date(doc.lrDate).toISOString().slice(0, 10) : '',
                transportName: doc.transportName ?? '',
                transportStation: doc.transportStation ?? '',
                caseNo: doc.caseNo ?? '',
                weight: doc.weight ? String(doc.weight) : '',
                freight: doc.freight ? String(toRupees(doc.freight)) : '',
                ewayBillNo: doc.ewayBillNo ?? '',
                transporterId: doc.transporterId ?? '',
                dueDays: doc.dueDays ? String(doc.dueDays) : ''
              })
            }
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
    taxRateBps: l.taxRateBps,
    cutLength: Number(l.cutLength || 0)
  }))
  const schemeBps = Math.round(Number(schemePct || 0) * 100)
  const { lines: computed, totals } = computeDocument(lineInputs, isInterState, {
    extraCharges: toPaise(extraCharges || '0'),
    extraDiscount: toPaise(extraDiscount || '0'),
    schemePct: schemeBps,
    // Purchases may also carry a flat rupee discount on the whole bill.
    schemeAmount: isSales ? 0 : toPaise(schemeAmountInput || '0')
  })

  // Credit-limit warning (sales only): projected outstanding vs the party's limit.
  const selectedParty = parties.find((p) => p.id === partyId)
  const creditWarning =
    isSales && selectedParty && (selectedParty.creditLimit ?? 0) > 0 && !editId
      ? (selectedParty.balance ?? 0) + totals.grandTotal > (selectedParty.creditLimit ?? 0)
      : false

  function onPartyChange(id: string): void {
    setPartyId(id)
    const p = parties.find((x) => x.id === id)

    // Derive the GST treatment from the two state codes, exactly as the POS
    // does. Leaving this to the user meant an inter-state bill raised here
    // silently charged CGST+SGST instead of IGST. Skipped once the user has
    // set the checkbox themselves, and on an existing document.
    if (!interStateTouched && !editId && companyStateCode && p?.billingStateCode) {
      setIsInterState(p.billingStateCode !== companyStateCode)
    }

    // Default a due date from the party's credit days (sales), if not already set.
    if (isSales && p?.creditDays && p.creditDays > 0 && !dueDate) {
      const d = new Date(issueDate)
      d.setDate(d.getDate() + p.creditDays)
      setDueDate(d.toISOString().slice(0, 10))
    }
  }

  function setLine(i: number, patch: Partial<LineRow>): void {
    setLines((ls) =>
      ls.map((l, idx) => {
        if (idx !== i) return l
        const next = { ...l, ...patch }
        // Changing the vendor's rate re-prices the line at the same margin, so
        // a buyer types the new rate and the MRP follows without being redone
        // by hand. Only on purchases, and only when a margin is actually set.
        if (!isSales && patch.unitPrice !== undefined && next.marginPct !== '') {
          next.sellingPrice = sellingFromMargin(next.unitPrice, next.marginPct)
        }
        return next
      })
    )
  }

  /**
   * Selling price from the purchase rate and a margin.
   *
   * Rate 4560 with a 45% margin gives 6612. The result is only a starting
   * point: the shop rounds it to 6615 or 6620 by typing over the MRP box, and
   * whatever is left there is what gets saved.
   */
  function sellingFromMargin(rate: string, marginPct: string): string {
    const r = Number(rate || 0)
    const m = Number(marginPct || 0)
    if (!r || Number.isNaN(r) || Number.isNaN(m)) return ''
    return (Math.round(r * (1 + m / 100) * 100) / 100).toFixed(2)
  }

  /**
   * Add a scanned design to the purchase, or bump the quantity if it is already
   * on the bill — the same behaviour as the counter, so goods-in can be done
   * with the scanner rather than the keyboard.
   */
  async function addByScan(): Promise<void> {
    const code = scan.trim()
    if (!code) return
    setScan('')
    const hit =
      items.find((x) => (x.barcode ?? '') === code) ??
      items.find((x) => x.sku.toLowerCase() === code.toLowerCase())
    if (!hit) {
      toast.error(`No item found for "${code}".`)
      return
    }
    setLines((ls) => {
      const at = ls.findIndex((l) => l.itemId === hit.id)
      if (at >= 0) {
        return ls.map((l, i) =>
          i === at ? { ...l, quantity: String((Number(l.quantity || 0) || 0) + 1) } : l
        )
      }
      // Fill the first blank row if there is one, else append.
      const blank = ls.findIndex((l) => !l.itemId && !l.description.trim())
      const margin = hit.marginBps ? String(hit.marginBps / 100) : ''
      const row: LineRow = {
        ...emptyLine,
        itemId: hit.id,
        description: hit.name,
        hsnCode: hit.hsnCode ?? '',
        quantity: '1',
        unitPrice: String(toRupees(hit.purchasePrice)),
        marginPct: margin,
        sellingPrice: hit.sellingPrice ? String(toRupees(hit.sellingPrice)) : '',
        taxRateBps: hit.taxRateBps ?? 0
      }
      return blank >= 0 ? ls.map((l, i) => (i === blank ? row : l)) : [...ls, row]
    })
  }

  function setMargin(i: number, marginPct: string): void {
    setLines((ls) =>
      ls.map((l, idx) =>
        idx === i ? { ...l, marginPct, sellingPrice: sellingFromMargin(l.unitPrice, marginPct) } : l
      )
    )
  }
  function onPickItem(i: number, itemId: string): void {
    const it = items.find((x) => x.id === itemId)
    if (!it) return setLine(i, { itemId: '' })
    // On a purchase, reopen the item at what it was bought and priced at last
    // time — rate, margin and MRP together — so a repeat purchase needs only
    // the quantity typed unless something has changed.
    const lastRate = toRupees(it.purchasePrice)
    const lastMargin = it.marginBps ? String(it.marginBps / 100) : ''
    setLine(i, {
      itemId,
      description: it.name,
      hsnCode: it.hsnCode ?? '',
      unitPrice: String(toRupees(isSales ? it.sellingPrice : it.purchasePrice)),
      ...(isSales
        ? {}
        : {
            marginPct: lastMargin,
            sellingPrice: it.sellingPrice ? String(toRupees(it.sellingPrice)) : sellingFromMargin(String(lastRate), lastMargin)
          }),
      taxRateBps: it.taxRateBps ?? 0,
      // Carry the item's cut/packing so MTS is right without extra typing.
      cutLength: it.cutLength ? String(it.cutLength) : '',
      packing: it.packing ?? ''
    })
  }

  /**
   * Cash discount in paise, from whichever box the buyer used.
   *
   * Vendors offer it either way — "2% for paying today" or "knock off 500" —
   * so both boxes exist and the percentage is taken on the bill total.
   */
  const payDiscountPaise = (() => {
    const pct = Number(pay.discountPct || 0)
    const flat = toPaise(pay.discountAmount || '0')
    const fromPct = pct > 0 ? Math.round((totals.grandTotal * pct) / 100) : 0
    return Math.max(0, Math.min(totals.grandTotal, fromPct + flat))
  })()

  async function save(): Promise<void> {
    let savedPurchase: SavedPurchase | null = null
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
          schemeLabel: schemeLabel || null,
          schemePct: schemeBps,
          challanNo: dispatch.challanNo || null,
          orderNo: dispatch.orderNo || null,
          agentName: dispatch.agentName || null,
          consigneeName: dispatch.consigneeName || null,
          consigneeGstin: dispatch.consigneeGstin || null,
          lrNo: dispatch.lrNo || null,
          lrDate: dispatch.lrDate ? new Date(dispatch.lrDate).getTime() : null,
          transportName: dispatch.transportName || null,
          transportStation: dispatch.transportStation || null,
          caseNo: dispatch.caseNo || null,
          weight: Number(dispatch.weight || 0),
          freight: toPaise(dispatch.freight || '0'),
          ewayBillNo: dispatch.ewayBillNo || null,
          transporterId: dispatch.transporterId || null,
          dueDays: Number(dispatch.dueDays || 0),
          notes: notes || null,
          termsAndConditions: null,
          // Sales lines additionally carry the textile presentation fields.
          lines: lines.map((l, i) => ({
            ...baseLines[i],
            cutLength: Number(l.cutLength || 0),
            packing: l.packing || null
          }))
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
          // The vendor's bill-level discount, taken off before GST.
          schemePct: schemeBps,
          schemeAmount: toPaise(schemeAmountInput || '0'),
          batchNo: batchNo || null,
          notes: notes || null,
          // Purchase lines carry the repricing done at goods-in: the margin
          // applied over the vendor's rate and the selling price it produced.
          lines: lines.map((l, i) => ({
            ...baseLines[i],
            marginBps: Math.round(Number(l.marginPct || 0) * 100),
            sellingPrice: toPaise(l.sellingPrice || '0')
          }))
        }
        const saved = await invoke<{ id: string; number: string }>('purchases:save', payload)

        // Settle the vendor's bill from the same screen. A failure here must
        // not lose the purchase that already saved, so it is reported on its
        // own rather than rolling the whole thing back.
        const payAmount = toPaise(pay.amount || '0')
        const cashDiscount = payDiscountPaise
        if (payAmount > 0) {
          try {
            await invoke('payments:record', {
              direction: 'outbound',
              partyId,
              amount: payAmount,
              paidAt: issueMs,
              mode: pay.mode,
              referenceNo: pay.reference || null,
              bankAccount: null,
              notes: null,
              cashDiscount,
              allocations: [
                {
                  refType: 'purchase',
                  documentId: saved.id,
                  amount: Math.min(payAmount + cashDiscount, totals.grandTotal)
                }
              ]
            })
          } catch (err) {
            toast.error(
              `Purchase ${saved.number} saved, but the payment was not recorded: ` +
                (err instanceof ApiError ? err.message : 'unknown error')
            )
          }
        }
        savedPurchase = {
          id: saved.id,
          number: saved.number,
          docType,
          // One sticker per piece received, which is what goods-in needs.
          labelLines: lines
            .filter((l) => l.itemId && Number(l.quantity || 0) > 0)
            .map((l) => ({ itemId: l.itemId, copies: Math.max(1, Math.round(Number(l.quantity))) }))
        }
      }
      toast.success('Saved.')
      onSaved(savedPurchase ?? undefined)
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
        {!isSales && (
          <div className="space-y-1.5">
            <Label>Batch / Lot no</Label>
            <Input
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              placeholder="Whole consignment"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label>{isSales ? 'Reference / PO no' : 'Supplier invoice no'}</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isInterState}
          onChange={(e) => {
            setInterStateTouched(true)
            setIsInterState(e.target.checked)
          }}
          className="size-4"
        />
        Inter-state supply (IGST instead of CGST + SGST)
      </label>

      {creditWarning && selectedParty && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm text-warning">
          <span>⚠ This will exceed {selectedParty.name}'s credit limit of {formatINR(selectedParty.creditLimit ?? 0)} (current outstanding {formatINR(selectedParty.balance ?? 0)}).</span>
        </div>
      )}

      {!isSales && (
        <div className="mt-4 max-w-md space-y-1.5">
          <Label>Scan barcode</Label>
          <Input
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== 'Tab') return
              e.preventDefault()
              void addByScan()
            }}
            placeholder="Scan or type a barcode / SKU, then press Enter"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Scanning the same design again adds one more to its quantity.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
              <th className="p-2 text-left">Item / Description</th>
              <th className="p-2 text-right">{isSales ? 'Pcs' : 'Qty'}</th>
              {isSales && <th className="p-2 text-right">Cut</th>}
              {isSales && <th className="p-2 text-right">Mts</th>}
              <th className="p-2 text-right">Rate</th>
              <th className="p-2 text-right">Disc</th>
              {!isSales && <th className="p-2 text-right" title="Margin over the purchase rate">Margin%</th>}
              {!isSales && <th className="p-2 text-right" title="Selling price / MRP, inclusive of tax">MRP</th>}
              <th className="p-2 text-right">Tax%</th>
              <th className="p-2 text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="p-1.5">
                  {isSales ? (
                    <Select value={l.itemId} onChange={(e) => onPickItem(i, e.target.value)} className="mb-1 h-8 text-xs">
                      <option value="">— custom —</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.sku})</option>)}
                    </Select>
                  ) : (
                    <ItemSearch
                      items={items}
                      value={l.itemId}
                      onPick={(id) => onPickItem(i, id)}
                      onClear={() => setLine(i, { itemId: '' })}
                    />
                  )}
                  <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description" className="h-8" />
                  <div className="mt-1 flex gap-1">
                    <Input value={l.batchNo} onChange={(e) => setLine(i, { batchNo: e.target.value })} placeholder="Batch (optional)" className="h-7 text-xs" />
                    <Input type="date" value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} title="Expiry" className="h-7 w-32 text-xs" />
                    {isSales && (
                      <Input value={l.packing} onChange={(e) => setLine(i, { packing: e.target.value })} placeholder="Packing" title="Packing (e.g. BOX)" className="h-7 w-24 text-xs" />
                    )}
                  </div>
                </td>
                <td className="p-1.5 w-20"><Input className="h-8 text-right" type="number" step="0.01" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                {isSales && (
                  <td className="p-1.5 w-20">
                    <Input className="h-8 text-right" type="number" step="0.01" placeholder="6.30" value={l.cutLength} onChange={(e) => setLine(i, { cutLength: e.target.value })} />
                  </td>
                )}
                {isSales && (
                  <td className="p-1.5 w-20 text-right text-muted-foreground tabular-nums">
                    {computed[i]?.metres ? computed[i].metres.toFixed(2) : '—'}
                  </td>
                )}
                <td className="p-1.5 w-28"><Input className="h-8 text-right" type="number" step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} /></td>
                <td className="p-1.5 w-24"><Input className="h-8 text-right" type="number" step="0.01" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} /></td>
                {!isSales && (
                  <td className="p-1.5 w-24">
                    <Input
                      className="h-8 text-right" type="number" step="0.01" placeholder="45"
                      value={l.marginPct}
                      onChange={(e) => setMargin(i, e.target.value)}
                    />
                  </td>
                )}
                {!isSales && (
                  <td className="p-1.5 w-28">
                    <Input
                      className="h-8 text-right font-medium" type="number" step="0.01" placeholder="0.00"
                      value={l.sellingPrice}
                      onChange={(e) => setLine(i, { sellingPrice: e.target.value })}
                      title="Selling price / MRP. Calculated from the margin, but you can overwrite it."
                    />
                  </td>
                )}
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

        {isSales && (
          <div className="grid w-80 grid-cols-2 gap-2">
            <div className="col-span-2 text-xs font-medium uppercase text-muted-foreground">
              Scheme / discount (applied before GST)
            </div>
            <Input placeholder="Label (DISCOUNT / SCHEME)" value={schemeLabel} onChange={(e) => setSchemeLabel(e.target.value)} className="h-9" />
            <Input type="number" step="0.01" placeholder="%" value={schemePct} onChange={(e) => setSchemePct(e.target.value)} className="h-9 text-right" />
          </div>
        )}

        {!isSales && (
          <div className="grid w-80 grid-cols-2 gap-2">
            <div className="col-span-2 mt-2 text-xs font-medium uppercase text-muted-foreground">
              Pay the vendor now (optional)
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount paid (₹)</Label>
              <Input
                type="number" step="0.01" placeholder="0.00"
                value={pay.amount} onChange={(e) => setPay((v) => ({ ...v, amount: e.target.value }))}
                className="h-9 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mode</Label>
              <Select value={pay.mode} onChange={(e) => setPay((v) => ({ ...v, mode: e.target.value }))} className="h-9">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Reference / UTR / Cheque no</Label>
              <Input value={pay.reference} onChange={(e) => setPay((v) => ({ ...v, reference: e.target.value }))} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cash discount %</Label>
              <Input
                type="number" step="0.01" placeholder="0"
                value={pay.discountPct} onChange={(e) => setPay((v) => ({ ...v, discountPct: e.target.value }))}
                className="h-9 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">or amount (₹)</Label>
              <Input
                type="number" step="0.01" placeholder="0.00"
                value={pay.discountAmount} onChange={(e) => setPay((v) => ({ ...v, discountAmount: e.target.value }))}
                className="h-9 text-right"
              />
            </div>
            {payDiscountPaise > 0 && (
              <p className="col-span-2 text-xs text-muted-foreground">
                Settles {formatINR(toPaise(pay.amount || '0') + payDiscountPaise)} of the bill for{' '}
                {formatINR(toPaise(pay.amount || '0'))} paid — {formatINR(payDiscountPaise)} written off as cash discount.
              </p>
            )}

            <div className="col-span-2 mt-3 text-xs font-medium uppercase text-muted-foreground">
              Discount on the whole bill (before GST)
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Discount %</Label>
              <Input
                type="number" step="0.01" placeholder="0"
                value={schemePct} onChange={(e) => setSchemePct(e.target.value)}
                className="h-9 text-right"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">or amount (₹)</Label>
              <Input
                type="number" step="0.01" placeholder="0.00"
                value={schemeAmountInput} onChange={(e) => setSchemeAmountInput(e.target.value)}
                className="h-9 text-right"
              />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              GST is charged on the amount left after this discount. Use either box, or both.
            </p>
          </div>
        )}

        <div className="w-64 space-y-1 text-sm">
          <Row label={isSales ? `Sub total (${totals.totalPcs} pcs, ${totals.totalMetres} mts)` : 'Subtotal'} value={formatINR(totals.subTotal)} />
          {totals.discountTotal > 0 && <Row label="Discount" value={`- ${formatINR(totals.discountTotal)}`} />}
          {totals.schemeAmount > 0 && (
            <Row label={`${schemeLabel || 'DISCOUNT'} @ ${Number(schemePct)}%`} value={`- ${formatINR(totals.schemeAmount)}`} />
          )}
          {totals.schemeAmount > 0 && <Row label="Taxable value" value={formatINR(totals.taxableValue)} />}
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

      {isSales && (
        <details className="mt-4 rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Dispatch &amp; transport details (printed on the bill)
          </summary>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <Field label="Challan no"><Input value={dispatch.challanNo} onChange={setD('challanNo')} /></Field>
            <Field label="Order no"><Input value={dispatch.orderNo} onChange={setD('orderNo')} /></Field>
            <Field label="Agent"><Input value={dispatch.agentName} onChange={setD('agentName')} /></Field>
            <Field label="Due days"><Input type="number" value={dispatch.dueDays} onChange={setD('dueDays')} /></Field>

            <Field label="Consignee"><Input value={dispatch.consigneeName} onChange={setD('consigneeName')} /></Field>
            <Field label="Consignee GSTIN"><Input value={dispatch.consigneeGstin} onChange={setD('consigneeGstin')} /></Field>
            <Field label="L.R. no"><Input value={dispatch.lrNo} onChange={setD('lrNo')} /></Field>
            <Field label="L.R. date"><Input type="date" value={dispatch.lrDate} onChange={setD('lrDate')} /></Field>

            <Field label="Transport"><Input value={dispatch.transportName} onChange={setD('transportName')} /></Field>
            <Field label="Station"><Input value={dispatch.transportStation} onChange={setD('transportStation')} /></Field>
            <Field label="Case no"><Input value={dispatch.caseNo} onChange={setD('caseNo')} placeholder="37x1" /></Field>
            <Field label="Weight"><Input type="number" step="0.001" value={dispatch.weight} onChange={setD('weight')} /></Field>

            <Field label="Freight ₹"><Input type="number" step="0.01" value={dispatch.freight} onChange={setD('freight')} /></Field>
            <Field label="E-Way bill no"><Input value={dispatch.ewayBillNo} onChange={setD('ewayBillNo')} /></Field>
            <Field label="Transporter ID"><Input value={dispatch.transporterId} onChange={setD('transporterId')} /></Field>
          </div>
        </details>
      )}

      <div className="mt-4 space-y-1.5">
        <Label>Notes</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span><span className="text-foreground">{value}</span>
    </div>
  )
}

/**
 * Type-to-find item picker, used on the purchase form.
 *
 * A dropdown is fine with twenty designs and unusable with two thousand — a
 * buyer knows the design name or the SKU and wants to type three letters, not
 * scroll. Matches on name, SKU or barcode, and Enter takes the top hit so the
 * whole line can be entered from the keyboard.
 */
function ItemSearch({
  items,
  value,
  onPick,
  onClear
}: {
  items: ItemOpt[]
  value: string
  onPick: (id: string) => void
  onClear: () => void
}): JSX.Element {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const picked = items.find((x) => x.id === value)

  const matches = (() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 8)
    return items
      .filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          x.sku.toLowerCase().includes(q) ||
          (x.barcode ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  })()

  if (picked) {
    return (
      <div className="mb-1 flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs">
        <span className="truncate font-medium">{picked.name}</span>
        <span className="shrink-0 font-mono text-muted-foreground">{picked.sku}</span>
        <button
          type="button"
          className="ml-auto shrink-0 rounded px-1 text-muted-foreground hover:text-foreground"
          title="Choose a different item"
          onClick={() => { onClear(); setQuery(''); setOpen(true) }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="relative mb-1">
      <Input
        className="h-8 text-xs"
        placeholder="Search item name, SKU or barcode"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) {
            e.preventDefault()
            onPick(matches[0].id)
            setOpen(false)
          }
        }}
      />
      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {matches.map((it) => (
            <button
              key={it.id}
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onPick(it.id); setOpen(false) }}
            >
              <span className="truncate font-medium">{it.name}</span>
              <span className="ml-auto shrink-0 font-mono text-muted-foreground">{it.sku}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
