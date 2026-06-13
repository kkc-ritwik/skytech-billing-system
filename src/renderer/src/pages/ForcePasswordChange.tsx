import { useState } from 'react'
import { KeyRound, Loader2, LogOut } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { CHANNELS } from '@shared/ipc'
import { useApp } from '@renderer/store/app'
import { toast } from '@renderer/store/toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'

/** Shown when a freshly-created staff account must set its own password. */
export function ForcePasswordChange(): JSX.Element {
  const { user, refreshMe, logout } = useApp()
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (newPassword !== confirm) return toast.error('Passwords do not match.')
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters.')
    setBusy(true)
    try {
      await invoke(CHANNELS.authChangePassword, { oldPassword, newPassword })
      await refreshMe()
      toast.success('Password updated.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-accent p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <KeyRound className="size-6" />
          </div>
          <CardTitle className="text-2xl">Set your password</CardTitle>
          <CardDescription>
            Welcome {user?.fullName?.split(' ')[0]}! For security, please choose your own password
            before continuing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label>Current (temporary) password</Label>
              <Input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Confirm new password</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Update & continue
            </Button>
            <button type="button" onClick={() => void logout()} className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <LogOut className="size-3" /> Sign out
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
