import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiJson } from '../lib/api'

type Course = {
  id: string
  code: string
  title: string
  level: 'basic_required' | 'growth' | 'advanced' | 'special'
  sequence: number | null
  summary: string | null
  objectives: string[]
  practiceTasks: string[]
  status: string
  materialLinks: Array<{ id: string; title: string; url: string }>
}

const levelNames = {
  basic_required: '基础必修',
  growth: '成长课程',
  advanced: '进阶课程',
  special: '专项课程',
}

export function TrainingCoursesPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const query = useQuery({
    queryKey: ['training-courses'],
    queryFn: () => apiJson<{ items: Course[] }>('/training/courses'),
  })
  const createMutation = useMutation({
    mutationFn: (payload: {
      code: string
      title: string
      level: Course['level']
      sequence?: number
      summary?: string
    }) =>
      apiJson('/training/courses', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setShowCreate(false)
      return queryClient.invalidateQueries({ queryKey: ['training-courses'] })
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({
      courseId,
      payload,
    }: {
      courseId: string
      payload: Record<string, unknown>
    }) =>
      apiJson(`/training/courses/${courseId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['training-courses'] }),
  })

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">标准课程库</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              课程与学习资料
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              系统只保存摘要、实践任务和飞书资料链接，不保存录播视频。
            </p>
          </div>
          <button
            type="button"
            className="app-btn-primary"
            onClick={() => setShowCreate((value) => !value)}
          >
            新建专项课程
          </button>
        </div>
        {showCreate ? (
          <CourseForm
            submitting={createMutation.isPending}
            onSubmit={(payload) => createMutation.mutate(payload)}
          />
        ) : null}
      </section>

      {query.error ? (
        <p className="text-sm text-rose-600">
          {query.error instanceof Error ? query.error.message : '课程加载失败'}
        </p>
      ) : null}
      <section className="grid gap-4 lg:grid-cols-2">
        {query.data?.items.map((course) => (
          <article
            key={course.id}
            className="rounded-3xl border border-slate-200 bg-white p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-brand-600">
                  {levelNames[course.level]} · {course.code}
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">
                  {course.sequence ? `${course.sequence}. ` : ''}
                  {course.title}
                </h3>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs ${
                  course.status === 'active'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {course.status === 'active' ? '启用中' : '已停用'}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              {course.summary || '暂未填写课程摘要。'}
            </p>
            <div className="mt-4 space-y-2 text-sm text-slate-600">
              <p>学习目标：{course.objectives.join('；') || '待补充'}</p>
              <p>实践任务：{course.practiceTasks.join('；') || '待补充'}</p>
              <p>
                飞书资料：
                {course.materialLinks.length
                  ? course.materialLinks.map((item) => item.title).join('；')
                  : '待补充'}
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="app-btn-secondary"
                onClick={() => {
                  const summary = window.prompt(
                    '请输入课程摘要',
                    course.summary ?? '',
                  )
                  if (summary !== null) {
                    updateMutation.mutate({
                      courseId: course.id,
                      payload: { summary },
                    })
                  }
                }}
              >
                编辑摘要
              </button>
              <button
                type="button"
                className="app-btn-secondary"
                onClick={() => {
                  const title = window.prompt('资料名称')
                  const url = title ? window.prompt('飞书资料完整链接') : null
                  if (title?.trim() && url?.trim()) {
                    updateMutation.mutate({
                      courseId: course.id,
                      payload: {
                        materialLinks: [
                          ...course.materialLinks.map((item, index) => ({
                            title: item.title,
                            url: item.url,
                            sortOrder: index,
                          })),
                          { title, url, sortOrder: course.materialLinks.length },
                        ],
                      },
                    })
                  }
                }}
              >
                添加资料链接
              </button>
              <button
                type="button"
                className="app-btn-secondary"
                onClick={() =>
                  updateMutation.mutate({
                    courseId: course.id,
                    payload: {
                      status:
                        course.status === 'active' ? 'inactive' : 'active',
                    },
                  })
                }
              >
                {course.status === 'active' ? '停用课程' : '重新启用'}
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}

function CourseForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean
  onSubmit: (payload: {
    code: string
    title: string
    level: Course['level']
    sequence?: number
    summary?: string
  }) => void
}) {
  const [code, setCode] = useState('')
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState<Course['level']>('special')
  const [summary, setSummary] = useState('')
  return (
    <form
      className="mt-5 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit({ code, title, level, summary })
      }}
    >
      <input
        className="app-field"
        placeholder="课程编号，如 special_001"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        required
      />
      <input
        className="app-field"
        placeholder="课程名称"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
      />
      <select
        className="app-select"
        value={level}
        onChange={(event) => setLevel(event.target.value as Course['level'])}
      >
        {Object.entries(levelNames).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        className="app-field"
        placeholder="课程摘要"
        value={summary}
        onChange={(event) => setSummary(event.target.value)}
      />
      <button
        type="submit"
        className="app-btn-primary md:col-span-2"
        disabled={submitting}
      >
        保存课程
      </button>
    </form>
  )
}
