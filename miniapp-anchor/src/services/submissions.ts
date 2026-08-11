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
import { normalizeUploadUrl, uploadWithFallback } from '@/services/upload'
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
  if (session?.mode === 'mock') {
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
  if (session?.mode === 'mock') {
    return getMockSubmissionDetail(recordId)
  }

  return requestJson<SubmissionDetailResponse>(`/submissions/mine/${recordId}`)
}

export async function previewSubmission(payload: PreviewSubmissionPayload) {
  const session = useSessionStore.getState().session
  if (session?.mode === 'mock') {
    return buildMockPreview(payload)
  }

  return requestJson<PreviewResponse>('/submissions/preview', {
    method: 'POST',
    data: payload,
  })
}

export async function createSubmission(payload: CreateOrUpdateSubmissionPayload) {
  const session = useSessionStore.getState().session
  if (session?.mode === 'mock') {
    return saveMockSubmission(payload)
  }

  return requestJson('/submissions', {
    method: 'POST',
    data: payload,
  })
}

export async function updateSubmission(recordId: string, payload: CreateOrUpdateSubmissionPayload) {
  const session = useSessionStore.getState().session
  if (session?.mode === 'mock') {
    return saveMockSubmission(payload, { recordId })
  }

  return requestJson(`/submissions/mine/${recordId}`, {
    method: 'PUT',
    data: payload,
  })
}

export async function removeSubmissionAttachment(recordId: string, attachmentId: string) {
  const session = useSessionStore.getState().session
  if (session?.mode === 'mock') {
    return deleteMockAttachment(recordId, attachmentId)
  }

  return requestJson(`/submissions/mine/${recordId}/attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}

/**
 * 提报截图 / 作业图片上传。
 * 优先 COS 直传（storage）；仅对失败项 / COS 不可用时回退服务端。
 * 半成功时保留 COS 结果，只补传 failedPaths，避免重复上传与孤儿对象。
 */
export async function uploadImages(files: LocalImageFile[]) {
  const session = useSessionStore.getState().session
  if (session?.mode === 'mock') {
    return buildMockUploadItems(files.map((file) => file.path))
  }

  const paths = files.map((f) => f.path).filter((p) => Boolean(p?.trim()))
  if (!paths.length) {
    return { items: [] } satisfies UploadImagesResponse
  }

  const { ordered: items, failedCount } = await uploadWithFallback({
    category: 'submission-proofs',
    kind: 'image',
    filePaths: paths,
    concurrency: 2,
    mapDirectItem: (item) => ({
      fileName:
        item.objectKey.split('/').pop() ||
        item.publicUrl.split('/').pop() ||
        'image',
      fileUrl: normalizeUploadUrl(item.publicUrl),
    }),
    uploadServerFile: async (filePath) => {
      const uploaded = await uploadSingleImage(filePath)
      const item = uploaded.items[0]
      if (!item) {
        throw new Error('上传成功但未返回文件地址')
      }
      return item
    },
  })

  if (items.length === 0) {
    throw new Error('图片上传失败，请重试')
  }
  if (failedCount > 0) {
    throw new Error(`有 ${failedCount} 张图片上传失败，请重试`)
  }

  return { items } satisfies UploadImagesResponse
}

/**
 * 直传原图，不做客户端有损压缩。
 * COS 侧已开数据万象/压缩，避免双重压缩导致画质下降。
 */
async function uploadSingleImage(
  filePath: string,
  options?: { endpoint?: string },
) {
  const session = useSessionStore.getState().session

  if (!session?.token || session.mode !== 'real') {
    return Promise.reject(new Error('请先登录后再上传图片'))
  }

  if (!filePath?.trim()) {
    return Promise.reject(new Error('无效的图片路径'))
  }

  const endpoint = options?.endpoint || '/submissions/upload-images'

  return new Promise<UploadImagesResponse>((resolve, reject) => {
    const task = Taro.uploadFile({
      url: `${getApiBaseUrl()}${endpoint}`,
      filePath,
      name: 'files',
      // 部分安卓机对无 Content-Type 的 multipart 更稳；由运行时自动带 boundary
      header: {
        Authorization: `Bearer ${session.token}`,
      },
      // 原图体积更大，放宽超时
      timeout: 120_000,
      success: (result: { data: string; statusCode: number }) => {
        try {
          const payload = JSON.parse(result.data) as UploadImagesResponse & {
            message?: string
            error?: string
          }

          if (result.statusCode === 401) {
            useSessionStore.getState().clearSession()
            reject(new Error('登录已过期，请重新登录'))
            return
          }

          if (result.statusCode < 200 || result.statusCode >= 300) {
            reject(
              new Error(
                payload.message ||
                  payload.error ||
                  `上传失败(${result.statusCode})`,
              ),
            )
            return
          }

          // 保留相对路径 /api/uploads/... 供 create/update 提交
          const items = (payload.items ?? []).map((item) => ({
            fileName: item.fileName,
            fileUrl: item.fileUrl,
          }))

          if (items.length === 0) {
            reject(new Error('上传成功但未返回文件地址'))
            return
          }

          resolve({ items })
        } catch (error) {
          console.error('[Upload] 解析上传响应失败', error, result.data)
          reject(new Error('上传响应异常，请重试'))
        }
      },
      fail: (error: unknown) => {
        console.error('[Upload] 上传失败', error)
        const msg =
          error && typeof error === 'object' && 'errMsg' in error
            ? String((error as { errMsg?: string }).errMsg || '')
            : ''
        reject(
          new Error(
            msg.includes('timeout')
              ? '上传超时，请检查网络后重试'
              : msg.includes('fail')
                ? '网络异常，上传失败'
                : '图片上传失败，请重试',
          ),
        )
      },
    })
    void task
  })
}

/** 头像专用：优先 COS profile-avatars，失败回退 /anchors/me/upload-avatar */
export async function uploadAvatar(file: LocalImageFile) {
  const session = useSessionStore.getState().session
  if (session?.mode === 'mock') {
    return buildMockUploadItems([file.path])
  }
  const path = file.path?.trim()
  if (!path) {
    throw new Error('无效的图片路径')
  }

  const { ordered, failedCount } = await uploadWithFallback({
    category: 'profile-avatars',
    kind: 'image',
    filePaths: [path],
    concurrency: 1,
    mapDirectItem: (item) => ({
      fileName:
        item.objectKey.split('/').pop() ||
        item.publicUrl.split('/').pop() ||
        'avatar',
      fileUrl: normalizeUploadUrl(item.publicUrl),
    }),
    uploadServerFile: async (filePath) => {
      const uploaded = await uploadSingleImage(filePath, {
        endpoint: '/anchors/me/upload-avatar',
      })
      const item = uploaded.items[0]
      if (!item) {
        throw new Error('上传成功但未返回头像地址')
      }
      return item
    },
  })

  if (!ordered.length || failedCount > 0) {
    throw new Error('头像上传失败，请重试')
  }

  return { items: [ordered[0]] } satisfies UploadImagesResponse
}

function buildMockPreview(payload: PreviewSubmissionPayload): PreviewResponse {
  const activityDetail = getMockActivityDetail(payload.activityId).item

  if (activityDetail.formConfig.mode === 'pk_score') {
    const pkValue = Number(payload.pkValue ?? 0)
    // 互斥区间：命中唯一档 [min, max]，无 max 时按最高 ≥ 门槛
    const matched = matchPkExclusiveRule(
      activityDetail.formConfig.rewardRules,
      pkValue,
    )
    const matchedRewards = matched ? [matched] : []

    return {
      mode: 'pk_score',
      pkValue,
      matchedRewards,
      rewardSummaryText:
        matchedRewards.length > 0
          ? `本次预计命中：${matchedRewards[0].rewardLabel}${
              matchedRewards[0].rangeLabel
                ? `（${matchedRewards[0].rangeLabel}）`
                : ''
            }`
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

/** PK 互斥档：落在 [min,max] 唯一命中；无 max 时取最高 ≥min */
function matchPkExclusiveRule(
  rewardRules: RewardRuleReference[],
  pkValue: number,
): RewardRuleReference | null {
  if (!Number.isFinite(pkValue)) return null
  const candidates = rewardRules.filter((rule) => {
    const min = Number(rule.threshold)
    if (!Number.isFinite(min) || pkValue < min) return false
    const max =
      rule.maxThreshold === undefined || rule.maxThreshold === null
        ? null
        : Number(rule.maxThreshold)
    if (max != null && Number.isFinite(max) && pkValue > max) return false
    return true
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const aHasMax =
      a.maxThreshold != null && Number.isFinite(Number(a.maxThreshold))
    const bHasMax =
      b.maxThreshold != null && Number.isFinite(Number(b.maxThreshold))
    if (aHasMax !== bHasMax) return aHasMax ? -1 : 1
    return Number(b.threshold) - Number(a.threshold)
  })
  return candidates[0] ?? null
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
