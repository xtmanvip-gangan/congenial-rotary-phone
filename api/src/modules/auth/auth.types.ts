export type AppRole = 'anchor' | 'operator' | 'super_admin'

export type SessionTokenPayload = {
  sub: string
  accountId?: string
  role: AppRole
  name: string
  avatarUrl: string | null
  loginType: 'wecom' | 'password'
  iat: number
  exp: number
}

export type AuthenticatedUser = {
  accountId?: string | null
  wecomUserId: string
  name: string
  avatarUrl: string | null
  role: AppRole
  loginType: 'wecom' | 'password'
}

export type LoginResponse = {
  token: string
  user: AuthenticatedUser
}
