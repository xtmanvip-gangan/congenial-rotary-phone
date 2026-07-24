import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  LoaderCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
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
}

type TaskForm = {
  expectedWecomUserId: string
  wecomDisplayName: string
  operatorId: string
  membershipCompletedAt: string
}

type StatusFilter = 'all' | ActivationStatus | 'rejected'

const queryKey = ['activation-tasks']
const emptyForm: TaskForm = {
  expectedWecomUserId: '',
  wecomDisplayName: '',
  operatorId: '',
  membershipCompletedAt: '',
}

const statusMeta: Record<
  ActivationStatus,
  { label: string; className: string }
> = {
  pending: {
    label: '待发送',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/60',
  },
  invited: {
    label: '已通知',
    className: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/60',
  },
  activated: {
    label: '已激活',
    className:
      'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60',
  },
  cancelled: {
    label: '已取消',
    className: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80',
  },
}

const assignmentMeta: Record<
  NonNullable<ActivationTask['assignmentStatus']>,
  { label: string; className: string }
> = {
  pending_confirmation: {
    label: '待运营确认',
    className: 'bg-amber-50 text-amber-700',
  },
  confirmed: {
    label: '运营已确认',
    className: 'bg-emerald-50 text-emerald-700',
  },
  rejected: {
    label: '运营已拒绝',
    className: 'bg-rose-50 text-rose-700',
  },
  ended: {
    label: '归属已结束',
    className: 'bg-slate-100 text-slate-600',
  },
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
  const [reassignments, setReassignments] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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
      setMessage({
        type: 'success',
        text: reopenedByEdit
          ? '资料已更新，任务已重新开启为「待发送」'
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

  const counts = useMemo(() => {
    const base = {
      all: items.length,
      pending: 0,
      invited: 0,
      activated: 0,
      cancelled: 0,
      rejected: 0,
    }
    for (const item of items) {
      base[item.status] += 1
      if (
        item.status === 'activated' &&
        item.assignmentStatus === 'rejected'
      ) {
        base.rejected += 1
      }
    }
    return base
  }, [items])

  const filteredItems = useMemo(() => {
    if (statusFilter === 'all') return items
    if (statusFilter === 'rejected') {
      return items.filter(
        (item) =>
          item.status === 'activated' &&
          item.assignmentStatus === 'rejected',
      )
    }
    return items.filter((item) => item.status === statusFilter)
  }, [items, statusFilter])

  const busy =
    saveMutation.isPending ||
    sendMutation.isPending ||
    cancelMutation.isPending ||
    reopenMutation.isPending ||
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
    setMessage(
      item.status === 'cancelled'
        ? {
            type: 'success',
            text: '正在编辑已作废任务：保存后将自动重新开启为「待发送」',
          }
        : null,
    )
  }

  function stopEdit() {
    setEditingTaskId(null)
    setEditingWasCancelled(false)
    setForm(emptyForm)
  }

  async function requestCancel(item: ActivationTask) {
    const ok = await confirm({
      title: '作废开通任务？',
      message: `将作废「${item.wecomDisplayName}」的开通任务。记录会保留，之后可重新开启、编辑资料或再发提醒；不会删除，也不能用删除代替。`,
      confirmText: '确认作废',
      cancelText: '返回',
      variant: 'danger',
    })
    if (ok) {
      cancelMutation.mutate(item.id)
    }
  }

  const filterTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'pending', label: '待发送', count: counts.pending },
    { key: 'invited', label: '已通知', count: counts.invited },
    { key: 'activated', label: '已激活', count: counts.activated },
    { key: 'rejected', label: '待重分配', count: counts.rejected },
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
              主播档案开通
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              创建开通任务、分配运营并发送企微提醒。作废只是暂停流程，任务仍会保留，可随时重新开启；主播激活后若运营拒绝，可在此重新分配。
            </p>
          </div>
          <button
            type="button"
            className="app-btn-secondary shrink-0"
            disabled={tasksQuery.isFetching}
            onClick={() => void tasksQuery.refetch()}
          >
            <RefreshCw
              className={`h-4 w-4 ${tasksQuery.isFetching ? 'animate-spin' : ''}`}
            />
            刷新列表
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryChip
            label="待发送"
            value={counts.pending}
            tone="amber"
            active={statusFilter === 'pending'}
            onClick={() => setStatusFilter('pending')}
          />
          <SummaryChip
            label="已通知"
            value={counts.invited}
            tone="sky"
            active={statusFilter === 'invited'}
            onClick={() => setStatusFilter('invited')}
          />
          <SummaryChip
            label="已激活"
            value={counts.activated}
            tone="emerald"
            active={statusFilter === 'activated'}
            onClick={() => setStatusFilter('activated')}
          />
          <SummaryChip
            label="待重分配"
            value={counts.rejected}
            tone="rose"
            active={statusFilter === 'rejected'}
            onClick={() => setStatusFilter('rejected')}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <section className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-soft xl:sticky xl:top-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {editingTaskId
                  ? editingWasCancelled
                    ? '编辑并重新开启'
                    : '编辑开通资料'
                  : '新建开通任务'}
              </h3>
              <p className="text-xs text-slate-500">
                {editingTaskId
                  ? editingWasCancelled
                    ? '保存后任务会回到「待发送」'
                    : '修改后保存，可继续发送提醒'
                  : '同一企微UID若曾作废，再创建会自动重开原任务'}
              </p>
            </div>
          </div>

          <form className="mt-5 space-y-4" noValidate onSubmit={submit}>
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
            {operatorsQuery.isError ? (
              <p className="text-xs text-rose-600">
                运营列表加载失败，请刷新后重试
              </p>
            ) : null}
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

            {message ? (
              <p
                className={[
                  'rounded-2xl px-3 py-2 text-sm',
                  message.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700',
                ].join(' ')}
              >
                {message.text}
              </p>
            ) : null}

            <button
              className="app-btn-primary w-full"
              type="submit"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {editingTaskId
                ? editingWasCancelled
                  ? '保存并重新开启'
                  : '保存开通资料'
                : '创建档案开通任务'}
            </button>
            {editingTaskId ? (
              <button
                className="app-btn-secondary w-full"
                type="button"
                onClick={stopEdit}
              >
                取消编辑
              </button>
            ) : null}
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">开通进度</h3>
              <p className="mt-1 text-sm text-slate-500">
                共 {counts.all} 条
                {statusFilter !== 'all'
                  ? ` · 当前筛选 ${filteredItems.length} 条`
                  : ''}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
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
                      active ? 'bg-white/20 text-white' : 'bg-white text-slate-500',
                    ].join(' ')}
                  >
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-5 space-y-3">
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
                  statusFilter === 'all'
                    ? '暂无档案开通任务'
                    : '当前筛选下没有任务'
                }
                description={
                  statusFilter === 'all'
                    ? '在左侧填写主播信息并创建第一条开通任务。'
                    : '切换筛选条件，或新建开通任务。'
                }
                tone="plain"
              />
            ) : null}

            {filteredItems.map((item) => {
              const meta = statusMeta[item.status]
              const assignment =
                item.assignmentStatus != null
                  ? assignmentMeta[item.assignmentStatus]
                  : null
              const actionable =
                item.status === 'pending' || item.status === 'invited'
              const isCancelled = item.status === 'cancelled'
              const needsReassign =
                item.status === 'activated' &&
                item.assignmentStatus === 'rejected'

              return (
                <article
                  key={item.id}
                  className={[
                    'rounded-2xl border p-4 transition hover:border-slate-300',
                    isCancelled
                      ? 'border-slate-200 bg-slate-50/60'
                      : 'border-slate-200 bg-white',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-900">
                          {item.wecomDisplayName}
                        </h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                        {assignment ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${assignment.className}`}
                          >
                            {assignment.label}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm text-slate-500">
                        企微UID：
                        <span className="font-mono text-slate-600">
                          {item.expectedWecomUserId}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        运营：{item.operator?.displayName ?? '待补充'}
                        <span className="mx-1.5 text-slate-300">·</span>
                        入会：{formatDateTime(item.membershipCompletedAt)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        创建 {formatDateTime(item.createdAt)}
                        <span className="mx-1.5">·</span>
                        提醒 {item.invitationCount} 次
                        {item.invitationSentAt
                          ? ` · 最近 ${formatDateTime(item.invitationSentAt)}`
                          : ''}
                      </p>
                      {isCancelled ? (
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          任务已作废，不会再发提醒；可「重新开启」继续流程，或「编辑资料」修正后自动开启。
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {actionable ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        className="app-btn-secondary"
                        disabled={busy}
                        onClick={() => beginEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑资料
                      </button>
                      <button
                        type="button"
                        className="app-btn-secondary"
                        disabled={!item.operator || busy}
                        onClick={() => sendMutation.mutate(item.id)}
                      >
                        {sendMutation.isPending ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Send className="h-3.5 w-3.5" />
                        )}
                        {item.invitationCount ? '重新发送提醒' : '发送提醒'}
                      </button>
                      <button
                        type="button"
                        className="app-btn-secondary text-rose-600 hover:bg-rose-50"
                        disabled={busy}
                        onClick={() => void requestCancel(item)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        作废任务
                      </button>
                    </div>
                  ) : null}

                  {isCancelled ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        className="app-btn-primary"
                        disabled={!item.operator || busy}
                        onClick={() => reopenMutation.mutate(item.id)}
                      >
                        {reopenMutation.isPending ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        重新开启
                      </button>
                      <button
                        type="button"
                        className="app-btn-secondary"
                        disabled={busy}
                        onClick={() => beginEdit(item)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        编辑资料
                      </button>
                    </div>
                  ) : null}

                  {needsReassign ? (
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
                      <label className="min-w-[12rem] flex-1 text-xs font-medium text-slate-600">
                        选择新运营
                        <select
                          aria-label={`为${item.wecomDisplayName}重新分配运营`}
                          className="mt-1.5 app-field"
                          value={reassignments[item.id] ?? ''}
                          onChange={(event) =>
                            setReassignments((current) => ({
                              ...current,
                              [item.id]: event.target.value,
                            }))
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
                      <button
                        type="button"
                        className="app-btn-primary"
                        disabled={!reassignments[item.id] || busy}
                        onClick={() =>
                          reassignMutation.mutate({
                            taskId: item.id,
                            operatorId: reassignments[item.id],
                          })
                        }
                      >
                        {reassignMutation.isPending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        重新分配运营
                      </button>
                    </div>
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

function SummaryChip({
  label,
  value,
  tone,
  active,
  onClick,
}: {
  label: string
  value: number
  tone: 'amber' | 'sky' | 'emerald' | 'rose'
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
