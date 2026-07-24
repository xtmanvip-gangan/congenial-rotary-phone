import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRightLeft,
  BookOpen,
  ClipboardList,
  Gift,
  LoaderCircle,
  RefreshCw,
  UsersRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'

type OverviewResponse = {
  operator: {
    id: string
    displayName: string
    wecomUserId: string
    status: string
    roles: string[]
  }
  metrics: {
    activeAnchors?: number
    pendingFirstLive?: number
    pendingFirstLiveReview?: number
    weeklyRegistrations?: number
    trainingFollowups?: number
    giftTodos?: number
    pendingConfirmation?: number
    rejectedAnchors?: number
    giftPendingReview?: number
    giftPendingGrant?: number
    giftRecent7d?: number
    trainingRegistrationsOpen?: number
  }
  links: {
    anchors: string
    giftRecords: string
    training: string
    staff: string
  }
}

const roleLabels: Record<string, string> = {
  audit_teacher: '审核老师',
  operator: '运营老师',
  training_teacher: '培训老师',
  training_admin: '培训管理员',
}

export function AdminOperatorOverviewPage() {
  const { operatorId = '' } = useParams()
  const query = useQuery({
    queryKey: ['admin-operator-overview', operatorId],
    queryFn: () =>
      apiJson<OverviewResponse>(`/dashboard/operators/${operatorId}`),
    enabled: Boolean(operatorId),
  })

  if (query.isLoading) {
    return <LoadingBlock text="正在加载运营工作台…" />
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <Link
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600"
          to="/admin/staff"
        >
          <ArrowLeft className="h-4 w-4" />
          返回员工与角色
        </Link>
        <ErrorBlock
          message={
            query.error instanceof Error
              ? query.error.message
              : '运营数据加载失败'
          }
        />
      </div>
    )
  }

  const { operator, metrics, links } = query.data
  const isActive = operator.status === 'active'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600"
          to="/admin/staff"
        >
          <ArrowLeft className="h-4 w-4" />
          返回员工与角色
        </Link>
        <button
          type="button"
          className="app-btn-secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          刷新
        </button>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">组织调度 · 运营详情</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold text-slate-900">
            {operator.displayName}
          </h2>
          <span
            className={[
              'rounded-full px-2.5 py-0.5 text-xs font-medium',
              isActive
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/60'
                : 'bg-slate-200 text-slate-600',
            ].join(' ')}
          >
            {isActive ? '启用' : '停用'}
          </span>
        </div>
        <p className="mt-2 font-mono text-sm text-slate-500">
          {operator.wecomUserId || '—'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {operator.roles.map((role) => (
            <span
              key={role}
              className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
            >
              {roleLabels[role] ?? role}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          只读监管视图：汇总该运营名下主播、礼物与培训数据，明细请点下方入口。
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="在管主播"
          value={metrics.activeAnchors ?? 0}
          helper="状态有效且归属该运营"
          tone="sky"
        />
        <MetricCard
          label="待运营确认"
          value={metrics.pendingConfirmation ?? 0}
          helper="转交后等待其确认"
          tone="amber"
        />
        <MetricCard
          label="待首播 / 待复盘"
          value={`${metrics.pendingFirstLive ?? 0} / ${metrics.pendingFirstLiveReview ?? 0}`}
          helper="岗前孵化待办"
          tone="brand"
        />
        <MetricCard
          label="礼物待办"
          value={metrics.giftTodos ?? 0}
          helper={`待审 ${metrics.giftPendingReview ?? 0} · 待发 ${metrics.giftPendingGrant ?? 0}`}
          tone="rose"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <DomainCard
          title="主播与归属"
          icon={<UsersRound className="h-4 w-4" />}
          items={[
            { label: '在管主播', value: metrics.activeAnchors ?? 0 },
            { label: '待确认归属', value: metrics.pendingConfirmation ?? 0 },
            { label: '待首播', value: metrics.pendingFirstLive ?? 0 },
            { label: '待首播复盘', value: metrics.pendingFirstLiveReview ?? 0 },
          ]}
          actions={[
            { label: '在管主播列表', to: links.anchors, primary: true },
            {
              label: '去转交（全景勾选）',
              to: links.anchors,
              icon: <ArrowRightLeft className="h-3.5 w-3.5" />,
            },
          ]}
        />
        <DomainCard
          title="礼物业务"
          icon={<Gift className="h-4 w-4" />}
          items={[
            { label: '礼物待办合计', value: metrics.giftTodos ?? 0 },
            { label: '待审核', value: metrics.giftPendingReview ?? 0 },
            { label: '待发放', value: metrics.giftPendingGrant ?? 0 },
            { label: '近7日提报', value: metrics.giftRecent7d ?? 0 },
          ]}
          actions={[
            {
              label: '查看活动记录',
              to: links.giftRecords,
              primary: true,
              icon: <ClipboardList className="h-3.5 w-3.5" />,
            },
          ]}
        />
        <DomainCard
          title="培训相关"
          icon={<BookOpen className="h-4 w-4" />}
          items={[
            {
              label: '当前有效报名/候补',
              value: metrics.trainingRegistrationsOpen ?? 0,
            },
            {
              label: '本周报名（含已学）',
              value: metrics.weeklyRegistrations ?? 0,
            },
            {
              label: '培训跟进待办',
              value: metrics.trainingFollowups ?? 0,
            },
          ]}
          actions={[
            {
              label: '培训代报名（该运营范围）',
              to: links.training,
              primary: true,
            },
          ]}
        />
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string
  value: number | string
  helper: string
  tone: 'sky' | 'amber' | 'brand' | 'rose'
}) {
  const tones = {
    sky: 'border-sky-100 bg-sky-50/70 text-sky-800',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-800',
    brand: 'border-brand-100 bg-brand-50/70 text-brand-800',
    rose: 'border-rose-100 bg-rose-50/70 text-rose-800',
  }[tone]
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{helper}</p>
    </div>
  )
}

function DomainCard({
  title,
  icon,
  items,
  actions,
}: {
  title: string
  icon: ReactNode
  items: Array<{ label: string; value: number }>
  actions: Array<{
    label: string
    to: string
    primary?: boolean
    icon?: ReactNode
  }>
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          {icon}
        </span>
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      </div>
      <dl className="mt-4 space-y-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
          >
            <dt className="text-slate-500">{item.label}</dt>
            <dd className="font-semibold tabular-nums text-slate-900">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.to}
            className={action.primary ? 'app-btn-primary' : 'app-btn-secondary'}
          >
            {action.icon}
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  )
}
