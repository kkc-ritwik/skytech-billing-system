import { create } from 'zustand'

/**
 * Promise-based confirmation prompts.
 *
 * Replaces the browser's native `window.confirm()`, which in Electron renders
 * an unstyled OS dialog titled with the internal package id and — because it is
 * synchronous — blocks the whole renderer thread while it is open.
 *
 * Usage mirrors the old call site:
 *   if (!(await confirm({ title: 'Delete?', message: '…' }))) return
 */

export interface ConfirmOptions {
  title: string
  message: string
  /** Label for the accept button. */
  confirmLabel?: string
  cancelLabel?: string
  /** Styles the accept button as destructive (delete / overwrite actions). */
  destructive?: boolean
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions | null
  resolve: ((ok: boolean) => void) | null
  request: (options: ConfirmOptions) => Promise<boolean>
  settle: (ok: boolean) => void
}

export const useConfirm = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,

  request: (options) =>
    new Promise<boolean>((resolve) => {
      // A second prompt while one is open would strand the first promise, so
      // decline the outstanding one before taking over.
      const prev = get().resolve
      if (prev) prev(false)
      set({ open: true, options, resolve })
    }),

  settle: (ok) => {
    const { resolve } = get()
    set({ open: false, options: null, resolve: null })
    resolve?.(ok)
  }
}))

/** Ask the user to confirm. Resolves true only if they accept. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useConfirm.getState().request(options)
}
