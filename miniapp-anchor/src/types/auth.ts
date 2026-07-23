export type AppRole = 'anchor' | 'operator' | 'super_admin'

export type AuthenticatedUser = {
  wecomUserId: string
  name: string
  avatarUrl: string | null
  role: AppRole
}

export type StoredSession = {
  token: string
  user: AuthenticatedUser
  mode: 'real' | 'mock'
}
