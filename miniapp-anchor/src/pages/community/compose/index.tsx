import { Image, Text, Textarea, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import { useBrandNavScroll } from '@/hooks/useBrandNavScroll'
import { ensureAppSession } from '@/services/auth'
import {
  clearComposeDraft,
  pickWithSourceSheet,
  readComposeDraft,
  type ComposeMode,
} from '@/services/community-compose-draft'
import {
  createCommunityPost,
  getCommunityPost,
  listCommunityTags,
  updateCommunityPost,
  uploadCommunityFiles,
  type CommunityMedia,
  type CommunityTag,
} from '@/services/community'
import { resolveAssetUrl, toUploadPath } from '@/services/request'
import { COLOR_ERROR, COLOR_TEXT_TERTIARY } from '@/styles/design-tokens'
import styles from './index.module.scss'

/** 发帖草稿项：local=true 表示尚未上传 COS，发送时再传 */
type DraftMedia = {
  key: string
  type: 'image' | 'video'
  url: string
  local: boolean
  coverUrl?: string
  coverLocal?: boolean
  durationSec?: number
  width?: number
  height?: number
}

function displaySrc(path: string, local?: boolean) {
  if (!path) return ''
  if (local) return path
  if (/^(wxfile|file):\/\//i.test(path)) return path
  if (/^https?:\/\//i.test(path) && /tmp|__tmp__/i.test(path)) return path
  return resolveAssetUrl(path)
}

let draftKeySeq = 0
function nextKey(prefix: string) {
  draftKeySeq += 1
  return `${prefix}-${Date.now()}-${draftKeySeq}`
}

export default function CommunityComposePage() {
  const nav = useBrandNavScroll()
  const router = useRouter()
  const editId = router.params.id || ''
  const modeParam = (router.params.mode || '') as ComposeMode | ''

  const [channel, setChannel] = useState<'plaza' | 'help'>('plaza')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState<CommunityTag[]>([])
  const [tagIds, setTagIds] = useState<string[]>([])
  const [media, setMedia] = useState<DraftMedia[]>([])
  /** image | video | null（纯文或未定） */
  const [mediaMode, setMediaMode] = useState<ComposeMode | null>(
    modeParam === 'image' || modeParam === 'video' ? modeParam : null,
  )
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
        const raw = p.media || []
        const imgs = raw.filter((m) => m.type === 'image').slice(0, 9)
        const vids = raw.filter((m) => m.type === 'video').slice(0, 1)
        const side = imgs.length > 0 ? imgs : vids
        setMedia(
          side.map((m) => ({
            key: nextKey(m.type),
            type: m.type,
            url: m.url,
            local: false,
            coverUrl: m.coverUrl,
            coverLocal: false,
            durationSec: m.durationSec,
            width: m.width,
            height: m.height,
          })),
        )
        setMediaMode(
          imgs.length > 0 ? 'image' : vids.length > 0 ? 'video' : null,
        )
        clearComposeDraft()
        return
      }

      // 首页 FAB 带入的本地草稿
      const draft = readComposeDraft()
      if (draft?.items?.length) {
        const mode = draft.mode
        setMediaMode(mode)
        setMedia(
          draft.items.map((it) => ({
            key: nextKey(it.type),
            type: it.type,
            url: it.path,
            local: true,
            coverUrl: it.coverPath,
            coverLocal: Boolean(it.coverPath),
            durationSec: it.durationSec,
            width: it.width,
            height: it.height,
          })),
        )
        clearComposeDraft()
      } else if (modeParam === 'image' || modeParam === 'video') {
        setMediaMode(modeParam)
      }
    })().catch((e) => {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '暂时打不开',
        icon: 'none',
      })
    })
  }, [editId, modeParam])

  const imageCount = media.filter((m) => m.type === 'image').length
  const videoCount = media.filter((m) => m.type === 'video').length
  /** 主播短动态上限；官方后台发帖不限制（小程序仅主播端） */
  const MAX_BODY = 200
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

  /**
   * 加号：仅图文模式且未满 9 可续选（本地草稿，不上传）
   * 视频模式无加号
   */
  const onAddMedia = async () => {
    if (videoCount > 0) return
    if (imageCount >= 9) return

    // 已有图或明确 image 模式 → 续图
    if (imageCount > 0 || mediaMode === 'image') {
      const remain = 9 - imageCount
      const items = await pickWithSourceSheet('image', remain)
      if (!items?.length) return
      setMediaMode('image')
      setMedia((prev) => {
        const next = [
          ...prev.filter((m) => m.type === 'image'),
          ...items.map((it) => ({
            key: nextKey('image'),
            type: 'image' as const,
            url: it.path,
            local: true,
          })),
        ]
        return next.slice(0, 9)
      })
      return
    }

    // 空媒体：页内也可补选（兼容资料页直接进发帖）
    try {
      const { tapIndex } = await Taro.showActionSheet({
        itemList: ['图文（照片）', '视频'],
      })
      if (tapIndex === 0) {
        const items = await pickWithSourceSheet('image', 9)
        if (!items?.length) return
        setMediaMode('image')
        setMedia(
          items.map((it) => ({
            key: nextKey('image'),
            type: 'image' as const,
            url: it.path,
            local: true,
          })),
        )
      } else if (tapIndex === 1) {
        const items = await pickWithSourceSheet('video', 1)
        if (!items?.length) return
        setMediaMode('video')
        const it = items[0]
        setMedia([
          {
            key: nextKey('video'),
            type: 'video',
            url: it.path,
            local: true,
            coverUrl: it.coverPath,
            coverLocal: Boolean(it.coverPath),
            durationSec: it.durationSec,
            width: it.width,
            height: it.height,
          },
        ])
      }
    } catch {
      // cancel
    }
  }

  /** 发送时再上传本地文件，再提交帖子 */
  const uploadDraftMedia = async (): Promise<CommunityMedia[]> => {
    const out: CommunityMedia[] = []

    const remote = media.filter((m) => !m.local)
    for (const m of remote) {
      out.push({
        type: m.type,
        url: toUploadPath(m.url) || m.url,
        coverUrl: m.coverUrl
          ? toUploadPath(m.coverUrl) || m.coverUrl
          : undefined,
        durationSec: m.durationSec,
        width: m.width,
        height: m.height,
      })
    }

    const localImages = media.filter((m) => m.local && m.type === 'image')
    if (localImages.length) {
      const paths = localImages.map((m) => m.url)
      const uploaded = await uploadCommunityFiles(paths, { kind: 'image' })
      for (const u of uploaded.filter((x) => x.type === 'image')) {
        out.push({
          type: 'image',
          url: toUploadPath(u.url) || u.url,
        })
      }
    }

    const localVideo = media.find((m) => m.local && m.type === 'video')
    if (localVideo) {
      const uploaded = await uploadCommunityFiles([localVideo.url], {
        kind: 'video',
      })
      const videoItem =
        uploaded.find((m) => m.type === 'video') || uploaded[0]
      if (!videoItem) {
        throw new Error('视频上传失败')
      }
      let width = localVideo.width
      let height = localVideo.height
      if (videoItem.width && videoItem.height) {
        width = videoItem.width
        height = videoItem.height
      }
      let coverUrl = videoItem.coverUrl
        ? toUploadPath(videoItem.coverUrl) || videoItem.coverUrl
        : undefined
      if (localVideo.coverUrl && localVideo.coverLocal) {
        try {
          const covers = await uploadCommunityFiles([localVideo.coverUrl], {
            kind: 'image',
          })
          const c = covers[0]?.url
          if (c) coverUrl = toUploadPath(c) || c
        } catch {
          // 封面失败不阻断
        }
      }
      out.push({
        type: 'video',
        url: toUploadPath(videoItem.url) || videoItem.url,
        coverUrl,
        durationSec:
          videoItem.durationSec || localVideo.durationSec || undefined,
        width,
        height,
      })
    }

    // 图优先：若误混只保留图侧（业务不应出现）
    const imgs = out.filter((m) => m.type === 'image').slice(0, 9)
    const vids = out.filter((m) => m.type === 'video').slice(0, 1)
    return imgs.length > 0 ? imgs : vids
  }

  const submit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await ensureAppSession()
      Taro.showLoading({ title: '上传发送中', mask: true })
      const finalMedia = await uploadDraftMedia()
      const payload = {
        channel,
        isHelp: channel === 'help',
        body: body.trim(),
        media: finalMedia,
        tagIds,
      }
      if (editId) {
        const res = await updateCommunityPost(editId, payload)
        const st = res.item?.status
        void Taro.showToast({
          title:
            st === 'approved'
              ? '已更新并发布'
              : st === 'rejected'
                ? '未通过，请修改后重提'
                : '已重新提交审核',
          icon: st === 'approved' ? 'success' : 'none',
          duration: 2200,
        })
      } else {
        const res = await createCommunityPost(payload)
        const st = res.item?.status
        void Taro.showToast({
          title:
            st === 'approved'
              ? '已发布'
              : st === 'rejected'
                ? '未通过审核，可在我的帖子查看原因'
                : '已提交，通过后出现在全部',
          icon: st === 'approved' ? 'success' : 'none',
          duration: 2200,
        })
      }
      clearComposeDraft()
      setTimeout(() => {
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
      Taro.hideLoading()
      setSubmitting(false)
    }
  }

  const showAdd =
    videoCount === 0 && imageCount < 9 && mediaMode !== 'video'

  return (
    <PageShell className={styles.page} backgroundColor="#ffffff">
      <PageNav title={editId ? '编辑动态' : '发动态'} showBack {...nav} />
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
            fontSize: '26rpx',
            color:
              body.length >= MAX_BODY
                ? COLOR_ERROR
                : COLOR_TEXT_TERTIARY,
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
            <View key={m.key} className={styles.thumbWrap}>
              {m.type === 'image' ? (
                <Image
                  className={styles.thumb}
                  src={displaySrc(m.url, m.local)}
                  mode="aspectFill"
                />
              ) : (
                <View className={styles.thumbVideo}>
                  {m.coverUrl ? (
                    <Image
                      className={styles.thumb}
                      src={displaySrc(m.coverUrl, m.coverLocal)}
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
                onClick={() => {
                  setMedia((prev) => {
                    const next = prev.filter((_, idx) => idx !== i)
                    if (next.length === 0 && !editId) {
                      // 删光后保持 mode，便于继续加；视频删光则清 mode
                      if (mediaMode === 'video') setMediaMode(null)
                    }
                    return next
                  })
                }}
              >
                <Text>×</Text>
              </View>
            </View>
          ))}
          {showAdd ? (
            <View className={styles.add} onClick={() => void onAddMedia()}>
              <Text className={styles.addPlus}>+</Text>
            </View>
          ) : null}
        </View>

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
