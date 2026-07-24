import { useQuery } from '@tanstack/react-query'
import {
  ClipboardList,
  MessageCircle,
  RefreshCw,
  Search,
  Users,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import {
  ActionChipLink,
  StatusPill,
  liveStatusPillTone,
} from '../components/listChips'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'

type HubItem = {
  id: string
  wecomName: string
  anchorDisplayName: string
  liveStatus: string
  qaCount: number
  reviewCount: number
}

type HubResponse = {
  overview: {
    todayActiveAnchors: number
    weekActiveAnchors: number
    monthActiveAnchors: number
    monthUncoveredAnchors: number
  }
  items: HubItem[]
}

const liveStatusLabels: Record<string, string> = {
  pending_first_live: '待首播',
  incubating: '孵化中',
  normal: '正常',
  offline: '断播',
  leave: '请假',
  exited: '退会',
}

/** 答疑复盘：概览 + 主播列表（答疑 / 复盘入口） */
export function OperatorReviewsListPage() {
  const [keyword, setKeyword] = useState('')

  const hubQuery = useQuery({
    queryKey: ['operator-qa-review-hub'],
    queryFn: () =>
      apiJson<HubResponse>('/operators/me/qa-review-hub'),
  })

  const overview = hubQuery.data?.overview
  const items = hubQuery.data?.items ?? []

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) =>
      `${item.anchorDisplayName} ${item.wecomName}`.toLowerCase().includes(q),
    )
  }, [items, keyword])

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
              「答疑」记录问题与 7 日结果跟踪；「复盘」进入独立日复盘页。概览按上海时区统计有答疑或日复盘的主播人数。
            </p>
          </div>
          <button
            type="button"
            className="app-btn-secondary shrink-0"
            disabled={hubQuery.isFetching}
            onClick={() => void hubQuery.refetch()}
          >
            <RefreshCw
              className={`h-4 w-4 ${hubQuery.isFetching ? 'animate-spin' : ''}`}
            />
            刷新
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OverviewCard
            label="今日答疑复盘人数"
            value={overview?.todayActiveAnchors ?? 0}
            helper="今日有答疑或日复盘"
            icon={<MessageCircle className="h-4 w-4" />}
            tone="sky"
          />
          <OverviewCard
            label="本周答疑复盘人数"
            value={overview?.weekActiveAnchors ?? 0}
            helper="本周一至今"
            icon={<ClipboardList className="h-4 w-4" />}
            tone="brand"
          />
          <OverviewCard
            label="本月答疑复盘人数"
            value={overview?.monthActiveAnchors ?? 0}
            helper="本月已覆盖"
            icon={<UsersRound className="h-4 w-4" />}
            tone="emerald"
          />
          <OverviewCard
            label="本月未覆盖主播"
            value={overview?.monthUncoveredAnchors ?? 0}
            helper="本月无答疑且无日复盘"
            icon={<Users className="h-4 w-4" />}
            tone="amber"
          />
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
          {hubQuery.isLoading ? (
            <LoadingBlock text="正在加载答疑复盘…" />
          ) : null}
          {hubQuery.isError ? (
            <ErrorBlock
              message={
                hubQuery.error instanceof Error
                  ? hubQuery.error.message
                  : '加载失败'
              }
            />
          ) : null}

          {!hubQuery.isLoading &&
          !hubQuery.isError &&
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
                    <th className="whitespace-nowrap px-3 py-3">
                      答疑复盘概况
                    </th>
                    <th className="whitespace-nowrap px-3 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filtered.map((item) => (
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
                      <td className="px-3 py-2.5">
                        <StatusPill
                          label={
                            liveStatusLabels[item.liveStatus] ??
                            item.liveStatus
                          }
                          tone={liveStatusPillTone(item.liveStatus)}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill
                          label={`${item.qaCount}/${item.reviewCount}`}
                          tone={
                            item.qaCount + item.reviewCount === 0
                              ? 'slate'
                              : item.qaCount > 0 && item.reviewCount > 0
                                ? 'emerald'
                                : item.qaCount > 0
                                  ? 'sky'
                                  : 'violet'
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-nowrap items-center gap-2 whitespace-nowrap">
                          <ActionChipLink
                            to={`/operator/anchors/${item.id}/qa`}
                            label="答疑"
                            icon={MessageCircle}
                            tone="sky"
                          />
                          <ActionChipLink
                            to={`/operator/anchors/${item.id}/reviews`}
                            label="复盘"
                            icon={ClipboardList}
                            tone="violet"
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

function OverviewCard({
  label,
  value,
  helper,
  icon,
  tone,
}: {
  label: string
  value: number
  helper: string
  icon: ReactNode
  tone: 'sky' | 'brand' | 'emerald' | 'amber'
}) {
  const tones = {
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
    amber: {
      wrap: 'border-amber-100 bg-amber-50/70',
      value: 'text-amber-800',
      icon: 'bg-amber-100 text-amber-800',
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
      <p className="mt-1 text-xs text-slate-400">{helper}</p>
    </div>
  )
}
