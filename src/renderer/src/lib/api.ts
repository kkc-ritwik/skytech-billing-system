import type { IpcResponse, IpcErrorCode } from '@shared/ipc'

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: IpcErrorCode
  ) {
    super(message)
  }
}

// The store registers a handler so a mid-session expiry or license lock is
// handled globally (bounce to login / activation), not per-call.
let authErrorHandler: ((code: IpcErrorCode) => void) | null = null
export function setAuthErrorHandler(fn: (code: IpcErrorCode) => void): void {
  authErrorHandler = fn
}

/**
 * Thin typed wrapper over the preload bridge. Throws ApiError on failure so
 * callers can use try/catch; auth/license errors also fire the global handler.
 */
export async function invoke<T = unknown>(channel: string, payload?: unknown): Promise<T> {
  const res = (await window.api.invoke(channel, payload)) as IpcResponse<T>
  if (!res.ok) {
    if (res.code === 'UNAUTHENTICATED' || res.code === 'LICENSE_BLOCKED') {
      try {
        authErrorHandler?.(res.code)
      } catch {
        /* ignore */
      }
    }
    throw new ApiError(res.error, res.code)
  }
  return res.data
}

export function setToken(token: string | null): void {
  window.api.setToken(token)
}
