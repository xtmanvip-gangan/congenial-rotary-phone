import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import type { DashboardResponse } from '../lib/dashboard'
import { formatDateTime, formatDateTimeRange } from '../lib/dateTime'
import {
  activityStatusClassMap,
  activityStatusTextMap,
  grantStatusClassMap,
  grantStatusTextMap,
  reviewStatusClassMap,
  reviewStatusTextMap,
} from '../lib/statusBadges'

type AdminSubmissionRecordItem = {
  id: string
  activity: {
    id: string
    name: string
    typeName: string
  }
  anchorName: string
  operatorName: string
  liveDate: string
  liveStartTime: string
  reviewStatus: 'pending' | 'approved' | 'rejected'
  grantStatus: 'pending' | 'granted'
  rejectReason: string | null
  createdAt: string
  rewardSummaryText: string
}

type AdminSubmissionsResponse = {
  items: AdminSubmissionRecordItem[]
}

type ActivityItem = {
  id: string
  name: string
  startAt: string
  endAt: string
  status: 'draft' | 'active' | 'ended' | 'disabled'
  itemCount: number
  ruleCount: number
  type: {
    typeName: string
  }
}

type ActivitiesResponse = {
  items: ActivityItem[]
}

type OperatorsResponse = {
  items: Array<{
    id: string
    status: 'active' | 'disabled'
  }>
}

export function AdminDashboardPage() {
  const { session } = useAuth()

  const recordsQuery = useQuery({
    queryKey: ['admin-submissions', 'dashboard'],
    queryFn: () =>
      apiJson<AdminSubmissionsResponse>('/submissions/admin?page=1&pageSize=500'),
  })

  const activitiesQuery = useQuery({
    queryKey: ['activities', 'dashboard'],
    queryFn: () => apiJson<ActivitiesResponse>('/activities'),
  })

  const operatorsQuery = useQuery({
    enabled: session?.user.role === 'super_admin',
    queryKey: ['operators', 'dashboard'],
    queryFn: () => apiJson<OperatorsResponse>('/operators'),
  })
  const platformDashboardQuery = useQuery({
    enabled: session?.user.role === 'super_admin',
    queryKey: ['dashboard', 'super_admin'],
    queryFn: () => apiJson<DashboardResponse>('/dashboard'),
  })

  const summary = useMemo(() => {
    const records = recordsQuery.data?.items ?? []
    const activities = activitiesQuery.data?.items ?? []
    const operators = operatorsQuery.data?.items ?? []
    const today = getTodayDate()

    return {
      pendingReviewCount: records.filter((item) => item.reviewStatus === 'pending').length,
      pendingGrantCount: records.filter(
        (item) => item.reviewStatus === 'approved' && item.grantStatus === 'pending',
      ).length,
      rejectedCount: records.filter((item) => item.reviewStatus === 'rejected').length,
      todaySubmissionCount: records.filter((item) => item.createdAt.slice(0, 10) === today).length,
      activeActivityCount: activities.filter((item) => item.status === 'active').length,
      configuredActivityCount: activities.filter((item) => item.ruleCount > 0).length,
      operatorCount: operators.length,
      activeOperatorCount: operators.filter((item) => item.status === 'active').length,
    }
  }, [activitiesQuery.data?.items, operatorsQuery.data?.items, recordsQuery.data?.items])

  const recentRecords = useMemo(
    () =>
      [...(recordsQuery.data?.items ?? [])]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 6),
    [recordsQuery.data?.items],
  )

  const recentActivities = useMemo(
    () =>
      [...(activitiesQuery.data?.items ?? [])]
        .sort((left, right) => new Date(right.startAt).getTime() - new Date(left.startAt).getTime())
        .slice(0, 6),
    [activitiesQuery.data?.items],
  )

  const loading = recordsQuery.isLoading || activitiesQuery.isLoading || operatorsQuery.isLoading
  const hasError = recordsQuery.isError || activitiesQuery.isError || operatorsQuery.isError

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-600">后台首页</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">当前业务概览</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              汇总待审核、待发放、活动配置和最新提报，方便快速安排今日处理重点。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <QuickLink to="/admin/records" label="去处理记录" />
            <QuickLink to="/admin/activities" label="去看活动" />
            <QuickLink to="/admin/exports" label="去导出报表" />
          </div>
        </div>
      </div>

      {hasError ? (
        <ErrorBlock
          message={
            recordsQuery.error instanceof Error
              ? recordsQuery.error.message
              : activitiesQuery.error instanceof Error
                ? activitiesQuery.error.message
                : operatorsQuery.error instanceof Error
                  ? operatorsQuery.error.message
                  : '后台首页数据加载失败'
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<ClipboardList className="h-5 w-5" />}
          label="待审核记录"
          value={summary.pendingReviewCount}
          helper="主播已提交，等待运营处理"
          loading={loading}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="待发放记录"
          value={summary.pendingGrantCount}
          helper="审核已通过，等待登记发放"
          loading={loading}
        />
        <SummaryCard
          icon={<Activity className="h-5 w-5" />}
          label="启用中活动"
          value={summary.activeActivityCount}
          helper={`已配规则 ${summary.configuredActivityCount} 个`}
          loading={loading}
        />
        <SummaryCard
          icon={<ShieldCheck className="h-5 w-5" />}
          label="今日新增提报"
          value={summary.todaySubmissionCount}
          helper={`已驳回 ${summary.rejectedCount} 条`}
          loading={loading}
        />
      </div>

      {session?.user.role === 'super_admin' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={<UsersRound className="h-5 w-5" />}
            label="有效主播档案"
            value={platformDashboardQuery.data?.metrics.activeAnchors ?? 0}
            helper="已经激活且仍在合作"
            loading={platformDashboardQuery.isLoading}
          />
          <SummaryCard
            icon={<BookOpenCheck className="h-5 w-5" />}
            label="执行中培训场次"
            value={platformDashboardQuery.data?.metrics.trainingSessions ?? 0}
            helper="已发布或正在进行"
            loading={platformDashboardQuery.isLoading}
          />
          <SummaryCard
            icon={<AlertTriangle className="h-5 w-5" />}
            label="开放接口异常"
            value={platformDashboardQuery.data?.metrics.openIncidents ?? 0}
            helper="企微或腾讯会议待处理"
            loading={platformDashboardQuery.isLoading}
          />
          <SummaryCard
            icon={<Activity className="h-5 w-5" />}
            label="异常任务运行"
            value={platformDashboardQuery.data?.metrics.failedJobs ?? 0}
            helper="失败或部分失败"
            loading={platformDashboardQuery.isLoading}
          />
        </div>
      ) : null}

      {session?.user.role === 'super_admin' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryCard
            icon={<UsersRound className="h-5 w-5" />}
            label="运营老师总数"
            value={summary.operatorCount}
            helper={`当前启用 ${summary.activeOperatorCount} 人`}
            loading={loading}
          />
          <SummaryCard
            icon={<Activity className="h-5 w-5" />}
            label="活动配置完成度"
            value={summary.configuredActivityCount}
            helper={`活动总数 ${activitiesQuery.data?.items.length ?? 0} 个`}
            loading={loading}
          />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <p className="text-sm font-medium text-brand-600">最近提报</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-900">优先关注的记录</h3>
            </div>
            <Link
              to="/admin/records"
              className="text-sm font-medium text-brand-600 transition hover:text-brand-700"
            >
              查看全部
            </Link>
          </div>

          {loading ? (
            <LoadingBlock text="正在加载最新提报，请稍候..." />
          ) : recentRecords.length > 0 ? (
            <div className="mt-4 space-y-3">
              {recentRecords.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition duration-300 hover:bg-white hover:shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                      {item.activity.name}
                    </span>
                    <span className={reviewStatusClassMap[item.reviewStatus]}>
                      {reviewStatusTextMap[item.reviewStatus]}
                    </span>
                    <span className={grantStatusClassMap[item.grantStatus]}>
                      {grantStatusTextMap[item.grantStatus]}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                    <p>主播：{item.anchorName}</p>
                    <p>运营：{item.operatorName}</p>
                    <p>直播时间：{item.liveDate} {item.liveStartTime}</p>
                    <p>提交时间：{formatDateTime(item.createdAt)}</p>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">命中奖励：{item.rewardSummaryText}</p>
                  {item.rejectReason ? (
                    <p className="mt-2 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-600">
                      驳回原因：{item.rejectReason}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="当前暂无提报记录" description="有新提报后，这里会显示最新动态。" />
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <p className="text-sm font-medium text-brand-600">活动概览</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-900">最近活动状态</h3>
            </div>
            <Link
              to="/admin/activities"
              className="text-sm font-medium text-brand-600 transition hover:text-brand-700"
            >
              去管理
            </Link>
          </div>

          {loading ? (
            <LoadingBlock text="正在加载活动概览，请稍候..." />
          ) : recentActivities.length > 0 ? (
            <div className="mt-4 space-y-3">
              {recentActivities.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition duration-300 hover:bg-white hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900">{item.name}</h4>
                      <p className="mt-1 text-sm text-slate-500">{item.type.typeName}</p>
                    </div>
                    <span className={activityStatusClassMap[item.status]}>{activityStatusTextMap[item.status]}</span>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>活动时间：{formatDateTimeRange(item.startAt, item.endAt)}</p>
                    <p>收集项：{item.itemCount} 项</p>
                    <p>奖励规则：{item.ruleCount} 条</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="当前暂无活动" description="创建活动后，这里会展示最近的活动状态。" />
          )}
        </section>
      </div>
    </section>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  helper,
  loading,
}: {
  icon: ReactNode
  label: string
  value: number
  helper: string
  loading: boolean
}) {
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-md">
      <div className="flex items-center gap-3 text-brand-600">
        <div className="rounded-2xl bg-brand-50 p-2">{icon}</div>
        <p className="text-sm font-medium text-slate-600">{label}</p>
      </div>
      <div className="mt-4">
        {loading ? (
          <div className="inline-flex items-center gap-2 text-sm text-slate-500">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            正在汇总
          </div>
        ) : (
          <p className="text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
        )}
        <p className="mt-2 text-sm text-slate-500">{helper}</p>
      </div>
    </article>
  )
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="app-btn-secondary"
    >
      {label}
    </Link>
  )
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10)
}
