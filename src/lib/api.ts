import { clearStoredSession, getToken } from './auth'

type ApiErrorPayload = {
  message?: string
  error?: string
}

export function getApiBaseUrl() {
  return (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
}

function handleUnauthorized() {
  clearStoredSession()

  if (typeof window === 'undefined') {
    return
  }

  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (window.location.pathname === '/') {
    return
  }

  const next = encodeURIComponent(currentPath)
  window.location.replace(`/?reason=session-expired&next=${next}`)
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const token = getToken()

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers,
  })

  if (response.status === 401) {
    handleUnauthorized()
  }

  if (!response.ok) {
    let errorPayload: ApiErrorPayload | null = null

    try {
      errorPayload = (await response.json()) as ApiErrorPayload
    } catch {
      errorPayload = null
    }

    throw new Error(errorPayload?.message || errorPayload?.error || `请求失败：${response.status}`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }

  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error('接口返回格式不正确')
  }
}

export function uploadFilesXhr<T>(path: string, formData: FormData, retries = 2): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${getApiBaseUrl()}${path}`)

    const token = getToken()
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }

    xhr.onload = () => {
      if (xhr.status === 401) {
        handleUnauthorized()
        reject(new Error('登录已过期，请重新登录'))
        return
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText)
          resolve(response as T)
        } catch {
          reject(new Error('接口返回格式不正确'))
        }
      } else {
        let message = `请求失败：${xhr.status}`
        try {
          const payload = JSON.parse(xhr.responseText)
          message = payload.message || payload.error || message
        } catch {
          // ignore
        }
        reject(new Error(message))
      }
    }

    xhr.onerror = () => {
      if (retries > 0) {
        console.warn(`上传失败，正在重试... 剩余重试次数: ${retries}`)
        uploadFilesXhr<T>(path, formData, retries - 1)
          .then(resolve)
          .catch(reject)
      } else {
        reject(new Error('网络请求失败或被中断'))
      }
    }

    xhr.send(formData)
  })
}
