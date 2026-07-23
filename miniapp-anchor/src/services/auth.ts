import { mockSession } from '@/data/mock-auth'
import { requestJson } from '@/services/request'
import { useSessionStore } from '@/store/session'
import type { AuthenticatedUser, StoredSession } from '@/types/auth'
import { requestWecomLoginCode, shouldUseMockMode } from '@/utils/env'

type LoginResponse = {
  token: string
  user: AuthenticatedUser
}

function toStoredSession(response: LoginResponse): StoredSession {
  return {
    token: response.token,
    user: response.user,
    mode: 'real',
  }
}

export async function ensureAppSession(force = false) {
  const store = useSessionStore.getState()
  if (!store.hydrated) {
    store.hydrateSession()
  }

  const currentSession = useSessionStore.getState().session
  if (currentSession && !force) {
    return currentSession
  }

  if (shouldUseMockMode()) {
    useSessionStore.getState().setSession(mockSession)
    return mockSession
  }

  useSessionStore.getState().setAuthLoading(true)
  useSessionStore.getState().setAuthError(null)

  try {
    const code = await requestWecomLoginCode()
    const loginResponse = await requestJson<LoginResponse>('/miniapp/auth/login', {
      method: 'POST',
      data: { code },
    })
    const session = toStoredSession(loginResponse)
    useSessionStore.getState().setSession(session)
    return session
  } catch (error) {
    const message = error instanceof Error ? error.message : '登录失败，请稍后重试。'
    useSessionStore.getState().setAuthError(message)
    throw error
  } finally {
    useSessionStore.getState().setAuthLoading(false)
  }
}

export async function refreshCurrentUser() {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return session
  }

  try {
    const user = await requestJson<AuthenticatedUser>('/miniapp/auth/me')
    const nextSession: StoredSession = {
      ...session,
      user,
    }
    useSessionStore.getState().setSession(nextSession)
    return nextSession
  } catch (error) {
    console.error('[MiniappAuth] 刷新登录态失败', error)
    useSessionStore.getState().clearSession()
    throw error
  }
}

export function clearAppSession() {
  useSessionStore.getState().clearSession()
}
