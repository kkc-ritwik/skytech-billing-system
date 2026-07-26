import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, Download, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { useApp } from '@renderer/store/app'
import { formatDate } from '@renderer/lib/format'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'

interface AuditRow {
  id: string
  username: string | null
  action: string
  entityType: string | null
  entityId: string | null
  details: string | null
  ipOrHost: string | null
  createdAt: number
}

const PAGE = 50

/** Colour the module chip so scanning the trail is fast. */
function moduleTone(module: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (module === 'auth' || module === 'user') return 'destructive'
  if (module === 'sales' || module === 'payment') return 'default'
  if (module === 'purchase' || module === 'item' || module === 'party') return 'secondary'
  return 'outline'
}

/** "sales.invoice.save" -> "Invoice save" for a non-technical reader. */
function humanise(action: string): string {
  const rest = action.split('.').slice(1).join(' ') || action
  return rest.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function AuditPage(): JSX.Element {
  const canView = useApp((s) => s.has('audit:view'))

  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState('')
  const [module, setModule] = useState('')
  const [username, setUsername] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [facets, setFacets] = useState<{ modules: string[]; users: string[] }>({ modules: [], users: [] })
  const [expanded, setExpanded] = useState<string | null>(null)

  const filter = useCallback(
    () => ({
      search: search || undefined,
      module: module || undefined,
      username: username || undefined,
      from: from ? new Date(from).getTime() : undefined,
      // Include the whole end day, not just its first millisecond.
      to: to ? new Date(to).getTime() + 86_399_999 : undefined
    }),
    [search, module, username, from, to]
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await invoke<{ rows: AuditRow[]; total: number }>('audit:list', {
        ...filter(),
        limit: PAGE,
        offset: page * PAGE
      })
      setRows(res.rows)
      setTotal(res.total)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load the audit trail.')
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => {
    const t = setTimeout(() => void load(), 200)
    return () => clearTimeout(t)
  }, [load])

  useEffect(() => {
    void invoke<{ modules: string[]; users: string[] }>('audit:facets')
      .then(setFacets)
      .catch(() => undefined)
  }, [])

  // Any filter change puts us back on the first page.
  useEffect(() => {
    setPage(0)
  }, [search, module, username, from, to])

  async function exportCsv(): Promise<void> {
    setBusy(true)
    try {
      const res = await invoke<{ rows: number }>('audit:export', filter())
      toast.success(`Exported ${res.rows} entries.`)
    } catch (err) {
      if (err instanceof ApiError && /cancel/i.test(err.message)) return
      toast.error(err instanceof ApiError ? err.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!canView) {
    return (
      <div>
        <PageHeader title="Activity log" subtitle="You do not have permission to view the audit trail." />
      </div>
    )
  }

  const pages = Math.max(1, Math.ceil(total / PAGE))

  return (
    <div>
      <PageHeader
        title="Activity log"
        subtitle="Every change made in this system, who made it and when. Records are never edited or deleted."
        actions={
          <Button variant="outline" onClick={() => void exportCsv()} disabled={busy || !rows.length}>
            {busy ? <Loader2 className="animate-spin" /> : <Download />} Export CSV
          </Button>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <Label htmlFor="auditsearch">Search</Label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="auditsearch"
                className="pl-9"
                placeholder="Action, user or record id…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="auditmod">Area</Label>
            <Select id="auditmod" value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">All areas</option>
              {facets.modules.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="audituser">User</Label>
            <Select id="audituser" value={username} onChange={(e) => setUsername(e.target.value)}>
              <option value="">All users</option>
              {facets.users.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="auditfrom">From</Label>
              <Input id="auditfrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="auditto">To</Label>
              <Input id="auditto" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
            <Loader2 className="animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
            <ShieldCheck className="size-10 text-primary/40" />
            <p className="text-lg font-medium text-foreground">No activity matches this filter</p>
            <p className="text-sm">Try widening the date range or clearing the search.</p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="w-44">When</TH>
                <TH className="w-32">User</TH>
                <TH className="w-28">Area</TH>
                <TH>Action</TH>
                <TH className="w-44">Record</TH>
                <TH className="w-28">Computer</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const mod = r.action.split('.')[0]
                const open = expanded === r.id
                return (
                  <TR
                    key={r.id}
                    className={r.details ? 'cursor-pointer' : undefined}
                    onClick={() => r.details && setExpanded(open ? null : r.id)}
                  >
                    <TD className="whitespace-nowrap text-muted-foreground">
                      {formatDate(r.createdAt)}{' '}
                      <span className="tabular-nums">
                        {new Date(r.createdAt).toLocaleTimeString('en-IN', { hour12: false })}
                      </span>
                    </TD>
                    <TD className="font-medium">{r.username ?? '—'}</TD>
                    <TD>
                      <Badge variant={moduleTone(mod)}>{mod}</Badge>
                    </TD>
                    <TD>
                      <div>{humanise(r.action)}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.action}</div>
                      {open && r.details && (
                        <pre className="mt-2 max-w-xl overflow-x-auto rounded bg-muted p-2 text-xs">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(r.details), null, 2)
                            } catch {
                              return r.details
                            }
                          })()}
                        </pre>
                      )}
                    </TD>
                    <TD className="text-xs text-muted-foreground">
                      {r.entityType ?? '—'}
                      {r.entityId && <div className="font-mono">{r.entityId.slice(0, 12)}…</div>}
                    </TD>
                    <TD className="text-xs text-muted-foreground">{r.ipOrHost ?? '—'}</TD>
                  </TR>
                )
              })}
            </TBody>
          </Table>
        )}

        {total > PAGE && (
          <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
            <span>
              Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
