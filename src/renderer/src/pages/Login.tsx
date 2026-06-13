import { useState } from 'react'
import { Loader2, Receipt, ArrowLeft } from 'lucide-react'
import { useApp } from '@renderer/store/app'
import { toast } from '@renderer/store/toast'
import { invoke, ApiError } from '@renderer/lib/api'
import { CHANNELS } from '@shared/ipc'
import { PRODUCT_NAME, COMPANY_NAME, TAGLINE } from '@shared/app-config'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Badge } from '@renderer/components/ui/badge'
import { RecoveryCodeCard } from '@renderer/components/RecoveryCodeCard'

export function Login(): JSX.Element {
  const { login, license } = useApp()
  const [mode, setMode] = useState<'login' | 'forgot'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  // Forgot-password state
  const [recUser, setRecUser] = useState('')
  const [recCode, setRecCode] = useState('')
  const [recNew, setRecNew] = useState('')
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    try {
      await login(username, password)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  async function onReset(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (recNew.length < 8) return toast.error('New password must be at least 8 characters.')
    setBusy(true)
    try {
      const res = await invoke<{ recoveryCode: string }>(CHANNELS.authResetWithRecovery, {
        username: recUser,
        recoveryCode: recCode,
        newPassword: recNew
      })
      setNewRecoveryCode(res.recoveryCode)
      toast.success('Password reset. You can now sign in.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Reset failed.')
    } finally {
      setBusy(false)
    }
  }

  function backToLogin(): void {
    setMode('login')
    setNewRecoveryCode(null)
    setRecUser('')
    setRecCode('')
    setRecNew('')
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-primary to-blue-700 p-12 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Receipt className="size-6" /> {PRODUCT_NAME}
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">{TAGLINE}</h1>
          <p className="mt-4 max-w-md text-primary-foreground/80">
            GST invoicing, stock control, purchase & sales, payments and reports — all offline, all
            on your machine, all yours.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">© {new Date().getFullYear()} {COMPANY_NAME}</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <p className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-primary lg:hidden">
            <Receipt className="size-4" /> {PRODUCT_NAME}
          </p>

          {mode === 'login' ? (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold">Sign in</h2>
                <p className="text-sm text-muted-foreground">Enter your credentials to continue.</p>
                {license && (
                  <div className="mt-3">
                    {license.status === 'trial' && (
                      <Badge variant="warning">Free trial · {license.daysRemaining} day(s) left</Badge>
                    )}
                    {license.status === 'active' && <Badge variant="success">Licensed</Badge>}
                    {license.status === 'grace' && <Badge variant="warning">{license.message}</Badge>}
                  </div>
                )}
              </div>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus autoCapitalize="none" />
                </div>
                <div className="space-y-1.5">
                  <Label>Password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />} Sign in
                </Button>
                <button type="button" onClick={() => setMode('forgot')} className="block w-full text-center text-sm text-primary hover:underline">
                  Forgot password?
                </button>
              </form>
            </>
          ) : newRecoveryCode ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Password reset ✓</h2>
              <p className="text-sm text-muted-foreground">Your new recovery code (replaces the old one):</p>
              <RecoveryCodeCard code={newRecoveryCode} />
              <Button className="w-full" onClick={backToLogin}>Back to sign in</Button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold">Reset password</h2>
                <p className="text-sm text-muted-foreground">
                  Enter your username and the <strong>recovery code</strong> you saved when your account
                  was created.
                </p>
              </div>
              <form className="space-y-4" onSubmit={onReset}>
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input value={recUser} onChange={(e) => setRecUser(e.target.value)} required autoFocus autoCapitalize="none" />
                </div>
                <div className="space-y-1.5">
                  <Label>Recovery code</Label>
                  <Input value={recCode} onChange={(e) => setRecCode(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX" required />
                </div>
                <div className="space-y-1.5">
                  <Label>New password</Label>
                  <Input type="password" value={recNew} onChange={(e) => setRecNew(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />} Reset password
                </Button>
                <button type="button" onClick={backToLogin} className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-3" /> Back to sign in
                </button>
              </form>
              <p className="mt-4 text-center text-xs text-muted-foreground">
                Lost your recovery code? Ask an admin to reset your password, or contact support.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
