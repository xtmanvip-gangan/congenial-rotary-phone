import { useQuery } from '@tanstack/react-query'
import { ListChecks, RefreshCw, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  ActionChipLink,
  StatusPill,
  milestonePillTone,
  onboardingProgressPillTone,
} from '../components/listChips'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'

type AnchorItem = {
  id: string
  wecomName: string
  anchorDisplayName: string
  liveStatus: string
  onboarding: {
    completedCount: number
    totalCount: number
    nextMilestone: string | null
  } | null
}

const milestoneLabels: Record<string, string> = {
  initial_communication: '初次沟通',
  homepage_ready: '个人主页',
  live_software_ready: '直播软件',
  helper_software_ready: '辅助软件',
  prejob_learning_completed: '岗前基础学习',
  first_live_completed: '独立首播',
  first_live_review_completed: '首播复盘',
}

type ProgressFilter = 'all' | 'not_started' | 'in_progress' | 'done'

export function OperatorOnboardingListPage() {
  const [keyword, setKeyword] = useState('')
  const [filter, setFilter] = useState<ProgressFilter>('all')

  const anchorsQuery = useQuery({
    queryKey: ['operator-anchors'],
    queryFn: () =>
      apiJson<{ items: AnchorItem[] }>('/operators/me/anchors'),
  })

  const items = anchorsQuery.data?.items ?? []

  const counts = useMemo(() => {
    let notStarted = 0
    let inProgress = 0
    let done = 0
    for (const item of items) {
      const d = item.onboarding?.completedCount ?? 0
      const t = item.onboarding?.totalCount ?? 7
      if (!item.onboarding || d === 0) notStarted += 1
      else if (d >= t) done += 1
      else inProgress += 1
    }
    return { all: items.length, notStarted, inProgress, done }
  }, [items])

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    return items.filter((item) => {
      const d = item.onboarding?.completedCount ?? 0
      const t = item.onboarding?.totalCount ?? 7
      if (filter === 'not_started' && !(!item.onboarding || d === 0))
        return false
      if (filter === 'in_progress' && !(item.onboarding && d > 0 && d < t))
        return false
      if (filter === 'done' && !(t > 0 && d >= t)) return false
      if (!q) return true
      return `${item.anchorDisplayName} ${item.wecomName}`
        .toLowerCase()
        .includes(q)
    })
  }, [items, keyword, filter])

  const tabs: { key: ProgressFilter; label: string; count: number }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'not_started', label: '未开始', count: counts.notStarted },
    { key: 'in_progress', label: '进行中', count: counts.inProgress },
    { key: 'done', label: '已完成', count: counts.done },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">主播孵化</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">
              岗前进度
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              跟进已确认主播的 7 个岗前节点；点「进入」填写或查看进度。
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
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const active = filter === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
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
          <label className="relative min-w-[14rem] flex-1 sm:max-w-xs sm:ml-auto">
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
            <LoadingBlock text="正在加载岗前列表…" />
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
              title={counts.all === 0 ? '暂无已确认主播' : '当前筛选下没有主播'}
              description={
                counts.all === 0
                  ? '先在「主播列表」确认归属后，再跟进岗前。'
                  : '试试切换筛选或清空搜索。'
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
                    <th className="whitespace-nowrap px-3 py-3">岗前进度</th>
                    <th className="whitespace-nowrap px-3 py-3">当前节点</th>
                    <th className="whitespace-nowrap px-3 py-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filtered.map((item) => {
                    const done = item.onboarding?.completedCount ?? 0
                    const total = item.onboarding?.totalCount ?? 7
                    const nextType = item.onboarding?.nextMilestone ?? null
                    const nextLabel = nextType
                      ? milestoneLabels[nextType] ?? nextType
                      : done >= total && total > 0
                        ? '已完成'
                        : '未开始'
                    const progressTone = onboardingProgressPillTone(done, total)
                    const nodeTone =
                      done >= total && total > 0
                        ? 'emerald'
                        : milestonePillTone(nextType)

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
                        <td className="px-3 py-2.5">
                          <StatusPill
                            label={
                              item.onboarding ? `${done}/${total}` : '—'
                            }
                            tone={progressTone}
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusPill label={nextLabel} tone={nodeTone} />
                        </td>
                        <td className="px-3 py-2.5">
                          <ActionChipLink
                            to={`/operator/anchors/${item.id}/onboarding`}
                            label="进入"
                            icon={ListChecks}
                            tone="brand"
                          />
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
