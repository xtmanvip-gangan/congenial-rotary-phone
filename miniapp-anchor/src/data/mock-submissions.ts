import { getMockActivityDetail } from '@/data/mock-activities'
import type { RewardRuleReference } from '@/types/activity'
import type {
  CreateOrUpdateSubmissionPayload,
  MySubmissionsResponse,
  SubmissionAttachment,
  SubmissionDetailResponse,
  SubmissionEntryItem,
} from '@/types/submission'

type SaveMockSubmissionOptions = {
  recordId?: string
}

let mockSubmissionItems: SubmissionDetailResponse['item'][] = [
  {
    id: 'record-1001',
    anchorName: '预览主播小雨',
    operatorId: 'operator-1',
    operatorName: '运营老师-安安',
    operatorAssignmentStatus: 'confirmed',
    liveDate: '2026-07-18',
    liveStartTime: '19:30',
    reviewStatus: 'pending',
    grantStatus: 'pending',
    rejectReason: null,
    attachments: [
      {
        id: 'attachment-1001',
        fileUrl: 'https://picsum.photos/id/103/600/400',
      },
    ],
    items: [
      { itemName: '鲜花', quantity: 12 },
      { itemName: '掌声', quantity: 15 },
    ],
    pkValue: null,
    rewardSummaryText: '已命中 2 项奖励：鲜花达 10 个，奖励 20 元；掌声达 15 个，奖励精选礼包',
    activity: getMockActivityDetail('activity-gift-1').item,
  },
  {
    id: 'record-1002',
    anchorName: '预览主播小雨',
    operatorId: 'operator-2',
    operatorName: '运营老师-阿泽',
    operatorAssignmentStatus: 'confirmed',
    liveDate: '2026-07-17',
    liveStartTime: '21:00',
    reviewStatus: 'rejected',
    grantStatus: 'pending',
    rejectReason: '截图不清晰，请重新补传完整直播截图。',
    attachments: [
      {
        id: 'attachment-1002',
        fileUrl: 'https://picsum.photos/id/201/600/400',
      },
    ],
    items: [{ itemName: '鲜花', quantity: 8 }],
    pkValue: null,
    rewardSummaryText: '本次暂未命中奖励',
    activity: getMockActivityDetail('activity-gift-1').item,
  },
]

export function getMockSubmissions(): MySubmissionsResponse {
  return {
    items: mockSubmissionItems
      .slice()
      .sort((left, right) => `${right.liveDate} ${right.liveStartTime}`.localeCompare(`${left.liveDate} ${left.liveStartTime}`))
      .map((item) => ({
        id: item.id,
        activity: {
          id: item.activity.id,
          name: item.activity.name,
          typeName: item.activity.type.typeName,
        },
        anchorName: item.anchorName,
        operatorName: item.operatorName,
        operatorAssignmentStatus: item.operatorAssignmentStatus,
        liveDate: item.liveDate,
        liveStartTime: item.liveStartTime,
        reviewStatus: item.reviewStatus,
        grantStatus: item.grantStatus,
        rejectReason: item.rejectReason,
        createdAt: `${item.liveDate}T${item.liveStartTime}:00.000Z`,
        items: item.items.map((entry) => ({ ...entry })),
        attachmentUrls: item.attachments.map((attachment) => attachment.fileUrl),
        rewardSummaryText: item.rewardSummaryText,
      })),
  }
}

export function getMockSubmissionDetail(recordId: string): SubmissionDetailResponse {
  const item = mockSubmissionItems.find((entry) => entry.id === recordId) ?? mockSubmissionItems[0]

  return {
    item: JSON.parse(JSON.stringify(item)) as SubmissionDetailResponse['item'],
  }
}

export function saveMockSubmission(
  payload: CreateOrUpdateSubmissionPayload,
  options: SaveMockSubmissionOptions = {},
): SubmissionDetailResponse {
  const activityId = payload.activityId ?? resolveActivityIdByRecordId(options.recordId)
  const detail = getMockActivityDetail(activityId)
  const existing = options.recordId
    ? mockSubmissionItems.find((item) => item.id === options.recordId) ?? null
    : null

  const attachments = payload.attachmentUrls.map((fileUrl, index) => ({
    id: existing?.attachments[index]?.id ?? `attachment-${Date.now()}-${index + 1}`,
    fileUrl,
  }))

  const nextItem: SubmissionDetailResponse['item'] = {
    id: existing?.id ?? `record-${Date.now()}`,
    anchorName:
      existing?.anchorName ?? detail.anchorProfile.anchorDisplayName,
    operatorId: existing?.operatorId ?? detail.anchorProfile.operator.id,
    operatorName:
      existing?.operatorName ?? detail.anchorProfile.operator.displayName,
    operatorAssignmentStatus:
      existing?.operatorAssignmentStatus ??
      detail.anchorProfile.assignmentStatus,
    liveDate: payload.liveDate,
    liveStartTime: payload.liveStartTime,
    reviewStatus: 'pending',
    grantStatus: existing?.grantStatus ?? 'pending',
    rejectReason: null,
    attachments,
    items: payload.items?.map((item) => ({ ...item })) ?? [],
    pkValue: payload.pkValue ?? null,
    rewardSummaryText: buildRewardSummary(activityId, payload.items ?? [], payload.pkValue ?? null),
    activity: detail.item,
  }

  if (existing) {
    mockSubmissionItems = mockSubmissionItems.map((item) => (item.id === existing.id ? nextItem : item))
  } else {
    mockSubmissionItems = [nextItem, ...mockSubmissionItems]
  }

  return {
    item: JSON.parse(JSON.stringify(nextItem)) as SubmissionDetailResponse['item'],
  }
}

export function deleteMockAttachment(recordId: string, attachmentId: string) {
  mockSubmissionItems = mockSubmissionItems.map((item) => {
    if (item.id !== recordId) {
      return item
    }

    return {
      ...item,
      attachments: item.attachments.filter((attachment) => attachment.id !== attachmentId),
    }
  })

  return {
    ok: true,
  }
}

function resolveActivityIdByRecordId(recordId?: string) {
  if (!recordId) {
    return 'activity-gift-1'
  }

  return mockSubmissionItems.find((item) => item.id === recordId)?.activity.id ?? 'activity-gift-1'
}

function buildRewardSummary(activityId: string, items: SubmissionEntryItem[], pkValue: number | null) {
  const matchedRewards = matchRewards(activityId, items, pkValue)

  if (matchedRewards.length === 0) {
    return '本次暂未命中奖励'
  }

  return `已命中 ${matchedRewards.length} 项奖励：${matchedRewards.map((item) => item.rewardLabel).join('；')}`
}

function matchRewards(activityId: string, items: SubmissionEntryItem[], pkValue: number | null) {
  const activityDetail = getMockActivityDetail(activityId).item
  const rewardRules = activityDetail.formConfig.rewardRules

  if (activityDetail.formConfig.mode === 'pk_score') {
    const currentValue = Number(pkValue ?? 0)
    return rewardRules
      .filter((rule) => currentValue >= rule.threshold)
      .sort((left, right) => right.threshold - left.threshold)
      .slice(0, 1)
  }

  const totals = new Map<string, number>()
  items.forEach((item) => {
    const nextValue = Number(item.quantity || 0)
    if (!item.itemName || !Number.isFinite(nextValue) || nextValue <= 0) {
      return
    }

    totals.set(item.itemName, (totals.get(item.itemName) ?? 0) + nextValue)
  })

  const matchedByItem = new Map<string, RewardRuleReference>()

  rewardRules.forEach((rule) => {
    if (!rule.itemName) {
      return
    }

    const currentValue = totals.get(rule.itemName) ?? 0
    const hit = rule.compareMode === 'eq' ? currentValue === rule.threshold : currentValue >= rule.threshold

    if (!hit) {
      return
    }

    const previous = matchedByItem.get(rule.itemName)
    if (!previous || previous.threshold <= rule.threshold) {
      matchedByItem.set(rule.itemName, rule)
    }
  })

  return Array.from(matchedByItem.values()).sort((left, right) => right.threshold - left.threshold)
}

export function buildMockUploadItems(localPaths: string[]) {
  return {
    items: localPaths.map((path, index) => ({
      fileName: `mock-upload-${index + 1}.jpg`,
      fileUrl: path,
    })),
  }
}

export function buildMockAttachments(fileUrls: string[]): SubmissionAttachment[] {
  return fileUrls.map((fileUrl, index) => ({
    id: `attachment-${Date.now()}-${index + 1}`,
    fileUrl,
  }))
}
