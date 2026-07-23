export type AppRole = 'anchor' | 'operator' | 'super_admin'

export type AuthenticatedUser = {
  wecomUserId: string
  name: string
  avatarUrl: string | null
  role: 'anchor'
  roles: ['anchor']
  loginType: 'wecom_miniapp'
  anchorProfileStatus:
    | 'not_eligible'
    | 'not_activated'
    | 'pending_confirmation'
    | 'active'
}

export type StoredSession = {
  token: string
  user: AuthenticatedUser
  mode: 'real' | 'mock'
}
