import { requestJson } from '@/services/request'

export type OnboardingMilestoneStatus =
  | 'pending'
  | 'awaiting_anchor_confirm'
  | 'completed'

export type OnboardingMilestone = {
  id: string | null
  type: string
  label: string
  status: OnboardingMilestoneStatus
  requiresAnchorConfirm: boolean
  evidence: Record<string, unknown> | null
  attachmentUrls: string[]
  note: string | null
  rejectReason: string | null
  submittedAt: string | null
}

export type OnboardingProgress = {
  anchor: { id: string; anchorDisplayName: string }
  completedCount: number
  totalCount: number
  nextMilestone: string | null
  trainingConfirmItems: Array<{ key: string; label: string }>
  milestones: OnboardingMilestone[]
}

export function getMyOnboarding() {
  return requestJson<{ item: OnboardingProgress }>('/anchors/me/onboarding')
}

export function confirmOnboardingMilestone(
  type: string,
  checklist?: Record<string, boolean>,
) {
  return requestJson<{ item: OnboardingProgress }>(
    `/anchors/me/onboarding/${type}/confirm`,
    {
      method: 'POST',
      data: { checklist },
    },
  )
}

export function rejectOnboardingMilestone(type: string, reason: string) {
  return requestJson<{ item: OnboardingProgress }>(
    `/anchors/me/onboarding/${type}/reject`,
    {
      method: 'POST',
      data: { reason },
    },
  )
}
