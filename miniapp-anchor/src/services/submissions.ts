import Taro from '@tarojs/taro'
import { getMockActivityDetail } from '@/data/mock-activities'
import {
  buildMockUploadItems,
  deleteMockAttachment,
  getMockSubmissionDetail,
  getMockSubmissions,
  saveMockSubmission,
} from '@/data/mock-submissions'
import { getApiBaseUrl, requestJson } from '@/services/request'
import { useSessionStore } from '@/store/session'
import type { RewardRuleReference } from '@/types/activity'
import type {
  CreateOrUpdateSubmissionPayload,
  LocalImageFile,
  MySubmissionsResponse,
  PreviewResponse,
  PreviewSubmissionPayload,
  SubmissionDetailResponse,
  SubmissionEntryItem,
  UploadImagesResponse,
} from '@/types/submission'

export async function getMySubmissions(activityId?: string) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    const response = getMockSubmissions()
    if (!activityId) {
      return response
    }

    return {
      items: response.items.filter((item) => item.activity.id === activityId),
    }
  }

  const query = activityId ? `?activityId=${encodeURIComponent(activityId)}` : ''
  return requestJson<MySubmissionsResponse>(`/submissions/mine${query}`)
}

export async function getSubmissionDetail(recordId: string) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return getMockSubmissionDetail(recordId)
  }

  return requestJson<SubmissionDetailResponse>(`/submissions/mine/${recordId}`)
}

export async function previewSubmission(payload: PreviewSubmissionPayload) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return buildMockPreview(payload)
  }

  return requestJson<PreviewResponse>('/submissions/preview', {
    method: 'POST',
    data: payload,
  })
}

export async function createSubmission(payload: CreateOrUpdateSubmissionPayload) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return saveMockSubmission(payload)
  }

  return requestJson('/submissions', {
    method: 'POST',
    data: payload,
  })
}

export async function updateSubmission(recordId: string, payload: CreateOrUpdateSubmissionPayload) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return saveMockSubmission(payload, { recordId })
  }

  return requestJson(`/submissions/mine/${recordId}`, {
    method: 'PUT',
    data: payload,
  })
}

export async function removeSubmissionAttachment(recordId: string, attachmentId: string) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return deleteMockAttachment(recordId, attachmentId)
  }

  return requestJson(`/submissions/mine/${recordId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}

export async function uploadImages(files: LocalImageFile[]) {
  const session = useSessionStore.getState().session
  if (!session || session.mode === 'mock') {
    return buildMockUploadItems(files.map((file) => file.path))
  }

  const uploadResults = await Promise.all(files.map((file) => uploadSingleImage(file.path)))

  return {
    items: uploadResults.reduce<Array<{ fileName: string; fileUrl: string }>>((items, result) => {
      return [...items, ...result.items]
    }, []),
  } satisfies UploadImagesResponse
}

function uploadSingleImage(filePath: string) {
  const session = useSessionStore.getState().session

  return new Promise<UploadImagesResponse>((resolve, reject) => {
    Taro.uploadFile({
      url: `${getApiBaseUrl()}/submissions/upload-images`,
      filePath,
      name: 'files',
      header: session?.mode === 'real' ? { Authorization: `Bearer ${session.token}` } : undefined,
      success: (result: { data: string; statusCode: number }) => {
        try {
          const payload = JSON.parse(result.data) as UploadImagesResponse & {
            message?: string
            error?: string
          }

          if (result.statusCode === 401) {
            useSessionStore.getState().clearSession()
          }

          if (result.statusCode < 200 || result.statusCode >= 300) {
            reject(new Error(payload.message || payload.error || '截图上传失败'))
            return
          }

          resolve({
            items: payload.items ?? [],
          })
        } catch (error) {
          console.error('[Upload] 解析上传响应失败', error)
          reject(new Error('截图上传失败'))
        }
      },
      fail: (error: unknown) => {
        console.error('[Upload] 上传失败', error)
        reject(new Error('截图上传失败'))
      },
    })
  })
}

function buildMockPreview(payload: PreviewSubmissionPayload): PreviewResponse {
  const activityDetail = getMockActivityDetail(payload.activityId).item

  if (activityDetail.formConfig.mode === 'pk_score') {
    const pkValue = Number(payload.pkValue ?? 0)
    const matchedRewards = activityDetail.formConfig.rewardRules
      .filter((rule) => pkValue >= rule.threshold)
      .sort((left, right) => right.threshold - left.threshold)
      .slice(0, 1)

    return {
      mode: 'pk_score',
      pkValue,
      matchedRewards,
      rewardSummaryText:
        matchedRewards.length > 0
          ? `本次预计命中：${matchedRewards[0].rewardLabel}`
          : '当前 PK 值还未达到奖励门槛',
    }
  }

  const normalizedItems = normalizeItems(payload.items ?? [])
  const matchedRewards = matchGiftRewards(activityDetail.formConfig.rewardRules, normalizedItems)

  return {
    mode: 'gift_collection',
    liveDate: payload.liveDate,
    selectedItems: normalizedItems,
    dailyTotals: normalizedItems,
    matchedRewards,
    rewardSummaryText:
      matchedRewards.length > 0
        ? `本次预计命中 ${matchedRewards.length} 项奖励：${matchedRewards.map((item) => item.rewardLabel).join('；')}`
        : '当前填写内容还未达到奖励门槛',
  }
}

function normalizeItems(items: SubmissionEntryItem[]) {
  const totals = new Map<string, number>()

  items.forEach((item) => {
    const itemName = item.itemName.trim()
    const quantity = Number(item.quantity)
    if (!itemName || !Number.isFinite(quantity) || quantity <= 0) {
      return
    }

    totals.set(itemName, (totals.get(itemName) ?? 0) + quantity)
  })

  return Array.from(totals.entries()).map(([itemName, quantity]) => ({
    itemName,
    quantity,
  }))
}

function matchGiftRewards(rewardRules: RewardRuleReference[], items: SubmissionEntryItem[]) {
  const totals = new Map<string, number>()
  items.forEach((item) => {
    totals.set(item.itemName, item.quantity)
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
