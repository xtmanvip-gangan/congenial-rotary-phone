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
}

type ErrorPayload = {
  message?: string
  error?: string
}

export function getApiBaseUrl() {
  return (process.env.TARO_APP_API_BASE_URL || 'https://ac.ydwy.net/api').replace(/\/$/, '')
}

export function resolveAssetUrl(path: string) {
  if (!path) {
    return ''
  }

  if (/^https?:\/\//.test(path)) {
    return path
  }

  return new URL(path, `${getApiBaseUrl()}/`).toString()
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

  const response = await Taro.request<ErrorPayload | T>({
    url: `${getApiBaseUrl()}${path}`,
    method: options.method ?? 'GET',
    header: headers,
    data: options.data,
  })

  if (response.statusCode === 401) {
    useSessionStore.getState().clearSession()
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const payload = response.data as ErrorPayload
    throw new Error(payload?.message || payload?.error || `请求失败：${response.statusCode}`)
  }

  return response.data as T
}
