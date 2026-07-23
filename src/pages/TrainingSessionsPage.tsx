import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type Course = { id: string; title: string; code: string }
type Session = {
  id: string
  course: Course
  teacher: { id: string; displayName: string } | null
  scheduledStartAt: string
  scheduledEndAt: string
  capacity: number
  status: string
  registeredCount: number
  waitlistCount: number
  remainingSeats: number
  meeting: {
    meetingCode: string | null
    joinUrl: string | null
    createStatus: string
    createAttempts: number
    lastError: string | null
    lastSyncAt: string | null
  } | null
}
type RosterItem = {
  id: string
  anchorDisplayName: string
  wecomName: string
  operatorName: string | null
  status: string
  learningType: string
  waitlistPosition: number | null
  outcomeReason: string | null
}

export function TrainingSessionsPage() {
  const { session: authSession } = useAuth()
  const queryClient = useQueryClient()
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [startAt, setStartAt] = useState('')
  const [capacity, setCapacity] = useState(50)
  const [templateCourseId, setTemplateCourseId] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [weekParity, setWeekParity] = useState('every')
  const [startTime, setStartTime] = useState('18:30')
  const isAdmin = authSession?.user.roles.includes('training_admin') ?? false

  const sessionsQuery = useQuery({
    queryKey: ['training-sessions'],
    queryFn: () => apiJson<{ items: Session[] }>('/training/sessions'),
  })
  const coursesQuery = useQuery({
    queryKey: ['training-courses'],
    queryFn: () => apiJson<{ items: Course[] }>('/training/courses'),
  })
  const rosterQuery = useQuery({
    queryKey: ['training-roster', selectedSessionId],
    queryFn: () =>
      apiJson<{ items: RosterItem[] }>(
        `/training/sessions/${selectedSessionId}/roster`,
      ),
    enabled: Boolean(selectedSessionId),
  })
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['training-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['training-roster'] }),
    ])
  const createSession = useMutation({
    mutationFn: () => {
      const start = new Date(startAt)
      const end = new Date(start.getTime() + 60 * 60_000)
      return apiJson('/training/sessions', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          scheduledStartAt: start.toISOString(),
          scheduledEndAt: end.toISOString(),
          capacity,
        }),
      })
    },
    onSuccess: refresh,
  })
  const createTemplate = useMutation({
    mutationFn: () =>
      apiJson('/training/schedule-templates', {
        method: 'POST',
        body: JSON.stringify({
          courseId: templateCourseId,
          weekday,
          weekParity,
          startTime,
          durationMinutes: 60,
          capacity,
        }),
      }),
  })
  const action = useMutation({
    mutationFn: ({
      path,
      payload,
      method = 'POST',
    }: {
      path: string
      payload?: Record<string, unknown>
      method?: 'POST' | 'PATCH'
    }) =>
      apiJson(path, {
        method,
        body: payload ? JSON.stringify(payload) : undefined,
      }),
    onSuccess: refresh,
  })
  const outcome = useMutation({
    mutationFn: ({
      registrationId,
      status,
      reason,
    }: {
      registrationId: string
      status: string
      reason?: string
    }) =>
      apiJson(`/training/registrations/${registrationId}/outcome`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      }),
    onSuccess: refresh,
  })

  const courseOptions = coursesQuery.data?.items ?? []
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">培训场次</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          排课与课堂执行
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          发布场次时自动创建独立腾讯会议；失败会保留原因，可直接重试。
        </p>
        {isAdmin ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <form
              className="space-y-3 rounded-2xl bg-slate-50 p-4"
              onSubmit={(event) => {
                event.preventDefault()
                createSession.mutate()
              }}
            >
              <h3 className="font-semibold text-slate-900">临时场次</h3>
              <select
                className="app-select"
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
                required
              >
                <option value="">选择课程</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <input
                className="app-field"
                type="datetime-local"
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                required
              />
              <input
                className="app-field"
                type="number"
                min={1}
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
              />
              <button className="app-btn-primary" type="submit">
                创建草稿
              </button>
            </form>
            <form
              className="space-y-3 rounded-2xl bg-slate-50 p-4"
              onSubmit={(event) => {
                event.preventDefault()
                createTemplate.mutate()
              }}
            >
              <h3 className="font-semibold text-slate-900">固定循环模板</h3>
              <select
                className="app-select"
                value={templateCourseId}
                onChange={(event) => setTemplateCourseId(event.target.value)}
                required
              >
                <option value="">选择课程</option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 gap-2">
                <select
                  className="app-select"
                  value={weekday}
                  onChange={(event) => setWeekday(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((day) => (
                    <option key={day} value={day}>
                      周{['一', '二', '三', '四', '五', '六'][day - 1]}
                    </option>
                  ))}
                </select>
                <select
                  className="app-select"
                  value={weekParity}
                  onChange={(event) => setWeekParity(event.target.value)}
                >
                  <option value="every">每周</option>
                  <option value="a">A周</option>
                  <option value="b">B周</option>
                </select>
                <input
                  className="app-field"
                  type="time"
                  min="18:00"
                  max="19:00"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                />
              </div>
              <button className="app-btn-secondary" type="submit">
                保存模板
              </button>
              <button
                className="app-btn-primary ml-2"
                type="button"
                onClick={() =>
                  action.mutate({
                    path: '/training/sessions/generate-next-week',
                  })
                }
              >
                生成下周草稿
              </button>
            </form>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        {sessionsQuery.data?.items.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-brand-600">
                  {item.status}
                </p>
                <h3 className="mt-1 font-semibold text-slate-900">
                  {item.course.title}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDateTime(item.scheduledStartAt)} · 正式{' '}
                  {item.registeredCount}/{item.capacity} · 候补{' '}
                  {item.waitlistCount}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  腾讯会议：
                  {item.meeting?.meetingCode
                    ? `${item.meeting.meetingCode} · ${item.meeting.createStatus}`
                    : item.meeting?.createStatus ?? '尚未创建'}
                </p>
                {item.meeting?.lastError ? (
                  <p className="mt-1 text-sm text-rose-600">
                    {item.meeting.lastError}
                  </p>
                ) : null}
                {item.meeting?.joinUrl ? (
                  <a
                    className="mt-2 inline-block text-sm text-brand-700 underline"
                    href={item.meeting.joinUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开会议入口
                  </a>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="app-btn-secondary"
                  onClick={() => setSelectedSessionId(item.id)}
                >
                  查看名单
                </button>
                {isAdmin &&
                ['draft', 'rescheduled', 'publish_failed'].includes(
                  item.status,
                ) ? (
                  <button
                    type="button"
                    className="app-btn-primary"
                    onClick={() =>
                      action.mutate({
                        path: `/training/sessions/${item.id}/publish`,
                      })
                    }
                  >
                    {item.status === 'publish_failed' ? '重试发布' : '发布'}
                  </button>
                ) : null}
                {isAdmin &&
                ['published', 'rescheduled'].includes(item.status) ? (
                  <button
                    type="button"
                    className="app-btn-secondary"
                    onClick={() => {
                      const value = window.prompt(
                        '请输入新的开课时间，例如 2026-07-30 18:30',
                      )
                      if (!value) return
                      const start = new Date(value.replace(' ', 'T'))
                      if (Number.isNaN(start.getTime())) return
                      action.mutate({
                        path: `/training/sessions/${item.id}/reschedule`,
                        method: 'PATCH',
                        payload: {
                          scheduledStartAt: start.toISOString(),
                          scheduledEndAt: new Date(
                            start.getTime() + 60 * 60_000,
                          ).toISOString(),
                        },
                      })
                    }}
                  >
                    改期
                  </button>
                ) : null}
                {item.status === 'published' ? (
                  <button
                    type="button"
                    className="app-btn-primary"
                    onClick={() =>
                      action.mutate({
                        path: `/training/sessions/${item.id}/start`,
                      })
                    }
                  >
                    开始上课
                  </button>
                ) : null}
                {item.status === 'in_progress' ? (
                  <button
                    type="button"
                    className="app-btn-primary"
                    onClick={() =>
                      action.mutate({
                        path: `/training/sessions/${item.id}/end`,
                      })
                    }
                  >
                    结束课程
                  </button>
                ) : null}
                {isAdmin &&
                !['cancelled', 'ended'].includes(item.status) ? (
                  <button
                    type="button"
                    className="app-btn-danger"
                    onClick={() => {
                      const reason = window.prompt('请输入取消原因')
                      if (reason?.trim()) {
                        action.mutate({
                          path: `/training/sessions/${item.id}/cancel`,
                          payload: { reason },
                        })
                      }
                    }}
                  >
                    取消
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </section>

      {selectedSessionId ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">报名名单</h3>
            <button
              className="app-btn-secondary"
              type="button"
              onClick={() => setSelectedSessionId('')}
            >
              关闭
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {rosterQuery.data?.items.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {item.anchorDisplayName} · {item.status}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    企微：{item.wecomName} · 运营：
                    {item.operatorName || '待确认'} · {item.learningType}
                  </p>
                </div>
                {item.status === 'registered' ? (
                  <div className="flex gap-2">
                    <button
                      className="app-btn-primary"
                      type="button"
                      onClick={() =>
                        outcome.mutate({
                          registrationId: item.id,
                          status: 'learned',
                          reason: '课堂确认已学习',
                        })
                      }
                    >
                      已学习
                    </button>
                    <button
                      className="app-btn-secondary"
                      type="button"
                      onClick={() => {
                        const reason = window.prompt('请输入待补学原因')
                        if (reason?.trim()) {
                          outcome.mutate({
                            registrationId: item.id,
                            status: 'needs_makeup',
                            reason,
                          })
                        }
                      }}
                    >
                      待补学
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {!rosterQuery.isLoading && !rosterQuery.data?.items.length ? (
              <p className="text-sm text-slate-500">当前还没有报名。</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}
