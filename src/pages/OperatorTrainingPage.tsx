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
type OperatorRegistration = {
  id: string
  anchorDisplayName: string
  status: string
  waitlistPosition: number | null
  session: Session
}

export function OperatorTrainingPage() {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState('')
  const [selectedAnchors, setSelectedAnchors] = useState<string[]>([])
  const [resultText, setResultText] = useState('')
  const [recommendationAnchorId, setRecommendationAnchorId] = useState('')
  const [recommendationCourseId, setRecommendationCourseId] = useState('')
  const [recommendationReason, setRecommendationReason] = useState('')
  const anchorsQuery = useQuery({
    queryKey: ['operator-training-anchors'],
    queryFn: () =>
      apiJson<{ items: Anchor[] }>('/training/operator/anchors'),
  })
  const sessionsQuery = useQuery({
    queryKey: ['training-sessions'],
    queryFn: () => apiJson<{ items: Session[] }>('/training/sessions'),
  })
  const registrationsQuery = useQuery({
    queryKey: ['operator-training-registrations'],
    queryFn: () =>
      apiJson<{ items: OperatorRegistration[] }>(
        '/training/operator/registrations',
      ),
  })
  const coursesQuery = useQuery({
    queryKey: ['training-courses'],
    queryFn: () =>
      apiJson<{ items: Array<{ id: string; title: string }> }>(
        '/training/courses',
      ),
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
  const cancelMutation = useMutation({
    mutationFn: (registrationId: string) =>
      apiJson(`/training/registrations/operator/${registrationId}`, {
        method: 'DELETE',
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['operator-training-registrations'],
        }),
        queryClient.invalidateQueries({ queryKey: ['training-sessions'] }),
      ]),
  })
  const recommendMutation = useMutation({
    mutationFn: () =>
      apiJson('/training/recommendations', {
        method: 'POST',
        body: JSON.stringify({
          anchorProfileId: recommendationAnchorId,
          courseId: recommendationCourseId,
          reason: recommendationReason || undefined,
        }),
      }),
    onSuccess: () => {
      setRecommendationReason('')
      setResultText('课程推荐已发送，主播可在小程序“推荐课程”中查看。')
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
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900">
          根据直播表现推荐课程
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          推荐只是成长建议，不限制主播报名其他开放课程。
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <select
            className="app-select"
            value={recommendationAnchorId}
            onChange={(event) =>
              setRecommendationAnchorId(event.target.value)
            }
          >
            <option value="">选择主播</option>
            {anchorsQuery.data?.items.map((anchor) => (
              <option key={anchor.id} value={anchor.id}>
                {anchor.anchorDisplayName}
              </option>
            ))}
          </select>
          <select
            className="app-select"
            value={recommendationCourseId}
            onChange={(event) =>
              setRecommendationCourseId(event.target.value)
            }
          >
            <option value="">选择课程</option>
            {coursesQuery.data?.items.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </div>
        <textarea
          className="app-field mt-3 min-h-20"
          placeholder="填写推荐原因，例如：需要加强开场和互动延展"
          value={recommendationReason}
          onChange={(event) => setRecommendationReason(event.target.value)}
        />
        <button
          type="button"
          className="app-btn-primary mt-3"
          disabled={
            !recommendationAnchorId ||
            !recommendationCourseId ||
            recommendMutation.isPending
          }
          onClick={() => recommendMutation.mutate()}
        >
          发送课程推荐
        </button>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900">待开课报名</h3>
        <div className="mt-4 space-y-3">
          {registrationsQuery.data?.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {item.anchorDisplayName} · {item.session.course.title}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(item.session.scheduledStartAt)} ·{' '}
                  {item.status === 'waitlisted'
                    ? `候补${item.waitlistPosition ?? ''}`
                    : '已报名'}
                </p>
              </div>
              <button
                type="button"
                className="app-btn-secondary"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(item.id)}
              >
                取消报名
              </button>
            </div>
          ))}
          {!registrationsQuery.isLoading &&
          !registrationsQuery.data?.items.length ? (
            <p className="text-sm text-slate-500">当前没有待开课报名。</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
