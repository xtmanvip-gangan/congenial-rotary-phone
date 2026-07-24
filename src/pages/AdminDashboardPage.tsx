import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Download,
  FolderKanban,
  GraduationCap,
  ListChecks,
  RefreshCw,
  Settings2,
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

type EntryGroup = {
  title: string
  items: Array<{
    label: string
    description: string
    to: string
    icon: ReactNode
  }>
}

const platformMetrics: MetricCardConfig[] = [
  {
    key: 'activeAnchors',
    label: '有效主播',
    helper: '已激活且在合作',
    icon: <UsersRound className="h-4 w-4" />,
    href: '/audit/activations',
  },
  {
    key: 'activeStaff',
    label: '在职员工',
    helper: '后台启用账号',
    icon: <Users className="h-4 w-4" />,
    href: '/admin/staff',
  },
  {
    key: 'giftTodos',
    label: '礼物待办',
    helper: '待审核或待发放',
    icon: <ClipboardList className="h-4 w-4" />,
    href: '/admin/records',
    todo: true,
  },
  {
    key: 'trainingSessions',
    label: '执行中场次',
    helper: '已发布或进行中',
    icon: <CalendarDays className="h-4 w-4" />,
    href: '/training/sessions',
  },
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
]

const entryGroups: EntryGroup[] = [
  {
    title: '人员与主播',
    items: [
      {
        label: '员工与角色',
        description: '账号、多角色、启停',
        to: '/admin/staff',
        icon: <Users className="h-4 w-4" />,
      },
      {
        label: '主播激活',
        description: '开通任务与企微提醒',
        to: '/audit/activations',
        icon: <UserCheck className="h-4 w-4" />,
      },
    ],
  },
  {
    title: '礼物业务',
    items: [
      {
        label: '活动记录',
        description: '审核与发放',
        to: '/admin/records',
        icon: <ClipboardList className="h-4 w-4" />,
      },
      {
        label: '活动管理',
        description: '活动与状态',
        to: '/admin/activities',
        icon: <FolderKanban className="h-4 w-4" />,
      },
      {
        label: '规则管理',
        description: '礼物 / PK 规则',
        to: '/admin/rules',
        icon: <Settings2 className="h-4 w-4" />,
      },
      {
        label: '导出中心',
        description: '提报导出',
        to: '/admin/exports',
        icon: <Download className="h-4 w-4" />,
      },
    ],
  },
  {
    title: '培训中心',
    items: [
      {
        label: '参会导入',
        description: '腾讯导出认定',
        to: '/training/attendance',
        icon: <ListChecks className="h-4 w-4" />,
      },
      {
        label: '培训运营',
        description: '反馈 / 问题 / 周会',
        to: '/training/operations',
        icon: <GraduationCap className="h-4 w-4" />,
      },
      {
        label: '课程与场次',
        description: '由培训管理员维护',
        to: '/training/sessions',
        icon: <BookOpen className="h-4 w-4" />,
      },
    ],
  },
  {
    title: '运维',
    items: [
      {
        label: '任务与异常',
        description: '任务运行与集成异常',
        to: '/operations',
        icon: <ShieldAlert className="h-4 w-4" />,
      },
    ],
  },
]

export function AdminDashboardPage() {
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', 'super_admin'],
    queryFn: () => apiJson<DashboardResponse>('/dashboard'),
  })

  const metrics = dashboardQuery.data?.metrics ?? {}
  const todoCards = platformMetrics.filter(
    (item) => item.todo && Number(metrics[item.key] ?? 0) > 0,
  )
  const overviewCards = platformMetrics.filter(
    (item) => !(item.todo && Number(metrics[item.key] ?? 0) > 0),
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
            覆盖主播开通、礼物业务、培训与运维
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

          <div>
            <p className="mb-3 text-sm font-medium text-slate-500">平台数据</p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overviewCards.map((item) => (
                <MetricCard
                  key={item.key}
                  label={item.label}
                  helper={item.helper}
                  value={Number(metrics[item.key] ?? 0)}
                  icon={item.icon}
                  href={item.href}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-slate-500">业务入口</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {entryGroups.map((group) => (
                <section
                  key={group.title}
                  className="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <h2 className="text-sm font-semibold text-slate-900">
                    {group.title}
                  </h2>
                  <ul className="mt-3 space-y-1.5">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-brand-50"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-brand-600 group-hover:bg-white">
                            {item.icon}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-800">
                              {item.label}
                            </span>
                            <span className="block text-xs text-slate-400">
                              {item.description}
                            </span>
                          </span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-500" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
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
