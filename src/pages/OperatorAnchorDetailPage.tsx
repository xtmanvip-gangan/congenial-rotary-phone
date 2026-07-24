import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ClipboardList,
  Gift,
  MessageCircle,
  RefreshCw,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AnchorStatusSelect } from '../components/AnchorStatusSelect'
import {
  DailyReviewPanel,
  type DailyReviewItem,
} from '../components/DailyReviewPanel'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type TabKey = 'profile' | 'gifts' | 'training' | 'reviews' | 'qa'

type QaItem = {
  id: string
  qaAt: string
  question: string
  reply: string
  resultFollowUp: string | null
  followUpDueAt: string
  followUpStatus: 'done' | 'pending' | 'overdue'
  followUpDays: number
}

type Milestone = {
  type: string
  label: string
  status: string
  completedAt: string | null
  submittedAt: string | null
  note: string | null
  evidence: Record<string, unknown> | null
  attachmentUrls: string[]
  rejectReason: string | null
}

type AnchorDetail = {
  profile: {
    id: string
    wecomName: string
    wecomUserId: string
    anchorDisplayName: string
    assignmentStatus: string | null
    status: string
    liveStatus?: string
    firstLiveAt?: string | null
    incubationDays?: number
    activatedAt: string
    membershipCompletedAt: string | null
    source: string
    createdAt: string
    updatedAt: string
    operator?: { id: string; displayName: string } | null
  }
  evidenceFieldLabels?: Record<string, string>
  assignmentHistory: Array<{
    id: string
    status: string
    operator: { id: string; displayName: string }
    startedAt: string | null
    endedAt: string | null
    reason: string | null
    createdAt: string
  }>
  nameHistory: Array<{
    id: string
    oldName: string
    newName: string
    changedByType: string
    createdAt: string
  }>
  onboarding: {
    completedCount: number
    totalCount: number
    nextMilestone: string | null
    firstLiveAt: string | null
    firstReviewCompletedAt: string | null
    milestones: Milestone[]
  } | null
  highlights: {
    available: boolean
    message: string
    catalog: Array<{
      code: string
      title: string
      category: string
      description: string
      status: string
    }>
    items: unknown[]
  }
  gifts: {
    summary: {
      total: number
      pendingReview: number
      approved: number
      rejected: number
      granted: number
    }
    items: Array<{
      id: string
      activity: {
        id: string
        name: string
        typeCode: string
        typeName: string
      }
      operatorName: string
      liveDate: string
      liveStartTime: string
      reviewStatus: string
      grantStatus: string
      rejectReason: string | null
      items: Array<{ itemName: string; quantity: number }>
      attachmentUrls: string[]
      createdAt: string
    }>
  }
  training: {
    summary: {
      registrationCount: number
      learnedCourseCount: number
      progressCount: number
    }
    progress: Array<{
      courseId: string
      courseCode: string
      courseTitle: string
      courseLevel: string
      status: string
      makeupStatus: string
      firstLearnedAt: string | null
      lastLearnedAt: string | null
    }>
    registrations: Array<{
      id: string
      status: string
      learningType: string
      source: string
      registeredAt: string
      course: {
        id: string
        code: string
        title: string
        level: string
      }
      teacher: { id: string; displayName: string } | null
      scheduledStartAt: string
      scheduledEndAt: string
      sessionStatus: string
    }>
  }
  reviews: {
    available: boolean
    message: string
    firstLiveReviewCompletedAt?: string | null
    items: DailyReviewItem[]
  }
  qaRecords?: {
    available: boolean
    message: string
    followUpDays: number
    overdueCount: number
    items: QaItem[]
  }
}

const assignmentLabels: Record<string, string> = {
  pending_confirmation: '待运营确认',
  confirmed: '已确认',
  rejected: '已拒绝',
  ended: '已结束',
}

const liveStatusLabels: Record<string, string> = {
  pending_first_live: '待首播',
  incubating: '孵化中',
  normal: '正常',
  offline: '断播',
  leave: '请假',
  exited: '退会',
}

const milestoneStatusLabels: Record<string, string> = {
  pending: '未开始',
  awaiting_anchor_confirm: '待主播确认',
  completed: '已完成',
}

const reviewStatusLabels: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}

const grantStatusLabels: Record<string, string> = {
  pending: '待发放',
  granted: '已发放',
}

const trainingStatusLabels: Record<string, string> = {
  not_started: '未开始',
  learning: '学习中',
  learned: '已学完',
  registered: '已报名',
  waitlisted: '候补',
  cancelled: '已取消',
  attended: '已到课',
  absent: '缺席',
  completed: '已完成',
}

const highlightCategoryLabels: Record<string, string> = {
  gift: '礼物',
  revenue: '营收',
  live: '开播',
  training: '培训',
}

/** 前端兜底：与 API evidenceFieldLabels 对齐，避免展示英文字段名 */
const fallbackEvidenceLabels: Record<string, string> = {
  communicatedAt: '沟通时间',
  channel: '沟通方式',
  availableScheduleStart: '可直播开始时间',
  availableScheduleEnd: '可直播结束时间',
  deviceNetwork: '设备与网络',
  voiceTraits: '声音特点',
  interestsAndExperience: '兴趣经历',
  liveExperience: '直播经验',
  learningCommitment: '学习与投入意愿',
  liveGoals: '直播目标',
  concerns: '担心顾虑',
  contentRecommendation: '内容推荐',
  basicConditionsJudgment: '基本条件判断',
  stabilityRisks: '稳定开播风险',
  anchorChecklist: '主播确认清单',
  trainedAt: '培训完成时间',
  materialsConfirmed: '资料已确认',
  materialsChecked: '资料已确认',
  liveSoftwareReady: '直播软件已安装并会使用',
  accountPackReady: '直播账号四件套已设置',
  redLinesUnderstood: '违规红线13条已清楚',
  scheduleConfirmed: '开播时间段已确定',
  mindsetAligned: '对直播的认知和心态已对齐',
  coreMetricsUnderstood: '核心数据已理解',
  toolsUnderstood: '辅助工具已了解',
  scriptReceived: '直播脚本已收到',
  processMemorized: '直播流程已记住',
  firstLiveScheduled: '首播时间已定好',
  anchorConfirmedAt: '主播确认时间',
  note: '备注',
  screenshotUrls: '截图',
  attachmentUrls: '附件',
  reviewConclusion: '复盘结论',
  reviewSummary: '复盘摘要',
  reviewPoints: '复盘要点',
  liveDurationMinutes: '直播时长（分钟）',
  peakViewers: '最高在线',
  issues: '问题与改进',
  nextActions: '下一步动作',
  materialsDelivered: '已下发培训资料',
}

/** 不在详情中展示的内部/冗余键 */
const HIDDEN_EVIDENCE_KEYS = new Set([
  'availableScheduleStart',
  'availableScheduleEnd',
])

const tabs: Array<{ key: TabKey; label: string; icon: typeof UserRound }> = [
  { key: 'profile', label: '档案与轨迹', icon: UserRound },
  { key: 'gifts', label: '礼物收集', icon: Gift },
  { key: 'training', label: '课程学习', icon: BookOpen },
  { key: 'reviews', label: '日复盘', icon: ClipboardList },
  { key: 'qa', label: '答疑记录', icon: MessageCircle },
]

function formatDateOnly(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function humanizeFieldKey(key: string): string {
  if (/[\u4e00-\u9fff]/.test(key)) return key
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
}

function labelEvidenceKey(
  key: string,
  labels?: Record<string, string>,
): string {
  return (
    labels?.[key] ??
    fallbackEvidenceLabels[key] ??
    // 不直接甩出 camelCase 英文，尽量可读（仍非业务文案时仅作兜底）
    humanizeFieldKey(key)
  )
}

function formatEvidenceValue(
  value: unknown,
  labels?: Record<string, string>,
): string {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        typeof item === 'object' && item !== null
          ? formatEvidenceValue(item, labels)
          : String(item),
      )
      .filter(Boolean)
      .join('、')
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== '' && v !== false)
      .map(([k, v]) => {
        const subLabel = labelEvidenceKey(k, labels)
        if (typeof v === 'boolean') return v ? subLabel : null
        return `${subLabel}：${formatEvidenceValue(v, labels)}`
      })
      .filter(Boolean)
      .join('；')
  }
  // ISO 时间可读化
  if (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(Date.parse(value))
  ) {
    return formatDateTime(value)
  }
  return String(value)
}

export function OperatorAnchorDetailPage() {
  const { anchorId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = searchParams.get('tab') as TabKey | null
  const validTabs: TabKey[] = [
    'profile',
    'gifts',
    'training',
    'reviews',
    'qa',
  ]
  const [tab, setTab] = useState<TabKey>(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : 'profile',
  )

  useEffect(() => {
    if (tabFromUrl && validTabs.includes(tabFromUrl) && tabFromUrl !== tab) {
      setTab(tabFromUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabFromUrl])

  const detailQuery = useQuery({
    queryKey: ['operator-anchor-detail', anchorId],
    enabled: Boolean(anchorId),
    queryFn: () =>
      apiJson<AnchorDetail>(
        `/operators/me/anchors/${encodeURIComponent(anchorId)}`,
      ),
  })

  const data = detailQuery.data
  const profile = data?.profile

  const statusLabel = useMemo(() => {
    if (profile?.liveStatus) {
      return liveStatusLabels[profile.liveStatus] ?? profile.liveStatus
    }
    if (!profile?.assignmentStatus) return '未分配'
    return assignmentLabels[profile.assignmentStatus] ?? profile.assignmentStatus
  }, [profile?.liveStatus, profile?.assignmentStatus])

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/operator/anchors"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <ArrowLeft className="h-4 w-4" />
              返回我的主播
            </Link>
            {detailQuery.isLoading ? (
              <div className="mt-4">
                <LoadingBlock text="正在加载主播档案…" />
              </div>
            ) : null}
            {detailQuery.isError ? (
              <div className="mt-4">
                <ErrorBlock
                  message={
                    detailQuery.error instanceof Error
                      ? detailQuery.error.message
                      : '主播详情加载失败'
                  }
                />
              </div>
            ) : null}
            {profile ? (
              <>
                <p className="mt-3 text-sm font-medium text-brand-600">
                  在管主播档案
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  {profile.anchorDisplayName}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  企微 {profile.wecomName || '—'}
                  <span className="mx-1.5 text-slate-300">·</span>
                  UID {profile.wecomUserId}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {statusLabel}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  入会 {formatDateOnly(profile.membershipCompletedAt)}
                  <span className="mx-1.5">·</span>
                  档案激活 {formatDateTime(profile.activatedAt)}
                  {profile.firstLiveAt ? (
                    <>
                      <span className="mx-1.5">·</span>
                      首播 {formatDateTime(profile.firstLiveAt)}
                    </>
                  ) : null}
                </p>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {profile ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>直播状态</span>
                <AnchorStatusSelect
                  compact
                  anchorId={profile.id}
                  status={profile.status}
                  queryKeys={[
                    ['operator-anchor-detail', anchorId],
                    ['operator-anchors'],
                    ['dashboard'],
                  ]}
                />
              </div>
            ) : null}
            {profile ? (
              <Link
                className="app-btn-primary"
                to={`/operator/anchors/${profile.id}/onboarding`}
              >
                岗前进度
              </Link>
            ) : null}
            <button
              type="button"
              className="app-btn-secondary"
              disabled={detailQuery.isFetching}
              onClick={() => void detailQuery.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${detailQuery.isFetching ? 'animate-spin' : ''}`}
              />
              刷新
            </button>
          </div>
        </div>

        {data ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryChip
              label="岗前进度"
              value={
                data.onboarding
                  ? `${data.onboarding.completedCount}/${data.onboarding.totalCount}`
                  : '—'
              }
            />
            <SummaryChip
              label="礼物提报"
              value={String(data.gifts.summary.total)}
              helper={`待审 ${data.gifts.summary.pendingReview} · 已发 ${data.gifts.summary.granted}`}
            />
            <SummaryChip
              label="课程学习"
              value={String(data.training.summary.learnedCourseCount)}
              helper={`报名 ${data.training.summary.registrationCount} 次`}
            />
            <SummaryChip
              label="高光时刻"
              value={
                data.highlights.available
                  ? String(data.highlights.items.length)
                  : '—'
              }
              helper={data.highlights.available ? undefined : '阶梯建设中'}
            />
          </div>
        ) : null}
      </section>

      {data ? (
        <>
          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => {
              const Icon = item.icon
              const active = tab === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  className={[
                    'inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-brand-600 text-white shadow-soft'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                  ].join(' ')}
                  onClick={() => {
                    setTab(item.key)
                    const next = new URLSearchParams(searchParams)
                    if (item.key === 'profile') next.delete('tab')
                    else next.set('tab', item.key)
                    setSearchParams(next, { replace: true })
                  }}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              )
            })}
          </div>

          {tab === 'profile' ? <ProfileTab data={data} /> : null}
          {tab === 'gifts' ? <GiftsTab data={data} /> : null}
          {tab === 'training' ? <TrainingTab data={data} /> : null}
          {tab === 'reviews' ? (
            <ReviewsTab data={data} anchorId={anchorId} />
          ) : null}
          {tab === 'qa' ? <QaTab data={data} /> : null}
        </>
      ) : null}
    </div>
  )
}

function ProfileTab({ data }: { data: AnchorDetail }) {
  const labels = data.evidenceFieldLabels
  const milestones = data.onboarding?.milestones ?? []
  const total = data.onboarding?.totalCount ?? 7
  const done = data.onboarding?.completedCount ?? 0
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0

  // null = 收起；点击同一节点再点一次收回
  const [expandedType, setExpandedType] = useState<string | null>(null)

  useEffect(() => {
    setExpandedType((current) => {
      if (!current) return null
      const list = data.onboarding?.milestones ?? []
      return list.some((item) => item.type === current) ? current : null
    })
  }, [data.onboarding])

  const selected =
    expandedType
      ? (milestones.find((item) => item.type === expandedType) ?? null)
      : null
  const selectedIndex = selected
    ? milestones.findIndex((item) => item.type === selected.type)
    : -1

  function toggleNode(type: string) {
    setExpandedType((current) => (current === type ? null : type))
  }

  return (
    <div className="space-y-6">
      {/* 岗前成长轨迹：横向节点轨 + 点开详情 */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-100 bg-gradient-to-r from-brand-50/80 via-white to-cyan-50/40 px-6 py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                岗前成长轨迹
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                点击节点展开详情，再点一次收回；桌面悬停可预览状态与时间
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums text-brand-700">
                {done}
                <span className="text-base font-medium text-slate-400">
                  /{total}
                </span>
              </p>
              <p className="text-xs text-slate-400">完成度 {progressPct}%</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-6">
          {!data.onboarding ? (
            <EmptyState
              title="尚未初始化岗前进度"
              description="运营确认归属后会生成岗前节点。"
              tone="plain"
            />
          ) : (
            <>
              {/* 横向进度轨 */}
              <div className="relative px-1 pt-2 pb-1">
                {/* 底轨 + 完成段 */}
                <div className="pointer-events-none absolute left-[calc(100%/14)] right-[calc(100%/14)] top-[22px] h-1 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all duration-500"
                    style={{
                      width:
                        total <= 1
                          ? done > 0
                            ? '100%'
                            : '0%'
                          : done <= 0
                            ? '0%'
                            : `${((Math.min(done, total) - 1) / (total - 1)) * 100}%`,
                    }}
                  />
                </div>

                <ol className="relative z-10 grid grid-cols-7 gap-1">
                  {milestones.map((item, index) => {
                    const completed = item.status === 'completed'
                    const waiting = item.status === 'awaiting_anchor_confirm'
                    const isCurrent =
                      data.onboarding?.nextMilestone === item.type && !completed
                    const isSelected = expandedType === item.type
                    const statusText =
                      isCurrent && item.status === 'pending'
                        ? '进行中'
                        : milestoneStatusLabels[item.status] ?? item.status
                    const timeText = item.completedAt
                      ? formatDateTime(item.completedAt)
                      : item.submittedAt
                        ? formatDateTime(item.submittedAt)
                        : '尚未推进'
                    const tip = `${item.label} · ${statusText} · ${timeText}`

                    return (
                      <li
                        key={item.type}
                        className="flex flex-col items-center"
                      >
                        <button
                          type="button"
                          title={tip}
                          aria-label={tip}
                          aria-expanded={isSelected}
                          aria-pressed={isSelected}
                          onClick={() => toggleNode(item.type)}
                          className={[
                            'group relative flex flex-col items-center outline-none',
                            'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 rounded-full',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold transition-all',
                              completed
                                ? 'bg-brand-600 text-white shadow-md shadow-brand-200'
                                : waiting
                                  ? 'bg-amber-400 text-white shadow-md shadow-amber-100'
                                  : isCurrent
                                    ? 'border-2 border-brand-500 bg-white text-brand-600 shadow-md shadow-brand-100'
                                    : 'border border-slate-200 bg-slate-50 text-slate-400',
                              isSelected
                                ? 'scale-110 ring-4 ring-brand-100'
                                : 'hover:scale-105',
                              isCurrent && !completed
                                ? 'animate-pulse'
                                : '',
                            ].join(' ')}
                          >
                            {completed ? (
                              <Check className="h-5 w-5" strokeWidth={2.5} />
                            ) : (
                              index + 1
                            )}
                          </span>

                          {/* 桌面悬停轻提示 */}
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-max max-w-[11rem] -translate-x-1/2 rounded-xl bg-slate-900 px-2.5 py-1.5 text-left text-[11px] leading-4 text-white opacity-0 shadow-lg transition group-hover:opacity-100 md:block"
                          >
                            <span className="font-medium">{item.label}</span>
                            <br />
                            <span className="text-slate-300">
                              {statusText} · {timeText}
                            </span>
                          </span>
                        </button>

                        <p
                          className={[
                            'mt-2 max-w-[4.5rem] text-center text-[11px] font-medium leading-4 sm:max-w-none sm:text-xs',
                            isSelected
                              ? 'text-brand-700'
                              : completed
                                ? 'text-slate-700'
                                : 'text-slate-400',
                          ].join(' ')}
                        >
                          {item.label}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              </div>

              <p className="mt-3 text-center text-xs text-slate-400">
                {expandedType
                  ? '再次点击同一节点可收回详情'
                  : data.onboarding.nextMilestone
                    ? `当前推进：${
                        milestones.find(
                          (m) => m.type === data.onboarding?.nextMilestone,
                        )?.label ?? data.onboarding.nextMilestone
                      }（点击节点查看详情）`
                    : done >= total
                      ? '岗前轨迹已全部完成（点击节点查看详情）'
                      : '点击节点查看详情'}
              </p>

              {/* 展开的节点详情（默认收起） */}
              {selected ? (
                <div
                  className={[
                    'mt-5 rounded-2xl border px-5 py-4',
                    selected.status === 'completed'
                      ? 'border-brand-100 bg-brand-50/40'
                      : selected.status === 'awaiting_anchor_confirm'
                        ? 'border-amber-200 bg-amber-50/40'
                        : 'border-slate-200 bg-slate-50/50',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-400">
                        节点 {selectedIndex + 1} / {milestones.length}
                      </p>
                      <h4 className="mt-0.5 text-lg font-semibold text-slate-900">
                        {selected.label}
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">
                        {selected.completedAt
                          ? `完成于 ${formatDateTime(selected.completedAt)}`
                          : selected.submittedAt
                            ? `提交于 ${formatDateTime(selected.submittedAt)}`
                            : '等待推进'}
                      </p>
                    </div>
                    <span
                      className={[
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
                        selected.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : selected.status === 'awaiting_anchor_confirm'
                            ? 'bg-amber-100 text-amber-800'
                            : data.onboarding.nextMilestone === selected.type
                              ? 'bg-brand-100 text-brand-700'
                              : 'bg-slate-200/80 text-slate-500',
                      ].join(' ')}
                    >
                      {data.onboarding.nextMilestone === selected.type &&
                      selected.status === 'pending'
                        ? '进行中'
                        : milestoneStatusLabels[selected.status] ??
                          selected.status}
                    </span>
                  </div>

                  {shouldShowMilestoneNote(selected) ? (
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      <span className="text-xs font-medium text-slate-400">
                        备注
                      </span>
                      <br />
                      {selected.note}
                    </p>
                  ) : null}
                  {selected.rejectReason ? (
                    <p className="mt-2 text-sm text-rose-600">
                      驳回：{selected.rejectReason}
                    </p>
                  ) : null}

                  {selected.evidence ? (
                    <EvidenceBlock
                      evidence={selected.evidence}
                      labels={labels}
                      membershipCompletedAt={data.profile.membershipCompletedAt}
                      milestoneType={selected.type}
                    />
                  ) : selected.status === 'pending' ? (
                    <p className="mt-3 text-sm text-slate-500">
                      该节点尚未填写详情。
                    </p>
                  ) : null}

                  {selected.attachmentUrls.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selected.attachmentUrls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                        >
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="app-btn-secondary text-xs"
                      disabled={selectedIndex <= 0}
                      onClick={() =>
                        setExpandedType(
                          milestones[selectedIndex - 1]?.type ?? null,
                        )
                      }
                    >
                      上一节点
                    </button>
                    <button
                      type="button"
                      className="app-btn-secondary text-xs"
                      disabled={
                        selectedIndex < 0 ||
                        selectedIndex >= milestones.length - 1
                      }
                      onClick={() =>
                        setExpandedType(
                          milestones[selectedIndex + 1]?.type ?? null,
                        )
                      }
                    >
                      下一节点
                    </button>
                    <button
                      type="button"
                      className="app-btn-secondary text-xs"
                      onClick={() => setExpandedType(null)}
                    >
                      收起
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      {/* 高光时刻 */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
        <div className="border-b border-slate-100 bg-gradient-to-r from-amber-50/90 via-white to-orange-50/40 px-6 py-5">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                高光时刻
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                与岗前孵化轨并列的<strong className="font-medium text-slate-700">成长成就轨</strong>
                ：记录首次收礼、营收阶梯、连续开播等里程碑。阶梯阈值后续可配置，当前先展示规划目录。
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="mb-4 rounded-2xl bg-amber-50/80 px-3 py-2 text-sm text-amber-800">
            {data.highlights.message}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(data.highlights.catalog ?? []).map((item) => (
              <div
                key={item.code}
                className="relative overflow-hidden rounded-2xl border border-dashed border-amber-200/80 bg-gradient-to-br from-white to-amber-50/40 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-100">
                    {highlightCategoryLabels[item.category] ?? item.category}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    待解锁
                  </span>
                </div>
                <p className="mt-2 font-semibold text-slate-800">{item.title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-base font-semibold text-slate-900">归属历史</h3>
          <div className="mt-4 space-y-2">
            {data.assignmentHistory.length === 0 ? (
              <p className="text-sm text-slate-500">暂无归属记录</p>
            ) : (
              data.assignmentHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-100 px-3 py-2 text-sm"
                >
                  <p className="font-medium text-slate-800">
                    {item.operator.displayName}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {assignmentLabels[item.status] ?? item.status}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(item.createdAt)}
                    {item.reason ? ` · ${item.reason}` : ''}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-base font-semibold text-slate-900">昵称变更</h3>
          <div className="mt-4 space-y-2">
            {data.nameHistory.length === 0 ? (
              <p className="text-sm text-slate-500">暂无改名记录</p>
            ) : (
              data.nameHistory.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-100 px-3 py-2 text-sm text-slate-700"
                >
                  {item.oldName} → {item.newName}
                  <p className="mt-1 text-xs text-slate-400">
                    {formatDateTime(item.createdAt)} · {item.changedByType}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

/**
 * note 与 evidence 内容重复时不展示（首播复盘会把同一结论写入 note + reviewConclusion）
 */
function shouldShowMilestoneNote(milestone: Milestone): boolean {
  const note = milestone.note?.trim()
  if (!note) return false
  const evidence = milestone.evidence
  if (!evidence) return true
  const conclusion =
    typeof evidence.reviewConclusion === 'string'
      ? evidence.reviewConclusion.trim()
      : ''
  if (conclusion && conclusion === note) return false
  // 任意 evidence 字符串字段与 note 完全相同也跳过
  for (const value of Object.values(evidence)) {
    if (typeof value === 'string' && value.trim() === note) return false
  }
  return true
}

/** 证据字段中文化展示；初次沟通额外展示入会日期 */
function EvidenceBlock({
  evidence,
  labels,
  membershipCompletedAt,
  milestoneType,
}: {
  evidence: Record<string, unknown>
  labels?: Record<string, string>
  membershipCompletedAt: string | null
  milestoneType: string
}) {
  const entries = Object.entries(evidence).filter(([key, value]) => {
    if (HIDDEN_EVIDENCE_KEYS.has(key)) return false
    if (value == null || value === '') return false
    if (Array.isArray(value) && value.length === 0) return false
    return true
  })

  // 可直播时段合并展示
  const scheduleStart = evidence.availableScheduleStart
  const scheduleEnd = evidence.availableScheduleEnd
  const hasSchedule =
    typeof scheduleStart === 'string' &&
    scheduleStart &&
    typeof scheduleEnd === 'string' &&
    scheduleEnd

  const rows: Array<{ label: string; value: string }> = []

  if (milestoneType === 'initial_communication') {
    rows.push({
      label: '入会日期',
      value: formatDateOnly(membershipCompletedAt),
    })
  }

  if (hasSchedule) {
    rows.push({
      label: '可直播时段',
      value: `${String(scheduleStart)} – ${String(scheduleEnd)}`,
    })
  }

  for (const [key, value] of entries) {
    const formatted = formatEvidenceValue(value, labels)
    if (!formatted) continue
    rows.push({
      label: labelEvidenceKey(key, labels),
      value: formatted,
    })
  }

  if (rows.length === 0) return null

  return (
    <dl className="mt-3 grid gap-2 rounded-xl border border-slate-100 bg-white/80 px-3 py-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-[11px] font-medium text-slate-400">{row.label}</dt>
          <dd className="mt-0.5 text-sm leading-5 text-slate-700 break-words">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function GiftsTab({ data }: { data: AnchorDetail }) {
  const { summary, items } = data.gifts
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">礼物收集记录</h3>
          <p className="mt-1 text-sm text-slate-500">
            共 {summary.total} 条 · 待审 {summary.pendingReview} · 通过{' '}
            {summary.approved} · 拒绝 {summary.rejected} · 已发放 {summary.granted}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {items.length === 0 ? (
          <EmptyState
            title="暂无礼物提报"
            description="主播在活动中提交礼物收集后会出现在这里。"
            tone="plain"
          />
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-200 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">
                    {item.activity.name}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.activity.typeName}
                    <span className="mx-1.5">·</span>
                    直播 {item.liveDate} {item.liveStartTime}
                    <span className="mx-1.5">·</span>
                    运营 {item.operatorName}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">
                    {reviewStatusLabels[item.reviewStatus] ?? item.reviewStatus}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-600">
                    {grantStatusLabels[item.grantStatus] ?? item.grantStatus}
                  </span>
                </div>
              </div>
              {item.items.length > 0 ? (
                <p className="mt-2 text-sm text-slate-600">
                  {item.items
                    .map((row) => `${row.itemName}×${row.quantity}`)
                    .join('、')}
                </p>
              ) : null}
              {item.rejectReason ? (
                <p className="mt-1 text-sm text-rose-600">
                  驳回原因：{item.rejectReason}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-400">
                提报 {formatDateTime(item.createdAt)}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function TrainingTab({ data }: { data: AnchorDetail }) {
  const { summary, progress, registrations } = data.training
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h3 className="text-base font-semibold text-slate-900">课程进度</h3>
        <p className="mt-1 text-sm text-slate-500">
          已学完 {summary.learnedCourseCount} 门 · 进度记录 {summary.progressCount}{' '}
          条
        </p>
        <div className="mt-4 space-y-2">
          {progress.length === 0 ? (
            <EmptyState
              title="暂无课程进度"
              description="报名并完成课程后会在此汇总。"
              tone="plain"
            />
          ) : (
            progress.map((item) => (
              <div
                key={item.courseId}
                className="rounded-2xl border border-slate-100 px-3 py-2"
              >
                <p className="font-medium text-slate-800">
                  {item.courseTitle}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {item.courseCode}
                  </span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {trainingStatusLabels[item.status] ?? item.status}
                  {item.lastLearnedAt
                    ? ` · 最近 ${formatDateTime(item.lastLearnedAt)}`
                    : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h3 className="text-base font-semibold text-slate-900">报名记录</h3>
        <p className="mt-1 text-sm text-slate-500">
          共 {summary.registrationCount} 次报名
        </p>
        <div className="mt-4 space-y-2">
          {registrations.length === 0 ? (
            <EmptyState
              title="暂无报名记录"
              description="运营代报名或主播自主报名会出现在这里。"
              tone="plain"
            />
          ) : (
            registrations.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-100 px-3 py-2"
              >
                <p className="font-medium text-slate-800">
                  {item.course.title}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTime(item.scheduledStartAt)}
                  <span className="mx-1">·</span>
                  {trainingStatusLabels[item.status] ?? item.status}
                  <span className="mx-1">·</span>
                  {item.learningType}
                  {item.teacher ? ` · 讲师 ${item.teacher.displayName}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function ReviewsTab({
  data,
  anchorId,
}: {
  data: AnchorDetail
  anchorId: string
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        档案仅展示记录。填写请到「答疑复盘」→ 复盘。
      </p>
      <DailyReviewPanel
        anchorId={anchorId}
        items={data.reviews.items ?? []}
        canWrite={false}
        canLeaderNote={false}
        queryKeyToInvalidate={['operator-anchor-detail', anchorId]}
      />
    </div>
  )
}

function QaTab({ data }: { data: AnchorDetail }) {
  const items = data.qaRecords?.items ?? []
  const overdue = data.qaRecords?.overdueCount ?? 0
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div>
        <h3 className="text-base font-semibold text-slate-900">答疑记录</h3>
        <p className="mt-1 text-sm text-slate-500">
          档案仅展示记录。填写请到「答疑复盘」→ 答疑。
          {overdue > 0 ? ` · ${overdue} 条已逾期` : ''}
        </p>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <EmptyState
            title="暂无答疑"
            description="在答疑复盘入口新建记录后会出现在这里。"
            tone="plain"
          />
        ) : (
          items.slice(0, 50).map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-100 px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">
                  {formatDateTime(item.qaAt)}
                </span>
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[11px] font-medium',
                    item.followUpStatus === 'done'
                      ? 'bg-emerald-50 text-emerald-700'
                      : item.followUpStatus === 'overdue'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-800',
                  ].join(' ')}
                >
                  {item.followUpStatus === 'done'
                    ? '已跟踪'
                    : item.followUpStatus === 'overdue'
                      ? '已逾期'
                      : '待跟踪'}
                </span>
              </div>
              <p className="mt-1.5 text-slate-700">
                <span className="text-slate-400">问题：</span>
                {item.question}
              </p>
              <p className="mt-1 text-slate-700">
                <span className="text-slate-400">回复：</span>
                {item.reply}
              </p>
              {item.resultFollowUp ? (
                <p className="mt-1 text-slate-600">
                  <span className="text-slate-400">跟踪：</span>
                  {item.resultFollowUp}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  )
}

function SummaryChip({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </p>
      {helper ? (
        <p className="mt-1 text-xs text-slate-400">{helper}</p>
      ) : null}
    </div>
  )
}
