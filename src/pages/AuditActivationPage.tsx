import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type ActivationTask = {
  id: string
  expectedWecomUserId: string
  wecomDisplayName: string
  status: 'pending' | 'invited' | 'activated' | 'cancelled'
  invitationSentAt: string | null
  invitationCount: number
  membershipCompletedAt: string
  deviceReadyAt: string
  createdAt: string
}

const queryKey = ['activation-tasks']

export function AuditActivationPage() {
  const queryClient = useQueryClient()
  const [expectedWecomUserId, setExpectedWecomUserId] = useState('')
  const [wecomDisplayName, setWecomDisplayName] = useState('')
  const [membershipCompletedAt, setMembershipCompletedAt] = useState('')
  const [deviceReadyAt, setDeviceReadyAt] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const tasksQuery = useQuery({
    queryKey,
    queryFn: () =>
      apiJson<{ items: ActivationTask[] }>('/activation-tasks'),
  })
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiJson('/activation-tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setExpectedWecomUserId('')
      setWecomDisplayName('')
      setMembershipCompletedAt('')
      setDeviceReadyAt('')
      setMessage('激活任务已创建')
      await queryClient.invalidateQueries({ queryKey })
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : '创建失败'),
  })
  const sendMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiJson<{ notificationStatus: string }>(
        `/activation-tasks/${taskId}/send`,
        { method: 'POST' },
      ),
    onSuccess: async (result) => {
      setMessage(
        result.notificationStatus === 'not_configured'
          ? '任务已更新；企微消息接口尚未配置，请先人工通知主播'
          : '激活提醒已发送',
      )
      await queryClient.invalidateQueries({ queryKey })
    },
  })
  const cancelMutation = useMutation({
    mutationFn: (taskId: string) =>
      apiJson(`/activation-tasks/${taskId}/cancel`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    createMutation.mutate({
      expectedWecomUserId,
      wecomDisplayName,
      membershipCompletedAt: new Date(membershipCompletedAt).toISOString(),
      deviceReadyAt: new Date(deviceReadyAt).toISOString(),
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">审核老师</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">主播档案激活</h2>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            企微展示名
            <input
              className="mt-2 app-field"
              value={wecomDisplayName}
              onChange={(event) => setWecomDisplayName(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            企微UID
            <input
              className="mt-2 app-field"
              value={expectedWecomUserId}
              onChange={(event) => setExpectedWecomUserId(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            入会完成时间
            <input
              type="datetime-local"
              className="mt-2 app-field"
              value={membershipCompletedAt}
              onChange={(event) => setMembershipCompletedAt(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            设备调试完成时间
            <input
              type="datetime-local"
              className="mt-2 app-field"
              value={deviceReadyAt}
              onChange={(event) => setDeviceReadyAt(event.target.value)}
            />
          </label>
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          <button className="app-btn-primary w-full" type="submit">
            创建激活任务
          </button>
        </form>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h3 className="text-xl font-semibold text-slate-900">激活进度</h3>
        <div className="mt-5 space-y-3">
          {tasksQuery.data?.items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="font-semibold text-slate-900">{item.wecomDisplayName}</h4>
                  <p className="mt-1 text-sm text-slate-500">{item.expectedWecomUserId}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    创建：{formatDateTime(item.createdAt)} · 提醒 {item.invitationCount} 次
                  </p>
                </div>
                <span className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">
                  {item.status}
                </span>
              </div>
              {item.status === 'pending' || item.status === 'invited' ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="app-btn-secondary"
                    onClick={() => sendMutation.mutate(item.id)}
                  >
                    发送提醒
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
            </article>
          ))}
          {!tasksQuery.isLoading && !tasksQuery.data?.items.length ? (
            <p className="text-sm text-slate-500">暂无激活任务。</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
