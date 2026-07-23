import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type OperatorOption = {
  id: string
  displayName: string
}

type ActivationTask = {
  id: string
  expectedWecomUserId: string
  wecomDisplayName: string
  status: 'pending' | 'invited' | 'activated' | 'cancelled'
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

const queryKey = ['activation-tasks']
const emptyForm: TaskForm = {
  expectedWecomUserId: '',
  wecomDisplayName: '',
  operatorId: '',
  membershipCompletedAt: '',
}

function toLocalDateTime(value: string) {
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function AuditActivationPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<TaskForm>(emptyForm)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [reassignments, setReassignments] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
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
      setForm(emptyForm)
      setEditingTaskId(null)
      setMessage(editingTaskId ? '开通资料已更新' : '档案开通任务已创建')
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : '保存失败'),
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
          ? '企微提醒已发送'
          : `企微提醒发送失败：${result.errorMessage || '未知错误'}`,
      )
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : '发送失败'),
  })
  const cancelMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiJson(`/activation-tasks/${taskId}/cancel`, { method: 'POST' }),
    onSuccess: async () => {
      setMessage('任务已取消')
      await queryClient.invalidateQueries({ queryKey })
    },
  })
  const reassignMutation = useMutation({
    mutationFn: ({ taskId, operatorId }: { taskId: string; operatorId: string }) =>
      apiJson(`/activation-tasks/${taskId}/reassign-operator`, {
        method: 'POST',
        body: JSON.stringify({ operatorId }),
      }),
    onSuccess: async () => {
      setMessage('运营已重新分配，等待运营确认')
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : '重新分配失败'),
  })

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
      setMessage('请完整填写主播昵称、企微UID、分配运营和入会时间')
      return
    }
    saveMutation.mutate(form)
  }

  function beginEdit(item: ActivationTask) {
    setEditingTaskId(item.id)
    setForm({
      expectedWecomUserId: item.expectedWecomUserId,
      wecomDisplayName: item.wecomDisplayName,
      operatorId: item.operator?.id ?? '',
      membershipCompletedAt: toLocalDateTime(item.membershipCompletedAt),
    })
    setMessage(null)
  }

  function stopEdit() {
    setEditingTaskId(null)
    setForm(emptyForm)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">审核老师</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          主播档案开通
        </h2>
        <form className="mt-6 space-y-4" noValidate onSubmit={submit}>
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
          <p className="-mt-2 text-xs text-slate-400">
            主播昵称须与企业微信昵称、抖音直播昵称一致
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
              onChange={(event) => updateForm('operatorId', event.target.value)}
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
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          <button className="app-btn-primary w-full" type="submit">
            {editingTaskId ? '保存开通资料' : '创建档案开通任务'}
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
        <h3 className="text-xl font-semibold text-slate-900">开通进度</h3>
        <div className="mt-5 space-y-3">
          {tasksQuery.data?.items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-slate-900">
                    {item.wecomDisplayName}
                  </h4>
                  <p className="mt-1 text-sm text-slate-500">
                    企微UID：{item.expectedWecomUserId}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    运营：{item.operator?.displayName ?? '待补充'} · 入会：
                    {formatDateTime(item.membershipCompletedAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    创建：{formatDateTime(item.createdAt)} · 提醒{' '}
                    {item.invitationCount} 次
                  </p>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">
                  {item.status}
                </span>
              </div>
              {item.status === 'pending' || item.status === 'invited' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="app-btn-secondary"
                    onClick={() => beginEdit(item)}
                  >
                    编辑资料
                  </button>
                  <button
                    type="button"
                    className="app-btn-secondary"
                    disabled={!item.operator}
                    onClick={() => sendMutation.mutate(item.id)}
                  >
                    {item.invitationCount ? '重新发送提醒' : '发送提醒'}
                  </button>
                  <button
                    type="button"
                    className="app-btn-secondary"
                    onClick={() => cancelMutation.mutate(item.id)}
                  >
                    取消
                  </button>
                </div>
              ) : null}
              {item.status === 'activated' &&
              item.assignmentStatus === 'rejected' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <select
                    aria-label={`为${item.wecomDisplayName}重新分配运营`}
                    className="app-field max-w-56"
                    value={reassignments[item.id] ?? ''}
                    onChange={(event) =>
                      setReassignments((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  >
                    <option value="">选择新运营</option>
                    {operatorsQuery.data?.items.map((operator) => (
                      <option key={operator.id} value={operator.id}>
                        {operator.displayName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="app-btn-secondary"
                    disabled={!reassignments[item.id]}
                    onClick={() =>
                      reassignMutation.mutate({
                        taskId: item.id,
                        operatorId: reassignments[item.id],
                      })
                    }
                  >
                    重新分配运营
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {!tasksQuery.isLoading && !tasksQuery.data?.items.length ? (
            <p className="text-sm text-slate-500">暂无档案开通任务。</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
