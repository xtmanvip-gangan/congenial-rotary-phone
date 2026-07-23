import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiJson } from '../lib/api'

type Feedback = {
  id: string
  weekStart: string
  status: 'unobserved' | 'practicing' | 'applied' | 'needs_support'
  observationNote: string | null
  replayIssue: string | null
  interventionNeeded: boolean
  anchorProfile: { id: string; anchorDisplayName: string }
  course: { id: string; title: string; sequence: number | null }
}

type Question = {
  id: string
  category: string | null
  urgency: 'normal' | 'urgent'
  description: string
  caseNote: string | null
  status: string
  resolutionType: string | null
  anchorProfile: { id: string; anchorDisplayName: string } | null
  course: { id: string; title: string } | null
  submittedByAccount: { id: string; displayName: string }
}

type Anchor = { id: string; anchorDisplayName: string }
type Course = { id: string; title: string }

const feedbackLabels = {
  unobserved: '暂未观察',
  practicing: '正在练习',
  applied: '已经应用',
  needs_support: '需要支持',
}

const resolutionLabels = {
  standard_course: '已有标准课程',
  review_session: '复习场次',
  saturday_qa: '周六答疑',
  special_course: '临时专项课',
  new_course_need: '新课程需求',
  operator_followup: '转运营日常跟进',
}

export function TrainingOperationsPage() {
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const isOperator = session?.user.role === 'operator'
  const [anchorProfileId, setAnchorProfileId] = useState('')
  const [courseId, setCourseId] = useState('')
  const [urgency, setUrgency] = useState<'normal' | 'urgent'>('normal')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [caseNote, setCaseNote] = useState('')

  const feedbackQuery = useQuery({
    queryKey: ['training-application-feedback'],
    queryFn: () =>
      apiJson<{ items: Feedback[] }>(
        '/training/operator/application-feedback',
      ),
    enabled: isOperator,
  })
  const questionsQuery = useQuery({
    queryKey: ['training-questions'],
    queryFn: () =>
      apiJson<{ items: Question[] }>('/training/questions'),
  })
  const anchorsQuery = useQuery({
    queryKey: ['operator-training-anchors'],
    queryFn: () =>
      apiJson<{ items: Anchor[] }>('/training/operator/anchors'),
    enabled: isOperator,
  })
  const coursesQuery = useQuery({
    queryKey: ['training-courses'],
    queryFn: () =>
      apiJson<{ items: Course[] }>('/training/courses'),
  })
  const weeklyMeetingsQuery = useQuery({
    queryKey: ['training-weekly-meetings'],
    queryFn: () =>
      apiJson<{ items: Array<{ id: string; weekStart: string; summary: string | null }> }>(
        '/training/weekly-meetings',
      ),
    enabled: !isOperator,
  })

  const updateFeedback = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string
      status: Feedback['status']
    }) =>
      apiJson(`/training/operator/application-feedback/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['training-application-feedback'],
      }),
  })
  const submitQuestion = useMutation({
    mutationFn: () =>
      apiJson('/training/questions', {
        method: 'POST',
        body: JSON.stringify({
          anchorProfileId: anchorProfileId || undefined,
          courseId: courseId || undefined,
          urgency,
          category: category || undefined,
          description,
          caseNote: caseNote || undefined,
        }),
      }),
    onSuccess: () => {
      setDescription('')
      setCaseNote('')
      return queryClient.invalidateQueries({
        queryKey: ['training-questions'],
      })
    },
  })
  const resolveQuestion = useMutation({
    mutationFn: ({
      id,
      resolutionType,
      note,
    }: {
      id: string
      resolutionType: keyof typeof resolutionLabels
      note: string
    }) =>
      apiJson(`/training/questions/${id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify({ resolutionType, note }),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['training-questions'],
      }),
  })
  const generateFeedback = useMutation({
    mutationFn: () =>
      apiJson('/training/operations/feedback/generate-weekly', {
        method: 'POST',
      }),
  })
  const saveMeeting = useMutation({
    mutationFn: () => {
      const summary = window.prompt('填写本周沟通会纪要')
      if (!summary?.trim()) throw new Error('已取消')
      return apiJson('/training/weekly-meetings', {
        method: 'POST',
        body: JSON.stringify({
          weekStart: new Date().toISOString(),
          attendeeIds: [],
          summary,
        }),
      })
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ['training-weekly-meetings'],
      }),
  })

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">培训运营闭环</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          {isOperator ? '应用反馈与问题提报' : '问题池与周沟通会'}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          这里记录直播中的实际应用和问题，不设置考试、分数或主播排名。
        </p>
      </section>

      {isOperator ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-slate-900">
            本周课程应用反馈
          </h3>
          <div className="mt-4 space-y-3">
            {feedbackQuery.data?.items.map((item) => (
              <article
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {item.anchorProfile.anchorDisplayName} · {item.course.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    周期：{item.weekStart.slice(0, 10)}
                  </p>
                </div>
                <select
                  className="app-select max-w-44"
                  value={item.status}
                  onChange={(event) =>
                    updateFeedback.mutate({
                      id: item.id,
                      status: event.target.value as Feedback['status'],
                    })
                  }
                >
                  {Object.entries(feedbackLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </article>
            ))}
            {!feedbackQuery.isLoading &&
            !feedbackQuery.data?.items.length ? (
              <p className="text-sm text-slate-500">
                本周暂时没有需要反馈的已学课程。
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">
              每周整理
            </h3>
            <div className="flex gap-2">
              {session?.user.roles.includes('training_admin') ? (
                <button
                  type="button"
                  className="app-btn-secondary"
                  onClick={() => generateFeedback.mutate()}
                >
                  生成本周运营反馈
                </button>
              ) : null}
              <button
                type="button"
                className="app-btn-primary"
                onClick={() => saveMeeting.mutate()}
              >
                记录周沟通会
              </button>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {weeklyMeetingsQuery.data?.items.map((item) => (
              <div key={item.id} className="rounded-2xl bg-slate-50 p-4">
                <p className="font-medium text-slate-900">
                  {item.weekStart.slice(0, 10)} 周沟通会
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {item.summary || '尚未填写纪要'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {isOperator ? (
        <form
          className="rounded-3xl border border-slate-200 bg-white p-6"
          onSubmit={(event) => {
            event.preventDefault()
            submitQuestion.mutate()
          }}
        >
          <h3 className="text-lg font-semibold text-slate-900">
            随时提交问题
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select
              className="app-select"
              value={anchorProfileId}
              onChange={(event) => setAnchorProfileId(event.target.value)}
            >
              <option value="">不关联具体主播</option>
              {anchorsQuery.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.anchorDisplayName}
                </option>
              ))}
            </select>
            <select
              className="app-select"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
            >
              <option value="">不关联具体课程</option>
              {coursesQuery.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <input
              className="app-field"
              placeholder="问题分类，例如：互动、违规、设备"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            />
            <select
              className="app-select"
              value={urgency}
              onChange={(event) =>
                setUrgency(event.target.value as 'normal' | 'urgent')
              }
            >
              <option value="normal">普通：每周统一整理</option>
              <option value="urgent">紧急：即时处理</option>
            </select>
          </div>
          <textarea
            className="app-field mt-3 min-h-28"
            required
            placeholder="描述直播中遇到的问题"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <textarea
            className="app-field mt-3 min-h-20"
            placeholder="案例或回放说明（可选）"
            value={caseNote}
            onChange={(event) => setCaseNote(event.target.value)}
          />
          <button
            type="submit"
            className="app-btn-primary mt-3"
            disabled={description.trim().length < 2}
          >
            提交到培训中心
          </button>
        </form>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900">问题池</h3>
        <div className="mt-4 space-y-3">
          {questionsQuery.data?.items.map((item) => (
            <article
              key={item.id}
              className={`rounded-2xl border p-4 ${
                item.urgency === 'urgent'
                  ? 'border-rose-200 bg-rose-50'
                  : 'border-slate-200'
              }`}
            >
              <p className="font-medium text-slate-900">
                {item.urgency === 'urgent' ? '紧急 · ' : ''}
                {item.category || '未分类'} · {item.status}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                {item.description}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                主播：{item.anchorProfile?.anchorDisplayName ?? '未关联'} ·
                课程：{item.course?.title ?? '未关联'} · 提交：
                {item.submittedByAccount.displayName}
              </p>
              {!isOperator &&
              !['resolved', 'transferred'].includes(item.status) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(resolutionLabels).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className="app-btn-secondary"
                      onClick={() => {
                        const note = window.prompt(`填写“${label}”处理说明`)
                        if (note?.trim()) {
                          resolveQuestion.mutate({
                            id: item.id,
                            resolutionType:
                              value as keyof typeof resolutionLabels,
                            note,
                          })
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
