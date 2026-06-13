import { useCallback, useEffect, useState } from 'react'
import { Plus, Search, Pencil, Trash2, Package, Loader2, AlertTriangle } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { useApp } from '@renderer/store/app'
import { formatINR, toPaise, toRupees, formatQty } from '@renderer/lib/format'
import type { ItemInput } from '@shared/dto'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { Card } from '@renderer/components/ui/card'
import { Dialog } from '@renderer/components/ui/dialog'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'

interface ItemRow {
  id: string
  sku: string
  name: string
  hsnCode: string | null
  unitSymbol: string | null
  taxName: string | null
  taxRateBps: number | null
  purchasePrice: number
  sellingPrice: number
  reorderLevel: number
  currentStock: number
  trackInventory: boolean
  isActive: boolean
}

interface Refs {
  units: { id: string; name: string; symbol: string }[]
  taxRates: { id: string; name: string; rateBps: number }[]
  categories: { id: string; name: string }[]
}

type FormState = {
  id?: string
  sku: string
  name: string
  description: string
  hsnCode: string
  barcode: string
  unitId: string
  taxRateId: string
  categoryId: string
  purchasePrice: string
  sellingPrice: string
  sellingPriceIsInclusive: boolean
  trackInventory: boolean
  reorderLevel: string
  openingStock: string
  openingStockValue: string
  isActive: boolean
}

const blankForm: FormState = {
  sku: '',
  name: '',
  description: '',
  hsnCode: '',
  barcode: '',
  unitId: '',
  taxRateId: '',
  categoryId: '',
  purchasePrice: '',
  sellingPrice: '',
  sellingPriceIsInclusive: false,
  trackInventory: true,
  reorderLevel: '',
  openingStock: '',
  openingStockValue: '',
  isActive: true
}

export function ItemsPage(): JSX.Element {
  const canManage = useApp((s) => s.has('items:manage'))
  const [rows, setRows] = useState<ItemRow[]>([])
  const [refs, setRefs] = useState<Refs>({ units: [], taxRates: [], categories: [] })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blankForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [items, r] = await Promise.all([
        invoke<ItemRow[]>('items:list', { search: search || undefined }),
        invoke<Refs>('items:refs')
      ])
      setRows(items)
      setRefs(r)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load items.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  function openCreate(): void {
    setForm({ ...blankForm, unitId: refs.units[0]?.id ?? '', taxRateId: refs.taxRates.find((t) => t.rateBps === 1800)?.id ?? '' })
    setDialogOpen(true)
  }

  async function openEdit(id: string): Promise<void> {
    try {
      const it = await invoke<any>('items:get', { id })
      if (!it) return
      setForm({
        id: it.id,
        sku: it.sku ?? '',
        name: it.name ?? '',
        description: it.description ?? '',
        hsnCode: it.hsnCode ?? '',
        barcode: it.barcode ?? '',
        unitId: it.unitId ?? '',
        taxRateId: it.taxRateId ?? '',
        categoryId: it.categoryId ?? '',
        purchasePrice: String(toRupees(it.purchasePrice)),
        sellingPrice: String(toRupees(it.sellingPrice)),
        sellingPriceIsInclusive: !!it.sellingPriceIsInclusive,
        trackInventory: !!it.trackInventory,
        reorderLevel: String(it.reorderLevel ?? 0),
        openingStock: String(it.openingStock ?? 0),
        openingStockValue: String(toRupees(it.openingStockValue ?? 0)),
        isActive: !!it.isActive
      })
      setDialogOpen(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to open item.')
    }
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const payload: ItemInput = {
        id: form.id,
        sku: form.sku.trim(),
        name: form.name.trim(),
        description: form.description || null,
        hsnCode: form.hsnCode || null,
        barcode: form.barcode || null,
        unitId: form.unitId || null,
        taxRateId: form.taxRateId || null,
        categoryId: form.categoryId || null,
        purchasePrice: toPaise(form.purchasePrice || '0'),
        sellingPrice: toPaise(form.sellingPrice || '0'),
        sellingPriceIsInclusive: form.sellingPriceIsInclusive,
        trackInventory: form.trackInventory,
        reorderLevel: Number(form.reorderLevel || 0),
        openingStock: Number(form.openingStock || 0),
        openingStockValue: toPaise(form.openingStockValue || '0'),
        isActive: form.isActive
      }
      await invoke('items:save', payload)
      toast.success(form.id ? 'Item updated.' : 'Item created.')
      setDialogOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(row: ItemRow): Promise<void> {
    if (!confirm(`Delete "${row.name}"? It will be hidden but kept for records.`)) return
    try {
      await invoke('items:delete', { id: row.id })
      toast.success('Item deleted.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed.')
    }
  }

  const up = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const toggle = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.checked }))

  return (
    <div>
      <PageHeader
        title="Items"
        subtitle="Your products & services master with HSN, tax and stock."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus /> New item
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search by name, SKU or barcode…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState onCreate={canManage ? openCreate : undefined} />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>SKU</TH>
                <TH>Name</TH>
                <TH>HSN</TH>
                <TH className="text-right">Purchase</TH>
                <TH className="text-right">Selling</TH>
                <TH>Tax</TH>
                <TH className="text-right">Stock</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const low = r.trackInventory && r.currentStock <= r.reorderLevel
                return (
                  <TR key={r.id}>
                    <TD className="font-mono text-xs">{r.sku}</TD>
                    <TD className="font-medium">
                      {r.name}
                      {!r.isActive && <Badge variant="secondary" className="ml-2">Inactive</Badge>}
                    </TD>
                    <TD className="text-muted-foreground">{r.hsnCode ?? '—'}</TD>
                    <TD className="text-right">{formatINR(r.purchasePrice)}</TD>
                    <TD className="text-right">{formatINR(r.sellingPrice)}</TD>
                    <TD>{r.taxName ?? '—'}</TD>
                    <TD className="text-right">
                      {r.trackInventory ? (
                        <span className={low ? 'inline-flex items-center gap-1 font-semibold text-warning' : ''}>
                          {low && <AlertTriangle className="size-3.5" />}
                          {formatQty(r.currentStock)} {r.unitSymbol ?? ''}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => void openEdit(r.id)}>
                          <Pencil className="size-4" />
                        </Button>
                        {canManage && (
                          <Button variant="ghost" size="icon" onClick={() => void remove(r)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={form.id ? 'Edit item' : 'New item'}
        description="Define pricing, tax and inventory tracking."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Save item
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="SKU *"><Input value={form.sku} onChange={up('sku')} /></FormField>
          <FormField label="Item name *"><Input value={form.name} onChange={up('name')} /></FormField>
          <FormField label="HSN / SAC code"><Input value={form.hsnCode} onChange={up('hsnCode')} /></FormField>
          <FormField label="Barcode"><Input value={form.barcode} onChange={up('barcode')} /></FormField>
          <FormField label="Unit">
            <Select value={form.unitId} onChange={up('unitId')}>
              <option value="">—</option>
              {refs.units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.symbol})</option>)}
            </Select>
          </FormField>
          <FormField label="GST tax rate">
            <Select value={form.taxRateId} onChange={up('taxRateId')}>
              <option value="">—</option>
              {refs.taxRates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Purchase price (₹)"><Input type="number" step="0.01" value={form.purchasePrice} onChange={up('purchasePrice')} /></FormField>
          <FormField label="Selling price (₹)"><Input type="number" step="0.01" value={form.sellingPrice} onChange={up('sellingPrice')} /></FormField>

          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.sellingPriceIsInclusive} onChange={toggle('sellingPriceIsInclusive')} className="size-4" />
            Selling price is inclusive of tax (MRP)
          </label>

          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.trackInventory} onChange={toggle('trackInventory')} className="size-4" />
            Track inventory for this item
          </label>

          {form.trackInventory && (
            <>
              <FormField label="Reorder level"><Input type="number" step="0.01" value={form.reorderLevel} onChange={up('reorderLevel')} /></FormField>
              {!form.id && (
                <>
                  <FormField label="Opening stock"><Input type="number" step="0.01" value={form.openingStock} onChange={up('openingStock')} /></FormField>
                  <FormField label="Opening stock value (₹)"><Input type="number" step="0.01" value={form.openingStockValue} onChange={up('openingStockValue')} /></FormField>
                </>
              )}
            </>
          )}

          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isActive} onChange={toggle('isActive')} className="size-4" />
            Active
          </label>
        </div>
      </Dialog>
    </div>
  )
}

function FormField({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate?: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center text-muted-foreground">
      <Package className="size-10 text-primary/50" />
      <p className="text-lg font-medium text-foreground">No items yet</p>
      <p className="max-w-sm text-sm">Add your first product or service to start billing.</p>
      {onCreate && <Button onClick={onCreate} className="mt-2"><Plus /> New item</Button>}
    </div>
  )
}
