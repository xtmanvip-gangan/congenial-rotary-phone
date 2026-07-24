export type StaffRole =
  | 'audit_teacher'
  | 'operator'
  | 'training_teacher'
  | 'training_admin'

export type AppRole = 'anchor' | StaffRole | 'super_admin'

export type AuthenticatedUser = {
  accountId?: string | null
  wecomUserId: string
  name: string
  avatarUrl: string | null
  role: AppRole
  roles: AppRole[]
  loginType: 'wecom_staff' | 'wecom_miniapp' | 'password_admin'
  anchorProfileStatus?:
    | 'not_eligible'
    | 'not_activated'
    | 'pending_confirmation'
    | 'active'
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
    // 主播业务由小程序承接；Web 仅提示页
    return '/app'
  }

  if (role === 'super_admin') {
    return '/admin/dashboard'
  }

  if (role === 'training_admin') {
    return '/staff/home'
  }

  if (role === 'training_teacher') {
    return '/staff/home'
  }

  if (role === 'audit_teacher') {
    return '/staff/home'
  }

  if (role === 'operator') {
    return '/staff/home'
  }

  return '/staff/home'
}
