import { Copy, ShieldAlert } from 'lucide-react'
import { toast } from '@renderer/store/toast'
import { Button } from '@renderer/components/ui/button'

/** Displays a one-time recovery code with copy + a save-it warning. */
export function RecoveryCodeCard({ code }: { code: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
      <div className="mb-2 flex items-center gap-2 font-semibold text-warning">
        <ShieldAlert className="size-4" /> Save your recovery code
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Write this down and keep it safe. It is the <strong>only way</strong> to reset your password
        if you forget it. We can't recover it for you, and it won't be shown again.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 select-all rounded bg-background px-3 py-2 text-center text-lg font-bold tracking-widest">
          {code}
        </code>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            navigator.clipboard.writeText(code)
            toast.success('Recovery code copied.')
          }}
        >
          <Copy />
        </Button>
      </div>
    </div>
  )
}
