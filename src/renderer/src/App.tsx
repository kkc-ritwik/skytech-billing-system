import { useEffect } from 'react'
import { HashRouter } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useApp } from './store/app'
import { PRODUCT_NAME, TAGLINE } from '@shared/app-config'
import { Toaster } from './components/Toaster'
import { ConfirmHost } from './components/ConfirmHost'
import { BootstrapSetup } from './pages/BootstrapSetup'
import { Login } from './pages/Login'
import { LicenseLocked } from './pages/LicenseLocked'
import { RecoveryCodeScreen } from './pages/RecoveryCodeScreen'
import { ForcePasswordChange } from './pages/ForcePasswordChange'
import { AppLayout } from './layout/AppLayout'

export function App(): JSX.Element {
  const { phase, license, user, recoveryCodeOnce, init } = useApp()

  useEffect(() => {
    void init()
  }, [init])

  let body: JSX.Element
  if (phase === 'loading') {
    body = (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-base font-semibold text-foreground">{PRODUCT_NAME}</p>
          <p className="text-sm">{TAGLINE}…</p>
        </div>
      </div>
    )
  } else if (recoveryCodeOnce) {
    // Show the one-time recovery code right after account creation, above all else.
    body = <RecoveryCodeScreen code={recoveryCodeOnce} />
  } else if (phase === 'needs-bootstrap') {
    body = <BootstrapSetup />
  } else if (license && !license.isUsable) {
    body = <LicenseLocked />
  } else if (phase === 'unauthenticated') {
    body = <Login />
  } else if (user?.mustChangePassword) {
    body = <ForcePasswordChange />
  } else {
    body = (
      <HashRouter>
        <AppLayout />
      </HashRouter>
    )
  }

  return (
    <>
      {body}
      <Toaster />
      <ConfirmHost />
    </>
  )
}
