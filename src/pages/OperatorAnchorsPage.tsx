import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FolderOpen,
  LoaderCircle,
  RefreshCw,
  Search,
  UserCheck,
  UsersRound,
  XCircle,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnchorStatusSelect } from '../components/AnchorStatusSelect'
import { ActionChipLink } from '../components/listChips'
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

/** 筛选 chip：选中 */
const filterTabActiveTone: Record<LiveStatus, string> = {
  pending_first_live: 'bg-sky-600 text-white shadow-sm',
  incubating: 'bg-violet-600 text-white shadow-sm',
  normal: 'bg-emerald-600 text-white shadow-sm',
  offline: 'bg-amber-600 text-white shadow-sm',
  leave: 'bg-slate-600 text-white shadow-sm',
  exited: 'bg-rose-600 text-white shadow-sm',
}

/** 筛选 chip：未选中（浅色区分状态） */
const filterTabIdleTone: Record<LiveStatus, string> = {
  pending_first_live: 'bg-sky-50 text-sky-700 hover:bg-sky-100',
  incubating: 'bg-violet-50 text-violet-700 hover:bg-violet-100',
  normal: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  offline: 'bg-amber-50 text-amber-800 hover:bg-amber-100',
  leave: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  exited: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
}

export function OperatorAnchorsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [keyword, setKeyword] = useState('')
  const [liveFilter, setLiveFilter] = useState<LiveFilter>(
    () => (searchParams.get('liveStatus') as LiveFilter) || 'all',
  )
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  /** 待确认折叠条：有待办时默认展开 */
  const [pendingOpen, setPendingOpen] = useState(true)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  useEffect(() => {
    const fromUrl = searchParams.get('liveStatus') as LiveFilter | null
    if (fromUrl && fromUrl !== liveFilter) {
      setLiveFilter(fromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync from URL
  }, [searchParams])

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
  const incubationDays = anchorsQuery.data?.incubationDays ?? 30

  /** 筛选数字以当前列表数据为准，改状态后随 refetch 立即更新 */
  const liveCounts = useMemo(() => {
    const base = {
      pending_first_live: 0,
      incubating: 0,
      normal: 0,
      offline: 0,
      leave: 0,
      exited: 0,
    }
    for (const item of anchorItems) {
      if (item.liveStatus in base) {
        base[item.liveStatus as keyof typeof base] += 1
      }
    }
    return base
  }, [anchorItems])

  const counts = useMemo(() => {
    return {
      pending: pendingItems.length,
      anchors: anchorItems.length,
      pendingFirstLive: liveCounts.pending_first_live,
      incubating: liveCounts.incubating,
      normal: liveCounts.normal,
      offline: liveCounts.offline,
      leave: liveCounts.leave,
      exited: liveCounts.exited,
      attention:
        liveCounts.offline + liveCounts.leave + liveCounts.exited,
    }
  }, [pendingItems.length, anchorItems.length, liveCounts])

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
    { key: 'offline', label: '断播', count: counts.offline },
    { key: 'leave', label: '请假', count: counts.leave },
    { key: 'exited', label: '退会', count: counts.exited },
  ]

  return (
    <div className="space-y-6">
      {confirmDialog}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">主播孵化</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              主播列表
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              先处理待确认归属；已确认主播按直播状态跟进：待首播 → 孵化中（首播后
              {incubationDays} 天）→ 正常 / 断播 / 请假 / 退会。断播、请假、退会可由运营标记。
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
            label="主播列表"
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
          {/* 待确认：折叠条，有数时默认可展开，不压主列表 */}
          {counts.pending > 0 ? (
            <section className="overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/40 shadow-soft">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-amber-50/80"
                onClick={() => setPendingOpen((open) => !open)}
                aria-expanded={pendingOpen}
              >
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-amber-900">待确认归属</span>
                  <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-800 ring-1 ring-inset ring-amber-200/70">
                    {counts.pending}
                  </span>
                  <span className="text-xs text-amber-800/80">
                    已开通档案，等待确认或驳回
                  </span>
                </span>
                <ChevronDown
                  className={[
                    'h-4 w-4 shrink-0 text-amber-700 transition',
                    pendingOpen ? 'rotate-180' : '',
                  ].join(' ')}
                />
              </button>

              {pendingOpen ? (
                <div className="border-t border-amber-200/60 bg-white px-4 py-3">
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/80 text-xs font-medium text-slate-500">
                          <th className="whitespace-nowrap px-3 py-2.5">主播</th>
                          <th className="whitespace-nowrap px-3 py-2.5">企微</th>
                          <th className="whitespace-nowrap px-3 py-2.5">
                            激活时间
                          </th>
                          <th className="whitespace-nowrap px-3 py-2.5">
                            分配时间
                          </th>
                          <th className="whitespace-nowrap px-3 py-2.5 text-right">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingItems.map((item) => {
                          const isRejecting = rejectingId === item.id
                          return (
                            <tr key={item.id} className="align-top">
                              <td className="px-3 py-2.5 font-medium text-slate-900">
                                {item.anchor.anchorDisplayName}
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
                                        disabled={
                                          busy || !rejectReason.trim()
                                        }
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
                </div>
              ) : null}
            </section>
          ) : null}

          {/* 主播列表：直播状态列表头 + 操作横排 */}
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  主播列表
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
                const chipTone =
                  tab.key === 'all'
                    ? active
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    : active
                      ? filterTabActiveTone[tab.key] ??
                        'bg-brand-600 text-white shadow-sm'
                      : filterTabIdleTone[tab.key] ??
                        'bg-slate-100 text-slate-600 hover:bg-slate-200'
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setLiveFilter(tab.key)
                      const next = new URLSearchParams(searchParams)
                      if (tab.key === 'all') next.delete('liveStatus')
                      else next.set('liveStatus', tab.key)
                      setSearchParams(next, { replace: true })
                    }}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                      chipTone,
                    ].join(' ')}
                  >
                    {tab.label}
                    <span
                      className={[
                        'rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
                        active
                          ? 'bg-white/25 text-inherit'
                          : 'bg-white/80 text-slate-600',
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
                        <th className="whitespace-nowrap px-3 py-3">
                          直播状态
                        </th>
                        <th className="whitespace-nowrap px-3 py-3">首播时间</th>
                        <th className="whitespace-nowrap px-3 py-3">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {filteredAnchors.map((item) => {
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
                              <AnchorStatusSelect
                                compact
                                anchorId={item.id}
                                status={item.status}
                                queryKeys={[
                                  ['operator-anchors'],
                                  ['dashboard'],
                                ]}
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
                              {item.firstLiveAt
                                ? formatDateTime(item.firstLiveAt)
                                : '—'}
                            </td>
                            <td className="px-3 py-2.5">
                              <ActionChipLink
                                to={`/operator/anchors/${item.id}`}
                                label="档案"
                                icon={FolderOpen}
                                tone="brand"
                              />
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
