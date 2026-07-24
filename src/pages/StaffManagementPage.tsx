import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react'
import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { useConfirmDialog } from '../components/useConfirmDialog'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'
import type { StaffRole } from '../lib/auth'

type StaffItem = {
  id: string
  displayName: string
  wecomUserId: string
  roles: StaffRole[]
  status: 'active' | 'disabled'
  managedAnchorCount?: number
  createdAt: string
  updatedAt: string
}

type StaffResponse = { items: StaffItem[] }
type StaffMutationResponse = { item: StaffItem }

type StatusFilter = 'all' | 'active' | 'disabled'

const roleOptions: { role: StaffRole; label: string; tone: string }[] = [
  {
    role: 'audit_teacher',
    label: '审核老师',
    tone: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/60',
  },
  {
    role: 'operator',
    label: '运营老师',
    tone: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/60',
  },
  {
    role: 'training_teacher',
    label: '培训老师',
    tone: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/60',
  },
  {
    role: 'training_admin',
    label: '培训管理员',
    tone: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200/60',
  },
]

const queryKey = ['staff']

function roleLabel(role: StaffRole) {
  return roleOptions.find((item) => item.role === role)?.label ?? role
}

function roleTone(role: StaffRole) {
  return (
    roleOptions.find((item) => item.role === role)?.tone ??
    'bg-slate-100 text-slate-600'
  )
}

export function StaffManagementPage() {
  const queryClient = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [displayName, setDisplayName] = useState('')
  const [wecomUserId, setWecomUserId] = useState('')
  const [roles, setRoles] = useState<StaffRole[]>(['operator'])
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [draftRoles, setDraftRoles] = useState<StaffRole[]>([])
  const [rolesFeedback, setRolesFeedback] = useState<{
    staffId: string
    type: 'success' | 'error'
    message: string
  } | null>(null)
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
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
      setSuccessMessage('员工已新增，对方使用企微UID登录即可')
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (nextError) => {
      setSuccessMessage(null)
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
    onSuccess: async (_, payload) => {
      setSuccessMessage(
        payload.status === 'active' ? '员工已启用' : '员工已停用',
      )
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (nextError) => {
      setError(
        nextError instanceof Error ? nextError.message : '状态更新失败',
      )
    },
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

  const deleteMutation = useMutation({
    mutationFn: (staffId: string) =>
      apiJson(`/staff/${staffId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setSuccessMessage('员工已彻底删除')
      setError(null)
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (nextError) => {
      setError(nextError instanceof Error ? nextError.message : '删除失败')
    },
  })

  const items = staffQuery.data?.items ?? []

  const counts = useMemo(() => {
    const base = {
      all: items.length,
      active: 0,
      disabled: 0,
      byRole: {
        audit_teacher: 0,
        operator: 0,
        training_teacher: 0,
        training_admin: 0,
      } as Record<StaffRole, number>,
    }
    for (const item of items) {
      if (item.status === 'active') base.active += 1
      else base.disabled += 1
      for (const role of item.roles) {
        if (role in base.byRole) base.byRole[role] += 1
      }
    }
    return base
  }, [items])

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (!q) return true
      const hay =
        `${item.displayName} ${item.wecomUserId} ${item.roles.map(roleLabel).join(' ')}`.toLowerCase()
      return hay.includes(q)
    })
  }, [items, keyword, statusFilter])

  function toggleRole(role: StaffRole) {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setSuccessMessage(null)
    if (!displayName.trim() || !wecomUserId.trim()) {
      setError('请填写员工姓名和企微UID')
      return
    }
    if (roles.length === 0) {
      setError('至少选择一个员工角色')
      return
    }
    createMutation.mutate({
      displayName: displayName.trim(),
      wecomUserId: wecomUserId.trim(),
      roles,
    })
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

  async function requestToggleStatus(item: StaffItem) {
    const nextStatus = item.status === 'active' ? 'disabled' : 'active'
    if (nextStatus === 'disabled') {
      const managed = item.managedAnchorCount ?? 0
      const ok = await confirm({
        title: '停用该员工？',
        message:
          managed > 0
            ? `「${item.displayName}」仍有 ${managed} 位在管主播。停用后其无法登录，但主播仍挂在其名下。建议先「转交主播」再停用或删除。`
            : `停用后，「${item.displayName}」将无法使用企微登录后台。可随时重新启用。`,
        confirmText: '确认停用',
        cancelText: '返回',
        variant: 'danger',
      })
      if (!ok) return
    }
    statusMutation.mutate({ staffId: item.id, status: nextStatus })
  }

  async function requestDelete(item: StaffItem) {
    const managed = item.managedAnchorCount ?? 0
    if (managed > 0) {
      setError(
        `「${item.displayName}」仍有 ${managed} 位在管主播，请先转交给其他运营后再删除`,
      )
      return
    }
    const ok = await confirm({
      title: '彻底删除员工？',
      message: `将永久删除「${item.displayName}」（${item.wecomUserId}）。不可恢复。若仍有历史提报等数据关联，系统会拒绝删除。`,
      confirmText: '确认删除',
      cancelText: '返回',
      variant: 'danger',
    })
    if (ok) deleteMutation.mutate(item.id)
  }

  return (
    <div className="space-y-6">
      {confirmDialog}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">人员与主播</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              员工与角色
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              员工仅用企微 UID 登录。离职时到「主播全景」勾选该运营名下主播分散转交，无在管主播后再硬删除。
            </p>
          </div>
          <button
            type="button"
            className="app-btn-secondary shrink-0"
            disabled={staffQuery.isFetching}
            onClick={() => void staffQuery.refetch()}
          >
            <RefreshCw
              className={`h-4 w-4 ${staffQuery.isFetching ? 'animate-spin' : ''}`}
            />
            刷新
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="全部员工"
            value={counts.all}
            tone="slate"
            icon={<Users className="h-4 w-4" />}
          />
          <SummaryCard
            label="启用中"
            value={counts.active}
            tone="emerald"
            icon={<UserCog className="h-4 w-4" />}
          />
          <SummaryCard
            label="已停用"
            value={counts.disabled}
            tone="rose"
            icon={<UserCog className="h-4 w-4" />}
          />
          <SummaryCard
            label="运营老师"
            value={counts.byRole.operator}
            tone="sky"
            icon={<Users className="h-4 w-4" />}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <section className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-soft xl:sticky xl:top-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Plus className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">新增员工</h3>
              <p className="text-xs text-slate-500">填写姓名、企微 UID 与角色</p>
            </div>
          </div>

          <form className="mt-5 space-y-4" onSubmit={submit}>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">员工姓名</span>
              <input
                className="mt-2 app-field"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="如：张三"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">企微UID</span>
              <input
                className="mt-2 app-field font-mono text-sm"
                value={wecomUserId}
                onChange={(event) => setWecomUserId(event.target.value)}
                placeholder="企业微信 UserId"
              />
            </label>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">角色</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {roleOptions.map((item) => {
                  const checked = roles.includes(item.role)
                  return (
                    <label
                      key={item.role}
                      className={[
                        'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition',
                        checked
                          ? 'border-brand-200 bg-brand-50/60'
                          : 'border-slate-200 bg-white hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRole(item.role)}
                      />
                      {item.label}
                    </label>
                  )
                })}
              </div>
            </fieldset>

            {error ? (
              <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}
            {successMessage ? (
              <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {successMessage}
              </p>
            ) : null}

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
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-brand-600">已配置员工</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                共 {counts.all} 人
                {statusFilter !== 'all' || keyword.trim()
                  ? ` · 当前 ${filteredItems.length} 人`
                  : ''}
              </h3>
            </div>
            <label className="relative min-w-[14rem] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="app-field pl-9"
                placeholder="搜索姓名 / UID / 角色"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                { key: 'all', label: '全部', count: counts.all },
                { key: 'active', label: '启用', count: counts.active },
                { key: 'disabled', label: '停用', count: counts.disabled },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                    active
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {tab.label}
                  <span
                    className={[
                      'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-slate-500',
                    ].join(' ')}
                  >
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-5 space-y-3">
            {staffQuery.isLoading ? (
              <LoadingBlock text="正在加载员工列表…" />
            ) : null}

            {staffQuery.isError ? (
              <ErrorBlock
                message={
                  staffQuery.error instanceof Error
                    ? staffQuery.error.message
                    : '员工列表加载失败'
                }
              />
            ) : null}

            {!staffQuery.isLoading &&
            !staffQuery.isError &&
            filteredItems.length === 0 ? (
              <EmptyState
                title={
                  items.length === 0
                    ? '还没有配置员工'
                    : '当前筛选下没有员工'
                }
                description={
                  items.length === 0
                    ? '在左侧填写姓名与企微 UID，并勾选角色后新增。'
                    : '试试切换状态筛选或清空搜索。'
                }
                tone="plain"
              />
            ) : null}

            {filteredItems.map((item) => {
              const isActive = item.status === 'active'
              return (
                <article
                  key={item.id}
                  className={[
                    'rounded-2xl border p-4 transition',
                    isActive
                      ? 'border-slate-200 bg-white hover:border-slate-300'
                      : 'border-slate-200 bg-slate-50/70',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-900">
                          {item.displayName}
                        </h4>
                        <span
                          className={[
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60'
                              : 'bg-slate-200/80 text-slate-600',
                          ].join(' ')}
                        >
                          {isActive ? '启用' : '停用'}
                        </span>
                      </div>
                      <p className="mt-1.5 font-mono text-sm text-slate-500">
                        {item.wecomUserId}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        在管主播 {item.managedAnchorCount ?? 0} 人
                        <span className="mx-1.5">·</span>
                        更新 {formatDateTime(item.updatedAt)}
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
                      {item.roles.includes('operator') ? (
                        <Link
                          className="app-btn-secondary"
                          to={`/admin/operators/${encodeURIComponent(item.id)}`}
                        >
                          <UserCog className="h-4 w-4" />
                          查看工作台
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className={[
                          'app-btn-secondary',
                          isActive ? 'text-rose-600 hover:bg-rose-50' : '',
                        ].join(' ')}
                        disabled={statusMutation.isPending}
                        onClick={() => void requestToggleStatus(item)}
                      >
                        {isActive ? '停用' : '启用'}
                      </button>
                      <button
                        type="button"
                        className="app-btn-danger"
                        disabled={
                          deleteMutation.isPending ||
                          (item.managedAnchorCount ?? 0) > 0
                        }
                        title={
                          (item.managedAnchorCount ?? 0) > 0
                            ? '请先转交主播'
                            : '彻底删除'
                        }
                        onClick={() => void requestDelete(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                        删除
                      </button>
                    </div>
                  </div>

                  {editingStaffId === item.id ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-700">
                        勾选该员工需要使用的全部角色
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {roleOptions.map((roleItem) => {
                          const checked = draftRoles.includes(roleItem.role)
                          return (
                            <label
                              key={roleItem.role}
                              className={[
                                'flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                                checked
                                  ? 'border-brand-200 bg-white'
                                  : 'border-slate-200 bg-white',
                              ].join(' ')}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDraftRole(roleItem.role)}
                              />
                              {roleItem.label}
                            </label>
                          )
                        })}
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
                      {item.roles.length === 0 ? (
                        <span className="text-xs text-slate-400">未分配角色</span>
                      ) : (
                        item.roles.map((role) => (
                          <span
                            key={role}
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${roleTone(role)}`}
                          >
                            {roleLabel(role)}
                          </span>
                        ))
                      )}
                    </div>
                  )}

                  {rolesFeedback?.staffId === item.id ? (
                    <p
                      className={`mt-3 rounded-2xl px-3 py-2 text-sm ${
                        rolesFeedback.type === 'success'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {rolesFeedback.message}
                      {rolesFeedback.type === 'success'
                        ? '，该员工退出当前企微登录并重新登录后即可切换工作台。'
                        : ''}
                    </p>
                  ) : null}
                </article>
              )
            })}
          </div>
        </section>
      </div>

    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'slate' | 'emerald' | 'rose' | 'sky'
  icon: ReactNode
}) {
  const tones = {
    slate: {
      wrap: 'border-slate-100 bg-slate-50/80',
      value: 'text-slate-800',
      icon: 'bg-slate-200/80 text-slate-600',
    },
    emerald: {
      wrap: 'border-emerald-100 bg-emerald-50/70',
      value: 'text-emerald-700',
      icon: 'bg-emerald-100 text-emerald-700',
    },
    rose: {
      wrap: 'border-rose-100 bg-rose-50/70',
      value: 'text-rose-700',
      icon: 'bg-rose-100 text-rose-700',
    },
    sky: {
      wrap: 'border-sky-100 bg-sky-50/70',
      value: 'text-sky-700',
      icon: 'bg-sky-100 text-sky-700',
    },
  }[tone]

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones.wrap}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-xl ${tones.icon}`}
        >
          {icon}
        </span>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones.value}`}>
        {value}
      </p>
    </div>
  )
}
