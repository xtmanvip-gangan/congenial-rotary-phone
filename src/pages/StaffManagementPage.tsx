import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Pencil, Plus, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'
import type { StaffRole } from '../lib/auth'

type StaffItem = {
  id: string
  displayName: string
  wecomUserId: string
  roles: StaffRole[]
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
}

type StaffResponse = { items: StaffItem[] }
type StaffMutationResponse = { item: StaffItem }

const roleOptions: { role: StaffRole; label: string }[] = [
  { role: 'audit_teacher', label: '审核老师' },
  { role: 'operator', label: '运营老师' },
  { role: 'training_teacher', label: '培训老师' },
  { role: 'training_admin', label: '培训管理员' },
]

const queryKey = ['staff']

export function StaffManagementPage() {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [wecomUserId, setWecomUserId] = useState('')
  const [roles, setRoles] = useState<StaffRole[]>(['operator'])
  const [error, setError] = useState<string | null>(null)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [draftRoles, setDraftRoles] = useState<StaffRole[]>([])
  const [rolesFeedback, setRolesFeedback] = useState<{
    staffId: string
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const staffQuery = useQuery({
    queryKey,
    queryFn: () => apiJson<StaffResponse>('/staff'),
  })
  const createMutation = useMutation({
    mutationFn: (payload: {
      displayName: string
      wecomUserId: string
      roles: StaffRole[]
    }) =>
      apiJson<StaffMutationResponse>('/staff', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setDisplayName('')
      setWecomUserId('')
      setRoles(['operator'])
      setError(null)
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (nextError) => {
      setError(nextError instanceof Error ? nextError.message : '员工保存失败')
    },
  })
  const statusMutation = useMutation({
    mutationFn: (payload: {
      staffId: string
      status: 'active' | 'disabled'
    }) =>
      apiJson<StaffMutationResponse>(`/staff/${payload.staffId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: payload.status }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
  const rolesMutation = useMutation({
    mutationFn: (payload: { staffId: string; roles: StaffRole[] }) =>
      apiJson<StaffMutationResponse>(`/staff/${payload.staffId}/roles`, {
        method: 'PATCH',
        body: JSON.stringify({ roles: payload.roles }),
      }),
    onSuccess: async (_, payload) => {
      setEditingStaffId(null)
      setDraftRoles([])
      setRolesFeedback({
        staffId: payload.staffId,
        type: 'success',
        message: '角色已保存',
      })
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (nextError, payload) => {
      setRolesFeedback({
        staffId: payload.staffId,
        type: 'error',
        message:
          nextError instanceof Error ? nextError.message : '角色保存失败',
      })
    },
  })

  function toggleRole(role: StaffRole) {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (roles.length === 0) {
      setError('至少选择一个员工角色')
      return
    }
    createMutation.mutate({ displayName, wecomUserId, roles })
  }

  function startEditing(item: StaffItem) {
    setEditingStaffId(item.id)
    setDraftRoles(item.roles)
    setRolesFeedback(null)
  }

  function toggleDraftRole(role: StaffRole) {
    setDraftRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    )
  }

  function saveRoles(staffId: string) {
    if (draftRoles.length === 0) {
      setRolesFeedback({
        staffId,
        type: 'error',
        message: '至少保留一个员工角色',
      })
      return
    }

    rolesMutation.mutate({ staffId, roles: draftRoles })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">超级管理员</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">员工与企微角色</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          员工只使用企微UID登录，不创建独立账号和密码。同一员工可同时拥有多个角色。
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">员工姓名</span>
            <input
              className="mt-2 app-field"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">企微UID</span>
            <input
              className="mt-2 app-field"
              value={wecomUserId}
              onChange={(event) => setWecomUserId(event.target.value)}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">角色</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {roleOptions.map((item) => (
                <label
                  key={item.role}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={roles.includes(item.role)}
                    onChange={() => toggleRole(item.role)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <button
            className="app-btn-primary w-full"
            type="submit"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            新增员工
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">已配置员工</p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-900">
              {staffQuery.data?.items.length ?? 0} 人
            </h3>
          </div>
          <button
            className="app-btn-secondary"
            type="button"
            onClick={() => void staffQuery.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        </div>
        {staffQuery.isLoading ? (
          <p className="mt-6 text-sm text-slate-500">正在加载员工列表…</p>
        ) : staffQuery.isError ? (
          <p className="mt-6 text-sm text-rose-600">
            {staffQuery.error instanceof Error
              ? staffQuery.error.message
              : '员工列表加载失败'}
          </p>
        ) : (
          <div className="mt-6 space-y-3">
            {staffQuery.data?.items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold text-slate-900">{item.displayName}</h4>
                    <p className="mt-1 text-sm text-slate-500">{item.wecomUserId}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      更新：{formatDateTime(item.updatedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="app-btn-secondary"
                      onClick={() => startEditing(item)}
                    >
                      <Pencil className="h-4 w-4" />
                      编辑角色
                    </button>
                    <button
                      type="button"
                      className="app-btn-secondary"
                      onClick={() =>
                        statusMutation.mutate({
                          staffId: item.id,
                          status: item.status === 'active' ? 'disabled' : 'active',
                        })
                      }
                    >
                      {item.status === 'active' ? '停用' : '启用'}
                    </button>
                  </div>
                </div>
                {editingStaffId === item.id ? (
                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm font-medium text-slate-700">
                      勾选该员工需要使用的全部角色
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {roleOptions.map((roleItem) => (
                        <label
                          key={roleItem.role}
                          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={draftRoles.includes(roleItem.role)}
                            onChange={() => toggleDraftRole(roleItem.role)}
                          />
                          {roleItem.label}
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="app-btn-primary"
                        disabled={rolesMutation.isPending}
                        onClick={() => saveRoles(item.id)}
                      >
                        {rolesMutation.isPending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : null}
                        保存角色
                      </button>
                      <button
                        type="button"
                        className="app-btn-secondary"
                        disabled={rolesMutation.isPending}
                        onClick={() => {
                          setEditingStaffId(null)
                          setDraftRoles([])
                          setRolesFeedback(null)
                        }}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.roles.map((role) => (
                      <span
                        key={role}
                        className="rounded-full bg-brand-600 px-3 py-1 text-xs text-white"
                      >
                        {roleOptions.find((item) => item.role === role)?.label ??
                          role}
                      </span>
                    ))}
                  </div>
                )}
                {rolesFeedback?.staffId === item.id ? (
                  <p
                    className={`mt-3 text-sm ${
                      rolesFeedback.type === 'success'
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                    }`}
                  >
                    {rolesFeedback.message}
                    {rolesFeedback.type === 'success'
                      ? '，该员工退出当前企微登录并重新登录后即可切换工作台。'
                      : ''}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
