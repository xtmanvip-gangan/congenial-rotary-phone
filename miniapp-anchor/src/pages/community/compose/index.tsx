import { Image, Text, Textarea, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import { useBrandNavScroll } from '@/hooks/useBrandNavScroll'
import { ensureAppSession } from '@/services/auth'
import {
  createCommunityPost,
  getCommunityPost,
  listCommunityTags,
  updateCommunityPost,
  uploadCommunityFiles,
  type CommunityMedia,
  type CommunityTag,
} from '@/services/community'
import { resolveAssetUrl } from '@/services/request'
import styles from './index.module.scss'

export default function CommunityComposePage() {
  const nav = useBrandNavScroll()
  const router = useRouter()
  const editId = router.params.id || ''

  const [channel, setChannel] = useState<'plaza' | 'help'>('plaza')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<CommunityTag[]>([])
  const [tagIds, setTagIds] = useState<string[]>([])
  const [media, setMedia] = useState<CommunityMedia[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void (async () => {
      await ensureAppSession()
      const res = await listCommunityTags()
      setTags(res.items ?? [])
      if (editId) {
        const detail = await getCommunityPost(editId)
        const p = detail.item
        setChannel(p.channel === 'help' ? 'help' : 'plaza')
        setBody(p.body || '')
        setTagIds((p.tags || []).map((t) => t.id))
        // 编辑：历史若图+视频并存，按朋友圈只保留一侧（优先图）
        {
          const raw = p.media || []
          const imgs = raw.filter((m) => m.type === 'image').slice(0, 9)
          const vids = raw.filter((m) => m.type === 'video').slice(0, 1)
          setMedia(imgs.length > 0 ? imgs : vids)
        }
      }
    })().catch((e) => {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '加载失败',
        icon: 'none',
      })
    })
  }, [editId])

  const imageCount = media.filter((m) => m.type === 'image').length
  const videoCount = media.filter((m) => m.type === 'video').length
  /** 主播帖上限，与后端 MAX_BODY_LEN_ANCHOR 一致 */
  const MAX_BODY = 500
  const canSubmit = useMemo(
    () =>
      body.trim().length > 0 &&
      body.trim().length <= MAX_BODY &&
      !submitting,
    [body, submitting],
  )

  const toggleTag = (id: string) => {
    setTagIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 3) {
        void Taro.showToast({ title: '最多 3 个话题', icon: 'none' })
        return prev
      }
      return [...prev, id]
    })
  }

  /** 朋友圈：图 / 视频二选一 */
  const pickImages = async () => {
    if (videoCount > 0) {
      void Taro.showToast({
        title: '已选视频，请先删除视频再加图',
        icon: 'none',
      })
      return
    }
    if (imageCount >= 9) return
    try {
      const choose = await Taro.chooseImage({
        count: 9 - imageCount,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const paths = choose.tempFilePaths || []
      if (!paths.length) return
      Taro.showLoading({ title: '上传中' })
      const uploaded = await uploadCommunityFiles(paths)
      const onlyImages = uploaded.filter((m) => m.type === 'image')
      setMedia((prev) => [
        ...prev.filter((m) => m.type === 'image'),
        ...onlyImages,
      ].slice(0, 9))
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '选图失败',
        icon: 'none',
      })
    } finally {
      Taro.hideLoading()
    }
  }

  const pickVideo = async () => {
    if (imageCount > 0) {
      void Taro.showToast({
        title: '已选图片，请先删除图片再加视频',
        icon: 'none',
      })
      return
    }
    if (videoCount >= 1) {
      void Taro.showToast({ title: '最多 1 个视频', icon: 'none' })
      return
    }
    try {
      const choose = await Taro.chooseMedia({
        count: 1,
        mediaType: ['video'],
        sourceType: ['album', 'camera'],
        maxDuration: 60,
        sizeType: ['compressed'],
      })
      const picked = choose.tempFiles?.[0]
      if (!picked?.tempFilePath) return
      if (picked.duration && picked.duration > 60) {
        void Taro.showToast({ title: '视频需 ≤60 秒', icon: 'none' })
        return
      }
      Taro.showLoading({ title: '上传中' })
      const uploaded = await uploadCommunityFiles([picked.tempFilePath])
      const videoItem = uploaded.find((m) => m.type === 'video') || uploaded[0]
      if (!videoItem) return

      let coverUrl: string | undefined
      const thumb = picked.thumbTempFilePath
      if (thumb) {
        try {
          const covers = await uploadCommunityFiles([thumb])
          coverUrl = covers[0]?.url
        } catch {
          // 封面失败不阻断发视频
        }
      }

      const next: CommunityMedia = {
        type: 'video',
        url: videoItem.url,
        coverUrl,
        durationSec: Math.round(picked.duration || 0),
        width: Number(picked.width) || undefined,
        height: Number(picked.height) || undefined,
      }
      // 仅保留这一条视频
      setMedia([next])
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '选视频失败',
        icon: 'none',
      })
    } finally {
      Taro.hideLoading()
    }
  }

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await ensureAppSession()
      const payload = {
        channel,
        isHelp: channel === 'help',
        body: body.trim(),
        media,
        tagIds,
      }
      if (editId) {
        await updateCommunityPost(editId, payload)
        void Taro.showToast({ title: '已重新提交审核', icon: 'success' })
      } else {
        await createCommunityPost(payload)
        void Taro.showToast({
          title: '已提交，通过后出现在推荐',
          icon: 'none',
          duration: 2200,
        })
      }
      setTimeout(() => {
        // 跳「我的帖子」看审核状态，而不是 silently 返回
        void Taro.redirectTo({ url: '/pages/community/profile/index' }).catch(
          () => {
            void Taro.navigateBack()
          },
        )
      }, 500)
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '发送失败',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <PageShell className={styles.page} backgroundColor="#ffffff">
      <PageNav
        title={editId ? '编辑动态' : '发动态'}
        showBack
        right={
          <Text
            style={{
              fontSize: '28rpx',
              fontWeight: 600,
              color: canSubmit ? '#1C1C1E' : '#94A3B8',
            }}
            onClick={() => void submit()}
          >
            {submitting ? '发送中' : '发送'}
          </Text>
        }
        {...nav}
      />
      <View className={styles.content}>
        <Textarea
          className={styles.textarea}
          value={body}
          maxlength={MAX_BODY}
          placeholder="分享你的直播日常、经验或求助…"
          autoFocus
          onInput={(e) => setBody(e.detail.value)}
        />
        <Text
          style={{
            display: 'block',
            textAlign: 'right',
            fontSize: '24rpx',
            color: body.length >= MAX_BODY ? '#FF3B30' : '#94A3B8',
            marginTop: '8rpx',
          }}
        >
          {body.length}/{MAX_BODY}
        </Text>

        <View className={styles.tools}>
          <Text
            className={`${styles.tool} ${channel === 'plaza' ? styles.toolOn : ''}`}
            onClick={() => setChannel('plaza')}
          >
            广场
          </Text>
          <Text
            className={`${styles.tool} ${channel === 'help' ? styles.toolOn : ''}`}
            onClick={() => setChannel('help')}
          >
            求助
          </Text>
          <Text
            className={`${styles.tool} ${videoCount > 0 ? styles.toolMuted : ''}`}
            onClick={() => void pickImages()}
          >
            图片
          </Text>
          <Text
            className={`${styles.tool} ${imageCount > 0 ? styles.toolMuted : ''}`}
            onClick={() => void pickVideo()}
          >
            视频
          </Text>
        </View>

        <View className={styles.topics}>
          {tags.map((t) => (
            <Text
              key={t.id}
              className={`${styles.topic} ${tagIds.includes(t.id) ? styles.topicOn : ''}`}
              onClick={() => toggleTag(t.id)}
            >
              #{t.name}
            </Text>
          ))}
        </View>

        <View className={styles.mediaRow}>
          {media.map((m, i) => (
            <View key={`${m.url}-${i}`} className={styles.thumbWrap}>
              {m.type === 'image' ? (
                <Image
                  className={styles.thumb}
                  src={resolveAssetUrl(m.url)}
                  mode="aspectFill"
                />
              ) : (
                <View className={styles.thumbVideo}>
                  {m.coverUrl ? (
                    <Image
                      className={styles.thumb}
                      src={resolveAssetUrl(m.coverUrl)}
                      mode="aspectFill"
                    />
                  ) : (
                    <View className={styles.thumbPlaceholder} />
                  )}
                  <View className={styles.thumbVideoMask}>
                    <View className={styles.thumbPlay}>
                      <Text className={styles.thumbPlayIcon}>▶</Text>
                    </View>
                  </View>
                </View>
              )}
              <View
                className={styles.remove}
                onClick={() =>
                  setMedia((prev) => prev.filter((_, idx) => idx !== i))
                }
              >
                <Text>×</Text>
              </View>
            </View>
          ))}
          {/* 朋友圈：有视频时不再出现加图；无视频且图未满可加图 */}
          {videoCount === 0 && imageCount < 9 ? (
            <View className={styles.add} onClick={() => void pickImages()}>
              <Text className={styles.addPlus}>+</Text>
              <Text>图片</Text>
            </View>
          ) : null}
          {imageCount === 0 && videoCount === 0 ? (
            <View className={styles.add} onClick={() => void pickVideo()}>
              <Text className={styles.addPlus}>+</Text>
              <Text>视频</Text>
            </View>
          ) : null}
        </View>

        <Text className={styles.hint}>
          图片与视频二选一：最多 9 张图，或 1 条 ≤60 秒视频。发送后需审核，通过后出现在信息流。
        </Text>

        <View className={styles.footer}>
          <View
            className={`${styles.submit} ${canSubmit ? '' : styles.submitOff}`}
            onClick={() => void submit()}
          >
            <Text>{submitting ? '发送中…' : '发送动态'}</Text>
          </View>
        </View>
      </View>
    </PageShell>
  )
}
