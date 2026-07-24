import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  FolderKanban,
  GraduationCap,
  ListChecks,
  Radio,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import type { DashboardResponse } from '../lib/dashboard'

type MetricCardConfig = {
  key: string
  label: string
  helper: string
  icon: ReactNode
  href: string
  todo?: boolean
}

type MetricGroup = {
  title: string
  items: MetricCardConfig[]
}

/** 按业务域分组的全平台指标（与侧栏业务对齐） */
const metricGroups: MetricGroup[] = [
  {
    title: '人员与主播',
    items: [
      {
        key: 'activeAnchors',
        label: '有效主播',
        helper: '已激活且在合作',
        icon: <UsersRound className="h-4 w-4" />,
        href: '/operator/anchors',
      },
      {
        key: 'activeStaff',
        label: '在职员工',
        helper: '后台启用账号',
        icon: <Users className="h-4 w-4" />,
        href: '/admin/staff',
      },
      {
        key: 'pendingActivation',
        label: '待激活',
        helper: '开通任务待发送/待开通',
        icon: <UserCheck className="h-4 w-4" />,
        href: '/audit/activations',
        todo: true,
      },
      {
        key: 'invitationsSent',
        label: '已通知待激活',
        helper: '已发提醒未开通',
        icon: <UserCheck className="h-4 w-4" />,
        href: '/audit/activations',
        todo: true,
      },
      {
        key: 'pendingOperatorConfirmation',
        label: '待运营确认',
        helper: '归属待确认',
        icon: <UsersRound className="h-4 w-4" />,
        href: '/operator/anchors',
        todo: true,
      },
      {
        key: 'pendingFirstLive',
        label: '待首播',
        helper: '岗前未完成首播',
        icon: <Radio className="h-4 w-4" />,
        href: '/operator/anchors',
        todo: true,
      },
      {
        key: 'pendingFirstLiveReview',
        label: '待首播复盘',
        helper: '已首播未复盘',
        icon: <BookOpenCheck className="h-4 w-4" />,
        href: '/operator/anchors',
        todo: true,
      },
    ],
  },
  {
    title: '礼物业务',
    items: [
      {
        key: 'pendingReview',
        label: '待审核',
        helper: '主播提报待处理',
        icon: <ClipboardList className="h-4 w-4" />,
        href: '/admin/records',
        todo: true,
      },
      {
        key: 'pendingGrant',
        label: '待发放',
        helper: '审核通过待登记',
        icon: <ClipboardList className="h-4 w-4" />,
        href: '/admin/records',
        todo: true,
      },
      {
        key: 'activeActivities',
        label: '启用中活动',
        helper: '当前进行中的活动',
        icon: <FolderKanban className="h-4 w-4" />,
        href: '/admin/activities',
      },
    ],
  },
  {
    title: '培训中心',
    items: [
      {
        key: 'trainingSessions',
        label: '执行中场次',
        helper: '已发布或进行中',
        icon: <CalendarDays className="h-4 w-4" />,
        href: '/training/sessions',
      },
      {
        key: 'weeklyRegistrations',
        label: '本周培训报名',
        helper: '正式 / 候补 / 已学',
        icon: <ListChecks className="h-4 w-4" />,
        href: '/operator/training',
      },
      {
        key: 'waitlisted',
        label: '当前候补',
        helper: '等待空余名额',
        icon: <ListChecks className="h-4 w-4" />,
        href: '/training/sessions',
        todo: true,
      },
      {
        key: 'attendancePending',
        label: '参会待确认',
        helper: '冲突 / 未匹配 / 待结论',
        icon: <ListChecks className="h-4 w-4" />,
        href: '/training/attendance',
        todo: true,
      },
      {
        key: 'needsMakeup',
        label: '待补学',
        helper: '缺席或需补学',
        icon: <BookOpenCheck className="h-4 w-4" />,
        href: '/training/attendance',
        todo: true,
      },
      {
        key: 'feedbackPending',
        label: '应用反馈待办',
        helper: '未观察或需支持',
        icon: <GraduationCap className="h-4 w-4" />,
        href: '/training/operations',
        todo: true,
      },
      {
        key: 'openQuestions',
        label: '问题池待处理',
        helper: '未解决或未转交完',
        icon: <AlertTriangle className="h-4 w-4" />,
        href: '/training/operations',
        todo: true,
      },
    ],
  },
  {
    title: '运维',
    items: [
      {
        key: 'failedNotifications',
        label: '通知失败',
        helper: '需关注重试',
        icon: <AlertTriangle className="h-4 w-4" />,
        href: '/operations',
        todo: true,
      },
      {
        key: 'openIncidents',
        label: '接口异常',
        helper: '企微等集成问题',
        icon: <ShieldAlert className="h-4 w-4" />,
        href: '/operations',
        todo: true,
      },
      {
        key: 'failedJobs',
        label: '任务异常',
        helper: '失败或部分失败',
        icon: <AlertTriangle className="h-4 w-4" />,
        href: '/operations',
        todo: true,
      },
    ],
  },
]

const allMetrics = metricGroups.flatMap((group) => group.items)

export function AdminDashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'super_admin'],
    queryFn: () => apiJson<DashboardResponse>('/dashboard'),
  })

  const metrics = dashboardQuery.data?.metrics ?? {}
  const todoCards = allMetrics.filter(
    (item) => item.todo && Number(metrics[item.key] ?? 0) > 0,
  )

  const updatedAt = dashboardQuery.data?.generatedAt
    ? formatTime(dashboardQuery.data.generatedAt)
    : null

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-brand-600">后台首页</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            平台总览
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            按业务线汇总全平台数据，入口请使用左侧导航
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
        <LoadingBlock text="正在汇总平台数据…" />
      ) : null}

      {dashboardQuery.isError ? (
        <ErrorBlock
          message={
            dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : '后台首页数据加载失败'
          }
        />
      ) : null}

      {!dashboardQuery.isLoading && !dashboardQuery.isError ? (
        <>
          {todoCards.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="inline-flex h-5 items-center rounded-md bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-700">
                  待办
                </span>
                <p className="text-sm text-slate-500">
                  有 {todoCards.length} 项需要优先关注
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {todoCards.map((item) => (
                  <MetricCard
                    key={item.key}
                    label={item.label}
                    helper={item.helper}
                    value={Number(metrics[item.key] ?? 0)}
                    icon={item.icon}
                    href={item.href}
                    emphasize
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
              当前没有紧急平台待办。
            </div>
          )}

          {metricGroups.map((group) => (
            <div key={group.title}>
              <p className="mb-3 text-sm font-medium text-slate-500">
                {group.title}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {group.items.map((item) => (
                  <MetricCard
                    key={item.key}
                    label={item.label}
                    helper={item.helper}
                    value={Number(metrics[item.key] ?? 0)}
                    icon={item.icon}
                    href={item.href}
                    emphasize={
                      Boolean(item.todo) && Number(metrics[item.key] ?? 0) > 0
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      ) : null}
    </section>
  )
}

function MetricCard({
  label,
  helper,
  value,
  icon,
  href,
  emphasize = false,
}: {
  label: string
  helper: string
  value: number
  icon: ReactNode
  href: string
  emphasize?: boolean
}) {
  return (
    <Link
      to={href}
      className={[
        'group flex h-full flex-col rounded-2xl border bg-white p-4 transition',
        emphasize
          ? 'border-amber-200 shadow-sm ring-1 ring-amber-100'
          : 'border-slate-200 hover:border-brand-200 hover:shadow-sm',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={[
            'flex h-8 w-8 items-center justify-center rounded-lg',
            emphasize
              ? 'bg-amber-50 text-amber-700'
              : 'bg-brand-50 text-brand-600',
          ].join(' ')}
        >
          {icon}
        </div>
        <ArrowUpRight className="h-4 w-4 text-slate-300 transition group-hover:text-brand-500" />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{label}</p>
      <p className="mt-0.5 text-xs leading-5 text-slate-400">{helper}</p>
    </Link>
  )
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
