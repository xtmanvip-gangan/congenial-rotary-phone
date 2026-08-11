import { Image, Text, Video, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import type { CommunityMedia } from '@/services/community'
import { resolveAssetUrl } from '@/services/request'
import {
  fitMomentsSingle,
  fitMomentsVideo,
  formatDurationSec,
  getMomentsMetrics,
  mediaLayoutMode,
  resolveVideoDisplaySize,
  splitMedia,
} from '../utils'
import styles from './index.module.scss'

type Props = {
  media?: CommunityMedia[]
  variant?: 'feed' | 'detail'
  stopPropagation?: boolean
}

/**
 * 朋友圈媒体
 * - 图/视频二选一
 * - 点图：previewImage
 * - 点视频：previewMedia → video-preview
 * - 竖屏：展示宽高必须「转正」后计算（见 resolveVideoDisplaySize）
 */

function MomentsSingleImage({
  url,
  variant,
  stopPropagation,
  onPreview,
}: {
  url: string
  variant: 'feed' | 'detail'
  stopPropagation: boolean
  onPreview: () => void
}) {
  const src = resolveAssetUrl(url)
  const metrics = useMemo(() => getMomentsMetrics(variant), [variant])
  const { singleMaxW, singleMaxH } = metrics
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  )

  useEffect(() => {
    let cancelled = false
    setSize(null)
    void Taro.getImageInfo({ src })
      .then((info) => {
        if (cancelled) return
        setSize(
          fitMomentsSingle(
            Number(info.width) || 0,
            Number(info.height) || 0,
            singleMaxW,
            singleMaxH,
          ),
        )
      })
      .catch(() => {
        if (cancelled) return
        setSize(
          fitMomentsSingle(
            singleMaxW,
            (singleMaxW * 3) / 4,
            singleMaxW,
            singleMaxH,
          ),
        )
      })
    return () => {
      cancelled = true
    }
  }, [src, singleMaxW, singleMaxH])

  const onImgLoad = (e: {
    detail?: { width?: string | number; height?: string | number }
  }) => {
    const nw = Number(e.detail?.width) || 0
    const nh = Number(e.detail?.height) || 0
    if (nw > 0 && nh > 0) {
      setSize(fitMomentsSingle(nw, nh, singleMaxW, singleMaxH))
    }
  }

  const box = size ?? {
    width: Math.round(singleMaxW * 0.72),
    height: Math.round(singleMaxW * 0.54),
  }

  return (
    <View
      className={styles.singleBox}
      style={{ width: `${box.width}px`, height: `${box.height}px` }}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation()
        onPreview()
      }}
      hoverClass={styles.cellHover}
      hoverStayTime={200}
    >
      <Image
        className={styles.singleImg}
        src={src}
        mode="aspectFill"
        lazyLoad
        showMenuByLongpress={false}
        onLoad={onImgLoad}
      />
    </View>
  )
}

function MomentsMultiGrid({
  images,
  overflow,
  variant,
  stopPropagation,
  onPreviewAt,
}: {
  images: CommunityMedia[]
  overflow: number
  variant: 'feed' | 'detail'
  stopPropagation: boolean
  onPreviewAt: (index: number) => void
}) {
  const metrics = useMemo(() => getMomentsMetrics(variant), [variant])
  const count = images.length
  const mode = mediaLayoutMode(count)
  const cols = mode === 'two' || mode === 'four' ? 2 : 3
  const gapPx = Math.max(2, Math.round(metrics.gap))
  const cellPx = Math.floor(
    cols === 2
      ? (metrics.grid2W - gapPx) / 2
      : (metrics.grid3W - 2 * gapPx) / 3,
  )
  const exactGridW = cols * cellPx + (cols - 1) * gapPx

  return (
    <View
      className={styles.grid}
      style={{
        width: `${exactGridW}px`,
        gap: `${gapPx}px`,
      }}
    >
      {images.map((item, i) => {
        const showMore = i === images.length - 1 && overflow > 0
        return (
          <View
            key={`${item.url}-${i}`}
            className={styles.cell}
            style={{
              width: `${cellPx}px`,
              height: `${cellPx}px`,
            }}
            onClick={(e) => {
              if (stopPropagation) e.stopPropagation()
              onPreviewAt(i)
            }}
            hoverClass={styles.cellHover}
            hoverStayTime={200}
          >
            <Image
              className={styles.cellImg}
              src={resolveAssetUrl(item.url)}
              mode="aspectFill"
              lazyLoad
              showMenuByLongpress={false}
            />
            {showMore ? (
              <View className={styles.moreMask}>
                <Text className={styles.moreText}>+{overflow}</Text>
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

/**
 * 视频列表缩略 · 朋友圈实践
 * - 竖屏：框尺寸 = 单图 fit（同 max 盒），封面 aspectFill 裁切；点开预览看全
 * - 横屏：框固定 4:3，封面 aspectFill
 * - 展示宽高经 resolveVideoDisplaySize 转正/纠偏
 */
function MomentsVideoThumb({
  item,
  variant,
  stopPropagation,
  onOpen,
}: {
  item: CommunityMedia
  variant: 'feed' | 'detail'
  stopPropagation: boolean
  onOpen: () => void
}) {
  const metrics = useMemo(() => getMomentsMetrics(variant), [variant])
  const { singleMaxW, singleMaxH } = metrics

  const metaW = Number(item.width) > 0 ? Number(item.width) : 0
  const metaH = Number(item.height) > 0 ? Number(item.height) : 0
  const coverSrc = item.coverUrl
    ? resolveAssetUrl(item.coverUrl)
    : undefined

  const [coverSize, setCoverSize] = useState<{ w: number; h: number } | null>(
    null,
  )
  const [coverFailed, setCoverFailed] = useState(false)

  // 始终测量封面（即使已有 meta）：用于方向纠偏与封面是否可展示
  useEffect(() => {
    setCoverFailed(false)
    setCoverSize(null)
    if (!coverSrc) return
    let cancelled = false
    void Taro.getImageInfo({ src: coverSrc })
      .then((info) => {
        if (cancelled) return
        const w = Number(info.width) || 0
        const h = Number(info.height) || 0
        if (w > 0 && h > 0) setCoverSize({ w, h })
      })
      .catch(() => {
        if (!cancelled) setCoverFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [coverSrc])

  const display = useMemo(
    () =>
      resolveVideoDisplaySize({
        metaW,
        metaH,
        coverW: coverSize?.w,
        coverH: coverSize?.h,
      }),
    [metaW, metaH, coverSize],
  )

  const size = useMemo(
    () =>
      fitMomentsVideo(
        display.width,
        display.height,
        singleMaxW,
        singleMaxH,
      ),
    [display.width, display.height, singleMaxW, singleMaxH],
  )

  const duration = formatDurationSec(item.durationSec)
  const showCover = Boolean(coverSrc) && !coverFailed
  const videoSrc = resolveAssetUrl(item.url)

  return (
    <View
      className={styles.videoBox}
      style={{
        width: `${size.width}px`,
        height: `${size.height}px`,
        borderRadius: 0,
      }}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation()
        onOpen()
      }}
    >
      {showCover ? (
        <Image
          className={styles.videoCover}
          src={coverSrc as string}
          mode="aspectFill"
          style={{ borderRadius: 0 }}
          onError={() => setCoverFailed(true)}
        />
      ) : videoSrc ? (
        /* 封面失败时用静音 Video 顶一帧，避免纯色占位 */
        <Video
          className={styles.videoCover}
          src={videoSrc}
          controls={false}
          autoplay={false}
          muted
          showCenterPlayBtn={false}
          showPlayBtn={false}
          showFullscreenBtn={false}
          enableProgressGesture={false}
          objectFit="cover"
          initialTime={0.1}
          style={{ borderRadius: 0, pointerEvents: 'none' }}
        />
      ) : (
        <View className={styles.videoPlaceholder} />
      )}
      <View className={styles.videoMask}>
        <View className={styles.playCircle}>
          <View className={styles.playTriangle} />
        </View>
      </View>
      {duration ? (
        <View className={styles.durationBadge}>
          <Text className={styles.durationText}>{duration}</Text>
        </View>
      ) : null}
    </View>
  )
}

export default function CommunityMediaGrid({
  media,
  variant = 'feed',
  stopPropagation = true,
}: Props) {
  const { images, video, mode, overflow } = splitMedia(media)

  if (mode === 'none') return null

  const previewUrls = images.map((m) => resolveAssetUrl(m.url))

  const openImageAt = (index: number) => {
    if (previewUrls.length === 0) return
    const safe = Math.max(0, Math.min(index, previewUrls.length - 1))
    void Taro.previewImage({
      current: previewUrls[safe],
      urls: previewUrls,
    }).catch(() => {})
  }

  const openVideo = () => {
    if (!video) return
    const url = resolveAssetUrl(video.url)
    const poster = video.coverUrl
      ? resolveAssetUrl(video.coverUrl)
      : undefined
    const display = resolveVideoDisplaySize({
      metaW: video.width,
      metaH: video.height,
    })

    /**
     * 播放策略（企微/COS 实测）：
     * - 不优先 previewMedia：COS 域名偶发打不开、失败也不进 catch
     * - 走独立 video-preview 页 + 本地 storage 传参（避免 query 过长截断）
     */
    try {
      Taro.setStorageSync('__community_video_preview__', {
        url,
        poster: poster || '',
        w: display.width,
        h: display.height,
        ts: Date.now(),
      })
    } catch {
      // storage 满时仍走 query
    }

    const qs = [
      `url=${encodeURIComponent(url)}`,
      poster ? `poster=${encodeURIComponent(poster)}` : '',
      display?.width ? `w=${display.width}` : '',
      display?.height ? `h=${display.height}` : '',
    ]
      .filter(Boolean)
      .join('&')

    void Taro.navigateTo({
      url: `/pages/community/video-preview/index?${qs}`,
    }).catch(() => {
      // 兜底：再试原生预览
      const previewMedia = (
        Taro as typeof Taro & {
          previewMedia?: (opt: {
            sources: Array<{
              url: string
              type: 'image' | 'video'
              poster?: string
            }>
            current?: number
          }) => Promise<unknown>
        }
      ).previewMedia
      if (typeof previewMedia === 'function') {
        void previewMedia({
          sources: [
            {
              url,
              type: 'video',
              ...(poster ? { poster } : {}),
            },
          ],
          current: 0,
        }).catch(() => {
          void Taro.showToast({ title: '暂无法播放', icon: 'none' })
        })
        return
      }
      void Taro.showToast({ title: '暂无法播放', icon: 'none' })
    })
  }

  const imgMode = mediaLayoutMode(images.length)

  return (
    <View className={styles.wrap}>
      {mode === 'images' && images.length === 1 && imgMode === 'single' ? (
        <MomentsSingleImage
          url={images[0].url}
          variant={variant}
          stopPropagation={stopPropagation}
          onPreview={() => openImageAt(0)}
        />
      ) : null}

      {mode === 'images' && images.length > 1 ? (
        <MomentsMultiGrid
          images={images}
          overflow={overflow}
          variant={variant}
          stopPropagation={stopPropagation}
          onPreviewAt={openImageAt}
        />
      ) : null}

      {mode === 'video' && video ? (
        <MomentsVideoThumb
          item={video}
          variant={variant}
          stopPropagation={stopPropagation}
          onOpen={openVideo}
        />
      ) : null}
    </View>
  )
}
