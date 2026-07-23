import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type MilestoneType =
  | 'operator_received'
  | 'homepage_ready'
  | 'live_software_ready'
  | 'helper_software_ready'
  | 'prejob_learning_completed'
  | 'prelive_check_completed'
  | 'first_live_completed'
  | 'first_live_review_completed'

type ProgressResponse = {
  item: {
    anchor: { id: string; anchorDisplayName: string }
    currentStage: MilestoneType
    firstLiveAt: string | null
    firstReviewCompletedAt: string | null
    milestones: Array<{
      id: string
      type: MilestoneType
      status: 'pending' | 'completed'
      completedAt: string | null
      note: string | null
    }>
  }
}

const milestoneLabels: Record<MilestoneType, string> = {
  operator_received: '运营完成接收',
  homepage_ready: '个人主页整理',
  live_software_ready: '直播软件设置',
  helper_software_ready: '辅助软件安装',
  prejob_learning_completed: '岗前基础学习',
  prelive_check_completed: '开播前准备确认',
  first_live_completed: '完成独立首播',
  first_live_review_completed: '完成首播复盘',
}

export function OperatorOnboardingPage() {
  const { anchorId = '' } = useParams()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['operator-onboarding', anchorId],
    queryFn: () =>
      apiJson<ProgressResponse>(
        `/operators/me/anchors/${anchorId}/onboarding`,
      ),
    enabled: Boolean(anchorId),
  })
  const completeMutation = useMutation({
    mutationFn: async (type: MilestoneType) => {
      const note = window.prompt('可填写本节点备注（选填）') ?? ''
      if (type === 'first_live_completed') {
        const firstLiveAt = window.prompt(
          '请输入首播时间，例如 2026-07-23 18:00',
        )
        if (!firstLiveAt) return
        return apiJson(
          `/operators/me/anchors/${anchorId}/onboarding/first-live`,
          {
            method: 'POST',
            body: JSON.stringify({
              firstLiveAt: new Date(firstLiveAt.replace(' ', 'T')).toISOString(),
              note,
            }),
          },
        )
      }
      if (type === 'first_live_review_completed') {
        const reviewNote = note || window.prompt('请填写首播复盘结论')
        if (!reviewNote?.trim()) return
        return apiJson(
          `/operators/me/anchors/${anchorId}/onboarding/first-live-review`,
          {
            method: 'POST',
            body: JSON.stringify({ note: reviewNote }),
          },
        )
      }
      return apiJson(
        `/operators/me/anchors/${anchorId}/onboarding/${type}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ note }),
        },
      )
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['operator-onboarding', anchorId],
        }),
        queryClient.invalidateQueries({ queryKey: ['operator-anchors'] }),
      ]),
  })

  if (query.isLoading) {
    return <p className="text-sm text-slate-500">正在加载岗前进度…</p>
  }
  if (query.error || !query.data) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
        {query.error instanceof Error ? query.error.message : '岗前进度加载失败'}
      </div>
    )
  }

  const progress = query.data.item
  const nextMilestone = progress.milestones.find(
    (item) => item.status === 'pending',
  )?.type

  return (
    <div className="space-y-6">
      <Link className="text-sm font-medium text-brand-600" to="/operator/anchors">
        ← 返回我的主播
      </Link>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">主播孵化进度</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          {progress.anchor.anchorDisplayName}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          已完成 {progress.milestones.filter((item) => item.status === 'completed').length} /{' '}
          {progress.milestones.length} 个节点
        </p>
      </section>
      <section className="space-y-3">
        {progress.milestones.map((milestone, index) => {
          const canComplete =
            milestone.status === 'pending' && milestone.type === nextMilestone
          return (
            <article
              key={milestone.type}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400">第 {index + 1} 步</p>
                  <h3 className="mt-1 font-semibold text-slate-900">
                    {milestoneLabels[milestone.type]}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {milestone.completedAt
                      ? `完成于 ${formatDateTime(milestone.completedAt)}`
                      : canComplete
                        ? '当前待完成'
                        : '等待前置节点'}
                  </p>
                  {milestone.note ? (
                    <p className="mt-2 text-sm text-slate-600">
                      备注：{milestone.note}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={
                    canComplete ? 'app-btn-primary' : 'app-btn-secondary'
                  }
                  disabled={!canComplete || completeMutation.isPending}
                  onClick={() => completeMutation.mutate(milestone.type)}
                >
                  {milestone.status === 'completed' ? '已完成' : '标记完成'}
                </button>
              </div>
            </article>
          )
        })}
      </section>
      {completeMutation.error ? (
        <p className="text-sm text-rose-600">
          {completeMutation.error instanceof Error
            ? completeMutation.error.message
            : '保存失败'}
        </p>
      ) : null}
    </div>
  )
}
