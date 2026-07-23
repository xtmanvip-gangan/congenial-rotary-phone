import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type Anchor = {
  id: string
  anchorDisplayName: string
  learnedCourseIds: string[]
}
type Session = {
  id: string
  course: { id: string; title: string }
  scheduledStartAt: string
  capacity: number
  remainingSeats: number
  waitlistCount: number
  status: string
}

export function OperatorTrainingPage() {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState('')
  const [selectedAnchors, setSelectedAnchors] = useState<string[]>([])
  const [resultText, setResultText] = useState('')
  const anchorsQuery = useQuery({
    queryKey: ['operator-training-anchors'],
    queryFn: () =>
      apiJson<{ items: Anchor[] }>('/training/operator/anchors'),
  })
  const sessionsQuery = useQuery({
    queryKey: ['training-sessions'],
    queryFn: () => apiJson<{ items: Session[] }>('/training/sessions'),
  })
  const openSessions = useMemo(
    () =>
      sessionsQuery.data?.items.filter((item) => item.status === 'published') ??
      [],
    [sessionsQuery.data],
  )
  const mutation = useMutation({
    mutationFn: () =>
      apiJson<{
        items: Array<{
          anchorProfileId: string
          ok: boolean
          status?: string
          message?: string
        }>
      }>('/training/registrations/operator/bulk', {
        method: 'POST',
        body: JSON.stringify({
          sessionId,
          anchorProfileIds: selectedAnchors,
        }),
      }),
    onSuccess: (result) => {
      const success = result.items.filter((item) => item.ok).length
      const failed = result.items.length - success
      setResultText(`已处理${result.items.length}人：成功${success}人，失败${failed}人。`)
      setSelectedAnchors([])
      return queryClient.invalidateQueries({ queryKey: ['training-sessions'] })
    },
  })

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">运营代报名</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          为我的主播安排课程
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          这里只显示已确认归属的主播；培训学习和直播同步进行，不设置考试。
        </p>
        <select
          className="app-select mt-5"
          value={sessionId}
          onChange={(event) => setSessionId(event.target.value)}
        >
          <option value="">选择开放场次</option>
          {openSessions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.course.title} · {formatDateTime(item.scheduledStartAt)} ·
              剩余{item.remainingSeats}席
            </option>
          ))}
        </select>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {anchorsQuery.data?.items.map((anchor) => {
          const checked = selectedAnchors.includes(anchor.id)
          return (
            <label
              key={anchor.id}
              className={`cursor-pointer rounded-2xl border p-4 ${
                checked
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <input
                className="mr-3"
                type="checkbox"
                checked={checked}
                onChange={() =>
                  setSelectedAnchors((current) =>
                    checked
                      ? current.filter((id) => id !== anchor.id)
                      : [...current, anchor.id],
                  )
                }
              />
              <span className="font-medium text-slate-900">
                {anchor.anchorDisplayName}
              </span>
              <p className="mt-2 text-sm text-slate-500">
                已学习 {anchor.learnedCourseIds.length} 门课程
              </p>
            </label>
          )
        })}
      </section>
      <button
        type="button"
        className="app-btn-primary"
        disabled={!sessionId || selectedAnchors.length === 0 || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        为已选 {selectedAnchors.length} 人报名
      </button>
      {resultText ? <p className="text-sm text-slate-600">{resultText}</p> : null}
      {mutation.error ? (
        <p className="text-sm text-rose-600">
          {mutation.error instanceof Error ? mutation.error.message : '报名失败'}
        </p>
      ) : null}
    </div>
  )
}
