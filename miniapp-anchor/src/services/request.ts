import Taro from '@tarojs/taro'
import { useSessionStore } from '@/store/session'

declare const process: {
  env: {
    TARO_APP_API_BASE_URL?: string
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  data?: unknown
  header?: Record<string, string>
  /** 毫秒，默认 15000；删除等写操作可加长，避免慢网误报失败 */
  timeout?: number
}

type ErrorPayload = {
  message?: string | string[]
  error?: string
  code?: string
}

export type RequestErrorKind =
  | 'auth'
  | 'network'
  | 'timeout'
  | 'server'
  | 'unknown'

type RequestErrorInput = {
  message: string
  kind: RequestErrorKind
  statusCode?: number
  code?: string
  cause?: unknown
}

export class RequestError extends Error {
  readonly kind: RequestErrorKind
  readonly statusCode?: number
  readonly code?: string
  readonly cause?: unknown

  constructor(input: RequestErrorInput) {
    super(input.message)
    this.name = 'RequestError'
    this.kind = input.kind
    this.statusCode = input.statusCode
    this.code = input.code
    this.cause = input.cause
  }
}

const UPLOAD_PATH_CATEGORIES = [
  'submission-proofs',
  'grant-proofs',
  'onboarding-proofs',
  'profile-avatars',
  'activity-covers',
  'community',
  'diy',
  'training',
] as const

const UPLOAD_PATH_PATTERN = new RegExp(
  `(\\/api\\/uploads\\/(?:${UPLOAD_PATH_CATEGORIES.join('|')})\\/[^/?#]+)`,
)

export function getApiBaseUrl() {
  return (process.env.TARO_APP_API_BASE_URL || 'https://ac.ydwy.net/api').replace(/\/$/, '')
}

function extractErrorMessage(
  payload: ErrorPayload | undefined,
  fallback: string,
) {
  const raw = payload?.message
  if (Array.isArray(raw)) {
    const message = raw.map((item) => item?.trim()).filter(Boolean).join('；')
    if (message) return message
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim()
  }
  if (typeof payload?.error === 'string' && payload.error.trim()) {
    return payload.error.trim()
  }
  return fallback
}

function normalizeRequestError(error: unknown, fallback: string) {
  if (error instanceof RequestError) {
    return error
  }

  const rawMessage =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : typeof error === 'object' &&
          error &&
          'errMsg' in error &&
          typeof (error as { errMsg?: unknown }).errMsg === 'string'
        ? String((error as { errMsg?: string }).errMsg).trim()
        : ''

  if (/401|unauthorized|token|登录态|登录已过期|未登录/i.test(rawMessage)) {
    return new RequestError({
      message: '登录状态已失效，请重新进入小程序',
      kind: 'auth',
      statusCode: 401,
      cause: error,
    })
  }

  if (/timeout|超时/i.test(rawMessage)) {
    return new RequestError({
      message: '网络有点慢，请稍后重试',
      kind: 'timeout',
      cause: error,
    })
  }

  if (/fail|network|连接|断开|DNS|socket|request:fail|网络/i.test(rawMessage)) {
    return new RequestError({
      message: '网络开小差了，请检查网络后重试',
      kind: 'network',
      cause: error,
    })
  }

  return new RequestError({
    message: rawMessage || fallback,
    kind: 'unknown',
    cause: error,
  })
}

export function getErrorMessage(error: unknown, fallback: string) {
  return normalizeRequestError(error, fallback).message
}

export function isRequestError(
  error: unknown,
  kind?: RequestErrorKind,
): error is RequestError {
  if (!(error instanceof RequestError)) {
    return false
  }
  return kind ? error.kind === kind : true
}

export function resolveAssetUrl(path: string) {
  if (!path) {
    return ''
  }

  // COS / CDN / 任意绝对地址：原样（去 query 签名可选，展示时保留也可）
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  return new URL(path, `${getApiBaseUrl()}/`).toString()
}

/**
 * 提交给后端的媒体地址归一化：
 * - 历史：/api/uploads/... 相对路径
 * - 新 COS：完整 https 公网 URL（去 query）
 * 展示用 resolveAssetUrl。
 */
export function toUploadPath(url: string) {
  const raw = (url || '').trim()
  if (!raw) return ''

  // 已是规范相对路径
  if (raw.startsWith('/api/uploads/')) {
    return raw.split('?')[0].split('#')[0]
  }

  // https://host/api/uploads/... 或带 query
  const match = raw.match(
    UPLOAD_PATH_PATTERN,
  )
  if (match?.[1]) {
    return match[1]
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const u = new URL(raw)
      const pathname = u.pathname
      if (pathname.startsWith('/uploads/')) {
        return `/api${pathname}`.split('?')[0]
      }
      if (pathname.startsWith('/api/uploads/')) {
        return pathname.split('?')[0]
      }
      // COS / CDN：非本 API 主机的 https 视为远端对象，去 query 后入库
      const host = u.hostname.toLowerCase()
      try {
        const apiBase = getApiBaseUrl()
        const apiHost = new URL(
          apiBase.startsWith('http') ? apiBase : `https://${apiBase}`,
        ).hostname.toLowerCase()
        if (host !== apiHost) {
          return `${u.origin}${pathname}`.split('#')[0]
        }
      } catch {
        return `${u.origin}${pathname}`.split('#')[0]
      }
    }
  } catch {
    // ignore
  }

  return raw
}

export async function previewRemoteImages(urls: string[], current?: string) {
  const normalizedUrls = urls.map((item) => resolveAssetUrl(item)).filter(Boolean)

  if (normalizedUrls.length === 0) {
    Taro.showToast({
      title: '暂时没有可预览的截图',
      icon: 'none',
    })
    return
  }

  try {
    await Taro.previewImage({
      current: resolveAssetUrl(current || normalizedUrls[0]),
      urls: normalizedUrls,
    })
  } catch (error) {
    console.error('[Preview] 打开截图预览失败', error)
    Taro.showToast({
      title: '截图暂时打不开，请稍后重试',
      icon: 'none',
    })
  }
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const session = useSessionStore.getState().session
  const headers: Record<string, string> = {
    ...(options.header ?? {}),
  }

  if (options.data !== undefined && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  if (session?.token && session.mode === 'real' && !headers.Authorization) {
    headers.Authorization = `Bearer ${session.token}`
  }

  let response: Taro.request.SuccessCallbackResult<Record<string, unknown>>
  try {
    response = await Taro.request<Record<string, unknown>>({
      url: `${getApiBaseUrl()}${path}`,
      method: options.method ?? 'GET',
      header: headers,
      data: options.data,
      // 显式超时，避免个别基础库请求永久 pending
      timeout: options.timeout ?? 15000,
    })
  } catch (error) {
    throw normalizeRequestError(error, '请求失败，请稍后重试')
  }

  if (response.statusCode === 401) {
    useSessionStore.getState().clearSession()
    throw new RequestError({
      message: '登录状态已失效，请重新进入小程序',
      kind: 'auth',
      statusCode: 401,
      cause: response.data,
    })
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const payload = response.data as ErrorPayload | undefined
    throw new RequestError({
      message: extractErrorMessage(payload, `请求失败：${response.statusCode}`),
      kind: 'server',
      statusCode: response.statusCode,
      code: payload?.code,
      cause: payload,
    })
  }

  return response.data as T
}
