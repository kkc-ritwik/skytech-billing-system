import { useState } from 'react'
import { ChevronDown, LogOut, User, KeyRound, ShieldQuestion, Loader2 } from 'lucide-react'
import { invoke, ApiError } from '@renderer/lib/api'
import { CHANNELS, type AuthUser } from '@shared/ipc'
import { ROLE_LABELS } from '@shared/permissions'
import { useApp } from '@renderer/store/app'
import { toast } from '@renderer/store/toast'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Dialog } from '@renderer/components/ui/dialog'
import { RecoveryCodeCard } from '@renderer/components/RecoveryCodeCard'

export function AccountMenu(): JSX.Element {
  const { user, logout, setUser } = useApp()
  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'profile' | 'password' | 'recovery' | null>(null)

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
        <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {user?.fullName?.charAt(0).toUpperCase()}
        </div>
        <div className="text-left">
          <p className="text-sm font-medium leading-tight">{user?.fullName}</p>
          <p className="text-xs text-muted-foreground">{user ? ROLE_LABELS[user.role] : ''}</p>
        </div>
        <ChevronDown className="size-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-52 rounded-md border bg-card p-1 shadow-lg" onMouseLeave={() => setOpen(false)}>
          <MenuItem icon={User} label="My profile" onClick={() => { setDialog('profile'); setOpen(false) }} />
          <MenuItem icon={KeyRound} label="Change password" onClick={() => { setDialog('password'); setOpen(false) }} />
          <MenuItem icon={ShieldQuestion} label="Recovery code" onClick={() => { setDialog('recovery'); setOpen(false) }} />
          <div className="my-1 border-t" />
          <button onClick={() => void logout()} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-destructive hover:bg-accent">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}

      {dialog === 'profile' && user && <ProfileDialog user={user} onClose={() => setDialog(null)} onSaved={setUser} />}
      {dialog === 'password' && <ChangePasswordDialog onClose={() => setDialog(null)} />}
      {dialog === 'recovery' && <RecoveryDialog onClose={() => setDialog(null)} />}
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof User; label: string; onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm hover:bg-accent">
      <Icon className="size-4 text-muted-foreground" /> {label}
    </button>
  )
}

function ProfileDialog({ user, onClose, onSaved }: { user: AuthUser; onClose: () => void; onSaved: (u: AuthUser) => void }): JSX.Element {
  const [fullName, setFullName] = useState(user.fullName)
  const [email, setEmail] = useState(user.email ?? '')
  const [busy, setBusy] = useState(false)
  async function save(): Promise<void> {
    setBusy(true)
    try {
      const updated = await invoke<AuthUser>(CHANNELS.authUpdateProfile, { fullName, email: email || null })
      onSaved(updated)
      toast.success('Profile updated.')
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onClose={onClose} title="My profile" className="max-w-md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save</Button></>}>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Username</Label><Input value={user.username} disabled /></div>
        <div className="space-y-1.5"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      </div>
    </Dialog>
  )
}

function ChangePasswordDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [oldPassword, setOld] = useState('')
  const [newPassword, setNew] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(): Promise<void> {
    if (newPassword !== confirm) return toast.error('Passwords do not match.')
    if (newPassword.length < 8) return toast.error('Password must be at least 8 characters.')
    setBusy(true)
    try {
      await invoke(CHANNELS.authChangePassword, { oldPassword, newPassword })
      toast.success('Password changed.')
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onClose={onClose} title="Change password" className="max-w-md"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void save()} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Update</Button></>}>
      <div className="space-y-4">
        <div className="space-y-1.5"><Label>Current password</Label><Input type="password" value={oldPassword} onChange={(e) => setOld(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>New password</Label><Input type="password" value={newPassword} onChange={(e) => setNew(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Confirm new password</Label><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      </div>
    </Dialog>
  )
}

function RecoveryDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function gen(): Promise<void> {
    if (!confirm('Generate a NEW recovery code? Your old code will stop working.')) return
    setBusy(true)
    try {
      const res = await invoke<{ recoveryCode: string }>(CHANNELS.authRegenRecovery)
      setCode(res.recoveryCode)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onClose={onClose} title="Recovery code" className="max-w-md" footer={<Button onClick={onClose}>Done</Button>}>
      {code ? (
        <RecoveryCodeCard code={code} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Your recovery code lets you reset your password if you forget it. For security the current
            code can't be shown again — but you can generate a fresh one (which replaces the old).
          </p>
          <Button onClick={() => void gen()} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Generate new recovery code</Button>
        </div>
      )}
    </Dialog>
  )
}
