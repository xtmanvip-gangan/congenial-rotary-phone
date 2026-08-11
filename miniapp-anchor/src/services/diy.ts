import { requestJson, resolveAssetUrl } from './request'

export type DiyLink =
  | { type: 'none' }
  | { type: 'system_page'; path?: string }
  | { type: 'diy_land'; diyPageId?: string }
  | { type: 'external'; url?: string }
  | Record<string, unknown>

export type DiyTextStyle = {
  fontSizeRpx?: number
  color?: string
}

export type DiyBlock = {
  id: string
  type: string
  enabled?: boolean
  props: Record<string, unknown>
  style: Record<string, unknown>
}

export type DiyPageSchema = {
  pageKey: string
  version: string
  pageStyle?: {
    backgroundType?: string
    backgroundColor?: string
    backgroundColorEnd?: string
    backgroundAngle?: string
    backgroundImageUrl?: string | null
    paddingBottomRpx?: number
    paddingTopRpx?: number
    nav?: {
      title?: string
      showTitle?: boolean
      showBack?: boolean
      titleStyle?: {
        fontSizeRpx?: number
        fontWeight?: number | string
        color?: string
      }
      titleStyleSolid?: {
        fontSizeRpx?: number
        fontWeight?: number | string
        color?: string
      }
      mode?: 'transparent' | 'solid' | 'fade' | 'gradient' | string
      backgroundColor?: string
      backgroundColorEnd?: string
      backgroundAngle?: string
      titleColor?: string
      titleColorSolid?: string
      immersive?: boolean
      titleFade?: boolean
    }
  }
  blocks: DiyBlock[]
}

export type DiyPublicPage = {
  pageKey: string
  kind: string
  title: string
  version: string
  schema: DiyPageSchema
}

export type DiyVersionInfo = {
  pageKey: string
  version: string | null
  templateId: string | null
}

let cachedPage: Record<string, { at: number; data: DiyPublicPage }> = {}
const CACHE_MS = 12_000

export function resolveDiyAssetUrl(path: string | null | undefined) {
  if (!path) return ''
  return resolveAssetUrl(path)
}

export function diyTextStyle(
  style?: (DiyTextStyle & { fontWeight?: number | string }) | null,
  fallback?: { fontSizeRpx?: number; color?: string; fontWeight?: number },
): { fontSize: string; color: string; fontWeight?: number | string } {
  const fontSizeRpx =
    typeof style?.fontSizeRpx === 'number'
      ? style.fontSizeRpx
      : fallback?.fontSizeRpx ?? 28
  const color =
    typeof style?.color === 'string' && style.color
      ? style.color
      : fallback?.color ?? '#1c2433'
  const fontWeight =
    typeof style?.fontWeight === 'number' || typeof style?.fontWeight === 'string'
      ? style.fontWeight
      : fallback?.fontWeight
  const out: { fontSize: string; color: string; fontWeight?: number | string } =
    {
      fontSize: `${fontSizeRpx}rpx`,
      color,
    }
  if (fontWeight != null) out.fontWeight = fontWeight
  return out
}

export async function fetchDiyVersion(pageKey: string): Promise<DiyVersionInfo> {
  return requestJson<DiyVersionInfo>(
    `/miniapp/diy/${encodeURIComponent(pageKey)}/version`,
    { method: 'GET' },
  )
}

/** 拉取已发布 schema；失败返回 null（调用方走本地兜底） */
export async function fetchDiyPage(
  pageKey: string,
  options?: { force?: boolean },
): Promise<DiyPublicPage | null> {
  const now = Date.now()
  const hit = cachedPage[pageKey]
  if (!options?.force && hit && now - hit.at < CACHE_MS) {
    return hit.data
  }
  try {
    const data = await requestJson<DiyPublicPage>(
      `/miniapp/diy/${encodeURIComponent(pageKey)}`,
      { method: 'GET' },
    )
    if (!data?.schema?.blocks) {
      return null
    }
    cachedPage[pageKey] = { at: now, data }
    return data
  } catch (e) {
    console.warn('[DIY] 拉取页面失败', pageKey, e)
    return hit?.data ?? null
  }
}

/** 草稿真机预览（需有效 token） */
export async function fetchDiyPreview(
  templateId: string,
  token: string,
): Promise<DiyPublicPage & { status?: string; preview?: boolean }> {
  const q = `token=${encodeURIComponent(token)}`
  return requestJson(
    `/miniapp/diy/preview/${encodeURIComponent(templateId)}?${q}`,
    { method: 'GET' },
  )
}

/** 自定义落地页：id 可为 page id / pageKey / published template id */
export async function fetchDiyLand(
  id: string,
  options?: { force?: boolean },
): Promise<DiyPublicPage | null> {
  const key = `land:${id}`
  const now = Date.now()
  const hit = cachedPage[key]
  if (!options?.force && hit && now - hit.at < CACHE_MS) {
    return hit.data
  }
  try {
    const data = await requestJson<DiyPublicPage>(
      `/miniapp/diy/land/${encodeURIComponent(id)}`,
      { method: 'GET' },
    )
    if (!data?.schema?.blocks) {
      return null
    }
    cachedPage[key] = { at: now, data }
    return data
  } catch (e) {
    console.warn('[DIY] 落地页拉取失败', id, e)
    return hit?.data ?? null
  }
}

export function openDiyLink(link: unknown) {
  if (!link || typeof link !== 'object') return
  const l = link as DiyLink
  const type = String((l as { type?: string }).type || 'none')
  if (type === 'system_page') {
    const path = String((l as { path?: string }).path || '').trim()
    if (!path) return
    const url = path.startsWith('/') ? path : `/${path}`
    // tab 页用 switchTab 更稳；失败再 navigateTo
    void import('@tarojs/taro').then(({ default: Taro }) => {
      // 仅 tabBar 真 Tab（activities/training 是分包页，须 navigateTo）
      const tabPaths = [
        '/pages/home/index',
        '/pages/community/index',
        '/pages/messages/index',
        '/pages/mine/index',
      ]
      if (tabPaths.some((t) => url.startsWith(t))) {
        void Taro.switchTab({ url }).catch(() => {
          void Taro.navigateTo({ url }).catch(() => undefined)
        })
        return
      }
      void Taro.navigateTo({ url }).catch(() => {
        void Taro.reLaunch({ url }).catch(() => undefined)
      })
    })
    return
  }
  if (type === 'diy_land') {
    const id = String((l as { diyPageId?: string }).diyPageId || '').trim()
    if (!id) return
    void import('@tarojs/taro').then(({ default: Taro }) => {
      void Taro.navigateTo({
        url: `/pages/diy-land/index?id=${encodeURIComponent(id)}`,
      }).catch(() => {
        // P2 落地页未上线时静默
      })
    })
    return
  }
  if (type === 'external') {
    const url = String((l as { url?: string }).url || '').trim()
    if (!url) return
    void import('@tarojs/taro').then(({ default: Taro }) => {
      void Taro.setClipboardData({ data: url }).then(() => {
        Taro.showToast({ title: '链接已复制', icon: 'none' })
      })
    })
  }
}
