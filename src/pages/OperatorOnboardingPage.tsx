import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson, getApiBaseUrl, uploadFilesXhr } from '../lib/api'
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

type FormMeta = {
  channelOptions: string[]
  deviceNetworkOptions: string[]
  voiceTraitOptions: string[]
  liveExperienceOptions: string[]
  learningCommitmentOptions: string[]
  liveGoalOptions: string[]
  fieldLabels: Record<string, string>
}

type ProgressResponse = {
  item: {
    anchor: { id: string; anchorDisplayName: string }
    completedCount: number
    totalCount: number
    nextMilestone: MilestoneType | null
    firstLiveAt: string | null
    firstReviewCompletedAt: string | null
    initialCommunicationForm?: FormMeta
    trainingConfirmItems: Array<{ key: string; label: string }>
    milestones: Milestone[]
  }
}

type InitialFormState = {
  communicatedAt: string
  channel: string
  availableScheduleStart: string
  availableScheduleEnd: string
  deviceNetwork: string
  voiceTraits: string[]
  interestsAndExperience: string
  liveExperience: string
  learningCommitment: string
  liveGoals: string[]
  concerns: string
  contentRecommendation: string
  basicConditionsJudgment: string
  stabilityRisks: string
}

const emptyInitialForm: InitialFormState = {
  communicatedAt: '',
  channel: '',
  availableScheduleStart: '',
  availableScheduleEnd: '',
  deviceNetwork: '',
  voiceTraits: [],
  interestsAndExperience: '',
  liveExperience: '',
  learningCommitment: '',
  liveGoals: [],
  concerns: '',
  contentRecommendation: '',
  basicConditionsJudgment: '',
  stabilityRisks: '',
}

const DEFAULT_FORM_META: FormMeta = {
  channelOptions: ['电话', '文字', '语音'],
  deviceNetworkOptions: [
    '电脑 + 声卡',
    '手机 + 耳机',
    '仅手机',
    '手机 + 外接声卡',
  ],
  voiceTraitOptions: [
    '低沉舒缓',
    '明亮清脆',
    '温柔细腻',
    '磁性有力',
    '偏沙哑/烟嗓',
    '吐字清晰、语速适中',
    '尚不稳定/需练声',
    '其他',
  ],
  liveExperienceOptions: [
    '零基础，未播过',
    '试播过几次',
    '有过短期开播（不足1个月）',
    '有过稳定开播经验',
    '其他平台有经验，抖音新号',
  ],
  learningCommitmentOptions: [
    '很高：可每天学练与复盘',
    '较高：每周固定几天可投入',
    '一般：时间碎，需压缩任务',
    '偏弱：目前难保证学习节奏',
    '暂不明确',
  ],
  liveGoalOptions: [
    '增加收入',
    '表达/展示自己',
    '陪伴他人、做情绪价值',
    '多一个发展方向/副业',
    '先验证适不适合',
    '其他',
  ],
  fieldLabels: {},
}

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
  const [initialForm, setInitialForm] =
    useState<InitialFormState>(emptyInitialForm)
  const [extraForm, setExtraForm] = useState<Record<string, string>>({})
  const [attachmentUrls, setAttachmentUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
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
      apiJson(
        `/operators/me/anchors/${anchorId}/onboarding/${payload.type}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({
            evidence: payload.evidence,
            attachmentUrls: payload.attachmentUrls,
            note: payload.note,
          }),
        },
      ),
    onSuccess: async () => {
      setActiveType(null)
      setInitialForm(emptyInitialForm)
      setExtraForm({})
      setAttachmentUrls([])
      setFeedback({
        type: 'success',
        text: '已提交；主播确认前仍可修改后重新提交',
      })
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
  const formMeta = progress?.initialCommunicationForm ?? DEFAULT_FORM_META
  const nextType = progress?.nextMilestone ?? null

  const helpers = useMemo(
    () => ({
      initial_communication:
        '结构化填写情况记录；基本条件/风险可点 AI 草稿后人工确认',
      homepage_ready: '上传主页截图（至少 1 张），提交即完成',
      live_software_ready: '上传直播软件截图，提交即完成',
      helper_software_ready: '上传辅助软件截图，提交即完成',
      prejob_learning_completed:
        '填写培训完成时间并勾选材料下发，提交后主播勾选 10 项确认',
      first_live_completed: '上传首播截图，提交即完成',
      first_live_review_completed: '填写复盘结论，提交后等待主播确认',
    }),
    [],
  )

  function beginEdit(milestone: Milestone) {
    if (milestone.status === 'completed') {
      return
    }
    // 待主播确认：允许运营修改重提；其它未完成节点仍须按序
    if (
      milestone.status !== 'awaiting_anchor_confirm' &&
      milestone.type !== nextType
    ) {
      setFeedback({ type: 'error', text: '请按顺序完成上一节点' })
      return
    }
    setActiveType(milestone.type)
    setFeedback(null)
    const evidence = (milestone.evidence as Record<string, unknown>) ?? {}
    if (milestone.type === 'initial_communication') {
      setInitialForm({
        communicatedAt: String(evidence.communicatedAt ?? ''),
        channel: String(evidence.channel ?? ''),
        availableScheduleStart: String(evidence.availableScheduleStart ?? ''),
        availableScheduleEnd: String(evidence.availableScheduleEnd ?? ''),
        deviceNetwork: String(evidence.deviceNetwork ?? ''),
        voiceTraits: Array.isArray(evidence.voiceTraits)
          ? evidence.voiceTraits.map(String)
          : [],
        interestsAndExperience: String(evidence.interestsAndExperience ?? ''),
        liveExperience: String(evidence.liveExperience ?? ''),
        learningCommitment: String(evidence.learningCommitment ?? ''),
        liveGoals: Array.isArray(evidence.liveGoals)
          ? evidence.liveGoals.map(String)
          : [],
        concerns: String(evidence.concerns ?? ''),
        contentRecommendation: String(evidence.contentRecommendation ?? ''),
        basicConditionsJudgment: String(evidence.basicConditionsJudgment ?? ''),
        stabilityRisks: String(evidence.stabilityRisks ?? ''),
      })
    } else if (milestone.type === 'prejob_learning_completed') {
      setExtraForm({
        trainedAt: String(evidence.trainedAt ?? ''),
        materialsDelivered: evidence.materialsDelivered ? '1' : '',
      })
    } else if (milestone.type === 'first_live_review_completed') {
      setExtraForm({
        reviewConclusion: String(
          evidence.reviewConclusion ?? milestone.note ?? '',
        ),
      })
    } else {
      setExtraForm({})
    }
    setAttachmentUrls(milestone.attachmentUrls ?? [])
  }

  function toggleMulti(
    field: 'voiceTraits' | 'liveGoals',
    option: string,
  ) {
    setInitialForm((current) => {
      const list = current[field]
      const next = list.includes(option)
        ? list.filter((item) => item !== option)
        : [...list, option]
      return { ...current, [field]: next }
    })
  }

  async function generateAiDraft() {
    setAiLoading(true)
    setFeedback(null)
    try {
      const result = await apiJson<{
        item: {
          basicConditionsJudgment: string
          stabilityRisks: string
          source: 'ai' | 'template'
        }
      }>(
        `/operators/me/anchors/${anchorId}/onboarding/initial-communication/ai-draft`,
        {
          method: 'POST',
          body: JSON.stringify({ evidence: initialForm }),
        },
      )
      setInitialForm((current) => ({
        ...current,
        basicConditionsJudgment: result.item.basicConditionsJudgment,
        stabilityRisks: result.item.stabilityRisks,
      }))
      setFeedback({
        type: 'success',
        text:
          result.item.source === 'ai'
            ? '已生成 AI 草稿，请核对后修改再提交'
            : '已生成模板草稿（未配置 AI Key），请核对修改后提交',
      })
    } catch (error) {
      setFeedback({
        type: 'error',
        text: error instanceof Error ? error.message : '生成草稿失败',
      })
    } finally {
      setAiLoading(false)
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setFeedback(null)
    try {
      const formData = new FormData()
      let count = 0
      for (const file of Array.from(files)) {
        if (file.type && !file.type.startsWith('image/')) {
          throw new Error(`不支持的文件类型：${file.type || file.name}`)
        }
        // 压缩后以 multipart 上传（企微内置浏览器比 base64 JSON 更稳）
        const prepared = await compressImageToBlob(file)
        formData.append('files', prepared.blob, prepared.fileName)
        count += 1
      }

      const result = await uploadFilesXhr<{
        items: Array<{ fileUrl: string }>
      }>(
        `/operators/me/anchors/${anchorId}/onboarding/upload-images`,
        formData,
        1,
      )

      const nextUrls = (result.items ?? [])
        .map((item) => item.fileUrl)
        .filter(Boolean)
      if (nextUrls.length === 0) {
        throw new Error('上传成功但未返回图片地址，请重试')
      }
      setAttachmentUrls((current) => [...current, ...nextUrls])
      setFeedback({
        type: 'success',
        text: `已上传 ${nextUrls.length} 张截图（共选 ${count} 张）`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败'
      setFeedback({
        type: 'error',
        text:
          message.includes('413') || message.includes('过大')
            ? '图片过大，请换更小的截图'
            : message.includes('Load failed') ||
                message.includes('网络请求失败') ||
                message.includes('Failed to fetch')
              ? '企微内上传失败，已切换为文件直传；请再试一次或用外部浏览器'
              : message,
      })
    } finally {
      setUploading(false)
    }
  }

  function submitActive() {
    if (!activeType) return
    if (activeType === 'initial_communication') {
      submitMutation.mutate({ type: activeType, evidence: initialForm })
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
          trainedAt: extraForm.trainedAt,
          materialsDelivered: extraForm.materialsDelivered === '1',
        },
      })
      return
    }
    if (activeType === 'first_live_review_completed') {
      submitMutation.mutate({
        type: activeType,
        evidence: { reviewConclusion: extraForm.reviewConclusion },
        note: extraForm.reviewConclusion,
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
            milestone.status !== 'completed' &&
            (milestone.status === 'awaiting_anchor_confirm' ||
              milestone.type === nextType)
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
                      已于 {formatDateTime(milestone.submittedAt)}{' '}
                      提交，等待主播确认
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
                  {milestone.evidence &&
                  milestone.status !== 'pending' &&
                  milestone.type !== 'initial_communication' ? (
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
                      '修改重提'
                    ) : canEdit ? (
                      '填写/提交'
                    ) : (
                      '等待前置'
                    )}
                  </button>
                ) : null}
              </div>

              {isEditing && activeType === 'initial_communication' ? (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-700">
                      沟通时间
                      <input
                        type="datetime-local"
                        className="mt-2 app-field"
                        value={initialForm.communicatedAt}
                        onChange={(e) =>
                          setInitialForm((c) => ({
                            ...c,
                            communicatedAt: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <fieldset className="block text-sm font-medium text-slate-700">
                      <legend>沟通方式</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {formMeta.channelOptions.map((option) => (
                          <OptionChip
                            key={option}
                            active={initialForm.channel === option}
                            label={option}
                            onClick={() =>
                              setInitialForm((c) => ({
                                ...c,
                                channel: option,
                              }))
                            }
                          />
                        ))}
                      </div>
                    </fieldset>
                    <label className="block text-sm font-medium text-slate-700">
                      可直播开始时间
                      <input
                        type="time"
                        className="mt-2 app-field"
                        value={initialForm.availableScheduleStart}
                        onChange={(e) =>
                          setInitialForm((c) => ({
                            ...c,
                            availableScheduleStart: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      可直播结束时间
                      <input
                        type="time"
                        className="mt-2 app-field"
                        value={initialForm.availableScheduleEnd}
                        onChange={(e) =>
                          setInitialForm((c) => ({
                            ...c,
                            availableScheduleEnd: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <fieldset className="text-sm font-medium text-slate-700">
                    <legend>设备与网络</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {formMeta.deviceNetworkOptions.map((option) => (
                        <OptionChip
                          key={option}
                          active={initialForm.deviceNetwork === option}
                          label={option}
                          onClick={() =>
                            setInitialForm((c) => ({
                              ...c,
                              deviceNetwork: option,
                            }))
                          }
                        />
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="text-sm font-medium text-slate-700">
                    <legend>声音特点（可多选）</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {formMeta.voiceTraitOptions.map((option) => (
                        <OptionChip
                          key={option}
                          active={initialForm.voiceTraits.includes(option)}
                          label={option}
                          onClick={() => toggleMulti('voiceTraits', option)}
                        />
                      ))}
                    </div>
                  </fieldset>

                  <label className="block text-sm font-medium text-slate-700">
                    兴趣经历
                    <textarea
                      className="mt-2 app-field min-h-[88px] resize-y"
                      value={initialForm.interestsAndExperience}
                      onChange={(e) =>
                        setInitialForm((c) => ({
                          ...c,
                          interestsAndExperience: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <fieldset className="text-sm font-medium text-slate-700">
                    <legend>直播经验</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {formMeta.liveExperienceOptions.map((option) => (
                        <OptionChip
                          key={option}
                          active={initialForm.liveExperience === option}
                          label={option}
                          onClick={() =>
                            setInitialForm((c) => ({
                              ...c,
                              liveExperience: option,
                            }))
                          }
                        />
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="text-sm font-medium text-slate-700">
                    <legend>学习与投入意愿</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {formMeta.learningCommitmentOptions.map((option) => (
                        <OptionChip
                          key={option}
                          active={initialForm.learningCommitment === option}
                          label={option}
                          onClick={() =>
                            setInitialForm((c) => ({
                              ...c,
                              learningCommitment: option,
                            }))
                          }
                        />
                      ))}
                    </div>
                  </fieldset>

                  <fieldset className="text-sm font-medium text-slate-700">
                    <legend>直播目标（可多选）</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {formMeta.liveGoalOptions.map((option) => (
                        <OptionChip
                          key={option}
                          active={initialForm.liveGoals.includes(option)}
                          label={option}
                          onClick={() => toggleMulti('liveGoals', option)}
                        />
                      ))}
                    </div>
                  </fieldset>

                  <label className="block text-sm font-medium text-slate-700">
                    担心顾虑
                    <textarea
                      className="mt-2 app-field min-h-[80px] resize-y"
                      value={initialForm.concerns}
                      onChange={(e) =>
                        setInitialForm((c) => ({
                          ...c,
                          concerns: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    内容推荐
                    <textarea
                      className="mt-2 app-field min-h-[80px] resize-y"
                      value={initialForm.contentRecommendation}
                      onChange={(e) =>
                        setInitialForm((c) => ({
                          ...c,
                          contentRecommendation: e.target.value,
                        }))
                      }
                      placeholder="建议的内容方向、人设或选题"
                    />
                  </label>

                  <div className="rounded-2xl border border-brand-100 bg-brand-50/40 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          条件与风险判断
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          可先生成草稿，再人工修改确认后提交
                        </p>
                      </div>
                      <button
                        type="button"
                        className="app-btn-secondary"
                        disabled={aiLoading}
                        onClick={() => void generateAiDraft()}
                      >
                        {aiLoading ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        生成 AI 草稿
                      </button>
                    </div>
                    <label className="mt-3 block text-sm font-medium text-slate-700">
                      基本条件判断
                      <textarea
                        className="mt-2 app-field min-h-[96px] resize-y bg-white"
                        value={initialForm.basicConditionsJudgment}
                        onChange={(e) =>
                          setInitialForm((c) => ({
                            ...c,
                            basicConditionsJudgment: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="mt-3 block text-sm font-medium text-slate-700">
                      稳定开播风险
                      <textarea
                        className="mt-2 app-field min-h-[96px] resize-y bg-white"
                        value={initialForm.stabilityRisks}
                        onChange={(e) =>
                          setInitialForm((c) => ({
                            ...c,
                            stabilityRisks: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <FormActions
                    busy={submitMutation.isPending || aiLoading}
                    onSubmit={submitActive}
                    onCancel={() => {
                      setActiveType(null)
                      setInitialForm(emptyInitialForm)
                    }}
                  />
                </div>
              ) : null}

              {isEditing && activeType === 'prejob_learning_completed' ? (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <label className="block text-sm font-medium text-slate-700">
                    培训完成时间
                    <input
                      type="datetime-local"
                      className="mt-2 app-field"
                      value={extraForm.trainedAt ?? ''}
                      onChange={(e) =>
                        setExtraForm((c) => ({
                          ...c,
                          trainedAt: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={extraForm.materialsDelivered === '1'}
                      onChange={(e) =>
                        setExtraForm((c) => ({
                          ...c,
                          materialsDelivered: e.target.checked ? '1' : '',
                        }))
                      }
                    />
                    已下发培训手册 / 直播脚本
                  </label>
                  <p className="text-xs text-slate-500">
                    提交后，主播需在小程序勾选 10 项培训确认清单。
                  </p>
                  <FormActions
                    busy={submitMutation.isPending}
                    onSubmit={submitActive}
                    onCancel={() => {
                      setActiveType(null)
                      setExtraForm({})
                    }}
                  />
                </div>
              ) : null}

              {isEditing && activeType === 'first_live_review_completed' ? (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <label className="block text-sm font-medium text-slate-700">
                    复盘结论
                    <textarea
                      className="mt-2 app-field min-h-[120px] resize-y"
                      value={extraForm.reviewConclusion ?? ''}
                      onChange={(e) =>
                        setExtraForm((c) => ({
                          ...c,
                          reviewConclusion: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <FormActions
                    busy={submitMutation.isPending}
                    onSubmit={submitActive}
                    onCancel={() => {
                      setActiveType(null)
                      setExtraForm({})
                    }}
                  />
                </div>
              ) : null}

              {isEditing &&
              (activeType === 'homepage_ready' ||
                activeType === 'live_software_ready' ||
                activeType === 'helper_software_ready' ||
                activeType === 'first_live_completed') ? (
                <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                  <ScreenshotUploadZone
                    uploading={uploading}
                    attachmentUrls={attachmentUrls}
                    onPick={(files) => void uploadFiles(files)}
                    onRemove={(url) =>
                      setAttachmentUrls((c) => c.filter((item) => item !== url))
                    }
                  />
                  <FormActions
                    busy={submitMutation.isPending || uploading}
                    onSubmit={submitActive}
                    onCancel={() => {
                      setActiveType(null)
                      setAttachmentUrls([])
                    }}
                  />
                </div>
              ) : null}
            </article>
          )
        })}
      </section>
    </div>
  )
}

function OptionChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full px-3 py-1.5 text-xs font-medium transition',
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function FormActions({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  onSubmit: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="app-btn-primary"
        disabled={busy}
        onClick={onSubmit}
      >
        {busy ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        提交
      </button>
      <button
        type="button"
        className="app-btn-secondary"
        disabled={busy}
        onClick={onCancel}
      >
        取消
      </button>
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
  // 初次沟通不在卡片摘要展示正文，需点「修改重提」查看/编辑
  if (type === 'prejob_learning_completed') {
    return (
      <p className="mt-2 text-sm text-slate-600">
        培训完成：{String(evidence.trainedAt ?? '—')}
        {evidence.materialsDelivered ? ' · 已下发手册/脚本' : ''}
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

function ScreenshotUploadZone({
  uploading,
  attachmentUrls,
  onPick,
  onRemove,
}: {
  uploading: boolean
  attachmentUrls: string[]
  onPick: (files: FileList | null) => void
  onRemove: (url: string) => void
}) {
  const inputId = useId()
  const [dragOver, setDragOver] = useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">上传截图</p>
          <p className="mt-0.5 text-xs text-slate-500">
            手机竖屏 9:16 截图更清晰；左侧上传，右侧预览
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs tabular-nums text-slate-600">
          已选 {attachmentUrls.length} 张
        </span>
      </div>

      {/* 左上传 / 右预览（小屏上下堆叠） */}
      <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
        <label
          htmlFor={inputId}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (!uploading) onPick(e.dataTransfer.files)
          }}
          className={[
            'flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 transition md:min-h-[360px]',
            dragOver
              ? 'border-brand-400 bg-brand-50'
              : 'border-slate-200 bg-slate-50/80 hover:border-brand-300 hover:bg-brand-50/40',
            uploading ? 'pointer-events-none opacity-70' : '',
          ].join(' ')}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200">
            {uploading ? (
              <LoaderCircle className="h-5 w-5 animate-spin" />
            ) : (
              <ImagePlus className="h-5 w-5" />
            )}
          </span>
          <p className="mt-3 text-center text-sm font-medium text-slate-800">
            {uploading ? '正在压缩并上传…' : '点击选择图片'}
          </p>
          <p className="mt-1 max-w-[14rem] text-center text-xs leading-5 text-slate-500">
            支持拖拽 · 可多选
            <br />
            建议竖屏 9:16 完整截图
          </p>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              onPick(e.target.files)
              e.target.value = ''
            }}
          />
        </label>

        <div className="flex min-h-[280px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm md:min-h-[360px]">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold text-slate-700">预览</p>
            <p className="text-[11px] text-slate-400">竖屏 9:16 比例展示</p>
          </div>

          {attachmentUrls.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-2">
                {attachmentUrls.map((url, index) => (
                  <div
                    key={url}
                    className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                  >
                    <a
                      href={resolveUploadUrl(url)}
                      target="_blank"
                      rel="noreferrer"
                      className="relative block aspect-[9/16] bg-slate-100"
                      title="点击查看原图"
                    >
                      <img
                        src={resolveUploadUrl(url)}
                        alt={`截图 ${index + 1}`}
                        className="absolute inset-0 h-full w-full object-cover object-top"
                      />
                    </a>
                    <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                      <span className="text-[11px] font-medium text-slate-600">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        className="text-[11px] font-medium text-rose-600 hover:text-rose-700"
                        onClick={() => onRemove(url)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-slate-50 px-4 text-center">
              <div className="w-16 overflow-hidden rounded-lg border border-dashed border-slate-200 bg-white shadow-sm">
                <div className="aspect-[9/16] bg-gradient-to-b from-slate-50 to-slate-100" />
              </div>
              <p className="mt-3 text-xs text-slate-500">
                上传后在此预览竖屏截图
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function resolveUploadUrl(url: string) {
  if (!url) return ''
  if (/^https?:\/\//.test(url)) return url
  // /api/uploads/... → 相对当前站点
  if (url.startsWith('/api/')) return url
  return `${getApiBaseUrl()}${url.startsWith('/') ? '' : '/'}${url}`
}

/** 压缩为 Blob，走 multipart，避免企微 Load failed */
async function compressImageToBlob(file: File): Promise<{
  fileName: string
  blob: Blob
}> {
  const maxEdge = 1600
  const quality = 0.82
  const baseName = (file.name || 'screenshot').replace(/\.[^.]+$/, '')

  // 小图直接上传，减少 canvas 兼容问题
  if (file.size > 0 && file.size < 400 * 1024 && file.type.startsWith('image/')) {
    return { fileName: file.name || `${baseName}.jpg`, blob: file }
  }

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('图片解码失败，请换一张截图'))
      img.src = dataUrl
    })

    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return { fileName: file.name || `${baseName}.jpg`, blob: file }
    }
    ctx.drawImage(image, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/jpeg', quality)
    })

    if (!blob) {
      return { fileName: file.name || `${baseName}.jpg`, blob: file }
    }

    return {
      fileName: `${baseName}.jpg`,
      blob,
    }
  } catch {
    // 企微等环境 canvas 异常时退回原文件 multipart
    return { fileName: file.name || `${baseName}.jpg`, blob: file }
  }
}
