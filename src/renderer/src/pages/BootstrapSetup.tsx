import { useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useApp } from '@renderer/store/app'
import { toast } from '@renderer/store/toast'
import { ApiError } from '@renderer/lib/api'
import { PRODUCT_NAME, TAGLINE } from '@shared/app-config'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'

export function BootstrapSetup(): JSX.Element {
  const bootstrap = useApp((s) => s.bootstrap)
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '', confirm: '', setupCode: '' })
  const [busy, setBusy] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const update = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (form.password !== form.confirm) return toast.error('Passwords do not match.')
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters.')
    setBusy(true)
    try {
      await bootstrap({
        fullName: form.fullName,
        username: form.username,
        email: form.email || undefined,
        password: form.password,
        setupCode: form.setupCode || undefined
      })
      toast.success('Welcome! Your account is ready.')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Setup failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-accent p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <CardTitle className="text-2xl">Welcome to {PRODUCT_NAME}</CardTitle>
          <CardDescription>{TAGLINE} — create your owner account to get started. It has full control of your business data.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <Field label="Full name">
              <Input value={form.fullName} onChange={update('fullName')} required placeholder="e.g. Ritwik Kamble" />
            </Field>
            <Field label="Username">
              <Input value={form.username} onChange={update('username')} required placeholder="e.g. admin" autoCapitalize="none" />
            </Field>
            <Field label="Email (optional)">
              <Input type="email" value={form.email} onChange={update('email')} placeholder="you@example.com" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Password">
                <Input type="password" value={form.password} onChange={update('password')} required />
              </Field>
              <Field label="Confirm">
                <Input type="password" value={form.confirm} onChange={update('confirm')} required />
              </Field>
            </div>
            {showAdvanced ? (
              <Field label="SkyTech setup code (vendor only — leave blank)">
                <Input
                  value={form.setupCode}
                  onChange={update('setupCode')}
                  placeholder="Only SkyTech enters this"
                  autoComplete="off"
                />
              </Field>
            ) : (
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Advanced setup
              </button>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              Create account & continue
            </Button>
          </form>
        </CardContent>
      </Card>
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
