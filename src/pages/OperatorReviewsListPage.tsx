import { useQuery } from '@tanstack/react-query'
import { ArrowRight, MessageCircle, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'

type AnchorItem = {
  id: string
  wecomName: string
  anchorDisplayName: string
  liveStatus: string
}

type QaItem = {
  id: string
  followUpStatus: 'done' | 'pending' | 'overdue'
}

const liveStatusLabels: Record<string, string> = {
  pending_first_live: '待首播',
  incubating: '孵化中',
  normal: '正常',
  offline: '断播',
  leave: '请假',
  exited: '退会',
}

/** 答疑复盘：主播列表 + 答疑 / 复盘入口 */
export function OperatorReviewsListPage() {
  const [keyword, setKeyword] = useState('')

  const anchorsQuery = useQuery({
    queryKey: ['operator-anchors'],
    queryFn: () =>
      apiJson<{ items: AnchorItem[] }>('/operators/me/anchors'),
  })

  const items = anchorsQuery.data?.items ?? []

  const qaSummaryQuery = useQuery({
    queryKey: ['operator-qa-summary', items.map((i) => i.id).join(',')],
    enabled: items.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        items.map(async (anchor) => {
          try {
            const res = await apiJson<{ items: QaItem[] }>(
              `/operators/me/anchors/${encodeURIComponent(anchor.id)}/qa-records`,
            )
            const overdue = res.items.filter(
              (r) => r.followUpStatus === 'overdue',
            ).length
            const pending = res.items.filter(
              (r) => r.followUpStatus === 'pending',
            ).length
            return [
              anchor.id,
              { total: res.items.length, overdue, pending },
            ] as const
          } catch {
            return [anchor.id, { total: 0, overdue: 0, pending: 0 }] as const
          }
        }),
      )
      return Object.fromEntries(entries) as Record<
        string,
        { total: number; overdue: number; pending: number }
      >
    },
  })

  const qaMap = qaSummaryQuery.data ?? {}

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      `${item.anchorDisplayName} ${item.wecomName}`.toLowerCase().includes(q),
    )
  }, [items, keyword])

  const overdueTotal = Object.values(qaMap).reduce(
    (sum, row) => sum + row.overdue,
    0,
  )

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">主播孵化</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              答疑复盘
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              「答疑」记录问题与回复，并在 7 日内补结果跟踪；「复盘」进入《主播日复盘表》独立页。
              {overdueTotal > 0
                ? ` 当前有 ${overdueTotal} 条答疑结果跟踪已逾期。`
                : ''}
            </p>
          </div>
          <button
            type="button"
            className="app-btn-secondary shrink-0"
            disabled={anchorsQuery.isFetching || qaSummaryQuery.isFetching}
            onClick={() => {
              void anchorsQuery.refetch()
              void qaSummaryQuery.refetch()
            }}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                anchorsQuery.isFetching || qaSummaryQuery.isFetching
                  ? 'animate-spin'
                  : ''
              }`}
            />
            刷新
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-slate-500">共 {items.length} 位主播</p>
          <label className="relative min-w-[14rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="app-field pl-9"
              placeholder="搜索主播 / 企微"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4">
          {anchorsQuery.isLoading ? (
            <LoadingBlock text="正在加载主播…" />
          ) : null}
          {anchorsQuery.isError ? (
            <ErrorBlock
              message={
                anchorsQuery.error instanceof Error
                  ? anchorsQuery.error.message
                  : '加载失败'
              }
            />
          ) : null}

          {!anchorsQuery.isLoading &&
          !anchorsQuery.isError &&
          filtered.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? '暂无已确认主播' : '没有匹配的主播'}
              description={
                items.length === 0
                  ? '先在「主播列表」确认归属。'
                  : '试试清空搜索。'
              }
              tone="plain"
            />
          ) : null}

          {filtered.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <th className="whitespace-nowrap px-3 py-3">主播</th>
                    <th className="whitespace-nowrap px-3 py-3">企微</th>
                    <th className="whitespace-nowrap px-3 py-3">直播状态</th>
                    <th className="whitespace-nowrap px-3 py-3">答疑概况</th>
                    <th className="whitespace-nowrap px-3 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filtered.map((item) => {
                    const qa = qaMap[item.id]
                    return (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-slate-50/80"
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-900">
                          {item.anchorDisplayName}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {item.wecomName || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {liveStatusLabels[item.liveStatus] ??
                            item.liveStatus}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {qaSummaryQuery.isLoading
                            ? '…'
                            : qa
                              ? `${qa.total} 条${
                                  qa.overdue > 0
                                    ? ` · ${qa.overdue} 逾期`
                                    : qa.pending > 0
                                      ? ` · ${qa.pending} 待跟踪`
                                      : ''
                                }`
                              : '0 条'}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-nowrap items-center gap-3 whitespace-nowrap">
                            <Link
                              className="inline-flex items-center gap-0.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                              to={`/operator/anchors/${item.id}/qa`}
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              答疑
                            </Link>
                            <Link
                              className="inline-flex items-center gap-0.5 text-xs font-medium text-slate-600 hover:text-brand-700"
                              to={`/operator/anchors/${item.id}/reviews`}
                            >
                              复盘
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
          ) : null}
        </div>
      </section>
    </div>
  )
}
