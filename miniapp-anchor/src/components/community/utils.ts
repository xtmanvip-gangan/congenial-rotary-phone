import Taro from '@tarojs/taro'
import type { CommunityMedia } from '@/services/community'

export function formatCount(n: number) {
  if (!n) return ''
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

export function avatarLetter(name: string) {
  const t = (name || '').trim()
  return t ? t.slice(0, 1) : '主'
}

/**
 * 朋友圈媒体解析：图 / 视频二选一
 * - 有图则只展示图（≤9），忽略视频（兼容历史脏数据）
 * - 无图有视频则只展示首条视频
 */
export function splitMedia(media: CommunityMedia[] | undefined) {
  const list = media || []
  const images = list.filter((m) => m.type === 'image').slice(0, 9)
  const videos = list.filter((m) => m.type === 'video')
  const mode: 'images' | 'video' | 'none' =
    images.length > 0 ? 'images' : videos.length > 0 ? 'video' : 'none'
  return {
    images,
    videos,
    video: mode === 'video' ? videos[0] : undefined,
    mode,
    total: list.length,
    overflow: Math.max(0, list.filter((m) => m.type === 'image').length - 9),
  }
}

/**
 * 朋友圈数量布局
 * 1 → 单图原比例（有最大宽高）
 * 2 → 一行 2 方格
 * 3 → 一行 3 方格
 * 4 → 2×2 四宫格（不是 3 列！）
 * 5–9 → 3 列九宫格
 */
export type MediaLayoutMode = 'single' | 'two' | 'three' | 'four' | 'nine'

export function mediaLayoutMode(count: number): MediaLayoutMode {
  if (count <= 1) return 'single'
  if (count === 2) return 'two'
  if (count === 3) return 'three'
  if (count === 4) return 'four'
  return 'nine'
}

export type MomentsMetrics = {
  cell: number
  gap: number
  singleMaxW: number
  singleMaxH: number
  grid3W: number
  grid2W: number
}

export function getMomentsMetrics(
  variant: 'feed' | 'detail' = 'feed',
): MomentsMetrics {
  const { windowWidth } = Taro.getSystemInfoSync()
  /**
   * 主列宽
   * - feed：左右 32 + 头像 84 + gap 20 → 582rpx
   * - detail：左右 32 → 686rpx
   */
  const contentRpx = variant === 'detail' ? 686 : 582
  const gapRpx = 10
  const contentW = (windowWidth * contentRpx) / 750
  const gap = (windowWidth * gapRpx) / 750
  const cell = (contentW - 2 * gap) / 3
  return {
    cell,
    gap,
    singleMaxW: 2 * cell + gap,
    singleMaxH: 3 * cell + 2 * gap,
    grid3W: contentW,
    grid2W: 2 * cell + gap,
  }
}

/** 单图：max 框内等比 contain，极端比再裁到约 3:4～4:3 */
export function fitMomentsSingle(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number,
) {
  if (naturalW <= 0 || naturalH <= 0) {
    return {
      width: Math.round(maxW * 0.9),
      height: Math.round((maxW * 0.9 * 3) / 4),
    }
  }
  const scale = Math.min(maxW / naturalW, maxH / naturalH)
  let finalW = Math.max(1, Math.round(naturalW * scale))
  let finalH = Math.max(1, Math.round(naturalH * scale))

  const ratio = finalW / finalH
  if (ratio < 0.75) {
    finalH = Math.round(finalW * (4 / 3))
  } else if (ratio > 1.33) {
    finalW = Math.round(finalH * (4 / 3))
  }

  return {
    width: finalW,
    height: finalH,
  }
}

/**
 * 解析视频「展示」宽高（最佳实践）
 *
 * 手机竖屏视频常见：编码 1920×1080 + rotate=90，库内应存 1080×1920。
 * 若元数据未转正而封面已转正，会出现「列表横版框 + 竖封面」；
 * 此处以封面方向纠偏元数据，二者冲突时优先封面方向 + 元数据长边。
 */
export function resolveVideoDisplaySize(input: {
  metaW?: number
  metaH?: number
  coverW?: number
  coverH?: number
}): { width: number; height: number; isPortrait: boolean; source: string } {
  const metaW = Number(input.metaW) > 0 ? Number(input.metaW) : 0
  const metaH = Number(input.metaH) > 0 ? Number(input.metaH) : 0
  const coverW = Number(input.coverW) > 0 ? Number(input.coverW) : 0
  const coverH = Number(input.coverH) > 0 ? Number(input.coverH) : 0

  const hasMeta = metaW > 0 && metaH > 0
  const hasCover = coverW > 0 && coverH > 0

  if (hasMeta && hasCover) {
    const metaPortrait = metaH > metaW
    const coverPortrait = coverH > coverW
    if (metaPortrait === coverPortrait) {
      return {
        width: metaW,
        height: metaH,
        isPortrait: metaPortrait,
        source: 'meta',
      }
    }
    // 方向冲突：封面方向 + 元数据长/短边（更接近真实像素）
    const longSide = Math.max(metaW, metaH)
    const shortSide = Math.min(metaW, metaH)
    if (coverPortrait) {
      return {
        width: shortSide,
        height: longSide,
        isPortrait: true,
        source: 'meta+cover-orient',
      }
    }
    return {
      width: longSide,
      height: shortSide,
      isPortrait: false,
      source: 'meta+cover-orient',
    }
  }

  if (hasMeta) {
    return {
      width: metaW,
      height: metaH,
      isPortrait: metaH > metaW,
      source: 'meta',
    }
  }

  if (hasCover) {
    return {
      width: coverW,
      height: coverH,
      isPortrait: coverH > coverW,
      source: 'cover',
    }
  }

  // 无任何信息：横屏 16:9，绝不用 1:1
  return { width: 16, height: 9, isPortrait: false, source: 'default' }
}

/**
 * 朋友圈信息流 · 视频缩略框（对齐真机朋友圈心智）
 *
 * 用户/实测约定：
 * - **竖屏视频**：列表框与 **单图同一套** max 与 fit（约 2 格宽 × 3 格高内等比），
 *   封面 aspectFill 居中裁切；**完整竖幅只在点开预览时**再看
 * - **横屏视频**：列表固定 **4:3（宽:高）** 横构图卡片
 *   （口语常说「3:4 横图」时多指横构图，此处按宽:高 = 4:3）
 *
 * maxW/maxH 与单图相同：getMomentsMetrics.singleMaxW / singleMaxH
 */
export function fitMomentsVideo(
  naturalW: number | undefined,
  naturalH: number | undefined,
  maxW: number,
  maxH: number,
) {
  const resolved = resolveVideoDisplaySize({
    metaW: naturalW,
    metaH: naturalH,
  })
  let w = resolved.width
  let h = resolved.height
  if (w <= 0 || h <= 0) {
    w = 16
    h = 9
  }
  const isPortrait = h > w

  if (isPortrait) {
    // 竖屏：与单图同一算法 → 列表尺寸跟单图一致，点开再看全
    const box = fitMomentsSingle(w, h, maxW, maxH)
    return {
      width: box.width,
      height: box.height,
      isPortrait: true,
    }
  }

  // 横屏：固定 4:3（宽:高），宽度尽量吃满 maxW，高度不超 maxH
  let width = maxW
  let height = Math.round((width * 3) / 4)
  if (height > maxH) {
    height = maxH
    width = Math.round((height * 4) / 3)
  }
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
    isPortrait: false,
  }
}

/** 时长 mm:ss */
export function formatDurationSec(sec?: number | null) {
  const n = Math.max(0, Math.floor(Number(sec) || 0))
  if (!n) return ''
  const m = Math.floor(n / 60)
  const s = n % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
