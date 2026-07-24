import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  BookOpenCheck,
  Radio,
  UserCheck,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import type { DashboardResponse } from '../lib/dashboard'

const metricLabels: Record<string, { label: string; helper: string }> = {
  pendingActivation: { label: '待激活', helper: '尚未完成主播档案激活' },
  invitationsSent: { label: '已通知待激活', helper: '已发送激活通知' },
  activated: { label: '已激活', helper: '已建立主播档案' },
  pendingOperatorConfirmation: { label: '待运营确认', helper: '审核已分配运营，等待运营确认归属' },
  averageActivationHours: { label: '平均激活时长', helper: '单位：小时' },
  activeAnchors: { label: '在管主播', helper: '当前有效固定归属' },
  pendingFirstLive: { label: '待首播', helper: '需要继续跟进开播准备' },
  pendingFirstLiveReview: { label: '待首播复盘', helper: '已首播但尚未完成复盘' },
  weeklyRegistrations: { label: '本周培训报名', helper: '正式、候补和已学习' },
  trainingFollowups: { label: '培训跟进待办', helper: '未观察或需要支持' },
  giftTodos: { label: '礼物业务待办', helper: '待审核或待发放' },
  publishedSessions: { label: '本周执行场次', helper: '已发布或进行中' },
  registrations: { label: '本周正式报名', helper: '等待参课主播' },
  waitlisted: { label: '当前候补', helper: '等待空余名额' },
  attendancePending: { label: '参会待确认', helper: '冲突、未匹配或待结论' },
  needsMakeup: { label: '待补学', helper: '缺席、异常退出或需补学' },
  feedbackPending: { label: '应用反馈待办', helper: '等待运营观察反馈' },
  openQuestions: { label: '问题池待处理', helper: '尚未解决或转交' },
  openIncidents: { label: '接口开放异常', helper: '需要培训管理员处理' },
}

export function StaffHomePage() {
  const { session } = useAuth()
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', session?.user.role],
    queryFn: () => apiJson<DashboardResponse>('/dashboard'),
  })

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <p className="text-sm font-medium text-brand-600">今日工作台</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          {roleTitle(session?.user.role)}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          数据由后端按当前登录角色自动限定范围，优先处理有待办的指标。
        </p>
      </div>

      {dashboardQuery.isLoading ? <LoadingBlock text="正在汇总工作台数据..." /> : null}
      {dashboardQuery.isError ? (
        <ErrorBlock
          message={
            dashboardQuery.error instanceof Error
              ? dashboardQuery.error.message
              : '工作台数据加载失败'
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(dashboardQuery.data?.metrics ?? {}).map(([key, value]) => {
          const copy = metricLabels[key] ?? { label: key, helper: '当前业务指标' }
          return (
            <article
              key={key}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft"
            >
              <div className="flex items-center gap-3 text-brand-600">
                {metricIcon(key)}
                <p className="text-sm font-medium">{copy.label}</p>
              </div>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{value}</p>
              <p className="mt-2 text-sm text-slate-500">{copy.helper}</p>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function roleTitle(role?: string) {
  if (role === 'audit_teacher') return '审核老师工作台'
  if (role === 'operator') return '运营老师工作台'
  if (role === 'training_teacher') return '培训老师工作台'
  return '培训管理员工作台'
}

function metricIcon(key: string) {
  if (key.includes('Incident') || key.includes('Pending')) {
    return <AlertTriangle className="h-5 w-5" />
  }
  if (key.includes('Live')) return <Radio className="h-5 w-5" />
  if (key.includes('Session') || key.includes('training')) {
    return <BookOpenCheck className="h-5 w-5" />
  }
  if (key.includes('Anchor') || key.includes('Activation')) {
    return <UsersRound className="h-5 w-5" />
  }
  return <UserCheck className="h-5 w-5" />
}
