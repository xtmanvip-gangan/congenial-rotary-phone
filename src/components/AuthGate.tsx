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

  const hasAllowedRole =
    !allowRoles ||
    allowRoles.some((role) => session.user.roles.includes(role))

  if (!hasAllowedRole) {
    return <Navigate to={getRoleHomePath(session.user.role)} replace />
  }

  return <>{children}</>
}
