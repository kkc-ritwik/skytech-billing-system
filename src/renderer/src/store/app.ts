import { create } from 'zustand'
import { invoke, setToken, setAuthErrorHandler } from '@renderer/lib/api'
import { CHANNELS, type AuthUser, type LicenseStatus, type SessionInfo } from '@shared/ipc'
import { can, type Permission } from '@shared/permissions'

const TOKEN_KEY = 'll_token'

type Phase = 'loading' | 'needs-bootstrap' | 'unauthenticated' | 'authenticated'

interface AppState {
  phase: Phase
  user: AuthUser | null
  license: LicenseStatus | null
  theme: 'light' | 'dark'
  /** A one-time recovery code to display once, then clear. */
  recoveryCodeOnce: string | null

  init: () => Promise<void>
  refreshLicense: () => Promise<void>
  refreshMe: () => Promise<void>
  bootstrap: (input: { fullName: string; username: string; password: string; email?: string; setupCode?: string }) => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  activate: (key: string) => Promise<LicenseStatus>
  setTheme: (t: 'light' | 'dark') => void
  setUser: (user: AuthUser) => void
  clearRecoveryCode: () => void
  has: (permission: Permission) => boolean
}

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'loading',
  user: null,
  license: null,
  theme: (localStorage.getItem('ll_theme') as 'light' | 'dark') || 'light',
  recoveryCodeOnce: null,

  init: async () => {
    applyTheme(get().theme)
    // Global handler: session expiry → sign out; license lock → refresh status.
    setAuthErrorHandler((code) => {
      if (code === 'UNAUTHENTICATED' && get().phase === 'authenticated') {
        setToken(null)
        localStorage.removeItem(TOKEN_KEY)
        set({ user: null, phase: 'unauthenticated' })
      } else if (code === 'LICENSE_BLOCKED') {
        void get().refreshLicense()
      }
    })
    try {
      const license = await invoke<LicenseStatus>(CHANNELS.licenseStatus)
      set({ license })

      const { needed } = await invoke<{ needed: boolean }>(CHANNELS.authBootstrapStatus)
      if (needed) {
        set({ phase: 'needs-bootstrap' })
        return
      }

      const token = localStorage.getItem(TOKEN_KEY)
      if (token) {
        setToken(token)
        const user = await invoke<AuthUser | null>(CHANNELS.authMe)
        if (user) {
          set({ user, phase: 'authenticated' })
          return
        }
      }
      setToken(null)
      localStorage.removeItem(TOKEN_KEY)
      set({ phase: 'unauthenticated' })
    } catch {
      set({ phase: 'unauthenticated' })
    }
  },

  refreshLicense: async () => {
    const license = await invoke<LicenseStatus>(CHANNELS.licenseStatus)
    set({ license })
  },

  refreshMe: async () => {
    const user = await invoke<AuthUser | null>(CHANNELS.authMe)
    if (user) set({ user })
  },

  bootstrap: async (input) => {
    const res = await invoke<{ session: SessionInfo; recoveryCode: string }>(CHANNELS.authBootstrap, input)
    persistSession(res.session)
    set({ user: res.session.user, phase: 'authenticated', recoveryCodeOnce: res.recoveryCode })
  },

  login: async (username, password) => {
    const session = await invoke<SessionInfo>(CHANNELS.authLogin, { username, password })
    persistSession(session)
    set({ user: session.user, phase: 'authenticated' })
  },

  logout: async () => {
    try {
      await invoke(CHANNELS.authLogout)
    } catch {
      /* ignore */
    }
    setToken(null)
    localStorage.removeItem(TOKEN_KEY)
    set({ user: null, phase: 'unauthenticated' })
  },

  activate: async (key) => {
    const license = await invoke<LicenseStatus>(CHANNELS.licenseActivate, { key })
    set({ license })
    return license
  },

  setTheme: (t) => {
    localStorage.setItem('ll_theme', t)
    applyTheme(t)
    set({ theme: t })
  },

  setUser: (user) => set({ user }),
  clearRecoveryCode: () => set({ recoveryCodeOnce: null }),

  has: (permission) => {
    const u = get().user
    return u ? can(u.role, permission) : false
  }
}))

function persistSession(session: SessionInfo): void {
  setToken(session.token)
  localStorage.setItem(TOKEN_KEY, session.token)
}
