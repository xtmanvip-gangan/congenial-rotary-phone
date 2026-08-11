import dayjs from 'dayjs'
import type { AvailableActivityItem } from '@/types/activity'
import type { GrantStatus, ReviewStatus } from '@/types/submission'

/**
 * 与后台活动状态展示对齐：
 * - active → 进行中（列表 API 仅返回 status=active）
 * - ended → 已结束
 * 后台无「未开始」状态；提报窗口仍以 startAt/endAt 校验。
 */
export type ActivityPhase = 'ongoing' | 'ended'

export function formatDateTime(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}

/** 微博式相对时间 */
export function formatRelativeTime(value: string) {
  const t = dayjs(value)
  if (!t.isValid()) return value
  const now = dayjs()
  const diffSec = now.diff(t, 'second')
  if (diffSec < 60) return '刚刚'
  const diffMin = now.diff(t, 'minute')
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffHour = now.diff(t, 'hour')
  if (diffHour < 24) return `${diffHour}小时前`
  const diffDay = now.diff(t, 'day')
  if (diffDay < 7) return `${diffDay}天前`
  if (t.year() === now.year()) return t.format('M-D HH:mm')
  return t.format('YYYY-M-D')
}

export function formatDate(value: string) {
  return dayjs(value).format('YYYY-MM-DD')
}

export function getCurrentDateValue() {
  return dayjs().format('YYYY-MM-DD')
}

export function getCurrentTimeValue() {
  return dayjs().format('HH:mm')
}

export function getActivityPhase(
  activity: Pick<AvailableActivityItem, 'startAt' | 'endAt'> & {
    status?: string
  },
  currentTime = Date.now(),
): ActivityPhase {
  // 后台显式 ended 优先；否则按结束时间
  if (activity.status === 'ended') {
    return 'ended'
  }
  const endTime = dayjs(activity.endAt).valueOf()
  if (currentTime > endTime) {
    return 'ended'
  }
  return 'ongoing'
}

export function getActivityPhaseText(phase: ActivityPhase) {
  return {
    ongoing: '进行中',
    ended: '已结束',
  }[phase]
}

/** 是否已到开始时间（提报需在 [startAt, endAt] 内） */
export function isActivityStarted(
  activity: Pick<AvailableActivityItem, 'startAt'>,
  currentTime = Date.now(),
) {
  return currentTime >= dayjs(activity.startAt).valueOf()
}

/** 当前是否允许提报（与后端 findActiveActivity 时间窗一致） */
export function isActivityReportable(
  activity: Pick<AvailableActivityItem, 'startAt' | 'endAt'>,
  currentTime = Date.now(),
) {
  const startTime = dayjs(activity.startAt).valueOf()
  const endTime = dayjs(activity.endAt).valueOf()
  return currentTime >= startTime && currentTime <= endTime
}

export type StatusTone = 'brand' | 'success' | 'warning' | 'error' | 'neutral'

export function getReviewStatusMeta(status: ReviewStatus): {
  text: string
  tone: StatusTone
} {
  switch (status) {
    case 'pending':
      return { text: '待审核', tone: 'warning' }
    case 'approved':
      return { text: '已通过', tone: 'success' }
    case 'rejected':
      return { text: '已驳回', tone: 'error' }
    default:
      return { text: '未知', tone: 'neutral' }
  }
}

export function getGrantStatusMeta(status: GrantStatus): {
  text: string
  tone: StatusTone
} {
  switch (status) {
    case 'pending':
      return { text: '待发放', tone: 'brand' }
    case 'granted':
      return { text: '已发放', tone: 'success' }
    default:
      return { text: '—', tone: 'neutral' }
  }
}

export function getReviewStatusText(status: ReviewStatus) {
  return getReviewStatusMeta(status).text
}

export function getGrantStatusText(status: GrantStatus) {
  return getGrantStatusMeta(status).text
}

/** 列表行：发放优先于审核态展示 */
export function getSubmissionListStatusMeta(item: {
  grantStatus?: GrantStatus | string
  reviewStatus?: ReviewStatus | string
}): { text: string; tone: StatusTone } {
  if (item.grantStatus === 'granted') {
    return getGrantStatusMeta('granted')
  }
  return getReviewStatusMeta((item.reviewStatus || 'pending') as ReviewStatus)
}

export function buildInitials(name: string) {
  return name.trim().slice(0, 2) || '主播'
}

export function formatCountdown(startAt: string, currentTime = Date.now()) {
  const diffMs = Math.max(dayjs(startAt).valueOf() - currentTime, 0)
  const totalMinutes = Math.floor(diffMs / 60_000)
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60

  if (days > 0) {
    return `${days}天 ${hours}小时 ${minutes}分钟`
  }

  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`
  }

  return `${minutes}分钟`
}

