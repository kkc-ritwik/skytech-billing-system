import { contextBridge, ipcRenderer } from 'electron'
import type { IpcResponse } from '@shared/ipc'

/**
 * The single, minimal bridge exposed to the renderer. The renderer can ONLY
 * call invoke(channel, payload); it has no direct Node/Electron access. The
 * session token is held here (preload scope), attached to every request, and
 * never exposed to page scripts via the DOM.
 */
let token: string | null = null

const api = {
  setToken(t: string | null): void {
    token = t
  },
  getToken(): string | null {
    return token
  },
  invoke<T = unknown>(channel: string, payload?: unknown): Promise<IpcResponse<T>> {
    return ipcRenderer.invoke('ledgerline:invoke', { channel, token, payload })
  }
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('api', api)
