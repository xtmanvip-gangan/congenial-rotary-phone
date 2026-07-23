import dayjs from 'dayjs'
import type { AvailableActivityItem } from '@/types/activity'
import type { GrantStatus, ReviewStatus } from '@/types/submission'

export type ActivityPhase = 'upcoming' | 'ongoing' | 'ended'

export function formatDateTime(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm')
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

export function getActivityPhase(activity: Pick<AvailableActivityItem, 'startAt' | 'endAt'>, currentTime = Date.now()): ActivityPhase {
  const startTime = dayjs(activity.startAt).valueOf()
  const endTime = dayjs(activity.endAt).valueOf()

  if (currentTime < startTime) {
    return 'upcoming'
  }

  if (currentTime > endTime) {
    return 'ended'
  }

  return 'ongoing'
}

export function getActivityPhaseText(phase: ActivityPhase) {
  return {
    upcoming: '未开始',
    ongoing: '进行中',
    ended: '已结束',
  }[phase]
}

export function getReviewStatusText(status: ReviewStatus) {
  return {
    pending: '待审核',
    approved: '已通过',
    rejected: '已驳回',
  }[status]
}

export function getGrantStatusText(status: GrantStatus) {
  return {
    pending: '待发放',
    granted: '已发放',
  }[status]
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
