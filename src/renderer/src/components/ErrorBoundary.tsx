import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/** Catches render errors so a single broken screen can't crash the whole app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error): void {
    console.error('[renderer] uncaught error:', error)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-6" />
            </div>
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              An unexpected error occurred on this screen. Your data is safe. Reloading usually fixes it.
            </p>
            <pre className="mt-3 max-h-32 overflow-auto rounded bg-muted p-2 text-left text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
