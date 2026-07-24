import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  Clock3,
  GraduationCap,
  ListChecks,
  Radio,
  RefreshCw,
  UserCheck,
  UsersRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import { formatRoleLabel } from '../lib/navConfig'
import type { AppRole } from '../lib/auth'
import type { DashboardResponse } from '../lib/dashboard'

type MetricMeta = {
  label: string
  helper: string
  icon: ReactNode
  /** 有待办语义时，数值>0 高亮 */
  todo?: boolean
  href?: string
}

const metricMeta: Record<string, MetricMeta> = {
  pendingActivation: {
    label: '待激活',
    helper: '尚未完成档案开通',
    icon: <UserCheck className="h-4 w-4" />,
    todo: true,
    href: '/audit/activations',
  },
  invitationsSent: {
    label: '已通知待激活',
    helper: '已发送开通提醒',
    icon: <UserCheck className="h-4 w-4" />,
    todo: true,
    href: '/audit/activations',
  },
  activated: {
    label: '已激活',
    helper: '已建立主播档案',
    icon: <UsersRound className="h-4 w-4" />,
    href: '/audit/activations',
  },
  cancelled: {
    label: '已取消',
    helper: '已取消的开通任务',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  pendingOperatorConfirmation: {
    label: '待运营确认',
    helper: '等待运营确认归属',
    icon: <UsersRound className="h-4 w-4" />,
    todo: true,
    href: '/operator/anchors',
  },
  averageActivationHours: {
    label: '平均激活时长',
    helper: '单位：小时',
    icon: <Clock3 className="h-4 w-4" />,
  },
  activeAnchors: {
    label: '在管主播',
    helper: '当前有效固定归属',
    icon: <UsersRound className="h-4 w-4" />,
    href: '/operator/anchors',
  },
  pendingFirstLive: {
    label: '待首播',
    helper: '已确认尚未首播',
    icon: <Radio className="h-4 w-4" />,
    todo: true,
    href: '/operator/anchors?liveStatus=pending_first_live',
  },
  incubating: {
    label: '孵化中',
    helper: '首播后 30 天内',
    icon: <UsersRound className="h-4 w-4" />,
    href: '/operator/anchors?liveStatus=incubating',
  },
  pendingFirstLiveReview: {
    label: '待首播复盘',
    helper: '已首播未完成复盘节点',
    icon: <BookOpenCheck className="h-4 w-4" />,
    todo: true,
    href: '/operator/onboarding',
  },
  offlineAnchors: {
    label: '断播',
    helper: '需跟进恢复开播',
    icon: <AlertTriangle className="h-4 w-4" />,
    todo: true,
    href: '/operator/anchors?liveStatus=offline',
  },
  leaveAnchors: {
    label: '请假',
    helper: '在会暂休',
    icon: <Clock3 className="h-4 w-4" />,
    href: '/operator/anchors?liveStatus=leave',
  },
  weeklyRegistrations: {
    label: '本周培训报名',
    helper: '正式 / 候补 / 已学',
    icon: <CalendarDays className="h-4 w-4" />,
    href: '/operator/training',
  },
  trainingFollowups: {
    label: '培训跟进待办',
    helper: '未观察或需支持',
    icon: <GraduationCap className="h-4 w-4" />,
    todo: true,
    href: '/training/operations',
  },
  giftTodos: {
    label: '礼物业务待办',
    helper: '待审核或待发放',
    icon: <ClipboardList className="h-4 w-4" />,
    todo: true,
    href: '/admin/records',
  },
  publishedSessions: {
    label: '本周执行场次',
    helper: '已发布或进行中',
    icon: <CalendarDays className="h-4 w-4" />,
    href: '/training/sessions',
  },
  registrations: {
    label: '本周正式报名',
    helper: '等待参课',
    icon: <ListChecks className="h-4 w-4" />,
    href: '/training/sessions',
  },
  waitlisted: {
    label: '当前候补',
    helper: '等待空余名额',
    icon: <ListChecks className="h-4 w-4" />,
    href: '/training/sessions',
  },
  attendancePending: {
    label: '参会待确认',
    helper: '冲突 / 未匹配 / 待结论',
    icon: <ListChecks className="h-4 w-4" />,
    todo: true,
    href: '/training/attendance',
  },
  needsMakeup: {
    label: '待补学',
    helper: '缺席或需补学',
    icon: <BookOpenCheck className="h-4 w-4" />,
    todo: true,
    href: '/training/attendance',
  },
  feedbackPending: {
    label: '应用反馈待办',
    helper: '等待观察反馈',
    icon: <GraduationCap className="h-4 w-4" />,
    todo: true,
    href: '/training/operations',
  },
  openQuestions: {
    label: '问题池待处理',
    helper: '尚未解决或转交',
    icon: <AlertTriangle className="h-4 w-4" />,
    todo: true,
    href: '/training/operations',
  },
  openIncidents: {
    label: '接口异常',
    helper: '需管理员处理',
    icon: <AlertTriangle className="h-4 w-4" />,
    todo: true,
    href: '/operations',
  },
  activeStaff: {
    label: '在职员工',
    helper: '后台启用账号',
    icon: <UsersRound className="h-4 w-4" />,
    href: '/admin/staff',
  },
  trainingSessions: {
    label: '进行中场次',
    helper: '已发布或进行中',
    icon: <CalendarDays className="h-4 w-4" />,
    href: '/training/sessions',
  },
  failedNotifications: {
    label: '通知失败',
    helper: '需关注重试',
    icon: <AlertTriangle className="h-4 w-4" />,
    todo: true,
    href: '/operations',
  },
  failedJobs: {
    label: '任务异常',
    helper: '失败或部分失败',
    icon: <AlertTriangle className="h-4 w-4" />,
    todo: true,
    href: '/operations',
  },
}

export function StaffHomePage() {
  const { session } = useAuth()
  const role = session?.user.role
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', role],
    queryFn: () => apiJson<DashboardResponse>('/dashboard'),
  })

  const metrics = dashboardQuery.data?.metrics ?? {}
  const entries = Object.entries(metrics)
  const todoEntries = entries.filter(([key, value]) => {
    const meta = metricMeta[key]
    return meta?.todo && Number(value) > 0
  })
  const otherEntries = entries.filter(([key, value]) => {
    const meta = metricMeta[key]
    return !(meta?.todo && Number(value) > 0)
  })

  const updatedAt = dashboardQuery.data?.generatedAt
    ? formatTime(dashboardQuery.data.generatedAt)
    : null

  return (
    <section className="space-y-5">
      {/* 页头：紧凑，贴合侧栏风格 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-brand-600">今日工作台</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            {roleTitle(role)}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {session?.user.name}
            <span className="text-slate-300"> · </span>
            {role ? formatRoleLabel(role) : ''}
            {updatedAt ? (
              <>
                <span className="text-slate-300"> · </span>
                更新于 {updatedAt}
              </>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void dashboardQuery.refetch()}
          disabled={dashboardQuery.isFetching}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-60"
        >
          <RefreshCw
            className={[
              'h-3.5 w-3.5',
              dashboardQuery.isFetching ? 'animate-spin' : '',
            ].join(' ')}
          />
          刷新
        </button>
      </div>

      {dashboardQuery.isLoading ? (
        <LoadingBlock text="正在汇总工作台数据…" />
      ) : null}

      {dashboardQuery.isError ? (
        <ErrorBlock
          message={
            dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : '工作台数据加载失败'
          }
        />
      ) : null}

      {!dashboardQuery.isLoading && !dashboardQuery.isError ? (
        <>
          {todoEntries.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-5 items-center rounded-md bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-700">
                  待办
                </span>
                <p className="text-sm text-slate-500">
                  有 {todoEntries.length} 项需要优先处理
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {todoEntries.map(([key, value]) => (
                  <MetricCard
                    key={key}
                    metricKey={key}
                    value={value}
                    role={role}
                    emphasize
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
              当前没有紧急待办，状态良好。
            </div>
          )}

          {otherEntries.length > 0 ? (
            <div>
              <p className="mb-3 text-sm font-medium text-slate-500">数据概览</p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {otherEntries.map(([key, value]) => (
                  <MetricCard
                    key={key}
                    metricKey={key}
                    value={value}
                    role={role}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
              暂无看板数据
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function MetricCard({
  metricKey,
  value,
  role,
  emphasize = false,
}: {
  metricKey: string
  value: number
  role?: AppRole
  emphasize?: boolean
}) {
  const meta = metricMeta[metricKey] ?? {
    label: metricKey,
    helper: '业务指标',
    icon: <UserCheck className="h-4 w-4" />,
  }
  const href = resolveMetricHref(metricKey, role, meta.href)

  const display =
    metricKey === 'averageActivationHours'
      ? Number(value).toFixed(1)
      : String(value)

  const cardClass = [
    'group relative flex h-full flex-col rounded-2xl border bg-white p-4 transition',
    emphasize
      ? 'border-amber-200 shadow-sm ring-1 ring-amber-100'
      : 'border-slate-200 hover:border-brand-200 hover:shadow-sm',
    href ? 'cursor-pointer' : '',
  ].join(' ')

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div
          className={[
            'flex h-8 w-8 items-center justify-center rounded-lg',
            emphasize
              ? 'bg-amber-50 text-amber-700'
              : 'bg-brand-50 text-brand-600',
          ].join(' ')}
        >
          {meta.icon}
        </div>
        {href ? (
          <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-brand-500" />
        ) : null}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
        {display}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{meta.label}</p>
      <p className="mt-0.5 text-xs leading-5 text-slate-400">{meta.helper}</p>
    </>
  )

  if (href) {
    return (
      <Link to={href} className={cardClass}>
        {body}
      </Link>
    )
  }

  return <article className={cardClass}>{body}</article>
}

function resolveMetricHref(
  key: string,
  role: AppRole | undefined,
  fallback?: string,
) {
  if (key === 'pendingOperatorConfirmation' && role === 'audit_teacher') {
    return '/audit/activations'
  }
  if (key === 'giftTodos' && role === 'super_admin') {
    return '/admin/records'
  }
  if (
    (key === 'openIncidents' || key === 'failedJobs' || key === 'failedNotifications') &&
    role === 'training_teacher'
  ) {
    return undefined
  }
  return fallback
}

function roleTitle(role?: AppRole) {
  if (role === 'audit_teacher') return '审核老师工作台'
  if (role === 'operator') return '运营老师工作台'
  if (role === 'training_teacher') return '培训老师工作台'
  if (role === 'training_admin') return '培训管理员工作台'
  return '工作台'
}

function formatTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
