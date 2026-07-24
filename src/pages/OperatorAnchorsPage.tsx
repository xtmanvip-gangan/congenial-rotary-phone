import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  RefreshCw,
  Search,
  UserCheck,
  UsersRound,
  XCircle,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { useConfirmDialog } from '../components/useConfirmDialog'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type OperatorBrief = {
  id: string
  displayName: string
}

type AnchorItem = {
  id: string
  wecomName: string
  anchorDisplayName: string
  assignmentStatus: string
  status: string
  activatedAt: string
  operator?: OperatorBrief | null
  onboarding: {
    completedCount: number
    totalCount: number
    nextMilestone: string | null
  } | null
}

type PendingAssignment = {
  id: string
  status: string
  createdAt: string
  anchor: AnchorItem
}

type ProgressFilter = 'all' | 'in_progress' | 'done' | 'not_started'

const milestoneLabels: Record<string, string> = {
  initial_communication: '初次沟通',
  homepage_ready: '个人主页',
  live_software_ready: '直播软件',
  helper_software_ready: '辅助软件',
  prejob_learning_completed: '岗前基础学习',
  first_live_completed: '独立首播',
  first_live_review_completed: '首播复盘',
}

function progressRatio(item: AnchorItem) {
  const total = item.onboarding?.totalCount ?? 8
  const done = item.onboarding?.completedCount ?? 0
  return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
}

function isOnboardingDone(item: AnchorItem) {
  const { done, total } = progressRatio(item)
  return total > 0 && done >= total
}

export function OperatorAnchorsPage() {
  const queryClient = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [keyword, setKeyword] = useState('')
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('all')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const pendingQuery = useQuery({
    queryKey: ['operator-pending-assignments'],
    queryFn: () =>
      apiJson<{ items: PendingAssignment[] }>(
        '/operators/me/assignments/pending',
      ),
  })
  const anchorsQuery = useQuery({
    queryKey: ['operator-anchors'],
    queryFn: () =>
      apiJson<{ items: AnchorItem[] }>('/operators/me/anchors'),
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['operator-pending-assignments'],
      }),
      queryClient.invalidateQueries({ queryKey: ['operator-anchors'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }

  const confirmMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      apiJson(`/operator-assignments/${assignmentId}/confirm`, {
        method: 'POST',
      }),
    onSuccess: async () => {
      setFeedback({
        type: 'success',
        text: '已确认归属，可在「我的主播」中管理岗前进度',
      })
      await refresh()
    },
    onError: (error) =>
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '确认失败',
      }),
  })

  const rejectMutation = useMutation({
    mutationFn: (payload: { assignmentId: string; reason: string }) =>
      apiJson(`/operator-assignments/${payload.assignmentId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: payload.reason }),
      }),
    onSuccess: async () => {
      setRejectingId(null)
      setRejectReason('')
      setFeedback({
        type: 'success',
        text: '已驳回归属，审核老师可在主播激活中重新分配运营',
      })
      await refresh()
    },
    onError: (error) =>
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '驳回失败',
      }),
  })

  const pendingItems = pendingQuery.data?.items ?? []
  const anchorItems = anchorsQuery.data?.items ?? []

  const counts = useMemo(() => {
    let inProgress = 0
    let done = 0
    let notStarted = 0
    for (const item of anchorItems) {
      const { done: d, total } = progressRatio(item)
      if (!item.onboarding || d === 0) notStarted += 1
      else if (d >= total) done += 1
      else inProgress += 1
    }
    return {
      pending: pendingItems.length,
      anchors: anchorItems.length,
      inProgress,
      done,
      notStarted,
    }
  }, [anchorItems, pendingItems.length])

  const filteredAnchors = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return anchorItems.filter((item) => {
      if (q) {
        const hay = `${item.anchorDisplayName} ${item.wecomName} ${item.operator?.displayName ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      const { done, total } = progressRatio(item)
      if (progressFilter === 'done') return done >= total && total > 0
      if (progressFilter === 'not_started') return !item.onboarding || done === 0
      if (progressFilter === 'in_progress')
        return Boolean(item.onboarding) && done > 0 && done < total
      return true
    })
  }, [anchorItems, keyword, progressFilter])

  const busy = confirmMutation.isPending || rejectMutation.isPending
  const loading = pendingQuery.isLoading || anchorsQuery.isLoading
  const error = pendingQuery.error ?? anchorsQuery.error

  async function requestConfirm(item: PendingAssignment) {
    const ok = await confirm({
      title: '确认主播归属？',
      message: `确认后，「${item.anchor.anchorDisplayName}」将固定归属到当前运营，并开始岗前孵化进度。`,
      confirmText: '确认归属',
      cancelText: '返回',
    })
    if (ok) confirmMutation.mutate(item.id)
  }

  function submitReject(assignmentId: string) {
    const reason = rejectReason.trim()
    if (!reason) {
      setFeedback({ type: 'error', text: '请填写驳回原因' })
      return
    }
    rejectMutation.mutate({ assignmentId, reason })
  }

  return (
    <div className="space-y-6">
      {confirmDialog}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">人员与主播</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              主播与归属
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              先处理待确认归属，再跟进已确认主播的岗前进度。超级管理员可查看全部运营名下主播。
            </p>
          </div>
          <button
            type="button"
            className="app-btn-secondary shrink-0"
            disabled={pendingQuery.isFetching || anchorsQuery.isFetching}
            onClick={() => void refresh()}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                pendingQuery.isFetching || anchorsQuery.isFetching
                  ? 'animate-spin'
                  : ''
              }`}
            />
            刷新
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="待确认归属"
            value={counts.pending}
            tone="amber"
            icon={<UserCheck className="h-4 w-4" />}
          />
          <SummaryCard
            label="在管主播"
            value={counts.anchors}
            tone="sky"
            icon={<UsersRound className="h-4 w-4" />}
          />
          <SummaryCard
            label="岗前进行中"
            value={counts.inProgress}
            tone="brand"
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <SummaryCard
            label="岗前已完成"
            value={counts.done}
            tone="emerald"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
        </div>

        {feedback ? (
          <p
            className={[
              'mt-4 rounded-2xl px-3 py-2 text-sm',
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700',
            ].join(' ')}
          >
            {feedback.text}
          </p>
        ) : null}
      </section>

      {loading ? <LoadingBlock text="正在加载主播与归属…" /> : null}
      {error ? (
        <ErrorBlock
          message={
            error instanceof Error ? error.message : '主播与归属加载失败'
          }
        />
      ) : null}

      {!loading && !error ? (
        <>
          <section
            className={[
              'rounded-3xl border p-6 shadow-soft',
              counts.pending > 0
                ? 'border-amber-200 bg-amber-50/40'
                : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-700">需要处理</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  主播归属确认
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {counts.pending > 0
                    ? `${counts.pending} 位主播等待确认或驳回`
                    : '当前没有待确认归属'}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {pendingItems.map((item) => {
                const isRejecting = rejectingId === item.id
                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-amber-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-slate-900">
                            {item.anchor.anchorDisplayName}
                          </h4>
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200/60">
                            待确认
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-500">
                          企微：{item.anchor.wecomName || '—'}
                          <span className="mx-1.5 text-slate-300">·</span>
                          激活：{formatDateTime(item.anchor.activatedAt)}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          分配时间 {formatDateTime(item.createdAt)}
                          {item.anchor.operator?.displayName
                            ? ` · 目标运营 ${item.anchor.operator.displayName}`
                            : ''}
                        </p>
                      </div>
                    </div>

                    {!isRejecting ? (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-100 pt-3">
                        <button
                          type="button"
                          className="app-btn-primary"
                          disabled={busy}
                          onClick={() => void requestConfirm(item)}
                        >
                          {confirmMutation.isPending ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          确认归属
                        </button>
                        <button
                          type="button"
                          className="app-btn-secondary text-rose-600 hover:bg-rose-50"
                          disabled={busy}
                          onClick={() => {
                            setRejectingId(item.id)
                            setRejectReason('')
                            setFeedback(null)
                          }}
                        >
                          <XCircle className="h-4 w-4" />
                          驳回
                        </button>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3 border-t border-amber-100 pt-3">
                        <label className="block text-sm font-medium text-slate-700">
                          驳回原因
                          <textarea
                            className="mt-2 app-field min-h-[88px] resize-y"
                            placeholder="例如：非本运营负责、信息有误、暂时无法接收…"
                            value={rejectReason}
                            onChange={(event) =>
                              setRejectReason(event.target.value)
                            }
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="app-btn-danger"
                            disabled={busy || !rejectReason.trim()}
                            onClick={() => submitReject(item.id)}
                          >
                            {rejectMutation.isPending ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <XCircle className="h-4 w-4" />
                            )}
                            确认驳回
                          </button>
                          <button
                            type="button"
                            className="app-btn-secondary"
                            disabled={busy}
                            onClick={() => {
                              setRejectingId(null)
                              setRejectReason('')
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}

              {pendingItems.length === 0 ? (
                <EmptyState
                  title="暂无待确认主播"
                  description="主播完成档案开通后，归属会进入此列表等待运营确认。"
                  tone="plain"
                />
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-brand-600">固定归属</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">
                  我的主播
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  共 {counts.anchors} 位
                  {progressFilter !== 'all' || keyword.trim()
                    ? ` · 当前筛选 ${filteredAnchors.length} 位`
                    : ''}
                </p>
              </div>
              <label className="relative min-w-[14rem] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="app-field pl-9"
                  placeholder="搜索主播 / 企微 / 运营"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(
                [
                  { key: 'all', label: '全部', count: counts.anchors },
                  {
                    key: 'not_started',
                    label: '未开始岗前',
                    count: counts.notStarted,
                  },
                  {
                    key: 'in_progress',
                    label: '进行中',
                    count: counts.inProgress,
                  },
                  { key: 'done', label: '已完成', count: counts.done },
                ] as const
              ).map((tab) => {
                const active = progressFilter === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setProgressFilter(tab.key)}
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

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {filteredAnchors.map((item) => {
                const { done, total, pct } = progressRatio(item)
                const finished = isOnboardingDone(item)
                const nextLabel = item.onboarding?.nextMilestone
                  ? milestoneLabels[item.onboarding.nextMilestone] ??
                    item.onboarding.nextMilestone
                  : null

                return (
                  <article
                    key={item.id}
                    className="flex flex-col rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-semibold text-slate-900">
                            {item.anchorDisplayName}
                          </h4>
                          <span
                            className={[
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              finished
                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60'
                                : done === 0
                                  ? 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80'
                                  : 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/60',
                            ].join(' ')}
                          >
                            {finished
                              ? '岗前完成'
                              : done === 0
                                ? '待启动'
                                : '孵化中'}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-500">
                          企微：{item.wecomName || '—'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          激活 {formatDateTime(item.activatedAt)}
                          {item.operator?.displayName
                            ? ` · 运营 ${item.operator.displayName}`
                            : ''}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>
                          岗前进度 {done} / {total}
                        </span>
                        <span className="tabular-nums">{pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={[
                            'h-full rounded-full transition-all',
                            finished ? 'bg-emerald-500' : 'bg-brand-500',
                          ].join(' ')}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {finished
                          ? '全部节点已完成'
                          : nextLabel
                            ? `下一步：${nextLabel}`
                            : '尚未生成岗前进度'}
                      </p>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                      <Link
                        className="app-btn-primary"
                        to={`/operator/anchors/${item.id}/onboarding`}
                      >
                        管理岗前进度
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>

            {filteredAnchors.length === 0 ? (
              <EmptyState
                title={
                  counts.anchors === 0
                    ? '还没有已确认归属的主播'
                    : '当前筛选下没有主播'
                }
                description={
                  counts.anchors === 0
                    ? '确认上方待确认归属后，主播会出现在这里。'
                    : '试试切换筛选条件或清空搜索。'
                }
                tone="plain"
              />
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'amber' | 'sky' | 'brand' | 'emerald'
  icon: ReactNode
}) {
  const tones = {
    amber: {
      wrap: 'border-amber-100 bg-amber-50/70',
      value: 'text-amber-700',
      icon: 'bg-amber-100 text-amber-700',
    },
    sky: {
      wrap: 'border-sky-100 bg-sky-50/70',
      value: 'text-sky-700',
      icon: 'bg-sky-100 text-sky-700',
    },
    brand: {
      wrap: 'border-brand-100 bg-brand-50/70',
      value: 'text-brand-700',
      icon: 'bg-brand-100 text-brand-700',
    },
    emerald: {
      wrap: 'border-emerald-100 bg-emerald-50/70',
      value: 'text-emerald-700',
      icon: 'bg-emerald-100 text-emerald-700',
    },
  }[tone]

  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones.wrap}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-xl ${tones.icon}`}
        >
          {icon}
        </span>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones.value}`}>
        {value}
      </p>
    </div>
  )
}
