import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getRoleHomePath, type AppRole } from '../lib/auth'

type AuthGateProps = {
  children: ReactNode
  allowRoles?: AppRole[]
}

export function AuthGate({ children, allowRoles }: AuthGateProps) {
  const { hydrated, session } = useAuth()

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm text-slate-500 shadow-soft">
          正在确认登录状态，请稍候。
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/" replace />
  }

  if (allowRoles && !isAllowed(session.user.role, session.user.roles, allowRoles)) {
    return <Navigate to={getRoleHomePath(session.user.role)} replace />
  }

  return <>{children}</>
}

/**
 * 超级管理员可进入全部非主播业务页；
 * 主播专属页（仅 allow anchor）仍仅主播可进。
 */
function isAllowed(
  currentRole: AppRole,
  roles: AppRole[],
  allowRoles: AppRole[],
) {
  const isSuperAdmin =
    currentRole === 'super_admin' || roles.includes('super_admin')
  const anchorOnly =
    allowRoles.length > 0 && allowRoles.every((role) => role === 'anchor')

  if (anchorOnly) {
    return currentRole === 'anchor' || roles.includes('anchor')
  }

  if (isSuperAdmin) {
    return true
  }

  return allowRoles.some(
    (role) => roles.includes(role) || currentRole === role,
  )
}
