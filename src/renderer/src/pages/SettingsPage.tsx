import { useEffect, useState } from 'react'
import { Loader2, Save, Building2, CreditCard, SlidersHorizontal, DatabaseBackup, ImageIcon, Trash2 } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { confirmAction } from '@renderer/store/confirm'
import { useApp } from '@renderer/store/app'
import type { CompanyInput } from '@shared/dto'
import { CHANNELS } from '@shared/ipc'
import { formatDate } from '@renderer/lib/format'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Select } from '@renderer/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'

type Form = Record<keyof CompanyInput, string>

const emptyForm: Form = {
  legalName: '', tradeName: '', gstin: '', pan: '', addressLine1: '', addressLine2: '',
  city: '', state: '', stateCode: '', pincode: '', phone: '', email: '', website: '',
  bankName: '', bankAccountNo: '', bankIfsc: '', bankBranch: '', upiId: '', defaultTermsAndConditions: ''
}

export function SettingsPage(): JSX.Element {
  const canManage = useApp((s) => s.has('settings:manage'))
  const canBackup = useApp((s) => s.has('backup:manage'))
  const [form, setForm] = useState<Form>(emptyForm)
  const [prefs, setPrefs] = useState<{
    paperSize: string
    preventNegativeStock: boolean
    invoiceTemplate: string
    invoiceInvocation: string
    defaultSchemeLabel: string
    defaultSchemePct: number
    defaultCutLength: number
    defaultTransportName: string
  }>({
    paperSize: 'A4',
    preventNegativeStock: true,
    invoiceTemplate: 'standard',
    invoiceInvocation: '',
    defaultSchemeLabel: 'DISCOUNT',
    defaultSchemePct: 0,
    defaultCutLength: 0,
    defaultTransportName: ''
  })
  const [logo, setLogo] = useState<string | null>(null)
  const [autoBackup, setAutoBackup] = useState<{ dir: string | null; lastAt: number | null }>({ dir: null, lastAt: null })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const [c, s, l] = await Promise.all([
          invoke<any>('settings:company:get'),
          invoke<any>('settings:get'),
          invoke<{ dataUrl: string | null }>('settings:logo:get')
        ])
        if (c) {
          const next = { ...emptyForm }
          for (const k of Object.keys(emptyForm) as (keyof Form)[]) next[k] = c[k] ?? ''
          setForm(next)
        }
        setPrefs({
          paperSize: s?.paperSize ?? 'A4',
          preventNegativeStock: s?.preventNegativeStock !== false,
          invoiceTemplate: (s?.invoiceTemplate as string) ?? 'standard',
          invoiceInvocation: (s?.invoiceInvocation as string) ?? '',
          defaultSchemeLabel: (s?.defaultSchemeLabel as string) ?? 'DISCOUNT',
          defaultSchemePct: (s?.defaultSchemePct as number) ?? 0,
          defaultCutLength: (s?.defaultCutLength as number) ?? 0,
          defaultTransportName: (s?.defaultTransportName as string) ?? ''
        })
        setLogo(l?.dataUrl ?? null)
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Failed to load settings.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!canBackup) return
    void invoke<{ dir: string | null; lastAt: number | null }>('backup:autoGet').then(setAutoBackup).catch(() => undefined)
  }, [canBackup])

  async function pickLogo(): Promise<void> {
    try {
      const res = await invoke<{ dataUrl: string | null }>('settings:logo:pick')
      setLogo(res.dataUrl)
      if (res.dataUrl) toast.success('Logo updated.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not set logo.')
    }
  }
  async function removeLogo(): Promise<void> {
    try {
      await invoke('settings:logo:remove')
      setLogo(null)
      toast.success('Logo removed.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove logo.')
    }
  }

  async function savePrefs(patch: Partial<typeof prefs>): Promise<void> {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try {
      await invoke('settings:save', patch)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save preference.')
    }
  }

  async function backup(): Promise<void> {
    setBusy(true)
    try {
      await invoke(CHANNELS.backupCreate)
      toast.success('Backup saved.')
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'VALIDATION')) toast.error(err instanceof ApiError ? err.message : 'Backup failed.')
    } finally {
      setBusy(false)
    }
  }

  async function restore(): Promise<void> {
    const ok = await confirmAction({
      title: 'Restore from backup?',
      message:
        'This replaces ALL current data with the contents of the backup and restarts the app. ' +
        'Anything entered since that backup was taken will be lost.',
      confirmLabel: 'Overwrite & restore',
      destructive: true
    })
    if (!ok) return
    setBusy(true)
    try {
      await invoke(CHANNELS.backupRestore)
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'VALIDATION')) toast.error(err instanceof ApiError ? err.message : 'Restore failed.')
    } finally {
      setBusy(false)
    }
  }

  async function chooseAutoBackup(): Promise<void> {
    try {
      const res = await invoke<{ dir: string | null; lastAt: number | null }>('backup:autoChoose')
      setAutoBackup(res)
      if (res.dir) toast.success('Automatic backups enabled.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not enable auto-backup.')
    }
  }
  async function disableAutoBackup(): Promise<void> {
    try {
      await invoke('backup:autoDisable')
      setAutoBackup({ dir: null, lastAt: null })
      toast.success('Automatic backups disabled.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed.')
    }
  }

  const up = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(): Promise<void> {
    setSaving(true)
    try {
      const payload = Object.fromEntries(
        Object.entries(form).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])
      ) as unknown as CompanyInput
      payload.legalName = form.legalName.trim()
      await invoke('settings:company:save', payload)
      toast.success('Company details saved.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Your company identity appears on every invoice and document."
        actions={canManage ? <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save</Button> : null}
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="size-5 text-primary" /> Company profile</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2 flex items-center gap-4 rounded-lg border bg-muted/30 p-3">
              <div className="flex h-16 w-32 items-center justify-center overflow-hidden rounded-md border bg-card">
                {logo ? (
                  <img src={logo} alt="logo" className="max-h-16 max-w-32 object-contain" />
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">Company logo</p>
                <p className="mb-2 text-xs text-muted-foreground">Shown on invoices & PDFs. PNG/JPG.</p>
                {canManage && (
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void pickLogo()}>Upload</Button>
                    {logo && <Button type="button" size="sm" variant="ghost" onClick={() => void removeLogo()}><Trash2 className="size-4 text-destructive" /></Button>}
                  </div>
                )}
              </div>
            </div>
            <Field label="Legal name *"><Input value={form.legalName} onChange={up('legalName')} disabled={!canManage} /></Field>
            <Field label="Trade name"><Input value={form.tradeName} onChange={up('tradeName')} disabled={!canManage} /></Field>
            <Field label="GSTIN"><Input value={form.gstin} onChange={up('gstin')} disabled={!canManage} /></Field>
            <Field label="PAN"><Input value={form.pan} onChange={up('pan')} disabled={!canManage} /></Field>
            <div className="col-span-2"><Field label="Address line 1"><Input value={form.addressLine1} onChange={up('addressLine1')} disabled={!canManage} /></Field></div>
            <div className="col-span-2"><Field label="Address line 2"><Input value={form.addressLine2} onChange={up('addressLine2')} disabled={!canManage} /></Field></div>
            <Field label="City"><Input value={form.city} onChange={up('city')} disabled={!canManage} /></Field>
            <Field label="State"><Input value={form.state} onChange={up('state')} disabled={!canManage} /></Field>
            <Field label="State code (GST)"><Input value={form.stateCode} onChange={up('stateCode')} placeholder="e.g. 09" disabled={!canManage} /></Field>
            <Field label="Pincode"><Input value={form.pincode} onChange={up('pincode')} disabled={!canManage} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={up('phone')} disabled={!canManage} /></Field>
            <Field label="Email"><Input value={form.email} onChange={up('email')} disabled={!canManage} /></Field>
            <Field label="Website"><Input value={form.website} onChange={up('website')} disabled={!canManage} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCard className="size-5 text-primary" /> Bank & payment details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label="Bank name"><Input value={form.bankName} onChange={up('bankName')} disabled={!canManage} /></Field>
            <Field label="Account number"><Input value={form.bankAccountNo} onChange={up('bankAccountNo')} disabled={!canManage} /></Field>
            <Field label="IFSC"><Input value={form.bankIfsc} onChange={up('bankIfsc')} disabled={!canManage} /></Field>
            <Field label="Branch"><Input value={form.bankBranch} onChange={up('bankBranch')} disabled={!canManage} /></Field>
            <Field label="UPI ID"><Input value={form.upiId} onChange={up('upiId')} placeholder="name@bank" disabled={!canManage} /></Field>
            <div className="col-span-2">
              <Field label="Default invoice terms & conditions">
                <textarea
                  className="flex min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  value={form.defaultTermsAndConditions}
                  onChange={up('defaultTermsAndConditions')}
                  disabled={!canManage}
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="size-5 text-primary" /> Preferences</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field label="Invoice paper size">
              <Select value={prefs.paperSize} onChange={(e) => void savePrefs({ paperSize: e.target.value })} disabled={!canManage}>
                <option value="A4">A4</option>
                <option value="A5">A5</option>
              </Select>
            </Field>
            <Field label="Invoice template">
              <Select
                value={prefs.invoiceTemplate}
                onChange={(e) => void savePrefs({ invoiceTemplate: e.target.value })}
                disabled={!canManage}
              >
                <option value="standard">Standard GST</option>
                <option value="textile">Textile GST (PCS / CUT / MTS)</option>
              </Select>
            </Field>
            <div className="col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={prefs.preventNegativeStock}
                  onChange={(e) => void savePrefs({ preventNegativeStock: e.target.checked })} disabled={!canManage} />
                Prevent negative stock — block an invoice if there isn't enough inventory
              </label>
            </div>

            {prefs.invoiceTemplate === 'textile' && (
              <>
                <div className="col-span-2 border-t pt-3 text-xs font-medium uppercase text-muted-foreground">
                  Textile bill defaults
                </div>
                <Field label="Invocation line (printed above the firm name)">
                  <Input
                    defaultValue={prefs.invoiceInvocation}
                    placeholder="Shree Ganeshaya Namah"
                    disabled={!canManage}
                    onBlur={(e) => void savePrefs({ invoiceInvocation: e.target.value })}
                  />
                </Field>
                <Field label="Default transport">
                  <Input
                    defaultValue={prefs.defaultTransportName}
                    placeholder="ANCHAL LOGISTICS"
                    disabled={!canManage}
                    onBlur={(e) => void savePrefs({ defaultTransportName: e.target.value })}
                  />
                </Field>
                <Field label="Default scheme label">
                  <Input
                    defaultValue={prefs.defaultSchemeLabel}
                    placeholder="DISCOUNT"
                    disabled={!canManage}
                    onBlur={(e) => void savePrefs({ defaultSchemeLabel: e.target.value })}
                  />
                </Field>
                <Field label="Default scheme %">
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={prefs.defaultSchemePct / 100}
                    disabled={!canManage}
                    onBlur={(e) => void savePrefs({ defaultSchemePct: Math.round(Number(e.target.value || 0) * 100) })}
                  />
                </Field>
                <Field label="Default cut (metres per piece)">
                  <Input
                    type="number"
                    step="0.01"
                    defaultValue={prefs.defaultCutLength}
                    placeholder="6.30"
                    disabled={!canManage}
                    onBlur={(e) => void savePrefs({ defaultCutLength: Number(e.target.value || 0) })}
                  />
                </Field>
              </>
            )}
          </CardContent>
        </Card>

        {canBackup && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><DatabaseBackup className="size-5 text-primary" /> Backup & restore</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => void backup()} disabled={busy}>Create backup…</Button>
                <Button variant="outline" onClick={() => void restore()} disabled={busy}>Restore from backup…</Button>
                <p className="text-xs text-muted-foreground">Your data lives only on this computer. Back it up regularly (e.g. to a USB drive).</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Automatic daily backups</p>
                    <p className="text-xs text-muted-foreground">
                      {autoBackup.dir ? <>Saving to <code className="rounded bg-background px-1">{autoBackup.dir}</code></> : 'Off — pick a folder (e.g. a cloud-synced or USB folder).'}
                      {autoBackup.lastAt ? ` · Last: ${formatDate(autoBackup.lastAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => void chooseAutoBackup()}>{autoBackup.dir ? 'Change folder' : 'Enable'}</Button>
                    {autoBackup.dir && <Button variant="ghost" size="sm" onClick={() => void disableAutoBackup()}>Disable</Button>}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Moving to a new PC? Create a backup here, install Shailee-GRMS there, then use
                <strong> Restore from backup</strong>. Your license is per-computer — deactivate on the
                old PC (License page) and we'll issue a key for the new one.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
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
