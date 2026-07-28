import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Wallet } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { confirmAction } from '@renderer/store/confirm'
import { useApp } from '@renderer/store/app'
import { formatINR, formatDate, toPaise, toRupees } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'
import type { PaymentInput } from '@shared/dto'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Dialog } from '@renderer/components/ui/dialog'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'

interface PayRow {
  id: string; number: string; partyName: string; amount: number
  allocatedAmount: number; paidAt: number; mode: string; referenceNo: string | null
}
interface PartyOpt { id: string; name: string }
interface OpenDoc { id: string; number: string; refType: 'sales' | 'purchase'; outstanding: number; issueDate: number }

export function PaymentsPage(): JSX.Element {
  const canCreate = useApp((s) => s.has('payments:create'))
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound')
  const [rows, setRows] = useState<PayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [parties, setParties] = useState<PartyOpt[]>([])
  const [partyId, setPartyId] = useState('')
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [mode, setMode] = useState<PaymentInput['mode']>('upi')
  const [reference, setReference] = useState('')
  const [openDocs, setOpenDocs] = useState<OpenDoc[]>([])
  const [alloc, setAlloc] = useState<Record<string, string>>({})
  /** True once the user edits an allocation by hand, which stops the automatic fill. */
  const [allocTouched, setAllocTouched] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await invoke<PayRow[]>('payments:list', { direction }))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [direction])

  useEffect(() => { void load() }, [load])

  async function openRecord(): Promise<void> {
    setPartyId(''); setAmount(''); setReference(''); setMode('upi')
    setPaidAt(new Date().toISOString().slice(0, 10)); setOpenDocs([]); setAlloc({}); setAllocTouched(false)
    try {
      setParties(await invoke<PartyOpt[]>('parties:list', { partyType: direction === 'inbound' ? 'customer' : 'vendor', activeOnly: true }))
    } catch { /* ignore */ }
    setOpen(true)
  }

  async function onPartyChange(id: string): Promise<void> {
    setPartyId(id)
    setAlloc({})
    setAllocTouched(false)
    if (!id) return setOpenDocs([])
    try {
      setOpenDocs(await invoke<OpenDoc[]>('payments:openDocs', { direction, partyId: id }))
    } catch { setOpenDocs([]) }
  }

  const buildAllocation = useCallback(
    (paise: number): Record<string, string> => {
      let remaining = paise
      const next: Record<string, string> = {}
      for (const d of openDocs) {
        if (remaining <= 0) break
        const apply = Math.min(remaining, d.outstanding)
        next[d.id] = String(toRupees(apply))
        remaining -= apply
      }
      return next
    },
    [openDocs]
  )

  function autoAllocate(): void {
    setAllocTouched(false)
    setAlloc(buildAllocation(toPaise(amount || '0')))
  }

  /**
   * Settle the oldest open bills by default.
   *
   * A receipt saved with no allocation is money the shop has genuinely
   * received, but every report that matters — aging, receivables, a bill's
   * paid/unpaid badge — is computed per document. Leaving allocation to a
   * button the user must remember to press means a customer who has paid keeps
   * showing a full outstanding balance and gets chased for it. So allocate as
   * the default, and step aside the moment the user edits the figures himself.
   */
  useEffect(() => {
    if (allocTouched) return
    setAlloc(buildAllocation(toPaise(amount || '0')))
  }, [amount, openDocs, allocTouched, buildAllocation])

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const allocations = openDocs
        .filter((d) => toPaise(alloc[d.id] || '0') > 0)
        .map((d) => ({ refType: d.refType, documentId: d.id, amount: toPaise(alloc[d.id]) }))
      if (allocations.length === 0 && openDocs.length > 0 && toPaise(amount || '0') > 0) {
        const ok = await confirmAction({
          title: 'Record this money without settling any bill?',
          message:
            `This ${direction === 'inbound' ? 'receipt' : 'payment'} is not applied to any of the ` +
            `${openDocs.length} open bill(s). They will keep showing their full outstanding amount ` +
            'in the ledger and the aging report. Use Auto-allocate to settle the oldest bills first.',
          confirmLabel: 'Keep it on account',
          cancelLabel: 'Go back'
        })
        if (!ok) { setSaving(false); return }
      }
      const payload: PaymentInput = {
        direction,
        partyId,
        amount: toPaise(amount || '0'),
        paidAt: new Date(paidAt).getTime(),
        mode,
        referenceNo: reference || null,
        bankAccount: null,
        notes: null,
        allocations
      }
      await invoke('payments:record', payload)
      toast.success('Payment recorded.')
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to record.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Payments"
        subtitle="Record money received from clients and paid to vendors, then match it to bills."
        actions={canCreate ? <Button onClick={() => void openRecord()}><Plus /> Record {direction === 'inbound' ? 'receipt' : 'payment'}</Button> : null}
      />

      <div className="mb-4 inline-flex rounded-lg border bg-card p-1">
        {(['inbound', 'outbound'] as const).map((d) => (
          <button key={d} onClick={() => setDirection(d)} className={cn('rounded-md px-4 py-1.5 text-sm font-medium transition-colors', direction === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            {d === 'inbound' ? 'Receipts (from clients)' : 'Payments (to vendors)'}
          </button>
        ))}
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
            <Wallet className="size-10 text-primary/50" />
            <p className="text-lg font-medium text-foreground">No {direction === 'inbound' ? 'receipts' : 'payments'} yet</p>
          </div>
        ) : (
          <Table>
            <THead><TR><TH>Voucher</TH><TH>Date</TH><TH>Party</TH><TH>Mode</TH><TH>Reference</TH><TH className="text-right">Amount</TH></TR></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.number}</TD>
                  <TD>{formatDate(r.paidAt)}</TD>
                  <TD className="font-medium">{r.partyName}</TD>
                  <TD className="capitalize">{r.mode.replace('_', ' ')}</TD>
                  <TD className="text-muted-foreground">{r.referenceNo ?? '—'}</TD>
                  <TD className="text-right font-semibold">{formatINR(r.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={direction === 'inbound' ? 'Record receipt' : 'Record payment'}
        description="Enter the payment that already happened in your bank/UPI, then allocate it to open bills."
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving || !partyId}>{saving && <Loader2 className="animate-spin" />} Save</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{direction === 'inbound' ? 'Client' : 'Vendor'} *</Label>
            <Select value={partyId} onChange={(e) => void onPartyChange(e.target.value)}>
              <option value="">Select…</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Amount (₹) *</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={mode} onChange={(e) => setMode(e.target.value as PaymentInput['mode'])}>
              <option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option><option value="cheque">Cheque</option>
              <option value="card">Card</option><option value="other">Other</option>
            </Select>
          </div>
          <div className="col-span-2 space-y-1.5"><Label>Reference / UTR / Cheque no</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>

        {openDocs.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <Label>Allocate to open bills</Label>
              <Button variant="outline" size="sm" onClick={autoAllocate}>Auto-allocate</Button>
            </div>
            <div className="space-y-2">
              {openDocs.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                  <span className="font-mono text-xs">{d.number}</span>
                  <span className="ml-auto text-muted-foreground">Outstanding {formatINR(d.outstanding)}</span>
                  <Input type="number" step="0.01" className="h-8 w-28 text-right" placeholder="0.00"
                    value={alloc[d.id] ?? ''}
                    onChange={(e) => { setAllocTouched(true); setAlloc((a) => ({ ...a, [d.id]: e.target.value })) }} />
                </div>
              ))}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
