import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, ScanLine, Trash2, Receipt, Plus, Minus, AlertTriangle, UserPlus } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { useApp } from '@renderer/store/app'
import { formatINR, toPaise, toRupees } from '@renderer/lib/format'
import { computeDocument } from '@shared/calc'
import { normaliseScan } from '@shared/barcode'
import type { SalesDocInput } from '@shared/dto'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'
import { Dialog } from '@renderer/components/ui/dialog'

interface ScanResult {
  id: string
  sku: string
  name: string
  barcode: string | null
  hsnCode: string | null
  sellingPrice: number
  taxRateBps: number
  cutLength: number
  packing: string | null
  trackInventory: boolean
  stockOnHand: number
}

/**
 * GST slabs a garment shop actually uses. The line opens on the item's own
 * rate; this list is only what the counter may switch it to.
 */
const GST_RATES = [0, 500, 1200, 1800, 2800] as const

interface PartyOpt {
  id: string
  name: string
  gstin: string | null
  billingStateCode: string | null
  phone?: string | null
}

interface CartLine {
  itemId: string
  sku: string
  description: string
  hsnCode: string | null
  packing: string | null
  quantity: number
  cutLength: number
  unitPrice: number // paise, per piece
  taxRateBps: number
  stockOnHand: number
  trackInventory: boolean
}

/**
 * Counter screen. A barcode scanner behaves as a keyboard that types the code
 * and presses Enter, so the scan box is a plain focused input — no driver, no
 * serial port. Scanning a code already in the cart increments its PCS rather
 * than adding a duplicate row, which is what makes repeat-scanning a stack of
 * pieces work naturally.
 */
export function PosPage(): JSX.Element {
  const canCreate = useApp((s) => s.has('sales:create'))

  // The company's state code decides IGST vs CGST/SGST. It is not in the app
  // store, so the counter screen loads it once alongside the customer list.
  const [companyStateCode, setCompanyStateCode] = useState<string | null>(null)

  const [scan, setScan] = useState('')
  const [lines, setLines] = useState<CartLine[]>([])
  const [parties, setParties] = useState<PartyOpt[]>([])
  const [partyId, setPartyId] = useState('')
  const [custOpen, setCustOpen] = useState(false)
  const [custSaving, setCustSaving] = useState(false)
  const [cust, setCust] = useState({ name: '', mobile: '', address: '', dob: '', anniversary: '' })
  /** The customer this mobile number already belongs to, if any. */
  const [custFound, setCustFound] = useState<PartyOpt | null>(null)
  /** Walk-in who will not give a number: billed as a cash customer. */
  const [custIsCash, setCustIsCash] = useState(false)
  const [salespersons, setSalespersons] = useState<{ id: string; name: string }[]>([])
  const [salespersonId, setSalespersonId] = useState('')
  /** Money collected at the counter, split across however many modes were used. */
  const [payOpen, setPayOpen] = useState(false)
  const [tender, setTender] = useState({ cash: '', upi: '', card: '', other: '' })
  const [cashGiven, setCashGiven] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const [schemeLabel, setSchemeLabel] = useState('DISCOUNT')
  const [schemePct, setSchemePct] = useState('0')
  // Transport and case number are wholesale dispatch details. A counter sale is
  // handed over there and then, so the retail bill carries neither.

  const scanRef = useRef<HTMLInputElement>(null)

  // Keep focus in the scan box: a scanner types wherever the caret happens to
  // be, so losing focus silently sends barcodes into some other field.
  const refocus = useCallback(() => scanRef.current?.focus(), [])

  useEffect(() => {
    void (async () => {
      try {
        const rows = await invoke<PartyOpt[]>('parties:list', { partyType: 'customer' })
        try {
          setSalespersons(await invoke<{ id: string; name: string }[]>('salespersons:list', { activeOnly: true }))
        } catch {
          /* a shop that keeps no salespeople simply sees an empty list */
        }
        setParties(rows)
        if (rows.length && !partyId) setPartyId(rows[0].id)
      } catch {
        /* the picker simply stays empty */
      }
      try {
        const ctx = await invoke<{
          companyStateCode: string | null
          defaultSchemeLabel: string
          defaultSchemePct: number
          defaultTransportName: string | null
        }>('app:context')
        setCompanyStateCode(ctx.companyStateCode)
        setSchemeLabel(ctx.defaultSchemeLabel)
        setSchemePct(String(ctx.defaultSchemePct / 100))
      } catch (err) {
        // Without the state code we cannot tell IGST from CGST/SGST, so say so
        // rather than quietly billing the wrong tax.
        toast.error(err instanceof ApiError ? err.message : 'Could not load counter settings.')
      }
      refocus()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const party = parties.find((p) => p.id === partyId) ?? null
  const isInterState = !!(party?.billingStateCode && companyStateCode && party.billingStateCode !== companyStateCode)

  const { totals } = useMemo(
    () =>
      computeDocument(
        lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRateBps: l.taxRateBps,
          cutLength: l.cutLength
        })),
        isInterState,
        { schemePct: Math.round(Number(schemePct || 0) * 100) }
      ),
    [lines, isInterState, schemePct]
  )

  /**
   * Resolve a scanned/typed code and fold it into the cart.
   *
   * The box is cleared by the caller BEFORE this runs, never here: a scanner
   * can fire the next barcode while this lookup is still in flight, and
   * clearing afterwards would wipe those freshly typed characters.
   */
  const addByCode = useCallback(async (raw: string) => {
    const code = normaliseScan(raw)
    if (!code) return
    setBusy(true)
    try {
      const found = await invoke<ScanResult | null>('barcode:scan', { code })
      if (!found) {
        toast.error(`No item matches "${code}".`)
        return
      }
      setLines((prev) => {
        const at = prev.findIndex((l) => l.itemId === found.id)
        if (at >= 0) {
          const next = [...prev]
          next[at] = { ...next[at], quantity: next[at].quantity + 1 }
          return next
        }
        return [
          ...prev,
          {
            itemId: found.id,
            sku: found.sku,
            description: found.name,
            hsnCode: found.hsnCode,
            packing: found.packing,
            quantity: 1,
            cutLength: found.cutLength,
            unitPrice: found.sellingPrice,
            taxRateBps: found.taxRateBps,
            stockOnHand: found.stockOnHand,
            trackInventory: found.trackInventory
          }
        ]
      })
      setLastAdded(found.id)
      window.setTimeout(() => setLastAdded(null), 700)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Scan failed.')
    } finally {
      setBusy(false)
      refocus()
    }
  }, [refocus])

  function setQty(itemId: string, qty: number): void {
    setLines((prev) =>
      prev.flatMap((l) => (l.itemId === itemId ? (qty <= 0 ? [] : [{ ...l, quantity: qty }]) : [l]))
    )
  }

  function setRate(itemId: string, rupees: string): void {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, unitPrice: toPaise(rupees) } : l)))
  }

  /**
   * Change the GST rate for one line of this bill.
   *
   * The item's own rate is what gets offered, and this only overrides it for
   * the bill being raised — the item master is left alone. A counter mistake
   * must not silently re-rate a design for every future sale.
   */
  function setTax(itemId: string, bps: number): void {
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, taxRateBps: bps } : l)))
  }

  /**
   * Quick-add a customer without leaving the counter.
   *
   * A shop takes a phone number and a name at the till; everything else is
   * optional. The mobile number is looked up first — a regular who has bought
   * before must be recognised, not entered a second time under a new record.
   */
  function openCustomer(): void {
    setCust({ name: '', mobile: '', address: '', dob: '', anniversary: '' })
    setCustFound(null)
    setCustIsCash(false)
    setCustOpen(true)
  }

  async function lookupMobile(mobile: string): Promise<void> {
    setCust((c) => ({ ...c, mobile }))
    const digits = mobile.replace(/\D/g, '')
    if (digits.length < 10) return setCustFound(null)
    const hit = parties.find((p) => (p.phone ?? '').replace(/\D/g, '').endsWith(digits.slice(-10)))
    setCustFound(hit ?? null)
  }

  /** Use the customer this mobile already belongs to, rather than duplicating them. */
  function useExisting(): void {
    if (!custFound) return
    setPartyId(custFound.id)
    setCustOpen(false)
    toast.success(`${custFound.name} selected.`)
  }

  async function saveCustomer(): Promise<void> {
    // A walk-in who will not leave a number still has to be billed, so a cash
    // customer needs neither a mobile nor a name — the counter cannot hold up
    // a queue over contact details it is never going to get.
    const name = cust.name.trim() || (custIsCash ? 'Cash Customer' : '')
    const mobile = cust.mobile.trim()
    if (!name) return toast.error('Customer name is required.')
    if (!custIsCash && !mobile) {
      return toast.error('Mobile number is required. Tick "Cash customer" for a walk-in.')
    }
    setCustSaving(true)
    try {
      const res = await invoke<{ id: string }>('parties:save', {
        name,
        partyType: 'customer',
        phone: mobile || null,
        billingAddressLine1: cust.address || null,
        dateOfBirth: cust.dob ? new Date(cust.dob).getTime() : null,
        anniversaryDate: cust.anniversary ? new Date(cust.anniversary).getTime() : null,
        creditLimit: 0,
        creditDays: 0,
        openingBalance: 0,
        isActive: true
      })
      const rows = await invoke<PartyOpt[]>('parties:list', { partyType: 'customer' })
      setParties(rows)
      setPartyId(res.id)
      setCustOpen(false)
      toast.success(`${name} added.`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the customer.')
    } finally {
      setCustSaving(false)
    }
  }

  /** Money entered across the tender boxes, in paise. */
  const tenderTotal =
    toPaise(tender.cash || '0') +
    toPaise(tender.upi || '0') +
    toPaise(tender.card || '0') +
    toPaise(tender.other || '0')

  /**
   * Change owed when more cash was handed over than the cash share of the bill.
   * Optional by design: a counter that types nothing here simply sees nothing.
   */
  const cashReturn = Math.max(0, toPaise(cashGiven || '0') - toPaise(tender.cash || '0'))

  /** Open the tender screen with the whole bill sitting in cash, the usual case. */
  function openPayment(): void {
    if (!partyId) return toast.error('Choose a customer first.')
    if (!lines.length) return toast.error('Scan at least one item.')
    setTender({ cash: String(toRupees(totals.grandTotal)), upi: '', card: '', other: '' })
    setCashGiven('')
    setPayOpen(true)
  }

  async function checkout(): Promise<void> {
    if (!partyId) return toast.error('Choose a customer first.')
    if (!lines.length) return toast.error('Scan at least one item.')
    // The counter takes the money in full before the goods leave, so the split
    // must add up to the bill exactly — not less, and not more.
    if (tenderTotal !== totals.grandTotal) {
      return toast.error(
        `Payment must add up to ${formatINR(totals.grandTotal)}. Entered so far: ${formatINR(tenderTotal)}.`
      )
    }

    setSaving(true)
    try {
      const payload: SalesDocInput = {
        docType: 'invoice',
        partyId,
        issueDate: Date.now(),
        isInterState,
        extraCharges: 0,
        extraDiscount: 0,
        schemeLabel: schemeLabel || null,
        schemePct: Math.round(Number(schemePct || 0) * 100),
        transportName: null,
        caseNo: null,
        salespersonId: salespersonId || null,
        weight: 0,
        freight: 0,
        dueDays: 0,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          description: l.description,
          hsnCode: l.hsnCode,
          quantity: l.quantity,
          cutLength: l.cutLength,
          packing: l.packing,
          unitPrice: l.unitPrice,
          discountPct: 0,
          discountAmount: 0,
          taxRateBps: l.taxRateBps
        }))
      } as SalesDocInput

      const res = await invoke<{ id: string; number: string }>('sales:save', payload)
      toast.success(`Invoice ${res.number} saved.`)

      // Record the money exactly as it was taken — one entry per mode used, each
      // applied to this bill, so a split payment shows both halves in the books
      // rather than one lump under a mode that was only part of it.
      const modes: { key: keyof typeof tender; mode: string }[] = [
        { key: 'cash', mode: 'cash' },
        { key: 'upi', mode: 'upi' },
        { key: 'card', mode: 'card' },
        { key: 'other', mode: 'other' }
      ]
      for (const m of modes) {
        const amount = toPaise(tender[m.key] || '0')
        if (amount <= 0) continue
        try {
          await invoke('payments:record', {
            direction: 'inbound',
            partyId,
            amount,
            paidAt: Date.now(),
            mode: m.mode,
            referenceNo: null,
            bankAccount: null,
            notes: null,
            cashDiscount: 0,
            allocations: [{ refType: 'sales', documentId: res.id, amount }]
          })
        } catch (err) {
          toast.error(
            `Invoice ${res.number} saved, but the ${m.mode} payment was not recorded: ` +
              (err instanceof ApiError ? err.message : 'unknown error')
          )
        }
      }
      setPayOpen(false)

      // Offer the printed bill straight away — the counter's next action.
      try {
        await invoke('documents:pdf', { type: 'sales', id: res.id, format: 'a4' })
      } catch (err) {
        if (err instanceof ApiError && err.code !== 'VALIDATION') throw err
      }

      setLines([])
      setTender({ cash: '', upi: '', card: '', other: '' })
      setCashGiven('')
      setSalespersonId('')
      refocus()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the invoice.')
    } finally {
      setSaving(false)
    }
  }

  const totalPcs = lines.reduce((a, l) => a + l.quantity, 0)
  const totalMts = Math.round(lines.reduce((a, l) => a + l.quantity * l.cutLength, 0) * 100) / 100

  if (!canCreate) {
    return (
      <div className="p-6">
        <PageHeader title="Point of Sale" subtitle="You do not have permission to raise bills." />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <PageHeader
        title="Point of Sale"
        subtitle="Scan a barcode to add pieces. The scanner types into the box below — keep it focused."
      />

      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        {/* ---------------- cart ---------------- */}
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <Label htmlFor="scanbox">Scan barcode</Label>
            <div className="relative mt-1">
              <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="scanbox"
                ref={scanRef}
                autoFocus
                className="pl-9 font-mono text-base"
                placeholder="Scan or type a barcode / SKU, then press Enter"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onBlur={() => window.setTimeout(refocus, 80)}
                onKeyDown={(e) => {
                  // Scanners terminate a scan with Enter, but some ship
                  // configured to send Tab instead. Accept either — but only
                  // treat Tab as a scan when there is something in the box, so
                  // an empty box still tabs to the next field normally.
                  const isScanEnd = e.key === 'Enter' || (e.key === 'Tab' && scan.trim() !== '')
                  if (isScanEnd) {
                    e.preventDefault()
                    // Clear synchronously so the next barcode can start typing
                    // into an empty box while this lookup is still running.
                    const code = scan
                    setScan('')
                    void addByCode(code)
                  }
                }}
              />
              {busy && (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-primary" />
              )}
            </div>
          </Card>

          <Card className="flex-1 overflow-auto p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Description</TH>
                  <TH className="w-28 text-right">PCS</TH>
                  <TH className="w-20 text-right">CUT</TH>
                  <TH className="w-24 text-right">MTS</TH>
                  <TH className="w-32 text-right">RATE</TH>
                  <TH className="w-24 text-right">GST</TH>
                  <TH className="w-32 text-right">AMOUNT</TH>
                  <TH className="w-12" />
                </TR>
              </THead>
              <TBody>
                {lines.length === 0 && (
                  <TR>
                    <TD colSpan={7} className="py-16 text-center text-muted-foreground">
                      Nothing scanned yet. Point the scanner at a label to begin.
                    </TD>
                  </TR>
                )}
                {lines.map((l) => {
                  const short = l.trackInventory && l.quantity > l.stockOnHand
                  return (
                    <TR
                      key={l.itemId}
                      className={lastAdded === l.itemId ? 'bg-primary/10 transition-colors' : undefined}
                    >
                      <TD>
                        <div className="font-medium">{l.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.sku}
                          {short && (
                            <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                              <AlertTriangle className="size-3" />
                              only {l.stockOnHand} in stock
                            </span>
                          )}
                        </div>
                      </TD>
                      <TD className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setQty(l.itemId, l.quantity - 1)}>
                            <Minus className="size-3" />
                          </Button>
                          <span className="w-8 text-center font-semibold tabular-nums">{l.quantity}</span>
                          <Button variant="ghost" size="sm" onClick={() => setQty(l.itemId, l.quantity + 1)}>
                            <Plus className="size-3" />
                          </Button>
                        </div>
                      </TD>
                      <TD className="text-right tabular-nums">{l.cutLength ? l.cutLength.toFixed(2) : '—'}</TD>
                      <TD className="text-right tabular-nums">
                        {l.cutLength ? (l.quantity * l.cutLength).toFixed(2) : '—'}
                      </TD>
                      <TD className="text-right">
                        <Input
                          className="h-8 text-right tabular-nums"
                          value={toRupees(l.unitPrice)}
                          onChange={(e) => setRate(l.itemId, e.target.value)}
                        />
                      </TD>
                      <TD className="text-right">
                        <Select
                          aria-label={`GST rate for ${l.description}`}
                          className="h-8 text-right"
                          value={String(l.taxRateBps)}
                          onChange={(e) => setTax(l.itemId, Number(e.target.value))}
                        >
                          {GST_RATES.map((b) => (
                            <option key={b} value={b}>{b / 100}%</option>
                          ))}
                        </Select>
                      </TD>
                      <TD className="text-right font-semibold tabular-nums">
                        {formatINR(l.quantity * l.unitPrice)}
                      </TD>
                      <TD>
                        <Button variant="ghost" size="sm" onClick={() => setQty(l.itemId, 0)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          </Card>
        </div>

        {/* ---------------- bill summary ---------------- */}
        <Card className="flex h-fit flex-col gap-3 p-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label htmlFor="cust">Customer</Label>
              <Button variant="outline" size="sm" className="h-7" onClick={openCustomer}>
                <UserPlus className="size-3" /> New
              </Button>
            </div>
            <Select id="cust" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              {parties.length === 0 && <option value="">No customers yet</option>}
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            {salespersons.length > 0 && (
              <div className="mt-2">
                <Label htmlFor="sp">Sold by</Label>
                <Select id="sp" value={salespersonId} onChange={(e) => setSalespersonId(e.target.value)}>
                  <option value="">— not recorded —</option>
                  {salespersons.map((sp) => (
                    <option key={sp.id} value={sp.id}>{sp.name}</option>
                  ))}
                </Select>
              </div>
            )}

            {party && !party.billingStateCode ? (
              // Never quietly assume intra-state: the wrong choice puts the
              // wrong tax on the bill and is invisible until filing.
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                <AlertTriangle className="size-3 shrink-0" />
                No state code on this customer — set one to bill IGST correctly.
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {isInterState ? 'Inter-state — IGST' : 'Intra-state — CGST + SGST'}
                {companyStateCode && party?.billingStateCode
                  ? ` (${companyStateCode} → ${party.billingStateCode})`
                  : ''}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="slabel">Scheme label</Label>
              <Input id="slabel" value={schemeLabel} onChange={(e) => setSchemeLabel(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="spct">Scheme %</Label>
              <Input
                id="spct"
                className="text-right tabular-nums"
                value={schemePct}
                onChange={(e) => setSchemePct(e.target.value)}
              />
            </div>
          </div>


          <div className="mt-1 space-y-1 border-t pt-3 text-sm">
            <Row label={`SUB TOTAL (${totalPcs} pcs, ${totalMts} mts)`} value={formatINR(totals.subTotal)} />
            {totals.schemeAmount > 0 && (
              <Row
                label={`${schemeLabel || 'DISCOUNT'} @ ${Number(schemePct)}%`}
                value={`-${formatINR(totals.schemeAmount)}`}
              />
            )}
            <Row label="Taxable Value" value={formatINR(totals.taxableValue)} />
            {isInterState ? (
              <Row label="IGST" value={formatINR(totals.igstTotal)} />
            ) : (
              <>
                <Row label="CGST" value={formatINR(totals.cgstTotal)} />
                <Row label="SGST" value={formatINR(totals.sgstTotal)} />
              </>
            )}
            {totals.roundOff !== 0 && <Row label="Round off" value={formatINR(totals.roundOff)} />}
            <div className="flex items-center justify-between border-t pt-2 text-lg font-bold">
              <span>Invoice Value</span>
              <span className="tabular-nums">{formatINR(totals.grandTotal)}</span>
            </div>
          </div>

          <Button className="mt-2 h-12 text-base" disabled={saving || !lines.length} onClick={openPayment}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Receipt className="mr-2 size-4" />}
            Take payment &amp; print bill
          </Button>
          {lines.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setLines([])}>
              Clear cart
            </Button>
          )}
        </Card>
      </div>

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Take payment"
        description="Split it across as many modes as the customer used. The total must match the bill."
        footer={
          <div className="flex w-full items-center gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Entered </span>
              <b className={tenderTotal === totals.grandTotal ? 'text-emerald-600' : 'text-destructive'}>
                {formatINR(tenderTotal)}
              </b>
              <span className="text-muted-foreground"> of {formatINR(totals.grandTotal)}</span>
              {tenderTotal !== totals.grandTotal && (
                <span className="ml-2 text-destructive">
                  ({tenderTotal < totals.grandTotal ? 'short by ' : 'over by '}
                  {formatINR(Math.abs(totals.grandTotal - tenderTotal))})
                </span>
              )}
            </div>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
              <Button
                onClick={() => void checkout()}
                disabled={saving || tenderTotal !== totals.grandTotal}
              >
                {saving && <Loader2 className="animate-spin" />} Save &amp; print bill
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="tcash">Cash (₹)</Label>
            <Input id="tcash" className="text-right tabular-nums" value={tender.cash}
              onChange={(e) => setTender((t) => ({ ...t, cash: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tupi">UPI (₹)</Label>
            <Input id="tupi" className="text-right tabular-nums" value={tender.upi}
              onChange={(e) => setTender((t) => ({ ...t, upi: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tcard">Card (₹)</Label>
            <Input id="tcard" className="text-right tabular-nums" value={tender.card}
              onChange={(e) => setTender((t) => ({ ...t, card: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="toth">Other (₹)</Label>
            <Input id="toth" className="text-right tabular-nums" value={tender.other}
              onChange={(e) => setTender((t) => ({ ...t, other: e.target.value }))} />
          </div>

          <div className="col-span-2 rounded-md border p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tgiven">Cash handed over (₹) — optional</Label>
                <Input id="tgiven" className="text-right tabular-nums" value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)} placeholder="2000" />
              </div>
              <div className="flex flex-col justify-end">
                <div className="text-sm text-muted-foreground">Return to customer</div>
                <div className="text-2xl font-semibold tabular-nums">{formatINR(cashReturn)}</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Only for working out change at the till. The bill still records {formatINR(toPaise(tender.cash || '0'))} as cash.
            </p>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={custOpen}
        onClose={() => setCustOpen(false)}
        title="New customer"
        description="Name and mobile number are enough. The rest can wait."
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={() => setCustOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveCustomer()} disabled={custSaving}>
              {custSaving && <Loader2 className="animate-spin" />} Save &amp; select
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cmob">Mobile no {custIsCash ? '' : '*'}</Label>
            <Input
              id="cmob"
              value={cust.mobile}
              onChange={(e) => void lookupMobile(e.target.value)}
              placeholder="10-digit number"
              inputMode="numeric"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cname">Name {custIsCash ? '' : '*'}</Label>
            <Input id="cname" value={cust.name} onChange={(e) => setCust((c) => ({ ...c, name: e.target.value }))} />
          </div>

          <label className="col-span-2 flex items-center gap-2 rounded-md border p-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={custIsCash}
              onChange={(e) => setCustIsCash(e.target.checked)}
            />
            <span>
              <b>Cash customer</b> — walk-in who will not give a number. Mobile and name
              both become optional.
            </span>
          </label>

          {custFound && (
            <div className="col-span-2 flex items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="size-4 shrink-0 text-amber-600" />
              <span>
                This mobile already belongs to <b>{custFound.name}</b>.
              </span>
              <Button size="sm" className="ml-auto" onClick={useExisting}>Use this customer</Button>
            </div>
          )}

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="caddr">Address</Label>
            <Input id="caddr" value={cust.address} onChange={(e) => setCust((c) => ({ ...c, address: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cdob">Date of birth</Label>
            <Input id="cdob" type="date" value={cust.dob} onChange={(e) => setCust((c) => ({ ...c, dob: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cann">Anniversary</Label>
            <Input id="cann" type="date" value={cust.anniversary} onChange={(e) => setCust((c) => ({ ...c, anniversary: e.target.value }))} />
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}
