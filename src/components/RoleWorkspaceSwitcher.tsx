import type { AppRole } from '../lib/auth'
import { getRoleHomePath } from '../lib/auth'
import { useAuth } from '../auth/AuthContext'
import { useNavigate } from 'react-router-dom'

const roleLabels: Record<AppRole, string> = {
  anchor: '主播',
  audit_teacher: '审核老师',
  operator: '运营老师',
  training_teacher: '培训老师',
  training_admin: '培训管理员',
  super_admin: '超级管理员',
}

export function RoleWorkspaceSwitcher() {
  const { session, selectRole } = useAuth()
  const navigate = useNavigate()

  if (!session || session.user.roles.length <= 1) {
    return null
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-slate-500 sm:text-sm">
      <span className="hidden sm:inline">工作台</span>
      <select
        value={session.user.role}
        className="max-w-[9.5rem] rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 sm:max-w-none sm:px-3 sm:py-1.5 sm:text-sm"
        onChange={(event) => {
          const role = event.target.value as AppRole
          selectRole(role)
          navigate(getRoleHomePath(role))
        }}
      >
        {session.user.roles
          .filter((role) => role !== 'anchor')
          .map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
      </select>
    </label>
  )
}
