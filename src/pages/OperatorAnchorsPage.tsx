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

type LiveStatus =
  | 'pending_first_live'
  | 'incubating'
  | 'normal'
  | 'offline'
  | 'leave'
  | 'exited'

type AnchorItem = {
  id: string
  wecomName: string
  anchorDisplayName: string
  assignmentStatus: string
  status: string
  liveStatus: LiveStatus
  firstLiveAt: string | null
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
  anchor: {
    id: string
    wecomName: string
    anchorDisplayName: string
    activatedAt: string
    operator?: OperatorBrief | null
  }
}

type AnchorsResponse = {
  items: AnchorItem[]
  summary?: {
    total: number
    pendingFirstLive: number
    incubating: number
    normal: number
    offline: number
    leave: number
    exited: number
  }
  incubationDays?: number
}

type LiveFilter = 'all' | LiveStatus

const liveStatusLabels: Record<LiveStatus, string> = {
  pending_first_live: '待首播',
  incubating: '孵化中',
  normal: '正常',
  offline: '断播',
  leave: '请假',
  exited: '退会',
}

const liveStatusTone: Record<LiveStatus, string> = {
  pending_first_live:
    'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200/60',
  incubating:
    'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200/60',
  normal:
    'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60',
  offline: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/60',
  leave: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80',
  exited: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/60',
}

export function OperatorAnchorsPage() {
  const queryClient = useQueryClient()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [keyword, setKeyword] = useState('')
  const [liveFilter, setLiveFilter] = useState<LiveFilter>('all')
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
    queryFn: () => apiJson<AnchorsResponse>('/operators/me/anchors'),
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
        text: '已确认归属，主播已进入在管列表，可管理岗前进度',
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
        text: '已驳回归属，审核老师可在激活监管中重新分配运营',
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
  const summary = anchorsQuery.data?.summary
  const incubationDays = anchorsQuery.data?.incubationDays ?? 30

  const counts = useMemo(() => {
    if (summary) {
      return {
        pending: pendingItems.length,
        anchors: summary.total,
        pendingFirstLive: summary.pendingFirstLive,
        incubating: summary.incubating,
        normal: summary.normal,
        attention: summary.offline + summary.leave + summary.exited,
      }
    }
    return {
      pending: pendingItems.length,
      anchors: anchorItems.length,
      pendingFirstLive: 0,
      incubating: 0,
      normal: 0,
      attention: 0,
    }
  }, [summary, pendingItems.length, anchorItems.length])

  const filteredAnchors = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return anchorItems.filter((item) => {
      if (liveFilter !== 'all' && item.liveStatus !== liveFilter) return false
      if (!q) return true
      const hay =
        `${item.anchorDisplayName} ${item.wecomName} ${item.operator?.displayName ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [anchorItems, keyword, liveFilter])

  const busy = confirmMutation.isPending || rejectMutation.isPending
  const loading = pendingQuery.isLoading || anchorsQuery.isLoading
  const error = pendingQuery.error ?? anchorsQuery.error

  async function requestConfirm(item: PendingAssignment) {
    const ok = await confirm({
      title: '确认主播归属？',
      message: `确认后，「${item.anchor.anchorDisplayName}」将固定归属到你，并进入待首播 / 岗前孵化。`,
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

  const filterTabs: { key: LiveFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.anchors },
    {
      key: 'pending_first_live',
      label: '待首播',
      count: counts.pendingFirstLive,
    },
    { key: 'incubating', label: '孵化中', count: counts.incubating },
    { key: 'normal', label: '正常', count: counts.normal },
    {
      key: 'offline',
      label: '断播',
      count: summary?.offline ?? 0,
    },
    { key: 'leave', label: '请假', count: summary?.leave ?? 0 },
    { key: 'exited', label: '退会', count: summary?.exited ?? 0 },
  ]

  return (
    <div className="space-y-6">
      {confirmDialog}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">主播孵化</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              我的主播
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              先处理待确认归属；已确认主播按经营状态跟进：待首播 → 孵化中（首播后
              {incubationDays} 天）→ 正常 / 断播 / 请假 / 退会。
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
            label="待首播"
            value={counts.pendingFirstLive}
            tone="brand"
            icon={<ClipboardList className="h-4 w-4" />}
          />
          <SummaryCard
            label="孵化中"
            value={counts.incubating}
            tone="violet"
            icon={<CheckCircle2 className="h-4 w-4" />}
            helper={
              counts.attention > 0
                ? `断播/请假/退会 ${counts.attention}`
                : undefined
            }
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

      {loading ? <LoadingBlock text="正在加载我的主播…" /> : null}
      {error ? (
        <ErrorBlock
          message={
            error instanceof Error ? error.message : '我的主播加载失败'
          }
        />
      ) : null}

      {!loading && !error ? (
        <>
          {/* 待确认：紧凑表格 */}
          <section
            className={[
              'rounded-3xl border p-6 shadow-soft',
              counts.pending > 0
                ? 'border-amber-200 bg-amber-50/30'
                : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  待确认归属
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {counts.pending > 0
                    ? `${counts.pending} 位主播已开通档案，等待你确认或驳回`
                    : '主播完成一点开通后会出现在这里'}
                </p>
              </div>
            </div>

            <div className="mt-4">
              {pendingItems.length === 0 ? (
                <EmptyState
                  title="暂无待确认主播"
                  description="审核创建开通任务 → 主播小程序一点开通 → 才会进入待确认。"
                  tone="plain"
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-amber-200/80 bg-white">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-amber-100 bg-amber-50/50 text-xs font-medium text-slate-500">
                        <th className="whitespace-nowrap px-3 py-3">主播</th>
                        <th className="whitespace-nowrap px-3 py-3">企微</th>
                        <th className="whitespace-nowrap px-3 py-3">激活时间</th>
                        <th className="whitespace-nowrap px-3 py-3">分配时间</th>
                        <th className="whitespace-nowrap px-3 py-3 text-right">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-50">
                      {pendingItems.map((item) => {
                        const isRejecting = rejectingId === item.id
                        return (
                          <tr key={item.id} className="align-top">
                            <td className="px-3 py-2.5 font-medium text-slate-900">
                              {item.anchor.anchorDisplayName}
                              <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200/60">
                                待确认
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              {item.anchor.wecomName || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                              {formatDateTime(item.anchor.activatedAt)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                              {formatDateTime(item.createdAt)}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {!isRejecting ? (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                                    disabled={busy}
                                    onClick={() => void requestConfirm(item)}
                                  >
                                    {confirmMutation.isPending ? (
                                      <LoaderCircle className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="h-3 w-3" />
                                    )}
                                    确认归属
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-0.5 text-xs font-medium text-rose-600 hover:text-rose-700"
                                    disabled={busy}
                                    onClick={() => {
                                      setRejectingId(item.id)
                                      setRejectReason('')
                                      setFeedback(null)
                                    }}
                                  >
                                    <XCircle className="h-3 w-3" />
                                    驳回
                                  </button>
                                </div>
                              ) : (
                                <div className="ml-auto max-w-sm space-y-2 text-left">
                                  <textarea
                                    className="app-field min-h-[72px] resize-y text-xs"
                                    placeholder="驳回原因，如：非本运营负责、信息有误…"
                                    value={rejectReason}
                                    onChange={(e) =>
                                      setRejectReason(e.target.value)
                                    }
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      className="text-xs font-medium text-rose-600 hover:text-rose-700"
                                      disabled={busy || !rejectReason.trim()}
                                      onClick={() => submitReject(item.id)}
                                    >
                                      确认驳回
                                    </button>
                                    <button
                                      type="button"
                                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
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
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* 在管主播：与全景对齐的状态表 */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  在管主播
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  共 {counts.anchors} 位
                  {liveFilter !== 'all' || keyword.trim()
                    ? ` · 当前 ${filteredAnchors.length} 位`
                    : ''}
                </p>
              </div>
              <label className="relative min-w-[14rem] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="app-field pl-9"
                  placeholder="搜索主播 / 企微"
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {filterTabs.map((tab) => {
                const active = liveFilter === tab.key
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setLiveFilter(tab.key)}
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

            <div className="mt-4">
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
                      : '试试切换状态筛选或清空搜索。'
                  }
                  tone="plain"
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="whitespace-nowrap px-3 py-3">主播</th>
                        <th className="whitespace-nowrap px-3 py-3">企微</th>
                        <th className="whitespace-nowrap px-3 py-3">状态</th>
                        <th className="whitespace-nowrap px-3 py-3">岗前</th>
                        <th className="whitespace-nowrap px-3 py-3">首播时间</th>
                        <th className="whitespace-nowrap px-3 py-3 text-right">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredAnchors.map((item) => {
                        const done = item.onboarding?.completedCount ?? 0
                        const total = item.onboarding?.totalCount ?? 7
                        const status = item.liveStatus
                        const tone =
                          liveStatusTone[status] ??
                          'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80'

                        return (
                          <tr
                            key={item.id}
                            className="transition-colors hover:bg-slate-50/80"
                          >
                            <td className="px-3 py-2.5 font-medium text-slate-900">
                              <Link
                                to={`/operator/anchors/${item.id}`}
                                className="hover:text-brand-700"
                              >
                                {item.anchorDisplayName}
                              </Link>
                            </td>
                            <td className="max-w-[10rem] truncate px-3 py-2.5 text-slate-600">
                              {item.wecomName || '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
                              >
                                {liveStatusLabels[status] ?? status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">
                              {item.onboarding ? `${done}/${total}` : '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                              {item.firstLiveAt
                                ? formatDateTime(item.firstLiveAt)
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Link
                                  className="text-xs font-medium text-slate-600 hover:text-brand-700"
                                  to={`/operator/anchors/${item.id}`}
                                >
                                  档案
                                </Link>
                                <Link
                                  className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                                  to={`/operator/anchors/${item.id}/onboarding`}
                                >
                                  岗前
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
  helper,
}: {
  label: string
  value: number
  tone: 'amber' | 'sky' | 'brand' | 'emerald' | 'violet'
  icon: ReactNode
  helper?: string
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
    violet: {
      wrap: 'border-violet-100 bg-violet-50/70',
      value: 'text-violet-700',
      icon: 'bg-violet-100 text-violet-700',
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
      {helper ? (
        <p className="mt-1 text-xs font-normal text-slate-400">{helper}</p>
      ) : null}
    </div>
  )
}
