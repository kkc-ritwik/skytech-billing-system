import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Printer, Search, X, Plus, Minus, AlertTriangle } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { formatINR } from '@renderer/lib/format'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Dialog } from '@renderer/components/ui/dialog'
import { Badge } from '@renderer/components/ui/badge'

export interface LabelItem {
  id: string
  sku: string
  name: string
  barcode: string | null
  sellingPrice: number
  currentStock: number
}

export interface LabelSheet {
  pageWidthMm: number
  pageHeightMm: number
  marginTopMm: number
  marginRightMm: number
  marginBottomMm: number
  marginLeftMm: number
  labelWidthMm: number
  labelHeightMm: number
  columnGapMm: number
  rowGapMm: number
  showName: boolean
  showSku: boolean
  showPrice: boolean
  skipLabels: number
}

interface Layout {
  columns: number
  rows: number
  perSheet: number
  totalLabels: number
  sheets: number
  moduleWidthMm: number
  tooSmallToScan: boolean
}

/**
 * Label stock a shop can buy off the shelf in India, plus the two roll sizes
 * that thermal barcode printers ship with. "Custom" leaves every box editable.
 */
const PRESETS: { id: string; label: string; sheet: Omit<LabelSheet, 'showName' | 'showSku' | 'showPrice' | 'skipLabels'> }[] = [
  {
    id: 'a4-65',
    label: 'A4 sheet — 65 labels (38.1 × 21.2 mm)',
    sheet: { pageWidthMm: 210, pageHeightMm: 297, marginTopMm: 8, marginRightMm: 5, marginBottomMm: 8, marginLeftMm: 5, labelWidthMm: 38.1, labelHeightMm: 21.2, columnGapMm: 0, rowGapMm: 0 }
  },
  {
    id: 'a4-48',
    label: 'A4 sheet — 48 labels (45.7 × 21.2 mm)',
    sheet: { pageWidthMm: 210, pageHeightMm: 297, marginTopMm: 9, marginRightMm: 8, marginBottomMm: 9, marginLeftMm: 8, labelWidthMm: 45.7, labelHeightMm: 21.2, columnGapMm: 2.5, rowGapMm: 0 }
  },
  {
    id: 'a4-24',
    label: 'A4 sheet — 24 labels (63.5 × 33.9 mm)',
    sheet: { pageWidthMm: 210, pageHeightMm: 297, marginTopMm: 13, marginRightMm: 7, marginBottomMm: 13, marginLeftMm: 7, labelWidthMm: 63.5, labelHeightMm: 33.9, columnGapMm: 2.5, rowGapMm: 0 }
  },
  {
    id: 'a4-12',
    label: 'A4 sheet — 12 labels (105 × 48 mm)',
    sheet: { pageWidthMm: 210, pageHeightMm: 297, marginTopMm: 21, marginRightMm: 0, marginBottomMm: 21, marginLeftMm: 0, labelWidthMm: 105, labelHeightMm: 42.3, columnGapMm: 0, rowGapMm: 0 }
  },
  {
    id: 'roll-50-25',
    label: 'Thermal roll — 50 × 25 mm (1 across)',
    sheet: { pageWidthMm: 50, pageHeightMm: 25, marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0, labelWidthMm: 50, labelHeightMm: 25, columnGapMm: 0, rowGapMm: 0 }
  },
  {
    id: 'roll-38-25',
    label: 'Thermal roll — 38 × 25 mm (1 across)',
    sheet: { pageWidthMm: 38, pageHeightMm: 25, marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 0, labelWidthMm: 38, labelHeightMm: 25, columnGapMm: 0, rowGapMm: 0 }
  },
  {
    id: 'roll-50-25-2up',
    label: 'Thermal roll — 50 × 25 mm (2 across)',
    sheet: { pageWidthMm: 104, pageHeightMm: 25, marginTopMm: 0, marginRightMm: 0, marginBottomMm: 0, marginLeftMm: 2, labelWidthMm: 50, labelHeightMm: 25, columnGapMm: 2, rowGapMm: 0 }
  }
]

export const DEFAULT_SHEET: LabelSheet = {
  ...PRESETS[0].sheet,
  showName: true,
  showSku: true,
  showPrice: true,
  skipLabels: 0
}

const SETTINGS_KEY = 'labelSheet'

interface Props {
  open: boolean
  onClose: () => void
  items: LabelItem[]
  /** Items ticked when the dialog opens, e.g. the row the user clicked. */
  initialSelection?: string[]
  canPrint: boolean
}

export function LabelPrintDialog({ open, onClose, items, initialSelection, canPrint }: Props): JSX.Element {
  const [search, setSearch] = useState('')
  const [qty, setQty] = useState<Record<string, number>>({})
  const [sheet, setSheet] = useState<LabelSheet>(DEFAULT_SHEET)
  const [presetId, setPresetId] = useState('a4-65')
  const [preview, setPreview] = useState<string>('')
  const [layout, setLayout] = useState<Layout | null>(null)
  const [previewError, setPreviewError] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const previewSeq = useRef(0)

  const barcoded = useMemo(() => items.filter((i) => i.barcode), [items])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return barcoded
    return barcoded.filter((i) => i.name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q) || (i.barcode ?? '').includes(q))
  }, [barcoded, search])

  const selected = useMemo(
    () => Object.entries(qty).filter(([, n]) => n > 0).map(([itemId, copies]) => ({ itemId, copies })),
    [qty]
  )
  const totalLabels = useMemo(() => selected.reduce((a, l) => a + l.copies, 0), [selected])

  // Restore the last sheet the shop used, so the mm figures are typed once.
  useEffect(() => {
    if (!open) return
    setSearch('')
    setPreviewError('')
    void (async () => {
      try {
        const s = await invoke<Record<string, unknown>>('settings:get', {})
        const saved = s?.[SETTINGS_KEY] as (LabelSheet & { presetId?: string }) | undefined
        if (saved && typeof saved.labelWidthMm === 'number') {
          setSheet({ ...DEFAULT_SHEET, ...saved })
          if (saved.presetId) setPresetId(saved.presetId)
        }
      } catch {
        /* first run, or no permission to read settings — defaults are fine */
      }
    })()
    const init: Record<string, number> = {}
    for (const id of initialSelection ?? []) init[id] = 1
    setQty(init)
  }, [open, initialSelection])

  function applyPreset(id: string): void {
    setPresetId(id)
    const p = PRESETS.find((x) => x.id === id)
    if (p) setSheet((s) => ({ ...s, ...p.sheet }))
  }

  const field = (k: keyof LabelSheet) => ({
    value: String(sheet[k] as number),
    onChange: (e: React.ChangeEvent<HTMLInputElement>): void => {
      const v = e.target.value === '' ? 0 : Number(e.target.value)
      if (Number.isNaN(v)) return
      setPresetId('custom')
      setSheet((s) => ({ ...s, [k]: v }))
    }
  })

  /** Ask the main process for the real print HTML, so preview == printout. */
  const refreshPreview = useCallback(async () => {
    if (!selected.length) {
      setPreview('')
      setLayout(null)
      setPreviewError('')
      return
    }
    const seq = ++previewSeq.current
    setPreviewing(true)
    try {
      const res = await invoke<{ html: string; layout: Layout }>('barcode:labelPreview', { lines: selected, sheet })
      if (seq !== previewSeq.current) return
      setPreview(res.html)
      setLayout(res.layout)
      setPreviewError('')
    } catch (err) {
      if (seq !== previewSeq.current) return
      setPreview('')
      setLayout(null)
      setPreviewError(err instanceof ApiError ? err.message : 'Could not build the preview.')
    } finally {
      if (seq === previewSeq.current) setPreviewing(false)
    }
  }, [selected, sheet])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => void refreshPreview(), 350)
    return () => clearTimeout(t)
  }, [open, refreshPreview])

  function setCopies(id: string, n: number): void {
    setQty((q) => {
      const next = { ...q }
      if (n <= 0) delete next[id]
      else next[id] = Math.min(1000, n)
      return next
    })
  }

  function addAllInView(): void {
    setQty((q) => {
      const next = { ...q }
      for (const i of visible) if (!next[i.id]) next[i.id] = 1
      return next
    })
  }

  /** One label per piece currently in stock — the usual intake job. */
  function matchStock(): void {
    setQty((q) => {
      const next = { ...q }
      for (const i of visible) {
        const n = Math.max(0, Math.floor(i.currentStock))
        if (n > 0) next[i.id] = Math.min(1000, n)
      }
      return next
    })
  }

  async function print(): Promise<void> {
    if (!selected.length) return toast.error('Tick at least one item to print.')
    setBusy(true)
    try {
      await invoke('barcode:labels', { lines: selected, sheet })
      try {
        await invoke('settings:save', { [SETTINGS_KEY]: { ...sheet, presetId } })
      } catch {
        /* saving the preference is a convenience, never a reason to fail the print */
      }
      toast.success(`${totalLabels} label${totalLabels === 1 ? '' : 's'} sent to PDF.`)
      onClose()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VALIDATION' && /cancel/i.test(err.message)) return
      toast.error(err instanceof ApiError ? err.message : 'Could not create the labels.')
    } finally {
      setBusy(false)
    }
  }

  const noBarcodes = barcoded.length === 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Print barcode labels"
      description="Pick the items, set how many labels each one needs, then set your label sheet size in millimetres."
      className="max-w-[1100px]"
      footer={
        <div className="flex w-full items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {totalLabels > 0 ? (
              <>
                <b className="text-foreground">{totalLabels}</b> label{totalLabels === 1 ? '' : 's'} from{' '}
                {selected.length} item{selected.length === 1 ? '' : 's'}
                {layout ? (
                  <>
                    {' '}· {layout.columns} across × {layout.rows} down = <b className="text-foreground">{layout.perSheet}</b> per sheet ·{' '}
                    <b className="text-foreground">{layout.sheets}</b> sheet{layout.sheets === 1 ? '' : 's'}
                  </>
                ) : null}
              </>
            ) : (
              'Nothing selected yet.'
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => void print()} disabled={busy || !selected.length || !canPrint || !!previewError}>
              {busy ? <Loader2 className="animate-spin" /> : <Printer />} Print labels
            </Button>
          </div>
        </div>
      }
    >
      {noBarcodes ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          None of your items have a barcode yet. Close this and press <b>Generate barcodes</b> first.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          {/* ---------------------------------------------------------- items */}
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search item, SKU or barcode"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" onClick={addAllInView}>Add all</Button>
              <Button variant="outline" size="sm" onClick={matchStock} title="One label per piece in stock">
                Match stock
              </Button>
              {selected.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setQty({})} title="Clear selection">
                  <X />
                </Button>
              )}
            </div>

            <div className="max-h-[46vh] overflow-auto rounded-md border">
              {visible.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground">No barcoded item matches “{search}”.</div>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {visible.map((i) => {
                      const n = qty[i.id] ?? 0
                      return (
                        <tr key={i.id} className={n > 0 ? 'border-b bg-primary/5' : 'border-b'}>
                          <td className="p-2 align-middle">
                            <input
                              type="checkbox"
                              aria-label={`Select ${i.name}`}
                              checked={n > 0}
                              onChange={(e) => setCopies(i.id, e.target.checked ? 1 : 0)}
                            />
                          </td>
                          <td className="min-w-0 p-2 align-middle">
                            <div className="truncate font-medium">{i.name}</div>
                            <div className="truncate font-mono text-xs text-muted-foreground">
                              {i.sku} · {i.barcode} · {formatINR(i.sellingPrice)}
                            </div>
                          </td>
                          <td className="whitespace-nowrap p-2 text-right align-middle text-xs text-muted-foreground">
                            stock {i.currentStock}
                          </td>
                          <td className="p-2 align-middle">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="outline" size="sm" className="size-7 p-0" onClick={() => setCopies(i.id, n - 1)} title="One less">
                                <Minus className="size-3" />
                              </Button>
                              <Input
                                type="number"
                                min={0}
                                max={1000}
                                aria-label={`Labels for ${i.name}`}
                                className="h-7 w-16 text-right"
                                value={n === 0 ? '' : String(n)}
                                placeholder="0"
                                onChange={(e) => setCopies(i.id, e.target.value === '' ? 0 : Number(e.target.value))}
                              />
                              <Button variant="outline" size="sm" className="size-7 p-0" onClick={() => setCopies(i.id, n + 1)} title="One more">
                                <Plus className="size-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ---------------------------------------------------------- sheet */}
          <div className="min-w-0 space-y-3">
            <div>
              <Label>Label stock</Label>
              <Select value={presetId} onChange={(e) => applyPreset(e.target.value)}>
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
                <option value="custom">Custom size…</option>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sheet width (mm)</Label>
                <Input type="number" step="0.1" {...field('pageWidthMm')} />
              </div>
              <div>
                <Label>Sheet height (mm)</Label>
                <Input type="number" step="0.1" {...field('pageHeightMm')} />
              </div>
              <div>
                <Label>Label width (mm)</Label>
                <Input type="number" step="0.1" {...field('labelWidthMm')} />
              </div>
              <div>
                <Label>Label height (mm)</Label>
                <Input type="number" step="0.1" {...field('labelHeightMm')} />
              </div>
            </div>

            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Margins &amp; gaps (mm)</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><Label>Top margin</Label><Input type="number" step="0.1" {...field('marginTopMm')} /></div>
                <div><Label>Bottom margin</Label><Input type="number" step="0.1" {...field('marginBottomMm')} /></div>
                <div><Label>Left margin</Label><Input type="number" step="0.1" {...field('marginLeftMm')} /></div>
                <div><Label>Right margin</Label><Input type="number" step="0.1" {...field('marginRightMm')} /></div>
                <div><Label>Gap between columns</Label><Input type="number" step="0.1" {...field('columnGapMm')} /></div>
                <div><Label>Gap between rows</Label><Input type="number" step="0.1" {...field('rowGapMm')} /></div>
                <div className="col-span-2">
                  <Label>Skip used labels at the start</Label>
                  <Input
                    type="number"
                    min={0}
                    value={String(sheet.skipLabels)}
                    onChange={(e) => setSheet((s) => ({ ...s, skipLabels: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Feeding a part-used sheet back in? Leave the first few blank.
                  </p>
                </div>
              </div>
            </details>

            <div className="flex flex-wrap gap-4 text-sm">
              {(['showName', 'showSku', 'showPrice'] as const).map((k) => (
                <label key={k} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sheet[k]}
                    onChange={(e) => setSheet((s) => ({ ...s, [k]: e.target.checked }))}
                  />
                  {k === 'showName' ? 'Item name' : k === 'showSku' ? 'SKU' : 'Price'}
                </label>
              ))}
            </div>

            {previewError ? (
              <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{previewError}</span>
              </div>
            ) : layout?.tooSmallToScan ? (
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span>
                  At {sheet.labelWidthMm} mm wide each bar prints {layout.moduleWidthMm.toFixed(3)} mm across — below the
                  ~0.19 mm most handheld scanners need. It will print, but expect misreads. Use a wider label.
                </span>
              </div>
            ) : null}

            <div>
              <div className="mb-1 flex items-center gap-2">
                <Label className="mb-0">Preview</Label>
                {previewing && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                {layout && !previewing && (
                  <Badge variant="secondary">
                    sheet 1 of {layout.sheets} · {layout.perSheet} per sheet
                  </Badge>
                )}
              </div>
              <div className="flex h-[34vh] items-start justify-center overflow-auto rounded-md border bg-muted/40 p-3">
                {preview ? (
                  // The whole sheet is scaled to fit the panel. CSS mm are a
                  // fixed 96dpi (1 mm = 3.7795 px), so the factor has to be
                  // worked out in pixels — comparing a width in mm against a
                  // width in px silently leaves the sheet at 1:1 and clipped.
                  (() => {
                    const PX_PER_MM = 96 / 25.4
                    const boxW = 300
                    const wPx = sheet.pageWidthMm * PX_PER_MM
                    const hPx = sheet.pageHeightMm * PX_PER_MM
                    const scale = Math.min(1, boxW / Math.max(1, wPx))
                    return (
                      <div style={{ width: wPx * scale, height: hPx * scale, flex: '0 0 auto' }}>
                        <iframe
                          title="Label sheet preview"
                          srcDoc={preview}
                          scrolling="no"
                          className="origin-top-left border-0 bg-white shadow-sm"
                          style={{
                            width: `${wPx}px`,
                            height: `${hPx}px`,
                            transform: `scale(${scale})`
                          }}
                        />
                      </div>
                    )
                  })()
                ) : (
                  <div className="self-center text-center text-sm text-muted-foreground">
                    Tick an item to see the sheet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  )
}
