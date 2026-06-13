import { useState } from 'react'
import { Copy, KeyRound, Loader2, ShieldCheck, ShieldX, Clock } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { toast } from '@renderer/store/toast'
import { useApp } from '@renderer/store/app'
import { CHANNELS } from '@shared/ipc'
import { editionLabel } from '@shared/app-config'
import { UpgradeContact } from '@renderer/components/UpgradeContact'
import { formatDate } from '@renderer/lib/format'
import { PageHeader } from '@renderer/components/PageHeader'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Dialog } from '@renderer/components/ui/dialog'

const statusMeta: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive'; Icon: typeof ShieldCheck }> = {
  active: { label: 'Licensed', variant: 'success', Icon: ShieldCheck },
  trial: { label: 'Trial', variant: 'warning', Icon: Clock },
  grace: { label: 'Grace period', variant: 'warning', Icon: Clock },
  expired: { label: 'Not licensed', variant: 'destructive', Icon: ShieldX }
}

export function LicensePage(): JSX.Element {
  const { license, activate, refreshLicense } = useApp()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [confirmCode, setConfirmCode] = useState<string | null>(null)

  if (!license) return <div className="py-20 text-center text-muted-foreground">Loading…</div>
  const meta = statusMeta[license.status] ?? statusMeta.expired
  const machineId = license.machineFingerprint

  function copy(text: string): void {
    navigator.clipboard.writeText(text)
    toast.success('Copied.')
  }

  async function onActivate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await activate(key.trim())
      if (res.isUsable) toast.success('License activated. Thank you!')
      setKey('')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Activation failed.')
    } finally {
      setBusy(false)
    }
  }

  async function onDeactivate(): Promise<void> {
    setBusy(true)
    try {
      const res = await invoke<{ confirmationCode: string }>(CHANNELS.licenseDeactivate)
      setConfirmCode(res.confirmationCode)
      setDeactivateOpen(false)
      await refreshLicense()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Deactivation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageHeader title="License" subtitle="Activate, view, or move your license to another computer." />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2"><meta.Icon className="size-5 text-primary" /> Status</span>
              <Badge variant={meta.variant}>{meta.label}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{license.message}</p>
            <Row label="Licensed to" value={license.licensedTo ?? '—'} />
            <Row label="Edition" value={editionLabel(license.edition)} />
            <Row label="Expires" value={license.expiresAt ? formatDate(license.expiresAt) : license.status === 'active' ? 'Never (perpetual)' : '—'} />
            <Row label="Days remaining" value={license.daysRemaining != null ? String(license.daysRemaining) : '—'} />
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Machine ID</Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-muted px-2 py-1 text-xs">{machineId}</code>
                <Button type="button" variant="outline" size="icon" onClick={() => copy(machineId)}><Copy /></Button>
              </div>
            </div>
            {(license.status === 'active' || license.status === 'grace') && (
              <Button variant="outline" className="mt-2 text-destructive" onClick={() => setDeactivateOpen(true)}>
                Deactivate this device…
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Activate */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="size-5 text-primary" /> Activate</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="mb-4 space-y-3" onSubmit={onActivate}>
              <div className="space-y-1.5">
                <Label>License key</Label>
                <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="LL1.xxxxx.xxxxx" required />
              </div>
              <Button type="submit" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Activate</Button>
            </form>
            <UpgradeContact compact />
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
        title="Deactivate this device?"
        description="Use this when moving the license to a new computer. This device will lock until re-activated."
        footer={<><Button variant="outline" onClick={() => setDeactivateOpen(false)}>Cancel</Button><Button variant="destructive" onClick={() => void onDeactivate()} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Deactivate</Button></>}
      >
        <p className="text-sm text-muted-foreground">
          After deactivating, you'll get a confirmation code. Send it to us as proof, and we'll issue a new key for your other computer.
        </p>
      </Dialog>

      <Dialog
        open={!!confirmCode}
        onClose={() => setConfirmCode(null)}
        title="Device deactivated"
        footer={<Button onClick={() => setConfirmCode(null)}>Done</Button>}
      >
        <p className="text-sm text-muted-foreground">Send this confirmation code to your vendor to transfer your license:</p>
        <div className="mt-3 flex items-center gap-2">
          <code className="flex-1 break-all rounded bg-muted px-2 py-2 text-sm">{confirmCode}</code>
          <Button variant="outline" size="icon" onClick={() => confirmCode && copy(confirmCode)}><Copy /></Button>
        </div>
      </Dialog>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
