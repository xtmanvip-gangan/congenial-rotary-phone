export type AppRole = 'anchor' | 'operator' | 'super_admin'

export type AuthenticatedUser = {
  accountId?: string | null
  wecomUserId: string
  name: string
  avatarUrl: string | null
  role: AppRole
  loginType?: 'wecom' | 'password'
}

export type StoredSession = {
  token: string
  user: AuthenticatedUser
}

const SESSION_STORAGE_KEY = 'shouji-session'

export function loadStoredSession(): StoredSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = window.localStorage.getItem(SESSION_STORAGE_KEY)

  if (!rawValue) {
    return null
  }

  try {
    return JSON.parse(rawValue) as StoredSession
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export function persistSession(session: StoredSession) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

export function getToken() {
  return loadStoredSession()?.token ?? null
}

export function getRoleHomePath(role: AppRole) {
  if (role === 'anchor') {
    return '/app/activities'
  }

  if (role === 'super_admin') {
    return '/admin/operators'
  }

  return '/admin/records'
}
