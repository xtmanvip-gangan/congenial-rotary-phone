import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LoaderCircle, Plus, RefreshCw } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import { formatDateTime, toDateTimeLocalValue } from '../lib/dateTime'

type QaItem = {
  id: string
  qaAt: string
  question: string
  reply: string
  resultFollowUp: string | null
  followUpAt: string | null
  followUpDueAt: string
  followUpStatus: 'done' | 'pending' | 'overdue'
  followUpDays: number
  operator?: { id: string; displayName: string } | null
}

const statusMeta = {
  done: {
    label: '已跟踪',
    className: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60',
  },
  pending: {
    label: '待跟踪',
    className: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/60',
  },
  overdue: {
    label: '已逾期',
    className: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/60',
  },
} as const

/** 答疑记录页：答疑时间 / 主播问题 / 运营回复 / 结果跟踪（7 日内） */
export function OperatorQaPage() {
  const { anchorId = '' } = useParams()
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [qaAt, setQaAt] = useState(() =>
    toDateTimeLocalValue(new Date().toISOString()),
  )
  const [question, setQuestion] = useState('')
  const [reply, setReply] = useState('')
  const [followUps, setFollowUps] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const profileQuery = useQuery({
    queryKey: ['operator-anchor-detail', anchorId, 'name'],
    enabled: Boolean(anchorId),
    queryFn: () =>
      apiJson<{ profile: { anchorDisplayName: string } }>(
        `/operators/me/anchors/${encodeURIComponent(anchorId)}`,
      ),
  })

  const listQuery = useQuery({
    queryKey: ['operator-qa-records', anchorId],
    enabled: Boolean(anchorId),
    queryFn: () =>
      apiJson<{ items: QaItem[]; followUpDays: number }>(
        `/operators/me/anchors/${encodeURIComponent(anchorId)}/qa-records`,
      ),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      apiJson(
        `/operators/me/anchors/${encodeURIComponent(anchorId)}/qa-records`,
        {
          method: 'POST',
          body: JSON.stringify({
            qaAt: new Date(qaAt).toISOString(),
            question: question.trim(),
            reply: reply.trim(),
          }),
        },
      ),
    onSuccess: async () => {
      setFeedback({ type: 'success', text: '答疑记录已保存，请在 7 日内填写结果跟踪' })
      setFormOpen(false)
      setQuestion('')
      setReply('')
      setQaAt(toDateTimeLocalValue(new Date().toISOString()))
      await queryClient.invalidateQueries({
        queryKey: ['operator-qa-records', anchorId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['operator-anchor-detail', anchorId],
      })
    },
    onError: (error) =>
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '保存失败',
      }),
  })

  const followUpMutation = useMutation({
    mutationFn: (payload: { recordId: string; resultFollowUp: string }) =>
      apiJson(
        `/operators/me/qa-records/${encodeURIComponent(payload.recordId)}/follow-up`,
        {
          method: 'PATCH',
          body: JSON.stringify({ resultFollowUp: payload.resultFollowUp }),
        },
      ),
    onSuccess: async () => {
      setFeedback({ type: 'success', text: '结果跟踪已保存' })
      await queryClient.invalidateQueries({
        queryKey: ['operator-qa-records', anchorId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['operator-anchor-detail', anchorId],
      })
    },
    onError: (error) =>
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '保存失败',
      }),
  })

  function submitCreate(event: FormEvent) {
    event.preventDefault()
    if (!question.trim() || !reply.trim()) {
      setFeedback({ type: 'error', text: '请填写主播问题与运营回复' })
      return
    }
    createMutation.mutate()
  }

  const name =
    profileQuery.data?.profile.anchorDisplayName ?? '主播'
  const items = listQuery.data?.items ?? []
  const followUpDays = listQuery.data?.followUpDays ?? 7

  if (listQuery.isLoading || profileQuery.isLoading) {
    return <LoadingBlock text="正在加载答疑记录…" />
  }

  if (listQuery.isError) {
    return (
      <div className="space-y-4">
        <Back />
        <ErrorBlock
          message={
            listQuery.error instanceof Error
              ? listQuery.error.message
              : '加载失败'
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Back />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            {name} · 答疑记录
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            字段：答疑时间、主播问题、运营回复、结果跟踪（答疑后 {followUpDays}{' '}
            日内必填）
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="app-btn-secondary"
            disabled={listQuery.isFetching}
            onClick={() => void listQuery.refetch()}
          >
            <RefreshCw
              className={`h-4 w-4 ${listQuery.isFetching ? 'animate-spin' : ''}`}
            />
            刷新
          </button>
          <button
            type="button"
            className="app-btn-primary"
            onClick={() => {
              setFormOpen(true)
              setFeedback(null)
            }}
          >
            <Plus className="h-4 w-4" />
            新建答疑
          </button>
        </div>
      </div>

      {feedback ? (
        <p
          className={[
            'rounded-2xl px-3 py-2 text-sm',
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-rose-50 text-rose-700',
          ].join(' ')}
        >
          {feedback.text}
        </p>
      ) : null}

      {formOpen ? (
        <form
          className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-soft"
          onSubmit={submitCreate}
        >
          <p className="text-sm font-semibold text-slate-900">新建答疑</p>
          <label className="block text-xs font-medium text-slate-600">
            答疑时间
            <input
              type="datetime-local"
              className="mt-1.5 app-field text-sm"
              required
              value={qaAt}
              onChange={(e) => setQaAt(e.target.value)}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            主播问题
            <textarea
              className="mt-1.5 app-field min-h-[88px] resize-y text-sm"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="主播提出的问题…"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            运营回复
            <textarea
              className="mt-1.5 app-field min-h-[88px] resize-y text-sm"
              required
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="你的解答与建议…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="app-btn-primary"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              保存
            </button>
            <button
              type="button"
              className="app-btn-secondary"
              onClick={() => setFormOpen(false)}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h3 className="text-base font-semibold text-slate-900">记录列表</h3>
        <div className="mt-4 space-y-3">
          {items.length === 0 ? (
            <EmptyState
              title="暂无答疑记录"
              description="点击「新建答疑」记录一次沟通。"
              tone="plain"
            />
          ) : (
            items.map((item) => {
              const meta = statusMeta[item.followUpStatus]
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      答疑时间 {formatDateTime(item.qaAt)}
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="text-slate-400">主播问题：</span>
                    {item.question}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-700">
                    <span className="text-slate-400">运营回复：</span>
                    {item.reply}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    结果跟踪截止 {formatDateTime(item.followUpDueAt)}
                    {item.followUpAt
                      ? ` · 已填于 ${formatDateTime(item.followUpAt)}`
                      : ''}
                  </p>

                  {item.followUpStatus === 'done' ? (
                    <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <span className="text-slate-400">结果跟踪：</span>
                      {item.resultFollowUp}
                    </p>
                  ) : (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <label className="block text-xs font-medium text-slate-600">
                        结果跟踪
                        {item.followUpStatus === 'overdue' ? (
                          <span className="ml-1 text-rose-600">（已逾期，请尽快补填）</span>
                        ) : (
                          <span className="ml-1 text-amber-700">
                            （答疑后 {item.followUpDays} 日内必填）
                          </span>
                        )}
                        <textarea
                          className="mt-1.5 app-field min-h-[72px] resize-y text-sm"
                          value={
                            followUps[item.id] ?? item.resultFollowUp ?? ''
                          }
                          onChange={(e) =>
                            setFollowUps((c) => ({
                              ...c,
                              [item.id]: e.target.value,
                            }))
                          }
                          placeholder="跟进结果：问题是否解决、后续动作…"
                        />
                      </label>
                      <button
                        type="button"
                        className="mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
                        disabled={followUpMutation.isPending}
                        onClick={() => {
                          const text = (
                            followUps[item.id] ??
                            item.resultFollowUp ??
                            ''
                          ).trim()
                          if (!text) {
                            setFeedback({
                              type: 'error',
                              text: '请填写结果跟踪',
                            })
                            return
                          }
                          followUpMutation.mutate({
                            recordId: item.id,
                            resultFollowUp: text,
                          })
                        }}
                      >
                        保存结果跟踪
                      </button>
                    </div>
                  )}
                </article>
              )
            })
          )}
        </div>
      </section>
    </div>
  )
}

function Back() {
  return (
    <Link
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600"
      to="/operator/reviews"
    >
      <ArrowLeft className="h-4 w-4" />
      返回答疑复盘
    </Link>
  )
}
