import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Users, Loader2, BookOpen } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { confirmAction } from '@renderer/store/confirm'
import { useApp } from '@renderer/store/app'
import { formatINR, toPaise, toRupees } from '@renderer/lib/format'
import type { PartyInput } from '@shared/dto'
import { PageHeader } from '@renderer/components/PageHeader'
import { PartyLedgerDialog } from '@renderer/components/PartyLedgerDialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { Card } from '@renderer/components/ui/card'
import { Dialog } from '@renderer/components/ui/dialog'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'
import { cn } from '@renderer/lib/utils'

interface PartyRow {
  id: string
  partyType: 'customer' | 'vendor' | 'both'
  name: string
  gstin: string | null
  contactPerson: string | null
  phone: string | null
  billingCity: string | null
  billingState: string | null
  creditLimit: number
  openingBalance: number
  balance: number
  isActive: boolean
}

type FormState = {
  id?: string
  partyType: 'customer' | 'vendor' | 'both'
  name: string
  displayCode: string
  gstin: string
  pan: string
  contactPerson: string
  phone: string
  email: string
  billingAddressLine1: string
  billingCity: string
  billingState: string
  billingStateCode: string
  billingPincode: string
  creditLimit: string
  creditDays: string
  openingBalance: string
  notes: string
  isActive: boolean
}

const blank = (type: 'customer' | 'vendor'): FormState => ({
  partyType: type,
  name: '',
  displayCode: '',
  gstin: '',
  pan: '',
  contactPerson: '',
  phone: '',
  email: '',
  billingAddressLine1: '',
  billingCity: '',
  billingState: '',
  billingStateCode: '',
  billingPincode: '',
  creditLimit: '',
  creditDays: '',
  openingBalance: '',
  notes: '',
  isActive: true
})

export function PartiesPage(): JSX.Element {
  const canManage = useApp((s) => s.has('parties:manage'))
  const [tab, setTab] = useState<'customer' | 'vendor'>('customer')
  const [rows, setRows] = useState<PartyRow[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blank('customer'))
  const [saving, setSaving] = useState(false)
  const [ledgerId, setLedgerId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await invoke<PartyRow[]>('parties:list', { partyType: tab, search: search || undefined })
      setRows(data)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [tab, search])

  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  function openCreate(): void {
    setForm(blank(tab))
    setOpen(true)
  }

  async function openEdit(id: string): Promise<void> {
    try {
      const p = await invoke<any>('parties:get', { id })
      if (!p) return
      setForm({
        id: p.id,
        partyType: p.partyType,
        name: p.name ?? '',
        displayCode: p.displayCode ?? '',
        gstin: p.gstin ?? '',
        pan: p.pan ?? '',
        contactPerson: p.contactPerson ?? '',
        phone: p.phone ?? '',
        email: p.email ?? '',
        billingAddressLine1: p.billingAddressLine1 ?? '',
        billingCity: p.billingCity ?? '',
        billingState: p.billingState ?? '',
        billingStateCode: p.billingStateCode ?? '',
        billingPincode: p.billingPincode ?? '',
        creditLimit: String(toRupees(p.creditLimit ?? 0)),
        creditDays: String(p.creditDays ?? 0),
        openingBalance: String(toRupees(p.openingBalance ?? 0)),
        notes: p.notes ?? '',
        isActive: !!p.isActive
      })
      setOpen(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to open.')
    }
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const payload: PartyInput = {
        id: form.id,
        partyType: form.partyType,
        name: form.name.trim(),
        displayCode: form.displayCode || null,
        gstin: form.gstin || null,
        pan: form.pan || null,
        contactPerson: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email || null,
        billingAddressLine1: form.billingAddressLine1 || null,
        billingAddressLine2: null,
        billingCity: form.billingCity || null,
        billingState: form.billingState || null,
        billingStateCode: form.billingStateCode || null,
        billingPincode: form.billingPincode || null,
        shippingAddressLine1: null,
        shippingAddressLine2: null,
        shippingCity: null,
        shippingState: null,
        shippingPincode: null,
        creditLimit: toPaise(form.creditLimit || '0'),
        creditDays: Number(form.creditDays || 0),
        openingBalance: toPaise(form.openingBalance || '0'),
        notes: form.notes || null,
        isActive: form.isActive
      }
      await invoke('parties:save', payload)
      toast.success(form.id ? 'Saved.' : 'Created.')
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(row: PartyRow): Promise<void> {
    const ok = await confirmAction({
      title: 'Delete this record?',
      message: `"${row.name}" will be hidden from lists. Existing documents for them are kept.`,
      confirmLabel: 'Delete',
      destructive: true
    })
    if (!ok) return
    try {
      await invoke('parties:delete', { id: row.id })
      toast.success('Deleted.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed.')
    }
  }

  const up = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <PageHeader
        title="Clients & Vendors"
        subtitle="Schools, colleges and other customers, plus your suppliers."
        actions={canManage ? <Button onClick={openCreate}><Plus /> New {tab}</Button> : null}
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border bg-card p-1">
          {(['customer', 'vendor'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors',
                tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t === 'customer' ? 'Clients' : 'Vendors'}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search name, phone, GSTIN…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="animate-spin" /> Loading…</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
            <Users className="size-10 text-primary/50" />
            <p className="text-lg font-medium text-foreground">No {tab === 'customer' ? 'clients' : 'vendors'} yet</p>
            {canManage && <Button onClick={openCreate} className="mt-2"><Plus /> Add now</Button>}
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>GSTIN</TH>
                <TH>Contact</TH>
                <TH>Location</TH>
                <TH className="text-right">Balance</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">
                    {r.name}
                    {r.partyType === 'both' && <Badge variant="secondary" className="ml-2">Both</Badge>}
                    {!r.isActive && <Badge variant="secondary" className="ml-2">Inactive</Badge>}
                  </TD>
                  <TD className="font-mono text-xs">{r.gstin ?? '—'}</TD>
                  <TD>{r.contactPerson || r.phone || '—'}</TD>
                  <TD className="text-muted-foreground">{[r.billingCity, r.billingState].filter(Boolean).join(', ') || '—'}</TD>
                  <TD className="text-right">
                    {r.balance === 0 ? (
                      <span className="text-muted-foreground">₹0.00</span>
                    ) : (
                      <span className={r.balance > 0 ? 'font-medium text-success' : 'font-medium text-destructive'}>
                        {formatINR(Math.abs(r.balance))} {r.balance > 0 ? 'Dr' : 'Cr'}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Statement / ledger" onClick={() => setLedgerId(r.id)}><BookOpen className="size-4" /></Button>
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => void openEdit(r.id)}><Pencil className="size-4" /></Button>
                      {canManage && <Button variant="ghost" size="icon" title="Delete" onClick={() => void remove(r)}><Trash2 className="size-4 text-destructive" /></Button>}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={form.id ? 'Edit party' : 'New party'}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <Select value={form.partyType} onChange={up('partyType')}>
              <option value="customer">Client / Customer</option>
              <option value="vendor">Vendor / Supplier</option>
              <option value="both">Both</option>
            </Select>
          </Field>
          <Field label="Name *"><Input value={form.name} onChange={up('name')} /></Field>
          <Field label="GSTIN"><Input value={form.gstin} onChange={up('gstin')} /></Field>
          <Field label="PAN"><Input value={form.pan} onChange={up('pan')} /></Field>
          <Field label="Contact person"><Input value={form.contactPerson} onChange={up('contactPerson')} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={up('phone')} /></Field>
          <Field label="Email"><Input value={form.email} onChange={up('email')} /></Field>
          <Field label="Display code"><Input value={form.displayCode} onChange={up('displayCode')} placeholder="e.g. DPS-NOIDA" /></Field>
          <div className="col-span-2"><Field label="Billing address"><Input value={form.billingAddressLine1} onChange={up('billingAddressLine1')} /></Field></div>
          <Field label="City"><Input value={form.billingCity} onChange={up('billingCity')} /></Field>
          <Field label="State"><Input value={form.billingState} onChange={up('billingState')} /></Field>
          <Field label="State code (GST)"><Input value={form.billingStateCode} onChange={up('billingStateCode')} placeholder="e.g. 09" /></Field>
          <Field label="Pincode"><Input value={form.billingPincode} onChange={up('billingPincode')} /></Field>
          <Field label="Credit limit (₹)"><Input type="number" step="0.01" value={form.creditLimit} onChange={up('creditLimit')} /></Field>
          <Field label="Credit days"><Input type="number" value={form.creditDays} onChange={up('creditDays')} /></Field>
          <Field label="Opening balance (₹)"><Input type="number" step="0.01" value={form.openingBalance} onChange={up('openingBalance')} /></Field>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="size-4" /> Active
          </label>
        </div>
      </Dialog>

      {ledgerId && <PartyLedgerDialog partyId={ledgerId} onClose={() => setLedgerId(null)} />}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
