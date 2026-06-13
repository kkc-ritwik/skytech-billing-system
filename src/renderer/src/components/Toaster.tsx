import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useToasts } from '@renderer/store/toast'
import { cn } from '@renderer/lib/utils'

const icons = { success: CheckCircle2, error: XCircle, info: Info }
const styles = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-primary/30 bg-primary/10 text-primary'
}

export function Toaster(): JSX.Element {
  const { toasts, dismiss } = useToasts()
  return (
    <div className="no-print fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.kind]
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-3 rounded-lg border bg-card p-3 text-sm shadow-lg',
              styles[t.kind]
            )}
          >
            <Icon className="mt-0.5 size-4 shrink-0" />
            <span className="flex-1 text-foreground">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
