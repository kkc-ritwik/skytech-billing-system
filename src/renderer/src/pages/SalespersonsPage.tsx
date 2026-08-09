import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Loader2, BadgeIndianRupee, Search } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { confirmAction } from '@renderer/store/confirm'
import { useApp } from '@renderer/store/app'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Dialog } from '@renderer/components/ui/dialog'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'

interface Row {
  id: string
  name: string
  phone: string | null
  code: string | null
  incentiveBps: number
  notes: string | null
  isActive: boolean
}

const blank = { id: '', name: '', phone: '', code: '', incentivePct: '', notes: '', isActive: true }

/**
 * Shop floor staff credited with a sale.
 *
 * Kept apart from Users on purpose: the people who sell sarees do not log in,
 * and the person at the till is usually not the person who made the sale. A
 * shop can list ten salespeople here while paying for one counter login.
 */
export function SalespersonsPage(): JSX.Element {
  const canManage = useApp((s) => s.has('users:manage'))
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await invoke<Row[]>('salespersons:list', { search: search || undefined }))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => void load(), 250)
    return () => clearTimeout(t)
  }, [load])

  function openCreate(): void {
    setForm(blank)
    setOpen(true)
  }

  function openEdit(r: Row): void {
    setForm({
      id: r.id,
      name: r.name,
      phone: r.phone ?? '',
      code: r.code ?? '',
      incentivePct: r.incentiveBps ? String(r.incentiveBps / 100) : '',
      notes: r.notes ?? '',
      isActive: r.isActive
    })
    setOpen(true)
  }

  async function save(): Promise<void> {
    if (!form.name.trim()) return toast.error('Name is required.')
    setSaving(true)
    try {
      await invoke('salespersons:save', {
        id: form.id || undefined,
        name: form.name.trim(),
        phone: form.phone || null,
        code: form.code || null,
        incentiveBps: Math.round(Number(form.incentivePct || 0) * 100),
        notes: form.notes || null,
        isActive: form.isActive
      })
      toast.success('Saved.')
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(r: Row): Promise<void> {
    const ok = await confirmAction({
      title: `Remove ${r.name}?`,
      message:
        'They will stop being offered at the counter. Bills already credited to them are kept exactly as they are.',
      confirmLabel: 'Remove',
      destructive: true
    })
    if (!ok) return
    try {
      await invoke('salespersons:delete', { id: r.id })
      toast.success('Removed.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove.')
    }
  }

  return (
    <div>
      <PageHeader
        title="Salespersons"
        subtitle="Shop floor staff a sale can be credited to. They do not log in to the software."
        actions={canManage ? <Button onClick={openCreate}><Plus /> New salesperson</Button> : null}
      />

      <div className="mb-3 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, code or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
            <BadgeIndianRupee className="size-10 text-primary/50" />
            <p className="text-lg font-medium text-foreground">No salespersons yet</p>
            <p className="max-w-sm text-sm">
              Add the staff who sell on the floor, so each sale can be credited and their
              incentive worked out at the end of the month.
            </p>
            {canManage && <Button onClick={openCreate} className="mt-2"><Plus /> New salesperson</Button>}
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Code</TH>
                <TH>Phone</TH>
                <TH className="text-right">Incentive</TH>
                <TH>Status</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <div className="font-medium">{r.name}</div>
                    {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                  </TD>
                  <TD className="font-mono text-xs">{r.code || '—'}</TD>
                  <TD className="tabular-nums">{r.phone || '—'}</TD>
                  <TD className="text-right tabular-nums">
                    {r.incentiveBps ? `${r.incentiveBps / 100}%` : '—'}
                  </TD>
                  <TD>
                    <Badge variant={r.isActive ? 'success' : 'secondary'}>
                      {r.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Edit" aria-label={`Edit ${r.name}`} onClick={() => openEdit(r)}>
                        <Pencil className="size-4" />
                      </Button>
                      {canManage && (
                        <Button variant="ghost" size="icon" title="Remove" aria-label={`Remove ${r.name}`} onClick={() => void remove(r)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
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
        title={form.id ? 'Edit salesperson' : 'New salesperson'}
        description="Only the name is required."
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !canManage}>
              {saving && <Loader2 className="animate-spin" />} Save
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="spname">Name *</Label>
            <Input id="spname" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="spcode">Staff code</Label>
            <Input id="spcode" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} placeholder="SP-01" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="spphone">Phone</Label>
            <Input id="spphone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="spinc">Incentive %</Label>
            <Input
              id="spinc"
              type="number"
              step="0.01"
              className="text-right"
              value={form.incentivePct}
              onChange={(e) => setForm((f) => ({ ...f, incentivePct: e.target.value }))}
              placeholder="2.5"
            />
            <p className="text-xs text-muted-foreground">Leave blank if you work incentives out yourself.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="spnotes">Notes</Label>
            <Input id="spnotes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active — offered at the counter
          </label>
        </div>
      </Dialog>
    </div>
  )
}
