import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useConfirm } from '@renderer/store/confirm'
import { Dialog } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'

/**
 * Renders whichever confirmation prompt is currently pending. Mounted once,
 * next to the toaster, so any screen can call `confirmAction()` without
 * carrying its own dialog state.
 */
export function ConfirmHost(): JSX.Element | null {
  const { open, options, settle } = useConfirm()
  const acceptRef = useRef<HTMLButtonElement>(null)

  // Focus the accept button so Enter confirms and Escape cancels, matching the
  // keyboard behaviour of the native dialog this replaced.
  useEffect(() => {
    if (open) acceptRef.current?.focus()
  }, [open])

  if (!open || !options) return null

  return (
    <Dialog
      open
      onClose={() => settle(false)}
      title={options.title}
      className="max-w-md"
      footer={
        <>
          <Button variant="outline" onClick={() => settle(false)}>
            {options.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            ref={acceptRef}
            variant={options.destructive ? 'destructive' : 'default'}
            onClick={() => settle(true)}
          >
            {options.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {options.destructive && (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        )}
        <p className="text-sm text-muted-foreground">{options.message}</p>
      </div>
    </Dialog>
  )
}
