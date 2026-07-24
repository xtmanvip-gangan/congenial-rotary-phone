import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  LoaderCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { useConfirmDialog } from '../components/useConfirmDialog'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type OperatorOption = {
  id: string
  displayName: string
}

type ActivationStatus = 'pending' | 'invited' | 'activated' | 'cancelled'

/** 入会漏斗展示态（列表只显示这一种主状态） */
type FunnelStage =
  | 'awaiting_notify'
  | 'awaiting_activate'
  | 'awaiting_confirm'
  | 'rejected'
  | 'joined'
  | 'cancelled'

type ActivationTask = {
  id: string
  expectedWecomUserId: string
  wecomDisplayName: string
  status: ActivationStatus
  invitationSentAt: string | null
  invitationCount: number
  membershipCompletedAt: string
  createdAt: string
  operator: OperatorOption | null
  assignmentStatus:
    | 'pending_confirmation'
    | 'confirmed'
    | 'rejected'
    | 'ended'
    | null
  /** 主播一点开通后才有，用于跳转个人全景档案 */
  anchorProfileId?: string | null
}

type TaskForm = {
  expectedWecomUserId: string
  wecomDisplayName: string
  operatorId: string
  membershipCompletedAt: string
}

type StatusFilter = 'all' | FunnelStage

const queryKey = ['activation-tasks']
const emptyForm: TaskForm = {
  expectedWecomUserId: '',
  wecomDisplayName: '',
  operatorId: '',
  membershipCompletedAt: '',
}

const funnelMeta: Record<
  FunnelStage,
  { label: string; className: string }
> = {
  awaiting_notify: {
    label: '待通知',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/60',
  },
  awaiting_activate: {
    label: '待激活',
    className: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/60',
  },
  awaiting_confirm: {
    label: '待运营确认',
    className:
      'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/60',
  },
  rejected: {
    label: '运营已拒绝',
    className: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/60',
  },
  joined: {
    label: '已入会',
    className:
      'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60',
  },
  cancelled: {
    label: '已取消',
    className: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80',
  },
}

function resolveFunnelStage(item: ActivationTask): FunnelStage {
  if (item.status === 'cancelled') return 'cancelled'
  if (item.status === 'pending') return 'awaiting_notify'
  if (item.status === 'invited') return 'awaiting_activate'
  if (item.status === 'activated') {
    if (item.assignmentStatus === 'rejected') return 'rejected'
    if (item.assignmentStatus === 'confirmed') return 'joined'
    return 'awaiting_confirm'
  }
  return 'awaiting_notify'
}

function toLocalDateTime(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function AuditActivationPage() {
  const queryClient = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [form, setForm] = useState<TaskForm>(emptyForm)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingWasCancelled, setEditingWasCancelled] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [reassignments, setReassignments] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [keyword, setKeyword] = useState('')

  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => apiJson<{ items: ActivationTask[] }>('/activation-tasks'),
  })
  const operatorsQuery = useQuery({
    queryKey: ['active-operators'],
    queryFn: () =>
      apiJson<{ items: OperatorOption[] }>('/staff/operators/active'),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: TaskForm) =>
      apiJson(
        editingTaskId
          ? `/activation-tasks/${editingTaskId}`
          : '/activation-tasks',
        {
          method: editingTaskId ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...payload,
            membershipCompletedAt: new Date(
              payload.membershipCompletedAt,
            ).toISOString(),
          }),
        },
      ),
    onSuccess: async () => {
      const wasEditing = Boolean(editingTaskId)
      const reopenedByEdit = wasEditing && editingWasCancelled
      setForm(emptyForm)
      setEditingTaskId(null)
      setEditingWasCancelled(false)
      setFormOpen(false)
      setMessage({
        type: 'success',
        text: reopenedByEdit
          ? '资料已更新，任务已重新开启为「待通知」'
          : wasEditing
            ? '开通资料已更新'
            : '档案开通任务已创建',
      })
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '保存失败',
      }),
  })

  const sendMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiJson<{
        notificationStatus: 'success' | 'failed'
        errorMessage?: string
      }>(`/activation-tasks/${taskId}/send`, { method: 'POST' }),
    onSuccess: async (result) => {
      setMessage(
        result.notificationStatus === 'success'
          ? { type: 'success', text: '企微提醒已发送' }
          : {
              type: 'error',
              text: `企微提醒发送失败：${result.errorMessage || '未知错误'}`,
            },
      )
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '发送失败',
      }),
  })

  const cancelMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiJson(`/activation-tasks/${taskId}/cancel`, { method: 'POST' }),
    onSuccess: async () => {
      setMessage({
        type: 'success',
        text: '任务已作废（可随时重新开启，不会删除记录）',
      })
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '作废失败',
      }),
  })

  const reopenMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiJson(`/activation-tasks/${taskId}/reopen`, { method: 'POST' }),
    onSuccess: async () => {
      setMessage({
        type: 'success',
        text: '任务已重新开启，可编辑资料或发送提醒',
      })
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '重新开启失败',
      }),
  })

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiJson(`/activation-tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      if (editingTaskId) {
        setEditingTaskId(null)
        setEditingWasCancelled(false)
        setForm(emptyForm)
        setFormOpen(false)
      }
      setMessage({
        type: 'success',
        text: '开通任务已彻底删除，可用同一企微UID重新创建',
      })
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '删除失败',
      }),
  })

  const reassignMutation = useMutation({
    mutationFn: ({
      taskId,
      operatorId,
    }: {
      taskId: string
      operatorId: string
    }) =>
      apiJson(`/activation-tasks/${taskId}/reassign-operator`, {
        method: 'POST',
        body: JSON.stringify({ operatorId }),
      }),
    onSuccess: async () => {
      setMessage({ type: 'success', text: '运营已重新分配，等待运营确认' })
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : '重新分配失败',
      }),
  })

  const items = tasksQuery.data?.items ?? []

  const withStage = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        funnel: resolveFunnelStage(item),
      })),
    [items],
  )

  const counts = useMemo(() => {
    const base = {
      all: withStage.length,
      awaiting_notify: 0,
      awaiting_activate: 0,
      awaiting_confirm: 0,
      rejected: 0,
      joined: 0,
      cancelled: 0,
    }
    for (const item of withStage) {
      base[item.funnel] += 1
    }
    return base
  }, [withStage])

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return withStage.filter((item) => {
      if (statusFilter !== 'all' && item.funnel !== statusFilter) return false
      if (!q) return true
      const hay =
        `${item.wecomDisplayName} ${item.expectedWecomUserId} ${item.operator?.displayName ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [withStage, statusFilter, keyword])

  const busy =
    saveMutation.isPending ||
    sendMutation.isPending ||
    cancelMutation.isPending ||
    reopenMutation.isPending ||
    deleteMutation.isPending ||
    reassignMutation.isPending

  function updateForm(field: keyof TaskForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (
      !form.wecomDisplayName.trim() ||
      !form.expectedWecomUserId.trim() ||
      !form.operatorId ||
      !form.membershipCompletedAt
    ) {
      setMessage({
        type: 'error',
        text: '请完整填写主播昵称、企微UID、分配运营和入会时间',
      })
      return
    }
    saveMutation.mutate(form)
  }

  function beginEdit(item: ActivationTask) {
    setEditingTaskId(item.id)
    setEditingWasCancelled(item.status === 'cancelled')
    setForm({
      expectedWecomUserId: item.expectedWecomUserId,
      wecomDisplayName: item.wecomDisplayName,
      operatorId: item.operator?.id ?? '',
      membershipCompletedAt: toLocalDateTime(item.membershipCompletedAt),
    })
    setFormOpen(true)
    setMessage(
      item.status === 'cancelled'
        ? {
            type: 'success',
            text: '正在编辑已作废任务：保存后将自动重新开启为「待通知」',
          }
        : null,
    )
  }

  function openCreate() {
    setEditingTaskId(null)
    setEditingWasCancelled(false)
    setForm(emptyForm)
    setFormOpen(true)
    setMessage(null)
  }

  function stopEdit() {
    setEditingTaskId(null)
    setEditingWasCancelled(false)
    setForm(emptyForm)
    setFormOpen(false)
  }

  async function requestCancel(item: ActivationTask) {
    const ok = await confirm({
      title: '作废开通任务？',
      message: `将作废「${item.wecomDisplayName}」的开通任务。记录会保留，之后可重新开启；若确认不再需要，可在作废后再「彻底删除」。已激活的主播不能作废/删除。`,
      confirmText: '确认作废',
      cancelText: '返回',
      variant: 'danger',
    })
    if (ok) {
      cancelMutation.mutate(item.id)
    }
  }

  async function requestDelete(item: ActivationTask) {
    const ok = await confirm({
      title: '彻底删除开通任务？',
      message: `将永久删除「${item.wecomDisplayName}」（企微UID：${item.expectedWecomUserId}）的开通任务，不可恢复。仅已作废且未激活的任务可删；删除后可用同一UID重新创建。`,
      confirmText: '确认删除',
      cancelText: '返回',
      variant: 'danger',
    })
    if (ok) {
      deleteMutation.mutate(item.id)
    }
  }

  const filterTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.all },
    {
      key: 'awaiting_notify',
      label: '待通知',
      count: counts.awaiting_notify,
    },
    {
      key: 'awaiting_activate',
      label: '待激活',
      count: counts.awaiting_activate,
    },
    {
      key: 'awaiting_confirm',
      label: '待运营确认',
      count: counts.awaiting_confirm,
    },
    { key: 'rejected', label: '已拒绝', count: counts.rejected },
    { key: 'joined', label: '已入会', count: counts.joined },
    { key: 'cancelled', label: '已取消', count: counts.cancelled },
  ]

  return (
    <div className="space-y-6">
      {confirmDialog}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">人员与主播</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              激活监管
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              入会前与待确认在此处理。运营确认后进入「主播全景」。进度：待通知 →
              待激活 → 待运营确认 → 已入会。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="app-btn-secondary shrink-0"
              disabled={tasksQuery.isFetching}
              onClick={() => void tasksQuery.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${tasksQuery.isFetching ? 'animate-spin' : ''}`}
              />
              刷新
            </button>
            <button
              type="button"
              className="app-btn-primary shrink-0"
              onClick={openCreate}
            >
              <UserPlus className="h-4 w-4" />
              新建开通
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryChip
            label="待通知"
            value={counts.awaiting_notify}
            tone="amber"
            active={statusFilter === 'awaiting_notify'}
            onClick={() => setStatusFilter('awaiting_notify')}
          />
          <SummaryChip
            label="待激活"
            value={counts.awaiting_activate}
            tone="sky"
            active={statusFilter === 'awaiting_activate'}
            onClick={() => setStatusFilter('awaiting_activate')}
          />
          <SummaryChip
            label="待运营确认"
            value={counts.awaiting_confirm}
            tone="violet"
            active={statusFilter === 'awaiting_confirm'}
            onClick={() => setStatusFilter('awaiting_confirm')}
          />
          <SummaryChip
            label="运营已拒绝"
            value={counts.rejected}
            tone="rose"
            active={statusFilter === 'rejected'}
            onClick={() => setStatusFilter('rejected')}
          />
        </div>

        {message ? (
          <p
            className={[
              'mt-4 rounded-2xl px-3 py-2 text-sm',
              message.type === 'success'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700',
            ].join(' ')}
          >
            {message.text}
          </p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {filterTabs.map((tab) => {
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
          <label className="relative min-w-[14rem] flex-1 sm:max-w-xs sm:ml-auto">
            <input
              className="app-field"
              placeholder="搜索昵称 / UID / 运营"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4">
          {tasksQuery.isLoading ? (
            <LoadingBlock text="正在加载开通任务…" />
          ) : null}
          {tasksQuery.isError ? (
            <ErrorBlock
              message={
                tasksQuery.error instanceof Error
                  ? tasksQuery.error.message
                  : '开通任务加载失败'
              }
            />
          ) : null}

          {!tasksQuery.isLoading &&
          !tasksQuery.isError &&
          filteredItems.length === 0 ? (
            <EmptyState
              title={
                statusFilter === 'all' && !keyword.trim()
                  ? '暂无档案开通任务'
                  : '当前筛选下没有任务'
              }
              description={
                statusFilter === 'all' && !keyword.trim()
                  ? '点击「新建开通」创建第一条任务。'
                  : '切换筛选或清空搜索。'
              }
              tone="plain"
            />
          ) : null}

          {!tasksQuery.isLoading &&
          !tasksQuery.isError &&
          filteredItems.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="whitespace-nowrap px-3 py-3">主播昵称</th>
                    <th className="whitespace-nowrap px-3 py-3">企微 UID</th>
                    <th className="whitespace-nowrap px-3 py-3">指定运营</th>
                    <th className="whitespace-nowrap px-3 py-3">入会日期</th>
                    <th className="whitespace-nowrap px-3 py-3">进度</th>
                    <th className="whitespace-nowrap px-3 py-3">提醒</th>
                    <th className="whitespace-nowrap px-3 py-3">创建时间</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredItems.map((item) => {
                    const meta = funnelMeta[item.funnel]
                    const canNotify =
                      item.funnel === 'awaiting_notify' ||
                      item.funnel === 'awaiting_activate'
                    const isCancelled = item.funnel === 'cancelled'
                    const needsReassign = item.funnel === 'rejected'

                    return (
                      <tr
                        key={item.id}
                        className={[
                          'align-top transition-colors',
                          isCancelled
                            ? 'bg-slate-50/60'
                            : 'hover:bg-slate-50/80',
                        ].join(' ')}
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {item.wecomDisplayName}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                          {item.expectedWecomUserId}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                          {item.operator?.displayName ?? '待补充'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                          {formatDateTime(item.membershipCompletedAt)}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.className}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                          {item.invitationCount} 次
                          {item.invitationSentAt
                            ? ` · ${formatDateTime(item.invitationSentAt)}`
                            : ''}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
                            {canNotify ? (
                              <>
                                <button
                                  type="button"
                                  className="text-xs font-medium text-slate-600 hover:text-brand-700"
                                  disabled={busy}
                                  onClick={() => beginEdit(item)}
                                >
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                                  disabled={!item.operator || busy}
                                  onClick={() => sendMutation.mutate(item.id)}
                                >
                                  {sendMutation.isPending ? (
                                    <LoaderCircle className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3" />
                                  )}
                                  {item.invitationCount ? '再提醒' : '发送提醒'}
                                </button>
                                <button
                                  type="button"
                                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                                  disabled={busy}
                                  onClick={() => void requestCancel(item)}
                                >
                                  作废
                                </button>
                              </>
                            ) : null}

                            {item.funnel === 'joined' ? (
                              item.anchorProfileId ? (
                                <Link
                                  to={`/admin/anchors/${item.anchorProfileId}`}
                                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                                >
                                  查看档案
                                </Link>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  已入会
                                </span>
                              )
                            ) : null}

                            {item.funnel === 'awaiting_confirm' ? (
                              <span className="text-xs text-slate-400">
                                等待运营确认
                              </span>
                            ) : null}

                            {needsReassign ? (
                              <div className="flex flex-wrap items-center justify-end gap-1.5">
                                <select
                                  aria-label={`为${item.wecomDisplayName}重新分配运营`}
                                  className="app-field max-w-[9rem] py-1 text-xs"
                                  value={reassignments[item.id] ?? ''}
                                  onChange={(event) =>
                                    setReassignments((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">新运营</option>
                                  {operatorsQuery.data?.items.map(
                                    (operator) => (
                                      <option
                                        key={operator.id}
                                        value={operator.id}
                                      >
                                        {operator.displayName}
                                      </option>
                                    ),
                                  )}
                                </select>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                                  disabled={!reassignments[item.id] || busy}
                                  onClick={() =>
                                    reassignMutation.mutate({
                                      taskId: item.id,
                                      operatorId: reassignments[item.id],
                                    })
                                  }
                                >
                                  {reassignMutation.isPending ? (
                                    <LoaderCircle className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="h-3 w-3" />
                                  )}
                                  改派
                                </button>
                                <button
                                  type="button"
                                  className="text-xs font-medium text-rose-600 hover:text-rose-700"
                                  disabled={busy}
                                  onClick={() => void requestCancel(item)}
                                >
                                  作废
                                </button>
                              </div>
                            ) : null}

                            {isCancelled ? (
                              <>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                                  disabled={!item.operator || busy}
                                  onClick={() => reopenMutation.mutate(item.id)}
                                >
                                  {reopenMutation.isPending ? (
                                    <LoaderCircle className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3 w-3" />
                                  )}
                                  重开
                                </button>
                                <button
                                  type="button"
                                  className="text-xs font-medium text-slate-600 hover:text-brand-700"
                                  disabled={busy}
                                  onClick={() => beginEdit(item)}
                                >
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-600 hover:text-rose-700"
                                  disabled={busy}
                                  onClick={() => void requestDelete(item)}
                                >
                                  {deleteMutation.isPending ? (
                                    <LoaderCircle className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3 w-3" />
                                  )}
                                  删除
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-soft">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {editingTaskId
                    ? editingWasCancelled
                      ? '编辑并重新开启'
                      : '编辑开通资料'
                    : '新建开通任务'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {editingTaskId
                    ? editingWasCancelled
                      ? '保存后任务会回到「待通知」'
                      : '修改后保存，可继续发送提醒'
                    : '同一企微UID若曾作废，再创建会自动重开原任务'}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={stopEdit}
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="space-y-4 px-5 py-4" noValidate onSubmit={submit}>
              <label className="block text-sm font-medium text-slate-700">
                主播昵称
                <input
                  className="mt-2 app-field"
                  required
                  value={form.wecomDisplayName}
                  onChange={(event) =>
                    updateForm('wecomDisplayName', event.target.value)
                  }
                />
              </label>
              <p className="-mt-2 text-xs leading-5 text-slate-400">
                须与企业微信昵称、抖音直播昵称一致
              </p>
              <label className="block text-sm font-medium text-slate-700">
                企微UID
                <input
                  className="mt-2 app-field"
                  required
                  value={form.expectedWecomUserId}
                  onChange={(event) =>
                    updateForm('expectedWecomUserId', event.target.value)
                  }
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                分配运营
                <select
                  className="mt-2 app-field"
                  required
                  value={form.operatorId}
                  onChange={(event) =>
                    updateForm('operatorId', event.target.value)
                  }
                >
                  <option value="">请选择运营老师</option>
                  {operatorsQuery.data?.items.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                入会时间
                <input
                  type="datetime-local"
                  className="mt-2 app-field"
                  required
                  value={form.membershipCompletedAt}
                  onChange={(event) =>
                    updateForm('membershipCompletedAt', event.target.value)
                  }
                />
              </label>

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  className="app-btn-secondary"
                  type="button"
                  onClick={stopEdit}
                >
                  取消
                </button>
                <button
                  className="app-btn-primary"
                  type="submit"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : editingTaskId ? (
                    <Pencil className="h-4 w-4" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {editingTaskId
                    ? editingWasCancelled
                      ? '保存并重新开启'
                      : '保存'
                    : '创建任务'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SummaryChip({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  tone: 'amber' | 'sky' | 'emerald' | 'rose' | 'violet'
  active: boolean
  onClick: () => void
}) {
  const tones = {
    amber: {
      wrap: 'border-amber-100 bg-amber-50/70',
      value: 'text-amber-700',
      ring: 'ring-amber-300',
    },
    sky: {
      wrap: 'border-sky-100 bg-sky-50/70',
      value: 'text-sky-700',
      ring: 'ring-sky-300',
    },
    emerald: {
      wrap: 'border-emerald-100 bg-emerald-50/70',
      value: 'text-emerald-700',
      ring: 'ring-emerald-300',
    },
    rose: {
      wrap: 'border-rose-100 bg-rose-50/70',
      value: 'text-rose-700',
      ring: 'ring-rose-300',
    },
    violet: {
      wrap: 'border-violet-100 bg-violet-50/70',
      value: 'text-violet-700',
      ring: 'ring-violet-300',
    },
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-2xl border px-4 py-3 text-left transition',
        tones.wrap,
        active ? `ring-2 ${tones.ring}` : 'hover:brightness-[0.98]',
      ].join(' ')}
    >
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones.value}`}>
        {value}
      </p>
    </button>
  )
}
