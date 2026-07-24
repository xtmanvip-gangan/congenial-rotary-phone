import {
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  Eye,
  LoaderCircle,
  Send,
  XCircle,
} from 'lucide-react'
import {
  grantStatusClassMap,
  reviewStatusClassMap,
} from '../lib/statusBadges'

export type RewardMatchItem = {
  itemName: string
  rewardLabel: string
  rewardValueCents?: number
}

export type AdminSubmissionRecordItem = {
  id: string
  activity: {
    id: string
    name: string
    typeCode: string
    typeName: string
  }
  anchorUserId: string
  anchorName: string
  operatorName: string
  liveDate: string
  liveStartTime: string
  reviewStatus: 'pending' | 'approved' | 'rejected'
  grantStatus: 'pending' | 'granted'
  rejectReason: string | null
  createdAt: string
  updatedAt: string
  items: Array<{
    itemName: string
    quantity: number
  }>
  attachmentUrls: string[]
  grantAttachmentUrls: string[]
  grantRemark: string | null
  rewardSummaryText: string
  rewardSummaryValueYuan: number
  matchedRewards: RewardMatchItem[]
}

export type AdminSubmissionsResponse = {
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
  items: AdminSubmissionRecordItem[]
}

export type UploadImagesResponse = {
  items: Array<{
    fileName: string
    fileUrl: string
  }>
}

export type SubmissionGroup = {
  id: string
  activity: AdminSubmissionRecordItem['activity']
  anchorName: string
  anchorUserId: string
  liveDate: string
  operatorSummary: string
  operatorCount: number
  submissionCount: number
  latestCreatedAt: string
  records: AdminSubmissionRecordItem[]
  quantitySummary: string
  rewardSummary: string
  rewardSummaryValueYuan: number
  reviewSummaryText: string
  reviewSummaryClassName: string
  grantSummaryText: string
  grantSummaryClassName: string
}

export function groupSubmissionsForDisplay(items: AdminSubmissionRecordItem[]) {
  const grouped = new Map<string, AdminSubmissionRecordItem[]>()

  items.forEach((item) => {
    const groupKey =
      item.activity.typeCode === 'gift_collection'
        ? `${item.activity.id}:${item.anchorUserId}:${item.liveDate}`
        : item.id
    const current = grouped.get(groupKey) ?? []
    current.push(item)
    grouped.set(groupKey, current)
  })

  return Array.from(grouped.values())
    .map((records) => buildSubmissionGroup(records))
    .sort(
      (left, right) =>
        new Date(right.latestCreatedAt).getTime() - new Date(left.latestCreatedAt).getTime(),
    )
}

export function SummaryMetric({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  return (
    <div className="rounded-[28px] bg-white px-5 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-100">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-base font-semibold leading-6 text-slate-900">{value}</p>
      {helper ? <p className="mt-1 text-xs leading-5 text-slate-500">{helper}</p> : null}
    </div>
  )
}

export function SubmissionDetailCard({
  item,
  index,
  processingExpanded,
  reviewBusy,
  grantBusy,
  feedback,
  rejectReason,
  onOpenPreview,
  onRejectReasonChange,
  onToggleProcessing,
  onApprove,
  onReject,
  onGrant,
}: {
  item: AdminSubmissionRecordItem
  index: number
  processingExpanded: boolean
  reviewBusy: boolean
  grantBusy: boolean
  feedback?: { type: 'success' | 'error'; message: string }
  rejectReason: string
  onOpenPreview: (url: string) => void
  onRejectReasonChange: (value: string) => void
  onToggleProcessing: () => void
  onApprove: () => void
  onReject: () => void
  onGrant: () => void
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/90 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              第 {index + 1} 场
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
              {item.liveStartTime || '--'} 开播
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleProcessing}
            className="inline-flex items-center justify-center gap-2 self-start rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
          >
            {processingExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                收起处理
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                展开处理
              </>
            )}
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1.05fr_1fr_0.95fr]">
          <div className="flex min-h-[148px] flex-col rounded-[20px] border border-slate-200/80 bg-slate-50/85 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">礼物信息</p>
                <p className="mt-1.5 font-semibold text-slate-800">本场礼物与数量</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                {item.items.length} 项
              </span>
            </div>
            <p className="mt-3 flex-1 text-[13px] leading-6 text-slate-600">{formatItemEntries(item.items)}</p>
          </div>
          <div className="flex min-h-[148px] flex-col rounded-[20px] border border-slate-200/80 bg-slate-50/85 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">奖励结果</p>
                <p className="mt-1.5 font-semibold text-slate-800">获得奖励</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                {item.rewardSummaryValueYuan > 0 ? `价值 ${formatMoney(item.rewardSummaryValueYuan)} 元` : '待判定'}
              </span>
            </div>
            <p className="mt-3 text-[13px] font-semibold leading-6 text-slate-900">
              {item.rewardSummaryText || '暂未命中奖励'}
            </p>
            {item.matchedRewards.length > 0 ? (
              <p className="mt-2 flex-1 text-xs leading-5 text-slate-500">
                {item.matchedRewards.map((reward) => `${reward.itemName} -> ${reward.rewardLabel}`).join('、')}
              </p>
            ) : (
              <p className="mt-2 flex-1 text-xs leading-5 text-slate-400">当前还没有更细的奖励拆分信息。</p>
            )}
          </div>
          <div className="flex min-h-[148px] flex-col rounded-[20px] border border-slate-200/80 bg-slate-50/85 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">提交凭证</p>
                <p className="mt-1.5 font-semibold text-slate-800">提交截图</p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                {item.attachmentUrls.length} 张
              </span>
            </div>
            <div className="mt-3 flex flex-1 flex-wrap content-start gap-2">
              {item.attachmentUrls.length > 0 ? (
                item.attachmentUrls.map((url, indexValue) => (
                  <button
                    key={`${item.id}-proof-${indexValue}`}
                    type="button"
                    onClick={() => onOpenPreview(url)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-brand-700 transition hover:border-brand-200 hover:bg-brand-50"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    截图{indexValue + 1}
                  </button>
                ))
              ) : (
                <span className="text-xs text-slate-400">暂无截图</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {feedback ? (
        <div
          className={`mt-3 rounded-2xl px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border border-rose-200 bg-rose-50 text-rose-600'
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      {item.rejectReason ? (
        <div className="mt-3 rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
          当前驳回原因：{item.rejectReason}
        </div>
      ) : null}

      {item.grantRemark ? (
        <div className="mt-3 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          当前发放备注：{item.grantRemark}
        </div>
      ) : null}

      {processingExpanded ? (
        <div className="mt-3 rounded-[22px] border border-slate-200/80 bg-slate-50/70 p-3">
          <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[18px] border border-slate-200/80 bg-white px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <CheckCheck className="h-4 w-4 text-brand-600" />
                审核处理
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-start">
                <textarea
                  value={rejectReason}
                  onChange={(event) => onRejectReasonChange(event.target.value)}
                  rows={2}
                  placeholder="需要驳回时填写原因，例如：截图不清晰、数量不一致"
                  className="min-h-[72px] resize-none rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-300 focus:bg-white"
                />
                <button
                  type="button"
                  disabled={reviewBusy || item.reviewStatus === 'approved'}
                  onClick={onApprove}
                  className="inline-flex min-w-[108px] items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {reviewBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                  通过
                </button>
                <button
                  type="button"
                  disabled={reviewBusy || item.grantStatus === 'granted'}
                  onClick={onReject}
                  className="inline-flex min-w-[108px] items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {reviewBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  驳回
                </button>
              </div>
            </div>

            <div className="rounded-[18px] border border-slate-200/80 bg-white px-4 py-3">
              <div className="flex h-full flex-col justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Send className="h-4 w-4 text-brand-600" />
                    发放处理
                  </p>
                  {item.reviewStatus === 'approved' ? (
                    <p className="mt-2 text-sm text-slate-500">审核已通过，可直接标记为已发放。</p>
                  ) : (
                    <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-100 bg-amber-50/90 px-3 py-2 text-sm font-medium text-amber-800">
                      <Clock3 className="h-4 w-4" />
                      等待审核通过
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={grantBusy || item.reviewStatus !== 'approved' || item.grantStatus === 'granted'}
                  onClick={onGrant}
                  className="inline-flex min-w-[156px] items-center justify-center gap-2 rounded-full bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {grantBusy ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      处理中
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      标记已发放
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : item.grantAttachmentUrls.length > 0 ? (
        <div className="mt-3 rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          该记录已标记为已发放。
        </div>
      ) : null}
    </div>
  )
}

function buildSubmissionGroup(records: AdminSubmissionRecordItem[]): SubmissionGroup {
  const sortedRecords = [...records].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  )
  const latestCreatedAt = sortedRecords[sortedRecords.length - 1]?.createdAt ?? ''
  const operatorNames = Array.from(new Set(sortedRecords.map((item) => item.operatorName).filter(Boolean)))
  const validRewardRecords = sortedRecords.filter((item) => item.reviewStatus !== 'rejected')
  const totals = new Map<string, number>()

  validRewardRecords.forEach((item) => {
    item.items.forEach((entry) => {
      totals.set(entry.itemName, (totals.get(entry.itemName) ?? 0) + entry.quantity)
    })
  })

  const quantitySummary =
    totals.size > 0
      ? Array.from(totals.entries())
          .sort((left, right) => left[0].localeCompare(right[0], 'zh-CN'))
          .map(([itemName, quantity]) => `${itemName} ${quantity}`)
          .join('、')
      : '暂无累计'

  const latestRewardRecord =
    validRewardRecords[validRewardRecords.length - 1] ?? sortedRecords[sortedRecords.length - 1]
  const rewardSummary = latestRewardRecord?.rewardSummaryText ?? '暂未命中奖励'
  const rewardSummaryValueYuan = latestRewardRecord?.rewardSummaryValueYuan ?? 0
  const reviewSummary = getReviewSummary(sortedRecords)
  const grantSummary = getGrantSummary(sortedRecords)
  const firstItem = sortedRecords[0]

  return {
    id:
      firstItem.activity.typeCode === 'gift_collection'
        ? `gift:${firstItem.activity.id}:${firstItem.anchorUserId}:${firstItem.liveDate}`
        : `single:${firstItem.id}`,
    activity: firstItem.activity,
    anchorName: firstItem.anchorName,
    anchorUserId: firstItem.anchorUserId,
    liveDate: firstItem.liveDate,
    operatorSummary: operatorNames.join('、') || '--',
    operatorCount: operatorNames.length,
    submissionCount: sortedRecords.length,
    latestCreatedAt,
    records: sortedRecords,
    quantitySummary,
    rewardSummary,
    rewardSummaryValueYuan,
    reviewSummaryText: reviewSummary.text,
    reviewSummaryClassName: reviewSummary.className,
    grantSummaryText: grantSummary.text,
    grantSummaryClassName: grantSummary.className,
  }
}

function getReviewSummary(records: AdminSubmissionRecordItem[]) {
  if (records.every((item) => item.reviewStatus === 'approved')) {
    return {
      text: '已通过',
      className: reviewStatusClassMap.approved,
    }
  }

  if (records.every((item) => item.reviewStatus === 'rejected')) {
    return {
      text: '已驳回',
      className: reviewStatusClassMap.rejected,
    }
  }

  if (records.every((item) => item.reviewStatus === 'pending')) {
    return {
      text: '待审核',
      className: reviewStatusClassMap.pending,
    }
  }

  if (records.some((item) => item.reviewStatus === 'rejected')) {
    return {
      text: '有驳回',
      className: 'rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700',
    }
  }

  return {
    text: '部分处理',
    className: 'rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700',
  }
}

function getGrantSummary(records: AdminSubmissionRecordItem[]) {
  if (records.every((item) => item.reviewStatus === 'rejected')) {
    return {
      text: '暂不发放',
      className: 'rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500',
    }
  }

  if (records.every((item) => item.grantStatus === 'granted')) {
    return {
      text: '已发放',
      className: grantStatusClassMap.granted,
    }
  }

  if (records.some((item) => item.grantStatus === 'granted')) {
    return {
      text: '部分发放',
      className: 'rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700',
    }
  }

  return {
    text: '待发放',
    className: grantStatusClassMap.pending,
  }
}

function formatItemEntries(items: AdminSubmissionRecordItem['items']) {
  if (items.length === 0) {
    return '暂无填写内容'
  }

  return items.map((item) => `${item.itemName} x ${item.quantity}`).join('、')
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}
