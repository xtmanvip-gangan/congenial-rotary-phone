import type { AppRole } from '../lib/auth'
import { getRoleHomePath } from '../lib/auth'
import { useAuth } from '../auth/AuthContext'
import { useNavigate } from 'react-router-dom'
import { ChevronsUpDown } from 'lucide-react'

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

  const staffRoles = session.user.roles.filter((role) => role !== 'anchor')
  if (staffRoles.length <= 1) {
    return null
  }

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">切换工作台</span>
      <select
        value={session.user.role}
        className="appearance-none rounded-xl border border-slate-200 bg-white py-1.5 pl-2.5 pr-8 text-xs font-medium text-slate-700 outline-none transition hover:border-brand-200 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:text-sm"
        onChange={(event) => {
          const role = event.target.value as AppRole
          selectRole(role)
          navigate(getRoleHomePath(role))
        }}
      >
        {staffRoles.map((role) => (
          <option key={role} value={role}>
            {roleLabels[role]}
          </option>
        ))}
      </select>
      <ChevronsUpDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-400" />
    </label>
  )
}
