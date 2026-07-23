import type { ActivityDetailItem, RewardRuleReference } from './activity'

export type ReviewStatus = 'pending' | 'approved' | 'rejected'
export type GrantStatus = 'pending' | 'granted'

export type SubmissionEntryItem = {
  itemName: string
  quantity: number
}

export type SubmissionAttachment = {
  id: string
  fileUrl: string
}

export type SubmissionRecordItem = {
  id: string
  activity: {
    id: string
    name: string
    typeName: string
  }
  anchorName: string
  operatorName: string
  operatorAssignmentStatus: 'pending_confirmation' | 'confirmed'
  liveDate: string
  liveStartTime: string
  reviewStatus: ReviewStatus
  grantStatus: GrantStatus
  rejectReason: string | null
  createdAt: string
  items: SubmissionEntryItem[]
  attachmentUrls: string[]
  rewardSummaryText: string
}

export type MySubmissionsResponse = {
  items: SubmissionRecordItem[]
}

export type SubmissionDetailItem = {
  id: string
  anchorName: string
  operatorId: string
  operatorName: string
  operatorAssignmentStatus: 'pending_confirmation' | 'confirmed'
  liveDate: string
  liveStartTime: string
  reviewStatus: ReviewStatus
  grantStatus: GrantStatus
  rejectReason: string | null
  attachments: SubmissionAttachment[]
  items: SubmissionEntryItem[]
  pkValue: number | null
  rewardSummaryText: string
  activity: ActivityDetailItem
}

export type SubmissionDetailResponse = {
  item: SubmissionDetailItem
}

export type PreviewGiftResponse = {
  mode: 'gift_collection'
  liveDate: string
  selectedItems: SubmissionEntryItem[]
  dailyTotals: SubmissionEntryItem[]
  matchedRewards: RewardRuleReference[]
  rewardSummaryText: string
}

export type PreviewPkResponse = {
  mode: 'pk_score'
  pkValue: number
  matchedRewards: RewardRuleReference[]
  rewardSummaryText: string
}

export type PreviewResponse = PreviewGiftResponse | PreviewPkResponse

export type CreateOrUpdateSubmissionPayload = {
  activityId?: string
  liveDate: string
  liveStartTime: string
  items?: SubmissionEntryItem[]
  pkValue?: number
  attachmentUrls: string[]
}

export type PreviewSubmissionPayload = {
  activityId: string
  submissionId?: string
  liveDate: string
  items?: SubmissionEntryItem[]
  pkValue?: number
}

export type UploadImagesResponse = {
  items: Array<{
    fileName: string
    fileUrl: string
  }>
}

export type LocalImageFile = {
  path: string
  name: string
}
