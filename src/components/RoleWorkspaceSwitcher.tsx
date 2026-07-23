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
    <label className="flex items-center gap-2 text-sm text-slate-500">
      <span>工作台</span>
      <select
        value={session.user.role}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700"
        onChange={(event) => {
          const role = event.target.value as AppRole
          selectRole(role)
          navigate(getRoleHomePath(role))
        }}
      >
        {session.user.roles.map((role) => (
          <option key={role} value={role}>
            {roleLabels[role]}
          </option>
        ))}
      </select>
    </label>
  )
}
