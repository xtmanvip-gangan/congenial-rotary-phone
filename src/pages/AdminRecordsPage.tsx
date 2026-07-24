import { useQuery } from '@tanstack/react-query'
import { ChevronRight, FolderKanban, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson, getApiBaseUrl } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'
import type { AdminSubmissionsResponse } from './adminRecordsShared'

type ActivitiesResponse = {
  items: Array<{
    id: string
    name: string
    coverUrl: string | null
    startAt: string
    endAt: string
    type: {
      typeName: string
    }
    status: 'draft' | 'active' | 'ended' | 'disabled'
  }>
}

export function AdminRecordsPage() {
  const { session } = useAuth()
  const [searchParams] = useSearchParams()
  const operatorId = searchParams.get('operatorId') ?? ''
  const isSuperAdmin = session?.user.role === 'super_admin'

  const operatorsQuery = useQuery({
    queryKey: ['active-operators'],
    queryFn: () =>
      apiJson<{ items: Array<{ id: string; displayName: string }> }>(
        '/staff/operators/active',
      ),
    enabled: isSuperAdmin,
  })

  const [localOperatorId, setLocalOperatorId] = useState(operatorId)

  useEffect(() => {
    setLocalOperatorId(operatorId)
  }, [operatorId])

  // URL 与本地筛选同步（运营详情深链）
  const scopedOperatorId = isSuperAdmin ? localOperatorId : ''

  const recordsQuery = useQuery({
    queryKey: ['admin-submissions', 'overview', scopedOperatorId],
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', pageSize: '500' })
      if (scopedOperatorId) params.set('operatorId', scopedOperatorId)
      return apiJson<AdminSubmissionsResponse>(
        `/submissions/admin?${params.toString()}`,
      )
    },
  })

  const activitiesQuery = useQuery({
    queryKey: ['activities', 'records-overview'],
    queryFn: () => apiJson<ActivitiesResponse>('/activities'),
  })

  const operatorName = operatorsQuery.data?.items.find(
    (item) => item.id === scopedOperatorId,
  )?.displayName

  const activityCards = useMemo(() => {
    const sourceItems = recordsQuery.data?.items ?? []
    const grouped = new Map<
      string,
      {
        activityId: string
        activityName: string
        activityTypeName: string
        totalCount: number
        anchorIds: Set<string>
        pendingReviewCount: number
        pendingGrantCount: number
        latestCreatedAt: string
        operatorNames: Set<string>
      }
    >()

    sourceItems.forEach((item) => {
      const current = grouped.get(item.activity.id) ?? {
        activityId: item.activity.id,
        activityName: item.activity.name,
        activityTypeName: item.activity.typeName,
        totalCount: 0,
        anchorIds: new Set<string>(),
        pendingReviewCount: 0,
        pendingGrantCount: 0,
        latestCreatedAt: item.createdAt,
        operatorNames: new Set<string>(),
      }
      current.totalCount += 1
      current.anchorIds.add(item.anchorUserId)
      current.latestCreatedAt =
        new Date(item.createdAt).getTime() > new Date(current.latestCreatedAt).getTime()
          ? item.createdAt
          : current.latestCreatedAt
      if (item.reviewStatus === 'pending') {
        current.pendingReviewCount += 1
      }
      if (item.reviewStatus === 'approved' && item.grantStatus === 'pending') {
        current.pendingGrantCount += 1
      }
      if (item.operatorName) {
        current.operatorNames.add(item.operatorName)
      }
      grouped.set(item.activity.id, current)
    })

    return (activitiesQuery.data?.items ?? [])
      .map((activity) => {
        const recordSummary = grouped.get(activity.id)
        return {
          activityId: activity.id,
          activityName: activity.name,
          activityTypeName: activity.type.typeName,
          totalCount: recordSummary?.totalCount ?? 0,
          pendingReviewCount: recordSummary?.pendingReviewCount ?? 0,
          pendingGrantCount: recordSummary?.pendingGrantCount ?? 0,
          latestCreatedAt: recordSummary?.latestCreatedAt ?? '',
          coverUrl: activity.coverUrl ? `${getApiBaseUrl().replace('/api', '')}${activity.coverUrl}` : null,
          status: activity.status,
          operatorSummary: recordSummary ? Array.from(recordSummary.operatorNames).join('、') || '--' : '--',
          operatorCount: recordSummary?.operatorNames.size ?? 0,
          anchorCount: recordSummary?.anchorIds.size ?? 0,
          hasRecords: Boolean(recordSummary),
        }
      })
      .sort(
        (left, right) =>
          new Date(right.latestCreatedAt || 0).getTime() - new Date(left.latestCreatedAt || 0).getTime(),
      )
  }, [activitiesQuery.data?.items, recordsQuery.data?.items])

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600">记录管理</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">先按活动查看记录</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            按活动查看提报记录。运营老师仅查看自己负责的活动；超级管理员可查看全部，也可按运营筛选。
            {operatorName ? (
              <span className="mt-1 block text-brand-700">
                当前筛选运营：{operatorName}
              </span>
            ) : null}
          </p>
        </div>
        {isSuperAdmin ? (
          <label className="min-w-[12rem] text-xs font-medium text-slate-600">
            按运营筛选
            <select
              className="mt-1.5 app-field"
              value={scopedOperatorId}
              onChange={(e) => setLocalOperatorId(e.target.value)}
            >
              <option value="">全部运营</option>
              {(operatorsQuery.data?.items ?? []).map((op) => (
                <option key={op.id} value={op.id}>
                  {op.displayName}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void recordsQuery.refetch()
            void activitiesQuery.refetch()
          }}
          className="app-btn-secondary"
        >
          <RefreshCw className="h-4 w-4" />
          刷新记录
        </button>
      </div>

      <div className="mt-6 grid gap-3 rounded-[32px] border border-slate-200 bg-slate-50/80 p-4 md:grid-cols-3">
        <div className="rounded-[28px] bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">可见活动</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{activityCards.length}</p>
          <p className="mt-1 text-xs text-slate-500">
            {session?.user.role === 'super_admin' ? '已汇总全部活动范围' : '仅展示你负责的活动'}
          </p>
        </div>
        <div className="rounded-[28px] bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">待审核</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {activityCards.reduce((sum, item) => sum + item.pendingReviewCount, 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">进入活动后可处理具体记录</p>
        </div>
        <div className="rounded-[28px] bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">待发放</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {activityCards.reduce((sum, item) => sum + item.pendingGrantCount, 0)}
          </p>
          <p className="mt-1 text-xs text-slate-500">进入活动后可处理发放状态</p>
        </div>
      </div>

      {recordsQuery.isLoading || activitiesQuery.isLoading ? (
        <LoadingBlock text="正在加载活动记录，请稍候..." minHeightClassName="min-h-64" />
      ) : recordsQuery.isError || activitiesQuery.isError ? (
        <ErrorBlock
          message={
            recordsQuery.error instanceof Error
              ? recordsQuery.error.message
              : activitiesQuery.error instanceof Error
                ? activitiesQuery.error.message
                : '记录加载失败'
          }
        />
      ) : activityCards.length > 0 ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {activityCards.map((activity) => (
            <article
              key={activity.activityId}
              className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_rgba(15,23,42,0.1)]"
            >
              <div className="flex flex-col gap-5 p-5">
                {activity.coverUrl ? (
                  <img
                    src={activity.coverUrl}
                    alt={activity.activityName}
                    className="h-44 w-full rounded-[28px] border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-44 w-full items-center justify-center rounded-[28px] border border-slate-200 bg-slate-100 text-sm text-slate-400">
                    暂无封面
                  </div>
                )}

                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">
                        {activity.activityTypeName}
                      </span>
                      {activity.pendingReviewCount > 0 ? (
                        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                          待审核 {activity.pendingReviewCount}
                        </span>
                      ) : null}
                      {activity.pendingGrantCount > 0 ? (
                        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                          待发放 {activity.pendingGrantCount}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-3 truncate text-xl font-semibold tracking-tight text-slate-900">
                      {activity.activityName}
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      {activity.hasRecords
                        ? session?.user.role === 'super_admin'
                          ? `最近提交：${formatDateTime(activity.latestCreatedAt)}`
                          : `你当前有 ${activity.totalCount} 条记录可处理`
                        : session?.user.role === 'super_admin'
                          ? '当前暂无提报记录'
                          : '当前暂无可处理记录'}
                    </p>
                  </div>
                  <div className="rounded-[24px] bg-slate-50 px-4 py-3 text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {session?.user.role === 'super_admin' ? '记录数' : '我的记录'}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {session?.user.role === 'super_admin'
                        ? activity.totalCount
                        : activity.totalCount > 0
                          ? `${activity.totalCount} 条`
                          : '暂无'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">覆盖主播</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{activity.anchorCount} 人</p>
                  </div>
                  <div className="rounded-[24px] bg-slate-50 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">活动状态</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{formatActivityStatus(activity.status)}</p>
                  </div>
                </div>

                <Link
                  to={`/admin/records/activity/${activity.activityId}${
                    scopedOperatorId
                      ? `?operatorId=${encodeURIComponent(scopedOperatorId)}`
                      : ''
                  }`}
                  className="app-btn-primary justify-center py-3"
                >
                  <FolderKanban className="h-4 w-4" />
                  {activity.hasRecords
                    ? session?.user.role === 'super_admin'
                      ? '进入活动记录'
                      : '进入我的记录'
                    : '查看活动详情'}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title={session?.user.role === 'super_admin' ? '当前暂无活动' : '当前暂无可查看活动'}
          description={
            session?.user.role === 'super_admin'
              ? '创建活动后，这里会显示可查看的记录入口。'
              : '活动分配给你后，会显示在这里。'
          }
        />
      )}
    </section>
  )
}

function formatActivityStatus(status: ActivitiesResponse['items'][number]['status']) {
  switch (status) {
    case 'active':
      return '进行中'
    case 'draft':
      return '草稿'
    case 'ended':
      return '已结束'
    case 'disabled':
      return '已停用'
    default:
      return '未知'
  }
}
