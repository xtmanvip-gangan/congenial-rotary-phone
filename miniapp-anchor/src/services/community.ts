import Taro from '@tarojs/taro'
import { getApiBaseUrl, requestJson } from '@/services/request'
import { normalizeUploadUrl, uploadWithFallback } from '@/services/upload'
import { useSessionStore } from '@/store/session'

export type CommunityMedia = {
  type: 'image' | 'video'
  url: string
  coverUrl?: string
  durationSec?: number
  /** 像素宽（视频列表比例用，可选） */
  width?: number
  /** 像素高（视频列表比例用，可选） */
  height?: number
}

export type CommunityTag = {
  id: string
  name: string
  sortOrder?: number
  enabled?: boolean
}

export type CommunityAuthor = {
  wecomUserId: string
  kind: string
  displayName: string
  avatarUrl: string | null
  tier?: number | null
  tierName?: string | null
}

export type CommunityPost = {
  id: string
  channel: 'plaza' | 'official' | 'help'
  isHelp: boolean
  title: string | null
  body: string
  media: CommunityMedia[]
  status: 'pending' | 'approved' | 'rejected' | 'taken_down'
  rejectReason: string | null
  likeCount: number
  commentCount: number
  likedByMe: boolean
  followingAuthor?: boolean
  pinnedAt: string | null
  recommendedAt?: string | null
  recommended?: boolean
  publishedAt: string | null
  createdAt: string
  author: CommunityAuthor
  tags: CommunityTag[]
  isAuthor?: boolean
}

export type CommunityPublicProfile = {
  wecomUserId: string
  kind: 'anchor' | 'staff'
  displayName: string
  avatarUrl: string | null
  /** 朋友圈顶部封面 */
  coverUrl?: string | null
  /** 个性签名 */
  bio?: string | null
  tier: number | null
  tierName: string | null
  roleLabel: string | null
  isSelf: boolean
  following: boolean
  stats: {
    postCount: number
    followerCount: number
    followingCount: number
  }
  joinedAt: string | null
}

/** 更新本人社区主页（封面 / 签名） */
export function updateMyCommunityProfile(body: {
  coverUrl?: string | null
  bio?: string | null
}) {
  return requestJson<{ item: { coverUrl: string | null; bio: string | null } }>(
    '/community/me/profile',
    { method: 'PATCH', data: body },
  )
}

export type CommunityComment = {
  id: string
  postId: string
  parentId: string | null
  body: string
  createdAt: string
  isAuthor?: boolean
  author: CommunityAuthor
  replies?: CommunityComment[]
}

export function listCommunityTags() {
  return requestJson<{ items: CommunityTag[] }>('/community/tags')
}

export function listCommunityPosts(query: {
  channel?: string
  tagId?: string
  keyword?: string
  cursor?: string
  take?: number
}) {
  const params = new URLSearchParams()
  if (query.channel) params.set('channel', query.channel)
  if (query.tagId) params.set('tagId', query.tagId)
  if (query.keyword?.trim()) params.set('keyword', query.keyword.trim())
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.take) params.set('take', String(query.take))
  const qs = params.toString()
  return requestJson<{ items: CommunityPost[]; nextCursor: string | null }>(
    `/community/posts${qs ? `?${qs}` : ''}`,
  )
}

export function listMyCommunityPosts(query?: { status?: string }) {
  const params = new URLSearchParams()
  if (query?.status) params.set('status', query.status)
  const qs = params.toString()
  return requestJson<{ items: CommunityPost[] }>(
    `/community/posts/mine${qs ? `?${qs}` : ''}`,
  )
}

export function getCommunityPost(id: string) {
  return requestJson<{ item: CommunityPost }>(`/community/posts/${id}`)
}

export function createCommunityPost(body: {
  channel?: string
  isHelp?: boolean
  title?: string
  body: string
  media?: CommunityMedia[]
  tagIds?: string[]
}) {
  return requestJson<{ item: CommunityPost }>('/community/posts', {
    method: 'POST',
    data: body,
  })
}

export function updateCommunityPost(
  id: string,
  body: {
    title?: string
    body?: string
    media?: CommunityMedia[]
    tagIds?: string[]
    isHelp?: boolean
  },
) {
  return requestJson<{ item: CommunityPost }>(`/community/posts/${id}`, {
    method: 'PATCH',
    data: body,
  })
}

export function deleteCommunityPost(id: string) {
  return requestJson<{ ok: boolean }>(`/community/posts/${id}`, {
    method: 'DELETE',
    // 删除写库可能偏慢；过短超时会「提示失败但服务端已删」
    timeout: 30000,
  })
}

export function toggleCommunityLike(id: string) {
  return requestJson<{ item: CommunityPost; liked: boolean }>(
    `/community/posts/${id}/like`,
    { method: 'POST' },
  )
}

export type CommunityLiker = {
  wecomUserId: string
  displayName: string
  /** 详情页点赞头像；列表可无 */
  avatarUrl?: string | null
  isMe?: boolean
}

export function listCommunityLikers(
  postId: string,
  query?: { take?: number },
) {
  const params = new URLSearchParams()
  if (query?.take) params.set('take', String(query.take))
  const qs = params.toString()
  return requestJson<{ total: number; items: CommunityLiker[] }>(
    `/community/posts/${postId}/likes${qs ? `?${qs}` : ''}`,
  )
}

export function listCommunityComments(
  postId: string,
  query?: { take?: number; cursor?: string },
) {
  const params = new URLSearchParams()
  if (query?.take) params.set('take', String(query.take))
  if (query?.cursor) params.set('cursor', query.cursor)
  const qs = params.toString()
  return requestJson<{ items: CommunityComment[]; nextCursor: string | null }>(
    `/community/posts/${postId}/comments${qs ? `?${qs}` : ''}`,
  )
}

export function createCommunityComment(
  postId: string,
  body: { body: string; parentId?: string },
) {
  return requestJson<{ item: CommunityComment }>(
    `/community/posts/${postId}/comments`,
    { method: 'POST', data: body },
  )
}

export function deleteCommunityComment(id: string) {
  return requestJson<{ ok: boolean }>(`/community/comments/${id}`, {
    method: 'DELETE',
  })
}

export function toggleCommunityFollow(wecomUserId: string) {
  const id = encodeURIComponent(wecomUserId)
  return requestJson<{ following: boolean }>(
    `/community/users/${id}/follow`,
    { method: 'POST' },
  )
}

export function getCommunityUserProfile(wecomUserId: string) {
  const id = encodeURIComponent(wecomUserId)
  return requestJson<{
    item: CommunityPublicProfile
    posts: CommunityPost[]
  }>(`/community/users/${id}`)
}

/**
 * 社区媒体上传：
 * 1) 优先 COS 直传（/storage/presign + PUT）
 * 2) COS 未配置时回落服务端 /community/upload（本机磁盘）
 */
export async function uploadCommunityFiles(
  filePaths: string[],
  options?: { kind?: 'image' | 'video' },
): Promise<CommunityMedia[]> {
  const session = useSessionStore.getState().session
  if (!session?.token || session.mode !== 'real') {
    throw new Error('请先登录后再上传')
  }
  if (!filePaths.length) return []
  const kind =
    options?.kind ||
    (/\.(mp4|mov|webm)(\?|$)/i.test(filePaths[0]) ? 'video' : 'image')

  const { ordered, failedCount } = await uploadWithFallback({
    category: 'community',
    kind,
    filePaths,
    concurrency: kind === 'video' ? 1 : 2,
    mapDirectItem: (item) => ({
      type: (item.contentType.startsWith('video/') ? 'video' : 'image') as
        | 'image'
        | 'video',
      url: normalizeUploadUrl(item.publicUrl),
    }),
    uploadServerFile: (filePath) => uploadCommunityFileByServer(filePath, session.token),
  })

  if (failedCount > 0) {
    throw new Error(`有 ${failedCount} 个文件上传失败，请重试`)
  }

  return ordered
}

async function uploadCommunityFileByServer(
  filePath: string,
  token: string,
): Promise<CommunityMedia> {
  const result = await new Promise<{
    type: 'image' | 'video'
    fileUrl: string
    coverUrl?: string
    width?: number
    height?: number
    durationSec?: number
  }>((resolve, reject) => {
    Taro.uploadFile({
      url: `${getApiBaseUrl()}/community/upload`,
      filePath,
      name: 'files',
      header: { Authorization: `Bearer ${token}` },
      timeout: 60_000,
      success: (res) => {
        try {
          const payload = JSON.parse(res.data) as {
            items?: Array<{
              type: 'image' | 'video'
              fileUrl: string
              coverUrl?: string
              width?: number
              height?: number
              durationSec?: number
            }>
            message?: string
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(payload.message || `上传失败(${res.statusCode})`))
            return
          }
          const item = payload.items?.[0]
          if (!item?.fileUrl) {
            reject(new Error('上传失败'))
            return
          }
          resolve({
            type: item.type,
            fileUrl: item.fileUrl,
            coverUrl: item.coverUrl,
            width: Number(item.width) || undefined,
            height: Number(item.height) || undefined,
            durationSec: Number(item.durationSec) || undefined,
          })
        } catch (e) {
          reject(e instanceof Error ? e : new Error('上传解析失败'))
        }
      },
      fail: (err) => reject(new Error(err.errMsg || '上传失败')),
    })
  })

  return {
    type: result.type,
    url: normalizeUploadUrl(result.fileUrl),
    coverUrl: result.coverUrl ? normalizeUploadUrl(result.coverUrl) : undefined,
    width: result.width,
    height: result.height,
    durationSec: result.durationSec,
  }
}
