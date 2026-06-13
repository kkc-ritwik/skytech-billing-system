/// <reference types="vite/client" />
import type { IpcResponse } from '@shared/ipc'

declare global {
  interface Window {
    api: {
      setToken(token: string | null): void
      getToken(): string | null
      invoke<T = unknown>(channel: string, payload?: unknown): Promise<IpcResponse<T>>
    }
  }
}

export {}
