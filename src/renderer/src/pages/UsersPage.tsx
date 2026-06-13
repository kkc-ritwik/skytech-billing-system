import { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Pencil, Trash2, ShieldCheck } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { useApp } from '@renderer/store/app'
import { formatDate } from '@renderer/lib/format'
import { ROLE_LABELS, type Role } from '@shared/permissions'
import type { UserInput } from '@shared/dto'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Badge } from '@renderer/components/ui/badge'
import { Card } from '@renderer/components/ui/card'
import { Dialog } from '@renderer/components/ui/dialog'
import { Table, THead, TBody, TR, TH, TD } from '@renderer/components/ui/table'

interface UserRow {
  id: string; fullName: string; username: string; email: string | null
  role: Role; isActive: boolean; lastLoginAt: number | null
}
type FormState = { id?: string; fullName: string; username: string; email: string; role: Role; isActive: boolean; password: string }
const blank: FormState = { fullName: '', username: '', email: '', role: 'operator', isActive: true, password: '' }

export function UsersPage(): JSX.Element {
  const me = useApp((s) => s.user)
  const canManage = useApp((s) => s.has('users:manage'))
  const isSuperAdmin = me?.role === 'super_admin'
  const [rows, setRows] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(blank)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await invoke<UserRow[]>('users:list'))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function openCreate(): void { setForm(blank); setOpen(true) }
  function openEdit(r: UserRow): void {
    setForm({ id: r.id, fullName: r.fullName, username: r.username, email: r.email ?? '', role: r.role, isActive: r.isActive, password: '' })
    setOpen(true)
  }

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const payload: UserInput = {
        id: form.id,
        fullName: form.fullName.trim(),
        username: form.username.trim(),
        email: form.email || null,
        role: form.role,
        isActive: form.isActive,
        password: form.password || undefined
      }
      await invoke('users:save', payload)
      toast.success(form.id ? 'User updated.' : 'User created.')
      setOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(r: UserRow): Promise<void> {
    if (!confirm(`Delete user "${r.fullName}"?`)) return
    try {
      await invoke('users:delete', { id: r.id })
      toast.success('User deleted.')
      await load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed.')
    }
  }

  const up = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Staff accounts and their access levels."
        actions={canManage ? <Button onClick={openCreate}><Plus /> New user</Button> : null}
      />

      <Card>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground"><Loader2 className="animate-spin" /> Loading…</div>
        ) : (
          <Table>
            <THead><TR><TH>Name</TH><TH>Username</TH><TH>Role</TH><TH>Status</TH><TH>Last login</TH><TH></TH></TR></THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.fullName}{r.id === me?.id && <Badge variant="secondary" className="ml-2">You</Badge>}</TD>
                  <TD className="font-mono text-xs">{r.username}</TD>
                  <TD><Badge variant={r.role === 'super_admin' ? 'default' : 'secondary'}>{ROLE_LABELS[r.role]}</Badge></TD>
                  <TD>{r.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Disabled</Badge>}</TD>
                  <TD className="text-muted-foreground">{r.lastLoginAt ? formatDate(r.lastLoginAt) : 'Never'}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {canManage && <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="size-4" /></Button>}
                      {canManage && r.id !== me?.id && <Button variant="ghost" size="icon" onClick={() => void remove(r)}><Trash2 className="size-4 text-destructive" /></Button>}
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
        title={form.id ? 'Edit user' : 'New user'}
        description={form.id ? 'Leave password blank to keep it unchanged.' : 'The user will be asked to change this password at first login.'}
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Full name *"><Input value={form.fullName} onChange={up('fullName')} /></Field>
          <Field label="Username *"><Input value={form.username} onChange={up('username')} autoCapitalize="none" /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={up('email')} /></Field>
          <Field label="Role">
            <Select value={form.role} onChange={up('role')}>
              <option value="operator">{ROLE_LABELS.operator}</option>
              <option value="manager">{ROLE_LABELS.manager}</option>
              <option value="admin">{ROLE_LABELS.admin}</option>
              {isSuperAdmin && <option value="super_admin">{ROLE_LABELS.super_admin}</option>}
            </Select>
          </Field>
          <Field label={form.id ? 'Reset password' : 'Password *'}>
            <Input type="password" value={form.password} onChange={up('password')} placeholder={form.id ? '••••••••' : ''} />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="size-4" /> Active
            </label>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>Roles control what each user can see and do. Operators do data entry; Managers add reports & approvals; Admins run everything; Super Admins also manage users & licensing.</span>
        </div>
      </Dialog>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>
}
