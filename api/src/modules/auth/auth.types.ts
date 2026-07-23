export type StaffRole =
  | 'audit_teacher'
  | 'operator'
  | 'training_teacher'
  | 'training_admin'

export type AppRole = 'anchor' | StaffRole | 'super_admin'

export type LoginType =
  | 'wecom_staff'
  | 'wecom_miniapp'
  | 'password_admin'

export type AnchorProfileStatus =
  | 'not_eligible'
  | 'not_activated'
  | 'pending_confirmation'
  | 'active'

export type SessionTokenPayload = {
  sub: string
  accountId?: string
  role: AppRole
  roles: AppRole[]
  name: string
  avatarUrl: string | null
  loginType: LoginType
  anchorProfileStatus?: AnchorProfileStatus
  iat: number
  exp: number
}

export type AuthenticatedUser = {
  accountId?: string | null
  wecomUserId: string
  name: string
  avatarUrl: string | null
  role: AppRole
  roles: AppRole[]
  loginType: LoginType
  anchorProfileStatus?: AnchorProfileStatus
}

export type LoginResponse = {
  token: string
  user: AuthenticatedUser
}
