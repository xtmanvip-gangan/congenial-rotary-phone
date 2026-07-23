import Taro from '@tarojs/taro'
import { create } from 'zustand'
import type { StoredSession } from '@/types/auth'

const STORAGE_KEY = 'ydwy-anchor-miniapp-session'

type SessionState = {
  session: StoredSession | null
  hydrated: boolean
  authLoading: boolean
  authError: string | null
  setSession: (session: StoredSession | null) => void
  hydrateSession: () => void
  setAuthLoading: (loading: boolean) => void
  setAuthError: (message: string | null) => void
  clearSession: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  hydrated: false,
  authLoading: false,
  authError: null,
  setSession: (session) => {
    if (session) {
      Taro.setStorageSync(STORAGE_KEY, session)
    } else {
      Taro.removeStorageSync(STORAGE_KEY)
    }

    set({
      session,
      hydrated: true,
      authError: null,
    })
  },
  hydrateSession: () => {
    const session = Taro.getStorageSync<StoredSession | ''>(STORAGE_KEY)
    set({
      session: session && typeof session === 'object' ? session : null,
      hydrated: true,
    })
  },
  setAuthLoading: (authLoading) => set({ authLoading }),
  setAuthError: (authError) => set({ authError }),
  clearSession: () => {
    Taro.removeStorageSync(STORAGE_KEY)
    set({
      session: null,
      hydrated: true,
      authError: null,
    })
  },
}))
