import { useState } from 'react'
import { Copy, KeyRound, Loader2, Lock } from 'lucide-react'
import { useApp } from '@renderer/store/app'
import { toast } from '@renderer/store/toast'
import { ApiError } from '@renderer/lib/api'
import { PRODUCT_NAME, TAGLINE } from '@shared/app-config'
import { UpgradeContact } from '@renderer/components/UpgradeContact'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'

export function LicenseLocked(): JSX.Element {
  const { license, activate } = useApp()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const machineId = license?.machineFingerprint ?? ''

  async function onActivate(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await activate(key.trim())
      if (res.isUsable) toast.success('License activated. Thank you!')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Activation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-accent p-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-warning/15 text-warning">
            <Lock className="size-6" />
          </div>
          <CardTitle className="text-2xl">{PRODUCT_NAME}</CardTitle>
          <CardDescription>
            {TAGLINE}
            <span className="mt-2 block font-medium text-foreground">{license?.message ?? 'Activation required.'}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border bg-muted/40 p-4">
            <Label className="text-xs uppercase text-muted-foreground">Your Machine ID</Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-background px-2 py-1 text-sm">{machineId}</code>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(machineId)
                  toast.success('Machine ID copied.')
                }}
              >
                <Copy />
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Share this Machine ID with us to purchase a license. We will send you a key bound to
              this computer.
            </p>
          </div>

          <form className="space-y-3" onSubmit={onActivate}>
            <div className="space-y-1.5">
              <Label>License key</Label>
              <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="LL1.xxxxx.xxxxx" required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Activate
            </Button>
          </form>

          <UpgradeContact />
        </CardContent>
      </Card>
    </div>
  )
}
