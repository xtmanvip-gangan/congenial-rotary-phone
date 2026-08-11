import { Text, Video, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import { resolveAssetUrl } from '@/services/request'
import { getNavLayoutMetrics } from '@/utils/nav-layout'
import styles from './index.module.scss'

type StoredPreview = {
  url?: string
  poster?: string
  w?: number
  h?: number
  ts?: number
}

/**
 * 视频预览页
 * - 优先读 storage（MediaGrid 写入），避免 COS 长 URL 在 navigateTo query 被截断
 * - query 作兜底
 * - 微信原生 Video 必须用明确 px 宽高，百分比/flex 易导致「整页黑屏」
 * - 远程拉流失败时 downloadFile 到本地再播（与封面同域名时通常可下）
 */
export default function CommunityVideoPreviewPage() {
  const router = useRouter()
  const [err, setErr] = useState('')
  const [playSrc, setPlaySrc] = useState('')
  const [loading, setLoading] = useState(true)
  const [hint, setHint] = useState('正在准备…')

  const metrics = useMemo(() => getNavLayoutMetrics(), [])
  const stageH = Math.max(
    240,
    (Taro.getSystemInfoSync().windowHeight || 667) - metrics.totalHeight,
  )
  const stageW = metrics.windowWidth || 375

  const { remoteSrc, poster } = useMemo(() => {
    let stored: StoredPreview = {}
    try {
      stored =
        (Taro.getStorageSync('__community_video_preview__') as StoredPreview) ||
        {}
    } catch {
      stored = {}
    }

    const qUrl = router.params.url
      ? decodeURIComponent(router.params.url)
      : ''
    const qPoster = router.params.poster
      ? decodeURIComponent(router.params.poster)
      : ''

    // storage 优先（完整 URL）；过期 10 分钟仍用 query
    const fresh =
      stored.url &&
      typeof stored.ts === 'number' &&
      Date.now() - stored.ts < 10 * 60 * 1000
    const rawUrl = ((fresh ? stored.url : '') || stored.url || qUrl || '').trim()
    const rawPoster = (
      (fresh ? stored.poster : '') ||
      stored.poster ||
      qPoster ||
      ''
    ).trim()

    return {
      remoteSrc: rawUrl ? resolveAssetUrl(rawUrl) : '',
      poster: rawPoster ? resolveAssetUrl(rawPoster) : undefined,
    }
  }, [router.params.url, router.params.poster])

  useEffect(() => {
    let cancelled = false

    async function prepare() {
      if (!remoteSrc) {
        setErr('视频地址无效')
        setLoading(false)
        return
      }

      setLoading(true)
      setErr('')
      setHint('正在准备…')
      // 先直接用远程地址（封面同域时图已能出）
      setPlaySrc(remoteSrc)

      // 并行尝试下载到本地：部分机型/COS 默认域远程流式播黑屏，本地路径更稳
      try {
        setHint('缓冲视频…')
        const dl = await Taro.downloadFile({
          url: remoteSrc,
          timeout: 120_000,
        })
        if (cancelled) return
        if (dl.statusCode === 200 && dl.tempFilePath) {
          setPlaySrc(dl.tempFilePath)
          setHint('')
          setLoading(false)
          return
        }
        // 下载失败仍保留远程 src 尝试播
        setHint('')
        setLoading(false)
      } catch {
        if (cancelled) return
        // 远程继续试；失败由 onError 承接
        setHint('')
        setLoading(false)
      }
    }

    void prepare()
    return () => {
      cancelled = true
    }
  }, [remoteSrc])

  const onVideoError = (e: { detail?: { errMsg?: string } }) => {
    const msg = e?.detail?.errMsg || ''
    // 若当前是远程且还没试过本地，download 失败时才走到这
    setErr(
      msg
        ? `无法播放：${msg}`
        : '视频加载失败。请确认小程序已配置该域名的 downloadFile 合法域名，且视频为 H.264/mp4',
    )
    setLoading(false)
  }

  const retry = () => {
    setErr('')
    setPlaySrc('')
    // 触发 effect：改 key 靠 remoteSrc 不变，手动重跑
    if (!remoteSrc) {
      setErr('视频地址无效')
      return
    }
    setLoading(true)
    setPlaySrc(remoteSrc)
    void Taro.downloadFile({ url: remoteSrc, timeout: 120_000 })
      .then((dl) => {
        if (dl.statusCode === 200 && dl.tempFilePath) {
          setPlaySrc(dl.tempFilePath)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  return (
    <PageShell
      className={styles.page}
      backgroundColor="#000000"
      style={{
        minHeight: '100vh',
        height: '100vh',
        padding: 0,
        maxWidth: '100%',
      }}
    >
      <PageNav
        title="视频"
        showBack
        backgroundColor="#000000"
        titleColor="#FFFFFF"
        backIconColor="#FFFFFF"
      />

      {err ? (
        <View className={styles.empty} style={{ height: `${stageH}px` }}>
          <Text className={styles.emptyText}>{err}</Text>
          {remoteSrc ? (
            <Text className={styles.hostText}>
              {(() => {
                try {
                  return new URL(remoteSrc).hostname
                } catch {
                  return remoteSrc.slice(0, 48)
                }
              })()}
            </Text>
          ) : null}
          <View className={styles.backBtn} onClick={() => void retry()}>
            <Text className={styles.backText}>重试</Text>
          </View>
          <View
            className={styles.backBtn}
            onClick={() => {
              void Taro.navigateBack()
            }}
          >
            <Text className={styles.backText}>返回</Text>
          </View>
        </View>
      ) : (
        <View
          className={styles.stage}
          style={{
            width: `${stageW}px`,
            height: `${stageH}px`,
          }}
        >
          {playSrc ? (
            <Video
              id="community-video-preview"
              className={styles.video}
              src={playSrc}
              poster={poster}
              controls
              autoplay
              showCenterPlayBtn
              showPlayBtn
              showFullscreenBtn
              enableProgressGesture
              enablePlayGesture
              objectFit="contain"
              style={{
                width: `${stageW}px`,
                height: `${stageH}px`,
                borderRadius: 0,
              }}
              onError={onVideoError}
              onPlay={() => {
                setLoading(false)
                setHint('')
              }}
              onLoadedMetaData={() => {
                setLoading(false)
                // 部分机型 autoplay 不生效，主动播
                try {
                  const ctx = Taro.createVideoContext('community-video-preview')
                  ctx.play()
                } catch {
                  // ignore
                }
              }}
            />
          ) : null}
          {loading || hint ? (
            <View className={styles.loadingMask}>
              <Text className={styles.loadingText}>{hint || '正在准备…'}</Text>
            </View>
          ) : null}
        </View>
      )}
    </PageShell>
  )
}
