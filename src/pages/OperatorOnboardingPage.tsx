import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
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

const milestoneHelpers: Record<MilestoneType, string> = {
  operator_received: '确认接收主播并建立沟通',
  homepage_ready: '抖音主页资料、封面与简介整理完成',
  live_software_ready: '直播伴侣/开播软件参数配置完成',
  helper_software_ready: '辅助工具安装与账号就绪',
  prejob_learning_completed: '完成岗前学习或课程要求',
  prelive_check_completed: '设备、网络、话术与开播清单确认',
  first_live_completed: '完成独立首播，需记录首播时间',
  first_live_review_completed: '首播复盘结论与改进点',
}

export function OperatorOnboardingPage() {
  const { anchorId = '' } = useParams()
  const queryClient = useQueryClient()
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [activeType, setActiveType] = useState<MilestoneType | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [firstLiveAtDraft, setFirstLiveAtDraft] = useState('')

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
      const note = noteDraft.trim()

      if (type === 'first_live_completed') {
        if (!firstLiveAtDraft) {
          throw new Error('请填写首播时间')
        }
        return apiJson(
          `/operators/me/anchors/${anchorId}/onboarding/first-live`,
          {
            method: 'POST',
            body: JSON.stringify({
              firstLiveAt: new Date(firstLiveAtDraft).toISOString(),
              note,
            }),
          },
        )
      }

      if (type === 'first_live_review_completed') {
        if (!note) {
          throw new Error('请填写首播复盘结论')
        }
        return apiJson(
          `/operators/me/anchors/${anchorId}/onboarding/first-live-review`,
          {
            method: 'POST',
            body: JSON.stringify({ note }),
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
    onSuccess: async () => {
      setActiveType(null)
      setNoteDraft('')
      setFirstLiveAtDraft('')
      setFeedback({ type: 'success', text: '节点已标记完成' })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['operator-onboarding', anchorId],
        }),
        queryClient.invalidateQueries({ queryKey: ['operator-anchors'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
    },
    onError: (error) =>
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '保存失败',
      }),
  })

  if (query.isLoading) {
    return <LoadingBlock text="正在加载岗前进度…" />
  }

  if (query.error || !query.data) {
    return (
      <div className="space-y-4">
        <Link
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600"
          to="/operator/anchors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回主播与归属
        </Link>
        <ErrorBlock
          message={
            query.error instanceof Error
              ? query.error.message
              : '岗前进度加载失败'
          }
        />
      </div>
    )
  }

  const progress = query.data.item
  const completedCount = progress.milestones.filter(
    (item) => item.status === 'completed',
  ).length
  const totalCount = progress.milestones.length
  const pct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const nextMilestone = progress.milestones.find(
    (item) => item.status === 'pending',
  )?.type
  const allDone = completedCount === totalCount

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600"
          to="/operator/anchors"
        >
          <ArrowLeft className="h-4 w-4" />
          返回主播与归属
        </Link>
        <button
          type="button"
          className="app-btn-secondary"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw
            className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`}
          />
          刷新
        </button>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">主播孵化进度</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">
          {progress.anchor.anchorDisplayName}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          已完成 {completedCount} / {totalCount} 个节点
          {allDone ? ' · 岗前流程已全部完成' : null}
        </p>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>整体进度</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className={[
                'h-full rounded-full transition-all',
                allDone ? 'bg-emerald-500' : 'bg-brand-500',
              ].join(' ')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {(progress.firstLiveAt || progress.firstReviewCompletedAt) && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {progress.firstLiveAt ? (
              <span>首播时间：{formatDateTime(progress.firstLiveAt)}</span>
            ) : null}
            {progress.firstReviewCompletedAt ? (
              <span>
                复盘完成：{formatDateTime(progress.firstReviewCompletedAt)}
              </span>
            ) : null}
          </div>
        )}

        {feedback ? (
          <p
            className={[
              'mt-4 rounded-2xl px-3 py-2 text-sm',
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700',
            ].join(' ')}
          >
            {feedback.text}
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        {progress.milestones.map((milestone, index) => {
          const done = milestone.status === 'completed'
          const canComplete =
            milestone.status === 'pending' && milestone.type === nextMilestone
          const isEditing = activeType === milestone.type

          return (
            <article
              key={milestone.type}
              className={[
                'rounded-2xl border bg-white p-5 transition',
                canComplete
                  ? 'border-brand-200 shadow-soft'
                  : done
                    ? 'border-emerald-100'
                    : 'border-slate-200',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={[
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                        done
                          ? 'bg-emerald-50 text-emerald-700'
                          : canComplete
                            ? 'bg-brand-50 text-brand-700'
                            : 'bg-slate-100 text-slate-500',
                      ].join(' ')}
                    >
                      {done ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div>
                      <p className="text-xs text-slate-400">
                        第 {index + 1} 步
                        {canComplete ? ' · 当前待完成' : null}
                      </p>
                      <h3 className="font-semibold text-slate-900">
                        {milestoneLabels[milestone.type]}
                      </h3>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {milestoneHelpers[milestone.type]}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {milestone.completedAt
                      ? `完成于 ${formatDateTime(milestone.completedAt)}`
                      : canComplete
                        ? '可在下方填写备注并标记完成'
                        : '等待前置节点完成'}
                  </p>
                  {milestone.note ? (
                    <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      备注：{milestone.note}
                    </p>
                  ) : null}
                </div>

                {!isEditing ? (
                  <button
                    type="button"
                    className={
                      canComplete ? 'app-btn-primary' : 'app-btn-secondary'
                    }
                    disabled={!canComplete || completeMutation.isPending}
                    onClick={() => {
                      setActiveType(milestone.type)
                      setNoteDraft('')
                      setFirstLiveAtDraft('')
                      setFeedback(null)
                    }}
                  >
                    {done ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        已完成
                      </>
                    ) : (
                      <>
                        <Circle className="h-4 w-4" />
                        标记完成
                      </>
                    )}
                  </button>
                ) : null}
              </div>

              {isEditing ? (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  {milestone.type === 'first_live_completed' ? (
                    <label className="block text-sm font-medium text-slate-700">
                      首播时间
                      <input
                        type="datetime-local"
                        className="mt-2 app-field"
                        value={firstLiveAtDraft}
                        onChange={(event) =>
                          setFirstLiveAtDraft(event.target.value)
                        }
                      />
                    </label>
                  ) : null}
                  <label className="block text-sm font-medium text-slate-700">
                    {milestone.type === 'first_live_review_completed'
                      ? '首播复盘结论（必填）'
                      : '备注（选填）'}
                    <textarea
                      className="mt-2 app-field min-h-[88px] resize-y"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder={
                        milestone.type === 'first_live_review_completed'
                          ? '例如：表现、问题、改进计划…'
                          : '可选补充说明'
                      }
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="app-btn-primary"
                      disabled={completeMutation.isPending}
                      onClick={() => completeMutation.mutate(milestone.type)}
                    >
                      {completeMutation.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      确认完成
                    </button>
                    <button
                      type="button"
                      className="app-btn-secondary"
                      disabled={completeMutation.isPending}
                      onClick={() => {
                        setActiveType(null)
                        setNoteDraft('')
                        setFirstLiveAtDraft('')
                      }}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </section>
    </div>
  )
}
