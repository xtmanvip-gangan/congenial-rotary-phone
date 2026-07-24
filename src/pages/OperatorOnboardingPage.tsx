import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type MilestoneType =
  | 'initial_communication'
  | 'homepage_ready'
  | 'live_software_ready'
  | 'helper_software_ready'
  | 'prejob_learning_completed'
  | 'first_live_completed'
  | 'first_live_review_completed'

type MilestoneStatus = 'pending' | 'awaiting_anchor_confirm' | 'completed'

type Milestone = {
  id: string | null
  type: MilestoneType
  label: string
  status: MilestoneStatus
  requiresAnchorConfirm: boolean
  requiresScreenshot: boolean
  completedAt: string | null
  note: string | null
  evidence: Record<string, unknown> | null
  attachmentUrls: string[]
  submittedAt: string | null
  rejectReason: string | null
}

type ProgressResponse = {
  item: {
    anchor: { id: string; anchorDisplayName: string }
    completedCount: number
    totalCount: number
    nextMilestone: MilestoneType | null
    firstLiveAt: string | null
    firstReviewCompletedAt: string | null
    initialCommunicationFields: Record<string, string>
    trainingConfirmItems: Array<{ key: string; label: string }>
    milestones: Milestone[]
  }
}

const INITIAL_FIELDS: Array<{ key: string; label: string; required?: boolean; rows?: number }> = [
  { key: 'communicatedAt', label: '沟通时间', required: true },
  { key: 'channel', label: '沟通方式（选填）' },
  { key: 'availableSchedule', label: '可直播时间', required: true, rows: 3 },
  { key: 'deviceNetwork', label: '设备与网络', required: true, rows: 3 },
  { key: 'voiceAndExpression', label: '声音与表达', required: true, rows: 3 },
  { key: 'interestsAndExperience', label: '兴趣与经历', required: true, rows: 3 },
  { key: 'liveExperience', label: '直播经验', required: true, rows: 2 },
  { key: 'learningCommitment', label: '学习与投入意愿', required: true, rows: 2 },
  { key: 'liveGoals', label: '直播目标', required: true, rows: 2 },
  { key: 'concerns', label: '担心与顾虑', required: true, rows: 2 },
  { key: 'basicConditionsJudgment', label: '基本条件判断', required: true, rows: 3 },
  { key: 'contentAdvantages', label: '内容优势判断', required: true, rows: 3 },
  { key: 'stabilityRisks', label: '稳定开播风险', required: true, rows: 3 },
  { key: 'nextPriority', label: '下次优先解决', required: true, rows: 2 },
  { key: 'escalateRisks', label: '需上报的风险/边界（选填）', rows: 2 },
  { key: 'nextStepPlan', label: '约定下一步', required: true, rows: 2 },
  { key: 'extraNote', label: '补充备注（选填）', rows: 2 },
]

const statusLabel: Record<MilestoneStatus, string> = {
  pending: '待提交',
  awaiting_anchor_confirm: '待主播确认',
  completed: '已完成',
}

const statusClass: Record<MilestoneStatus, string> = {
  pending: 'bg-slate-100 text-slate-600',
  awaiting_anchor_confirm: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
}

export function OperatorOnboardingPage() {
  const { anchorId = '' } = useParams()
  const queryClient = useQueryClient()
  const [activeType, setActiveType] = useState<MilestoneType | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const query = useQuery({
    queryKey: ['operator-onboarding', anchorId],
    queryFn: () =>
      apiJson<ProgressResponse>(
        `/operators/me/anchors/${anchorId}/onboarding`,
      ),
    enabled: Boolean(anchorId),
  })

  const submitMutation = useMutation({
    mutationFn: (payload: {
      type: MilestoneType
      evidence?: Record<string, unknown>
      attachmentUrls?: string[]
      note?: string
    }) =>
      apiJson(`/operators/me/anchors/${anchorId}/onboarding/${payload.type}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          evidence: payload.evidence,
          attachmentUrls: payload.attachmentUrls,
          note: payload.note,
        }),
      }),
    onSuccess: async () => {
      setActiveType(null)
      setForm({})
      setAttachmentUrls([])
      setFeedback({ type: 'success', text: '已提交' })
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
        text: error instanceof Error ? error.message : '提交失败',
      }),
  })

  const progress = query.data?.item
  const nextType = progress?.nextMilestone ?? null

  const helpers = useMemo(
    () => ({
      initial_communication: '填写情况记录表，提交后等待主播确认',
      homepage_ready: '上传主页截图（至少 1 张），提交即完成',
      live_software_ready: '上传直播软件截图，提交即完成',
      helper_software_ready: '上传辅助软件截图，提交即完成',
      prejob_learning_completed: '标记培训完成并写说明，提交后主播勾选 10 项确认',
      first_live_completed: '上传首播截图，提交即完成',
      first_live_review_completed: '填写复盘结论，提交后等待主播确认',
    }),
    [],
  )

  function beginEdit(milestone: Milestone) {
    if (milestone.status === 'completed' || milestone.status === 'awaiting_anchor_confirm') {
      return
    }
    if (milestone.type !== nextType) {
      setFeedback({ type: 'error', text: '请按顺序完成上一节点' })
      return
    }
    setActiveType(milestone.type)
    setFeedback(null)
    const evidence = (milestone.evidence as Record<string, string>) ?? {}
    if (milestone.type === 'initial_communication') {
      setForm({
        communicatedAt: evidence.communicatedAt ?? '',
        channel: evidence.channel ?? '',
        availableSchedule: evidence.availableSchedule ?? '',
        deviceNetwork: evidence.deviceNetwork ?? '',
        voiceAndExpression: evidence.voiceAndExpression ?? '',
        interestsAndExperience: evidence.interestsAndExperience ?? '',
        liveExperience: evidence.liveExperience ?? '',
        learningCommitment: evidence.learningCommitment ?? '',
        liveGoals: evidence.liveGoals ?? '',
        concerns: evidence.concerns ?? '',
        basicConditionsJudgment: evidence.basicConditionsJudgment ?? '',
        contentAdvantages: evidence.contentAdvantages ?? '',
        stabilityRisks: evidence.stabilityRisks ?? '',
        nextPriority: evidence.nextPriority ?? '',
        escalateRisks: evidence.escalateRisks ?? '',
        nextStepPlan: evidence.nextStepPlan ?? '',
        extraNote: evidence.extraNote ?? '',
      })
    } else if (milestone.type === 'prejob_learning_completed') {
      setForm({
        trainedAt: String(evidence.trainedAt ?? ''),
        trainerName: String(evidence.trainerName ?? ''),
        learningNote: String(evidence.learningNote ?? milestone.note ?? ''),
        materialsDelivered: evidence.materialsDelivered ? '1' : '',
      })
    } else if (milestone.type === 'first_live_review_completed') {
      setForm({
        reviewConclusion: String(
          evidence.reviewConclusion ?? milestone.note ?? '',
        ),
      })
    } else {
      setForm({})
    }
    setAttachmentUrls(milestone.attachmentUrls ?? [])
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      const nextUrls: string[] = []
      for (const file of Array.from(files)) {
        const base64Data = await fileToBase64(file)
        const result = await apiJson<{
          items: Array<{ fileUrl: string }>
        }>(`/operators/me/anchors/${anchorId}/onboarding/upload-images`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: file.name,
            mimeType: file.type || 'image/png',
            base64Data,
          }),
        })
        if (result.items[0]?.fileUrl) {
          nextUrls.push(result.items[0].fileUrl)
        }
      }
      setAttachmentUrls((current) => [...current, ...nextUrls])
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '上传失败',
      })
    } finally {
      setUploading(false)
    }
  }

  function submitActive() {
    if (!activeType) return
    if (activeType === 'initial_communication') {
      submitMutation.mutate({ type: activeType, evidence: form })
      return
    }
    if (
      activeType === 'homepage_ready' ||
      activeType === 'live_software_ready' ||
      activeType === 'helper_software_ready' ||
      activeType === 'first_live_completed'
    ) {
      submitMutation.mutate({ type: activeType, attachmentUrls })
      return
    }
    if (activeType === 'prejob_learning_completed') {
      submitMutation.mutate({
        type: activeType,
        evidence: {
          trainedAt: form.trainedAt,
          trainerName: form.trainerName,
          learningNote: form.learningNote,
          materialsDelivered: form.materialsDelivered === '1',
        },
        note: form.learningNote,
      })
      return
    }
    if (activeType === 'first_live_review_completed') {
      submitMutation.mutate({
        type: activeType,
        evidence: { reviewConclusion: form.reviewConclusion },
        note: form.reviewConclusion,
      })
    }
  }

  if (query.isLoading) {
    return <LoadingBlock text="正在加载岗前进度…" />
  }

  if (query.error || !progress) {
    return (
      <div className="space-y-4">
        <BackLink />
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

  const pct =
    progress.totalCount > 0
      ? Math.round((progress.completedCount / progress.totalCount) * 100)
      : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink />
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
          已完成 {progress.completedCount} / {progress.totalCount} 个节点
          （运营接收不计入进度）
        </p>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>整体进度</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
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
          const canEdit =
            milestone.type === nextType &&
            milestone.status !== 'completed' &&
            milestone.status !== 'awaiting_anchor_confirm'
          const isEditing = activeType === milestone.type

          return (
            <article
              key={milestone.type}
              className={[
                'rounded-2xl border bg-white p-5',
                canEdit
                  ? 'border-brand-200 shadow-soft'
                  : milestone.status === 'completed'
                    ? 'border-emerald-100'
                    : 'border-slate-200',
              ].join(' ')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <h3 className="font-semibold text-slate-900">
                      {milestone.label}
                    </h3>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass[milestone.status]}`}
                    >
                      {statusLabel[milestone.status]}
                    </span>
                    {milestone.requiresAnchorConfirm ? (
                      <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-sky-700">
                        需主播确认
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {helpers[milestone.type]}
                  </p>
                  {milestone.rejectReason ? (
                    <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      主播驳回：{milestone.rejectReason}
                    </p>
                  ) : null}
                  {milestone.completedAt ? (
                    <p className="mt-1 text-xs text-slate-400">
                      完成于 {formatDateTime(milestone.completedAt)}
                    </p>
                  ) : null}
                  {milestone.submittedAt &&
                  milestone.status === 'awaiting_anchor_confirm' ? (
                    <p className="mt-1 text-xs text-amber-600">
                      已于 {formatDateTime(milestone.submittedAt)} 提交，等待主播确认
                    </p>
                  ) : null}
                  {milestone.attachmentUrls.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {milestone.attachmentUrls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-brand-600 underline"
                        >
                          查看截图
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {milestone.evidence && milestone.status !== 'pending' ? (
                    <EvidencePreview
                      type={milestone.type}
                      evidence={milestone.evidence}
                    />
                  ) : null}
                </div>

                {!isEditing ? (
                  <button
                    type="button"
                    className={canEdit ? 'app-btn-primary' : 'app-btn-secondary'}
                    disabled={!canEdit || submitMutation.isPending}
                    onClick={() => beginEdit(milestone)}
                  >
                    {milestone.status === 'completed' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        已完成
                      </>
                    ) : milestone.status === 'awaiting_anchor_confirm' ? (
                      '等待确认'
                    ) : canEdit ? (
                      '填写/提交'
                    ) : (
                      '等待前置'
                    )}
                  </button>
                ) : null}
              </div>

              {isEditing ? (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  {activeType === 'initial_communication' ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {INITIAL_FIELDS.map((field) => (
                        <label
                          key={field.key}
                          className={[
                            'block text-sm font-medium text-slate-700',
                            field.key === 'communicatedAt' || field.key === 'channel'
                              ? ''
                              : 'md:col-span-2',
                          ].join(' ')}
                        >
                          {field.label}
                          {field.key === 'communicatedAt' ? (
                            <input
                              type="datetime-local"
                              className="mt-2 app-field"
                              value={form[field.key] ?? ''}
                              onChange={(e) =>
                                setForm((c) => ({
                                  ...c,
                                  [field.key]: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            <textarea
                              className="mt-2 app-field resize-y"
                              rows={field.rows ?? 2}
                              value={form[field.key] ?? ''}
                              onChange={(e) =>
                                setForm((c) => ({
                                  ...c,
                                  [field.key]: e.target.value,
                                }))
                              }
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  ) : null}

                  {activeType === 'prejob_learning_completed' ? (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">
                        培训完成时间
                        <input
                          type="datetime-local"
                          className="mt-2 app-field"
                          value={form.trainedAt ?? ''}
                          onChange={(e) =>
                            setForm((c) => ({ ...c, trainedAt: e.target.value }))
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        授课老师（选填）
                        <input
                          className="mt-2 app-field"
                          value={form.trainerName ?? ''}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              trainerName: e.target.value,
                            }))
                          }
                        />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        学习完成说明
                        <textarea
                          className="mt-2 app-field min-h-[100px] resize-y"
                          value={form.learningNote ?? ''}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              learningNote: e.target.value,
                            }))
                          }
                          placeholder="培训内容、是否补训、材料是否已发等"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={form.materialsDelivered === '1'}
                          onChange={(e) =>
                            setForm((c) => ({
                              ...c,
                              materialsDelivered: e.target.checked ? '1' : '',
                            }))
                          }
                        />
                        已下发培训手册 / 直播脚本
                      </label>
                      <p className="text-xs text-slate-500">
                        提交后，主播需在小程序确认 10 项培训清单。
                      </p>
                    </div>
                  ) : null}

                  {activeType === 'first_live_review_completed' ? (
                    <label className="block text-sm font-medium text-slate-700">
                      复盘结论
                      <textarea
                        className="mt-2 app-field min-h-[120px] resize-y"
                        value={form.reviewConclusion ?? ''}
                        onChange={(e) =>
                          setForm((c) => ({
                            ...c,
                            reviewConclusion: e.target.value,
                          }))
                        }
                        placeholder="表现、问题、改进计划…"
                      />
                    </label>
                  ) : null}

                  {activeType &&
                  (activeType === 'homepage_ready' ||
                    activeType === 'live_software_ready' ||
                    activeType === 'helper_software_ready' ||
                    activeType === 'first_live_completed') ? (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-slate-700">
                        上传截图（至少 1 张）
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="mt-2 block w-full text-sm"
                          disabled={uploading}
                          onChange={(e) => void uploadFiles(e.target.files)}
                        />
                      </label>
                      {uploading ? (
                        <p className="flex items-center gap-2 text-sm text-slate-500">
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          上传中…
                        </p>
                      ) : null}
                      {attachmentUrls.length > 0 ? (
                        <ul className="space-y-1 text-sm text-slate-600">
                          {attachmentUrls.map((url, index) => (
                            <li
                              key={url}
                              className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                            >
                              <span className="truncate">截图 {index + 1}</span>
                              <button
                                type="button"
                                className="text-rose-600"
                                onClick={() =>
                                  setAttachmentUrls((c) =>
                                    c.filter((item) => item !== url),
                                  )
                                }
                              >
                                移除
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="flex items-center gap-2 text-xs text-slate-400">
                          <ImagePlus className="h-3.5 w-3.5" />
                          尚未选择截图
                        </p>
                      )}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="app-btn-primary"
                      disabled={submitMutation.isPending || uploading}
                      onClick={submitActive}
                    >
                      {submitMutation.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      提交
                    </button>
                    <button
                      type="button"
                      className="app-btn-secondary"
                      disabled={submitMutation.isPending}
                      onClick={() => {
                        setActiveType(null)
                        setForm({})
                        setAttachmentUrls([])
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

function BackLink() {
  return (
    <Link
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600"
      to="/operator/anchors"
    >
      <ArrowLeft className="h-4 w-4" />
      返回主播与归属
    </Link>
  )
}

function EvidencePreview({
  type,
  evidence,
}: {
  type: MilestoneType
  evidence: Record<string, unknown>
}) {
  if (type === 'initial_communication') {
    return (
      <div className="mt-3 grid gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {Object.entries(evidence)
          .filter(([, v]) => typeof v === 'string' && v)
          .slice(0, 6)
          .map(([k, v]) => (
            <p key={k}>
              <span className="text-slate-400">{k}：</span>
              {String(v).slice(0, 80)}
            </p>
          ))}
      </div>
    )
  }
  if (type === 'prejob_learning_completed') {
    return (
      <p className="mt-2 text-sm text-slate-600">
        培训说明：{String(evidence.learningNote ?? '—')}
      </p>
    )
  }
  if (type === 'first_live_review_completed') {
    return (
      <p className="mt-2 text-sm text-slate-600">
        复盘：{String(evidence.reviewConclusion ?? '—')}
      </p>
    )
  }
  return null
}

async function fileToBase64(file: File) {
  const buffer = await file.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}
