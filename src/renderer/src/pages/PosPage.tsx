import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, ScanLine, Trash2, Receipt, Plus, Minus, AlertTriangle } from 'lucide-react'
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

interface PartyOpt {
  id: string
  name: string
  gstin: string | null
  billingStateCode: string | null
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
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastAdded, setLastAdded] = useState<string | null>(null)

  const [schemeLabel, setSchemeLabel] = useState('DISCOUNT')
  const [schemePct, setSchemePct] = useState('0')
  const [transportName, setTransportName] = useState('')
  const [caseNo, setCaseNo] = useState('')

  const scanRef = useRef<HTMLInputElement>(null)

  // Keep focus in the scan box: a scanner types wherever the caret happens to
  // be, so losing focus silently sends barcodes into some other field.
  const refocus = useCallback(() => scanRef.current?.focus(), [])

  useEffect(() => {
    void (async () => {
      try {
        const rows = await invoke<PartyOpt[]>('parties:list', { partyType: 'customer' })
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
        if (ctx.defaultTransportName) setTransportName(ctx.defaultTransportName)
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

  async function checkout(): Promise<void> {
    if (!partyId) return toast.error('Choose a customer first.')
    if (!lines.length) return toast.error('Scan at least one item.')

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
        transportName: transportName || null,
        caseNo: caseNo || null,
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

      // Offer the printed bill straight away — the counter's next action.
      try {
        await invoke('documents:pdf', { type: 'sales', id: res.id, format: 'a4' })
      } catch (err) {
        if (err instanceof ApiError && err.code !== 'VALIDATION') throw err
      }

      setLines([])
      setCaseNo('')
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
            <Label htmlFor="cust">Customer</Label>
            <Select id="cust" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              {parties.length === 0 && <option value="">No customers yet</option>}
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
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

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="tr">Transport</Label>
              <Input id="tr" value={transportName} onChange={(e) => setTransportName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="cn">Case no</Label>
              <Input id="cn" value={caseNo} onChange={(e) => setCaseNo(e.target.value)} />
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

          <Button className="mt-2 h-12 text-base" disabled={saving || !lines.length} onClick={() => void checkout()}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Receipt className="mr-2 size-4" />}
            Save &amp; print bill
          </Button>
          {lines.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setLines([])}>
              Clear cart
            </Button>
          )}
        </Card>
      </div>
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
