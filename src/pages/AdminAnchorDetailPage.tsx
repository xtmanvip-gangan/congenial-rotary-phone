import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  BookOpen,
  ClipboardList,
  Gift,
  RefreshCw,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type TabKey = 'profile' | 'gifts' | 'training' | 'reviews'

type AnchorDetail = {
  profile: {
    id: string
    wecomName: string
    wecomUserId: string
    anchorDisplayName: string
    assignmentStatus: string | null
    status: string
    activatedAt: string
    source: string
    createdAt: string
    updatedAt: string
    operator?: { id: string; displayName: string } | null
  }
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
    milestones: Array<{
      type: string
      label: string
      status: string
      completedAt: string | null
      submittedAt: string | null
      note: string | null
      evidence: Record<string, unknown> | null
      attachmentUrls: string[]
      rejectReason: string | null
    }>
  } | null
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
    items: unknown[]
  }
}

const assignmentLabels: Record<string, string> = {
  pending_confirmation: '待运营确认',
  confirmed: '已确认',
  rejected: '已拒绝',
  ended: '已结束',
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

const tabs: Array<{ key: TabKey; label: string; icon: typeof UserRound }> = [
  { key: 'profile', label: '档案与岗前', icon: UserRound },
  { key: 'gifts', label: '礼物收集', icon: Gift },
  { key: 'training', label: '课程学习', icon: BookOpen },
  { key: 'reviews', label: '复盘记录', icon: ClipboardList },
]

export function AdminAnchorDetailPage() {
  const { anchorId = '' } = useParams()
  const [tab, setTab] = useState<TabKey>('profile')

  const detailQuery = useQuery({
    queryKey: ['admin-anchor-detail', anchorId],
    enabled: Boolean(anchorId),
    queryFn: () =>
      apiJson<AnchorDetail>(`/admin/anchors/${encodeURIComponent(anchorId)}`),
  })

  const data = detailQuery.data
  const profile = data?.profile

  const statusLabel = useMemo(() => {
    if (!profile?.assignmentStatus) return '未分配'
    return assignmentLabels[profile.assignmentStatus] ?? profile.assignmentStatus
  }, [profile?.assignmentStatus])

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/admin/anchors"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <ArrowLeft className="h-4 w-4" />
              返回主播全景
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
                <p className="mt-3 text-sm font-medium text-brand-600">主播全景</p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  {profile.anchorDisplayName}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  企微 {profile.wecomName || '—'}
                  <span className="mx-1.5 text-slate-300">·</span>
                  UID {profile.wecomUserId}
                  <span className="mx-1.5 text-slate-300">·</span>
                  运营 {profile.operator?.displayName ?? '未分配'}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {statusLabel}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  激活 {formatDateTime(profile.activatedAt)}
                  <span className="mx-1.5">·</span>
                  来源 {profile.source}
                  <span className="mx-1.5">·</span>
                  状态 {profile.status}
                </p>
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {profile?.assignmentStatus === 'confirmed' ? (
              <Link
                className="app-btn-secondary"
                to={`/operator/anchors/${profile.id}/onboarding`}
              >
                打开岗前操作
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
              label="复盘记录"
              value={data.reviews.available ? String(data.reviews.items.length) : '—'}
              helper={data.reviews.available ? undefined : '建设中'}
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
                  onClick={() => setTab(item.key)}
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
          {tab === 'reviews' ? <ReviewsTab data={data} /> : null}
        </>
      ) : null}
    </div>
  )
}

function ProfileTab({ data }: { data: AnchorDetail }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <h3 className="text-base font-semibold text-slate-900">岗前里程碑</h3>
        {!data.onboarding ? (
          <div className="mt-4">
            <EmptyState
              title="尚未初始化岗前进度"
              description="运营确认归属后会生成岗前节点。"
              tone="plain"
            />
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {data.onboarding.milestones.map((item) => (
              <article
                key={item.type}
                className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{item.label}</p>
                  <span className="text-xs font-medium text-slate-500">
                    {milestoneStatusLabels[item.status] ?? item.status}
                  </span>
                </div>
                {item.completedAt || item.submittedAt ? (
                  <p className="mt-1 text-xs text-slate-400">
                    {item.completedAt
                      ? `完成 ${formatDateTime(item.completedAt)}`
                      : `提交 ${formatDateTime(item.submittedAt!)}`}
                  </p>
                ) : null}
                {item.note ? (
                  <p className="mt-2 text-sm text-slate-600">{item.note}</p>
                ) : null}
                {item.rejectReason ? (
                  <p className="mt-1 text-sm text-rose-600">
                    驳回：{item.rejectReason}
                  </p>
                ) : null}
                {item.evidence ? (
                  <dl className="mt-2 grid gap-1 text-xs text-slate-500">
                    {Object.entries(item.evidence)
                      .filter(([, value]) => {
                        if (value == null || value === '') return false
                        if (Array.isArray(value) && value.length === 0)
                          return false
                        return true
                      })
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <dt className="shrink-0 text-slate-400">{key}</dt>
                          <dd className="min-w-0 break-words text-slate-600">
                            {Array.isArray(value)
                              ? value.join('、')
                              : typeof value === 'object'
                                ? JSON.stringify(value)
                                : String(value)}
                          </dd>
                        </div>
                      ))}
                  </dl>
                ) : null}
                {item.attachmentUrls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.attachmentUrls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-16 w-16 overflow-hidden rounded-xl border border-slate-200 bg-white"
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
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="space-y-6">
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

function ReviewsTab({ data }: { data: AnchorDetail }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <h3 className="text-base font-semibold text-slate-900">复盘记录</h3>
      <div className="mt-4">
        <EmptyState
          title="功能建设中"
          description={
            data.reviews.message ||
            '复盘记录为暂定项目，上线后将汇总首播复盘与日常复盘。'
          }
          tone="plain"
        />
      </div>
      {data.onboarding?.firstReviewCompletedAt ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          首播复盘节点已于{' '}
          {formatDateTime(data.onboarding.firstReviewCompletedAt)} 完成（岗前节点，
          非独立复盘档案）。
        </p>
      ) : null}
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
