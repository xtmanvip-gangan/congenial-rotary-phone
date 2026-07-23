import { useQuery } from '@tanstack/react-query'
import { CalendarRange, ChevronRight, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type AvailableActivityItem = {
  id: string
  name: string
  startAt: string
  endAt: string
  description: string | null
  ruleCount: number
  entryCount: number
  entrySummary: string
  type: {
    typeCode: string
    typeName: string
    aggregationMode: string
    metricUnit: string | null
  }
}

type AvailableActivitiesResponse = {
  items: AvailableActivityItem[]
}

type ActivityFilter = 'all' | 'upcoming' | 'ongoing' | 'ended'

export function AnchorActivitiesPage() {
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>('all')
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const activitiesQuery = useQuery({
    queryKey: ['anchor-available-activities'],
    queryFn: () => apiJson<AvailableActivitiesResponse>('/submissions/available-activities'),
  })

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now())
    }, 60_000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const filteredItems = useMemo(() => {
    const items = activitiesQuery.data?.items ?? []

    return items.filter((item) => {
      const phase = getActivityPhase(item, currentTime)

      if (selectedFilter === 'all') {
        return true
      }

      return phase === selectedFilter
    })
  }, [activitiesQuery.data?.items, currentTime, selectedFilter])

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-none lg:rounded-3xl lg:p-6 lg:shadow-soft">
      <div className="hidden flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between lg:flex">
        <div>
          <p className="text-sm font-medium text-brand-600">主播活动列表</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">活动列表</h2>
          <p className="mt-2 hidden text-sm leading-6 text-slate-500 lg:block">查看当前可参与的活动，进行中活动可直接提报。</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link to="/app/records" className="app-btn-secondary">
            我的记录
          </Link>
          <button
            type="button"
            onClick={() => void activitiesQuery.refetch()}
            className="app-btn-secondary"
          >
            <RefreshCw className="h-4 w-4" />
            刷新列表
          </button>
        </div>
      </div>

      {activitiesQuery.isLoading ? (
        <LoadingBlock text="正在加载活动，请稍候..." minHeightClassName="min-h-64" />
      ) : activitiesQuery.isError ? (
        <ErrorBlock message={activitiesQuery.error instanceof Error ? activitiesQuery.error.message : '活动列表加载失败'} />
      ) : activitiesQuery.data && activitiesQuery.data.items.length > 0 ? (
        <div className="mt-6 space-y-4">
          <div className="flex flex-col gap-3 lg:hidden">
            <button type="button" onClick={() => void activitiesQuery.refetch()} className="app-btn-secondary w-full justify-center">
              <RefreshCw className="h-4 w-4" />
              刷新列表
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:gap-3">
              {activityFilterOptions.map((option) => {
                const isActive = selectedFilter === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedFilter(option.value)}
                    className={[
                      'whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium transition lg:px-4',
                      isActive
                        ? 'bg-brand-600 text-white shadow-soft'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700',
                    ].join(' ')}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const phase = getActivityPhase(item, currentTime)

              return (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 lg:rounded-3xl lg:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-slate-900">{item.name}</h3>
                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                          {item.type.typeName}
                        </span>
                        <span className="hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 lg:inline-flex">
                          {item.type.aggregationMode === 'daily' ? '按天累计' : '按场次统计'}
                        </span>
                        <span className={phaseBadgeClassMap[phase]}>{phaseLabelMap[phase]}</span>
                      </div>

                      <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                        <CalendarRange className="h-4 w-4" />
                        {formatDateTime(item.startAt)} - {formatDateTime(item.endAt)}
                      </p>

                      <p
                        className={[
                          'mt-2 hidden text-sm font-medium lg:block',
                          phase === 'upcoming'
                            ? 'text-brand-700'
                            : phase === 'ended'
                              ? 'text-slate-500'
                              : 'text-emerald-700',
                        ].join(' ')}
                      >
                        {phase === 'upcoming'
                          ? `距离开始还有：${formatCountdown(new Date(item.startAt).getTime() - currentTime)}`
                          : phase === 'ended'
                            ? '活动已结束'
                            : '活动进行中'}
                      </p>

                      <p className="mt-1 hidden text-sm text-slate-500 lg:block">
                        共 {item.entryCount} 个填写项，{item.ruleCount} 条奖励规则
                      </p>

                      {item.description ? (
                        <p className="mt-3 hidden rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-600 lg:block">
                          {item.description}
                        </p>
                      ) : null}
                    </div>

                    {phase === 'ongoing' ? (
                      <Link to={`/app/activities/${item.id}/submit`} className="app-btn-primary w-full justify-center lg:w-auto">
                        立即提报
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        disabled
                        className="app-btn-secondary w-full justify-center opacity-70 lg:w-auto"
                      >
                        {phase === 'upcoming' ? '未开始' : '已结束'}
                      </button>
                    )}
                  </div>
                </article>
              )
            })
          ) : (
            <EmptyState
              title={emptyStateTextMap[selectedFilter]}
              description="切换筛选条件后再查看。"
            />
          )}
        </div>
      ) : (
        <EmptyState title="当前暂无可参与活动" description="暂时还没有启用中的活动。" />
      )}
    </section>
  )
}

function getActivityPhase(item: AvailableActivityItem, currentTime: number): Exclude<ActivityFilter, 'all'> {
  const startTime = new Date(item.startAt).getTime()
  const endTime = new Date(item.endAt).getTime()

  if (currentTime < startTime) {
    return 'upcoming'
  }

  if (currentTime > endTime) {
    return 'ended'
  }

  return 'ongoing'
}

function formatCountdown(diffMs: number) {
  const totalMinutes = Math.max(0, Math.floor(diffMs / 60_000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return `${days}天 ${hours}小时 ${minutes}分钟`
  }

  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`
  }

  return `${minutes}分钟`
}

const activityFilterOptions: Array<{ value: ActivityFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'upcoming', label: '未开始' },
  { value: 'ongoing', label: '进行中' },
  { value: 'ended', label: '已结束' },
]

const phaseLabelMap: Record<Exclude<ActivityFilter, 'all'>, string> = {
  upcoming: '未开始',
  ongoing: '进行中',
  ended: '已结束',
}

const phaseBadgeClassMap: Record<Exclude<ActivityFilter, 'all'>, string> = {
  upcoming: 'rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700',
  ongoing: 'rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700',
  ended: 'rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600',
}

const emptyStateTextMap: Record<ActivityFilter, string> = {
  all: '当前没有已启用活动',
  upcoming: '当前没有未开始活动',
  ongoing: '当前没有进行中的活动',
  ended: '当前没有已结束活动',
}
