import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRightLeft,
  ChevronRight,
  LoaderCircle,
  RefreshCw,
  Search,
  UsersRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type OperatorOption = { id: string; displayName: string }

type LiveStatus =
  | 'pending_first_live'
  | 'incubating'
  | 'normal'
  | 'offline'
  | 'leave'
  | 'exited'

type AdminAnchorItem = {
  id: string
  wecomName: string
  anchorDisplayName: string
  assignmentStatus: string | null
  status: string
  liveStatus: LiveStatus
  firstLiveAt: string | null
  activatedAt: string
  operator?: OperatorOption | null
  onboarding: {
    completedCount: number
    totalCount: number
    nextMilestone: string | null
  } | null
}

type ListResponse = {
  items: AdminAnchorItem[]
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

export function AdminAnchorsPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('keyword') ?? '')
  const [operatorId, setOperatorId] = useState(
    searchParams.get('operatorId') ?? '',
  )
  const [liveStatus, setLiveStatus] = useState(
    searchParams.get('liveStatus') ?? '',
  )
  /** 默认浏览模式；开启后才出现勾选列与批量转交 */
  const [transferMode, setTransferMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [transferOpen, setTransferOpen] = useState(false)
  const [targetOperatorId, setTargetOperatorId] = useState('')
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  function exitTransferMode() {
    setTransferMode(false)
    setSelected(new Set())
    setTransferOpen(false)
    setTargetOperatorId('')
  }

  function enterTransferMode() {
    setFeedback(null)
    setTransferMode(true)
    setSelected(new Set())
  }

  useEffect(() => {
    const next = new URLSearchParams()
    if (operatorId) next.set('operatorId', operatorId)
    if (liveStatus) next.set('liveStatus', liveStatus)
    if (keyword.trim()) next.set('keyword', keyword.trim())
    setSearchParams(next, { replace: true })
  }, [operatorId, liveStatus, keyword, setSearchParams])

  const operatorsQuery = useQuery({
    queryKey: ['active-operators'],
    queryFn: () =>
      apiJson<{ items: OperatorOption[] }>('/staff/operators/active'),
  })

  const anchorsQuery = useQuery({
    queryKey: ['admin-anchors', operatorId, liveStatus, keyword],
    queryFn: () => {
      const params = new URLSearchParams()
      if (operatorId) params.set('operatorId', operatorId)
      if (liveStatus) params.set('liveStatus', liveStatus)
      if (keyword.trim()) params.set('keyword', keyword.trim())
      const qs = params.toString()
      return apiJson<ListResponse>(`/admin/anchors${qs ? `?${qs}` : ''}`)
    },
  })

  const transferMutation = useMutation({
    mutationFn: (payload: {
      anchorIds: string[]
      targetOperatorId: string
    }) =>
      apiJson<{
        transferredCount: number
        skippedCount: number
        targetOperator: OperatorOption
      }>('/admin/anchors/transfer', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async (result) => {
      setTransferOpen(false)
      setTargetOperatorId('')
      setSelected(new Set())
      setTransferMode(false)
      setFeedback({
        type: 'success',
        text: `已转交 ${result.transferredCount} 位主播给「${result.targetOperator.displayName}」${
          result.skippedCount
            ? `（跳过已在其名下 ${result.skippedCount} 位）`
            : ''
        }，等待新运营确认`,
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-anchors'] }),
        queryClient.invalidateQueries({ queryKey: ['staff'] }),
        queryClient.invalidateQueries({
          queryKey: ['operator-pending-assignments'],
        }),
        queryClient.invalidateQueries({ queryKey: ['operator-anchors'] }),
      ])
    },
    onError: (error) =>
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '转交失败',
      }),
  })

  const items = anchorsQuery.data?.items ?? []
  const summary = anchorsQuery.data?.summary
  const incubationDays = anchorsQuery.data?.incubationDays ?? 30
  const operators = operatorsQuery.data?.items ?? []

  const counts = useMemo(() => {
    if (summary) {
      return {
        all: summary.total,
        pendingFirstLive: summary.pendingFirstLive,
        incubating: summary.incubating,
        normal: summary.normal,
        attention: summary.offline + summary.leave + summary.exited,
      }
    }
    return {
      all: items.length,
      pendingFirstLive: 0,
      incubating: 0,
      normal: 0,
      attention: 0,
    }
  }, [summary, items.length])

  const selectedItems = items.filter((item) => selected.has(item.id))
  const allVisibleSelected =
    items.length > 0 && items.every((item) => selected.has(item.id))

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(items.map((item) => item.id)))
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openTransfer() {
    if (!transferMode) {
      enterTransferMode()
      return
    }
    if (selected.size === 0) {
      setFeedback({ type: 'error', text: '请先勾选要转交的主播' })
      return
    }
    setFeedback(null)
    setTargetOperatorId('')
    setTransferOpen(true)
  }

  function submitTransfer() {
    if (!targetOperatorId) {
      setFeedback({ type: 'error', text: '请选择接收的运营老师' })
      return
    }
    transferMutation.mutate({
      anchorIds: [...selected],
      targetOperatorId,
    })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">组织调度</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              主播全景
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              仅展示运营已确认的主播。状态按经营阶段：待首播 → 孵化中（首播后
              {incubationDays} 天）→ 正常 / 断播 / 请假 / 退会。激活与待确认请到「激活监管」。
            </p>
          </div>
          <button
            type="button"
            className="app-btn-secondary shrink-0"
            disabled={anchorsQuery.isFetching}
            onClick={() => void anchorsQuery.refetch()}
          >
            <RefreshCw
              className={`h-4 w-4 ${anchorsQuery.isFetching ? 'animate-spin' : ''}`}
            />
            刷新
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryChip label="在管合计" value={counts.all} tone="slate" />
          <SummaryChip
            label="待首播"
            value={counts.pendingFirstLive}
            tone="sky"
          />
          <SummaryChip
            label="孵化中"
            value={counts.incubating}
            tone="violet"
          />
          <SummaryChip
            label="正常"
            value={counts.normal}
            tone="emerald"
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

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[10rem] flex-1 text-xs font-medium text-slate-600">
            当前运营
            <select
              className="mt-1.5 app-field"
              value={operatorId}
              onChange={(e) => {
                setOperatorId(e.target.value)
                setSelected(new Set())
              }}
            >
              <option value="">全部运营</option>
              {operators.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[10rem] flex-1 text-xs font-medium text-slate-600">
            主播状态
            <select
              className="mt-1.5 app-field"
              value={liveStatus}
              onChange={(e) => {
                setLiveStatus(e.target.value)
                setSelected(new Set())
              }}
            >
              <option value="">全部状态</option>
              <option value="pending_first_live">待首播</option>
              <option value="incubating">孵化中</option>
              <option value="normal">正常</option>
              <option value="offline">断播</option>
              <option value="leave">请假</option>
              <option value="exited">退会</option>
            </select>
          </label>
          <label className="relative min-w-[14rem] flex-[1.5] text-xs font-medium text-slate-600">
            搜索
            <span className="relative mt-1.5 block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="app-field pl-9"
                placeholder="主播名 / 企微 / 运营"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-500">
            共 {items.length} 人
            {transferMode
              ? selected.size > 0
                ? ` · 转交模式 · 已选 ${selected.size}`
                : ' · 转交模式 · 请勾选主播'
              : ' · 浏览模式'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {transferMode ? (
              <>
                <button
                  type="button"
                  className="app-btn-secondary"
                  disabled={transferMutation.isPending}
                  onClick={exitTransferMode}
                >
                  退出转交
                </button>
                <button
                  type="button"
                  className="app-btn-primary"
                  disabled={selected.size === 0 || transferMutation.isPending}
                  onClick={openTransfer}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  转交所选
                  {selected.size > 0 ? ` (${selected.size})` : ''}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="app-btn-secondary"
                onClick={enterTransferMode}
              >
                <ArrowRightLeft className="h-4 w-4" />
                批量转交
              </button>
            )}
          </div>
        </div>

        <div className="mt-4">
          {anchorsQuery.isLoading ? (
            <LoadingBlock text="正在加载主播全景…" />
          ) : null}
          {anchorsQuery.isError ? (
            <ErrorBlock
              message={
                anchorsQuery.error instanceof Error
                  ? anchorsQuery.error.message
                  : '主播列表加载失败'
              }
            />
          ) : null}

          {!anchorsQuery.isLoading &&
          !anchorsQuery.isError &&
          items.length === 0 ? (
            <EmptyState
              title="没有符合条件的主播"
              description="全景仅含运营已确认的主播。未确认请到激活监管；也可调整筛选条件。"
              tone="plain"
            />
          ) : null}

          {!anchorsQuery.isLoading &&
          !anchorsQuery.isError &&
          items.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    {transferMode ? (
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAllVisible}
                          aria-label="全选当前列表"
                        />
                      </th>
                    ) : null}
                    <th className="whitespace-nowrap px-3 py-3">主播</th>
                    <th className="whitespace-nowrap px-3 py-3">企微</th>
                    <th className="whitespace-nowrap px-3 py-3">运营</th>
                    <th className="whitespace-nowrap px-3 py-3">状态</th>
                    <th className="whitespace-nowrap px-3 py-3">岗前进度</th>
                    <th className="whitespace-nowrap px-3 py-3">首播时间</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {items.map((item) => {
                    const status = item.liveStatus
                    const statusLabel = liveStatusLabels[status] ?? status
                    const tone =
                      liveStatusTone[status] ??
                      'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80'
                    const done = item.onboarding?.completedCount ?? 0
                    const total = item.onboarding?.totalCount ?? 7
                    const isSelected = selected.has(item.id)

                    return (
                      <tr
                        key={item.id}
                        className={[
                          'transition-colors',
                          transferMode && isSelected
                            ? 'bg-brand-50/50'
                            : 'hover:bg-slate-50/80',
                        ].join(' ')}
                      >
                        {transferMode ? (
                          <td className="px-3 py-2.5 align-middle">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleOne(item.id)}
                              aria-label={`选择 ${item.anchorDisplayName}`}
                            />
                          </td>
                        ) : null}
                        <td className="px-3 py-2.5 align-middle">
                          <Link
                            to={`/admin/anchors/${item.id}`}
                            className="font-medium text-slate-900 hover:text-brand-700"
                          >
                            {item.anchorDisplayName}
                          </Link>
                        </td>
                        <td className="max-w-[10rem] truncate px-3 py-2.5 align-middle text-slate-600">
                          {item.wecomName || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle text-slate-600">
                          {item.operator?.displayName ?? '未分配'}
                        </td>
                        <td className="px-3 py-2.5 align-middle">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle tabular-nums text-slate-700">
                          {item.onboarding ? `${done}/${total}` : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-middle text-xs text-slate-500">
                          {item.firstLiveAt
                            ? formatDateTime(item.firstLiveAt)
                            : '—'}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-right">
                          <Link
                            to={`/admin/anchors/${item.id}`}
                            className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                          >
                            查看
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>

      {transferOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
            <div className="border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">
                转交所选主播
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                将 {selected.size}{' '}
                位主播转交给目标运营，归属变为「待运营确认」，对方确认前不会出现在全景列表。
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block text-sm font-medium text-slate-700">
                接收的运营老师
                <select
                  className="mt-2 app-field"
                  value={targetOperatorId}
                  onChange={(e) => setTargetOperatorId(e.target.value)}
                >
                  <option value="">请选择运营老师</option>
                  {operators.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="max-h-32 overflow-y-auto rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {selectedItems.map((item) => (
                  <p key={item.id}>
                    {item.anchorDisplayName}
                    <span className="text-slate-400">
                      {' '}
                      · 现运营 {item.operator?.displayName ?? '未分配'}
                    </span>
                  </p>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="app-btn-secondary"
                disabled={transferMutation.isPending}
                onClick={() => setTransferOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="app-btn-primary"
                disabled={transferMutation.isPending || !targetOperatorId}
                onClick={submitTransfer}
              >
                {transferMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4" />
                )}
                确认转交
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SummaryChip({
  label,
  value,
  tone,
  helper,
}: {
  label: string
  value: number
  tone: 'slate' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'
  helper?: string
}) {
  const tones = {
    slate: 'border-slate-100 bg-slate-50/80 text-slate-800',
    emerald: 'border-emerald-100 bg-emerald-50/70 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-700',
    rose: 'border-rose-100 bg-rose-50/70 text-rose-700',
    sky: 'border-sky-100 bg-sky-50/70 text-sky-700',
    violet: 'border-violet-100 bg-violet-50/70 text-violet-700',
  }[tone]
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones}`}>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <UsersRound className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {helper ? (
        <p className="mt-1 text-xs font-normal text-slate-400">{helper}</p>
      ) : null}
    </div>
  )
}
