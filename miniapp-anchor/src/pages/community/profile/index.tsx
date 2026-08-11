import { Image, Input, Text, View } from '@tarojs/components'
import Taro, {
  useDidShow,
  usePullDownRefresh,
  useRouter,
} from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { useBrandNavScroll } from '@/hooks/useBrandNavScroll'
import { ensureAppSession } from '@/services/auth'
import {
  deleteCommunityPost,
  getCommunityUserProfile,
  listMyCommunityPosts,
  toggleCommunityFollow,
  updateMyCommunityProfile,
  uploadCommunityFiles,
  type CommunityPost,
  type CommunityPublicProfile,
} from '@/services/community'
import { resolveAssetUrl, toUploadPath } from '@/services/request'
import { useSessionStore } from '@/store/session'
import { getTierMeta } from '@/utils/tier'
import styles from './index.module.scss'

/**
 * 社区资料页 · 朋友圈
 * - 封面可换（本人）；无封面用品牌渐变+气泡
 * - 头像仅展示默认，不可在此更换
 * - 签名点「点击添加签名」弹卡片
 * - 仅已通过动态；图左字右；媒体最多 4 张固定布局
 */

type DayGroup = {
  key: string
  kind: 'today' | 'yesterday' | 'date'
  day?: number
  month?: number
  posts: CommunityPost[]
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function groupPostsByDay(posts: CommunityPost[]): DayGroup[] {
  const now = new Date()
  const today = startOfDay(now)
  const yest = today - 86400000
  const map = new Map<string, DayGroup>()

  for (const p of posts) {
    const t = new Date(p.createdAt || p.publishedAt || Date.now())
    const sod = startOfDay(t)
    let key: string
    let group: DayGroup
    if (sod === today) {
      key = 'today'
      group = map.get(key) || { key, kind: 'today', posts: [] }
    } else if (sod === yest) {
      key = 'yesterday'
      group = map.get(key) || { key, kind: 'yesterday', posts: [] }
    } else {
      key = `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`
      group = map.get(key) || {
        key,
        kind: 'date',
        day: t.getDate(),
        month: t.getMonth() + 1,
        posts: [],
      }
    }
    group.posts.push(p)
    map.set(key, group)
  }
  return Array.from(map.values())
}

function formatPostTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** 列表媒体：最多 4 张；视频取封面 */
function getMediaThumbs(post: CommunityPost): {
  urls: string[]
  isVideo: boolean
} {
  const list = post.media || []
  const video = list.find((m) => m.type === 'video')
  if (video) {
    const u = video.coverUrl || video.url
    return { urls: u ? [u] : [], isVideo: true }
  }
  return {
    urls: list
      .filter((m) => m.type === 'image')
      .slice(0, 4)
      .map((m) => m.url)
      .filter(Boolean),
    isVideo: false,
  }
}

/**
 * 朋友圈媒体：总外框永远 ≈165×165（对齐 my 参考图，非 260）
 * 1 整方 / 2 双竖 / 3 左竖+右上下 / 4 宫格
 */
function MomentsMedia({
  urls,
  isVideo,
  onPreview,
}: {
  urls: string[]
  isVideo: boolean
  onPreview: (index: number) => void
}) {
  const list = urls.slice(0, 4)
  const n = list.length
  if (n <= 0) return null

  const cellClass =
    n === 1
      ? [styles.m1]
      : n === 2
        ? [styles.m2a, styles.m2b]
        : n === 3
          ? [styles.m3a, styles.m3b, styles.m3c]
          : [styles.m4a, styles.m4b, styles.m4c, styles.m4d]

  return (
    <View className={styles.mediaBox}>
      {list.map((u, i) => (
        <View
          key={`${u}-${i}`}
          className={`${styles.mediaCell} ${cellClass[i] || ''}`}
          onClick={() => onPreview(i)}
        >
          <Image
            className={styles.mediaImg}
            src={resolveAssetUrl(u)}
            mode="aspectFill"
          />
        </View>
      ))}
      {isVideo ? (
        <View className={styles.videoBadge}>
          <View className={styles.videoBadgeTri} />
        </View>
      ) : null}
    </View>
  )
}

export default function CommunityProfilePage() {
  const nav = useBrandNavScroll()
  const router = useRouter()
  const session = useSessionStore((s) => s.session)
  const selfId = session?.user?.wecomUserId || ''

  const paramUid = decodeURIComponent(router.params.uid || '').trim()
  const targetUid = paramUid || selfId
  const isSelfView = Boolean(targetUid) && (!paramUid || paramUid === selfId)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<CommunityPublicProfile | null>(null)
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [bioOpen, setBioOpen] = useState(false)
  const [bioDraft, setBioDraft] = useState('')
  const [savingBio, setSavingBio] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)

  const load = useCallback(
    async (options?: { pullDown?: boolean }) => {
      if (!targetUid) {
        setError('请先登录')
        setLoading(false)
        return
      }
      if (!options?.pullDown) setLoading(true)
      setError(null)
      try {
        await ensureAppSession()
        const me = useSessionStore.getState().session?.user?.wecomUserId || ''
        const uid = paramUid || me
        if (!uid) {
          setError('请先登录')
          return
        }
        const self = !paramUid || paramUid === me

        if (self) {
          // 仅已通过 · 与朋友圈一致
          const [profileRes, mineRes] = await Promise.all([
            getCommunityUserProfile(uid),
            listMyCommunityPosts({ status: 'approved' }),
          ])
          setProfile(profileRes.item)
          setPosts(mineRes.items ?? [])
        } else {
          const res = await getCommunityUserProfile(uid)
          setProfile(res.item)
          setPosts(res.posts ?? [])
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
        if (options?.pullDown) Taro.stopPullDownRefresh()
      }
    },
    [paramUid, targetUid],
  )

  useEffect(() => {
    void load()
  }, [load])

  usePullDownRefresh(() => {
    void load({ pullDown: true })
  })

  const showSelf = isSelfView || Boolean(profile?.isSelf)
  const tierMeta = getTierMeta(profile?.tier)
  const dayGroups = useMemo(() => groupPostsByDay(posts), [posts])

  /**
   * 换封面：选图 → 自研裁切页（企微无 cropImage）→ 完成后再上传
   * 裁切结果经 storage 回传，见 useDidShow
   */
  const changeCover = async () => {
    if (!showSelf || uploadingCover) return
    try {
      let picked: string | null = null
      try {
        const media = await Taro.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sourceType: ['album', 'camera'],
          sizeType: ['original'],
        })
        picked = media.tempFiles?.[0]?.tempFilePath?.trim() || null
      } catch (e1) {
        const m1 =
          e1 && typeof e1 === 'object' && 'errMsg' in e1
            ? String((e1 as { errMsg?: string }).errMsg || '')
            : ''
        if (/cancel|Cancel|取消/i.test(m1)) return
        const choose = await Taro.chooseImage({
          count: 1,
          sizeType: ['original'],
          sourceType: ['album', 'camera'],
        })
        picked = choose.tempFilePaths?.[0]?.trim() || null
      }
      if (!picked) return

      try {
        Taro.removeStorageSync('__cover_crop_result__')
      } catch {
        // ignore
      }
      Taro.setStorageSync('__cover_crop_src__', picked)
      void Taro.navigateTo({
        url: `/pages/community/cover-crop/index?src=${encodeURIComponent(picked)}`,
      })
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'errMsg' in e
          ? String((e as { errMsg?: string }).errMsg || '')
          : e instanceof Error
            ? e.message
            : '选图失败'
      if (/cancel|Cancel|取消/i.test(msg)) return
      void Taro.showToast({ title: msg || '选图失败', icon: 'none' })
    }
  }

  /** 裁切页完成 → 上传封面（取消裁切无 result，忽略） */
  const uploadCroppedCover = useCallback(async (filePath: string) => {
    if (uploadingCover) return
    setUploadingCover(true)
    void Taro.showLoading({ title: '上传中', mask: true })
    try {
      const uploaded = await uploadCommunityFiles([filePath], {
        kind: 'image',
      })
      const url = uploaded[0]?.url
      if (!url) throw new Error('上传失败')
      const saved = toUploadPath(url) || url
      const res = await updateMyCommunityProfile({ coverUrl: saved })
      setProfile((p) =>
        p ? { ...p, coverUrl: res.item.coverUrl ?? saved } : p,
      )
      void Taro.hideLoading()
      void Taro.showToast({ title: '封面已更新', icon: 'success' })
    } catch (e) {
      void Taro.hideLoading()
      void Taro.showToast({
        title: e instanceof Error ? e.message : '上传失败',
        icon: 'none',
      })
    } finally {
      setUploadingCover(false)
      try {
        Taro.removeStorageSync('__cover_crop_result__')
      } catch {
        // ignore
      }
    }
  }, [uploadingCover])

  useDidShow(() => {
    if (!isSelfView) return
    try {
      const raw = Taro.getStorageSync('__cover_crop_result__') as
        | { path?: string; ts?: number }
        | string
      const path =
        typeof raw === 'string'
          ? raw
          : raw && typeof raw === 'object'
            ? String(raw.path || '')
            : ''
      const ts =
        typeof raw === 'object' && raw && typeof raw.ts === 'number'
          ? raw.ts
          : 0
      // 先清缓存，避免重复触发；仅 2 分钟内有效
      if (path && (!ts || Date.now() - ts < 120_000)) {
        try {
          Taro.removeStorageSync('__cover_crop_result__')
        } catch {
          // ignore
        }
        void uploadCroppedCover(path)
      }
    } catch {
      // ignore
    }
  })

  const openBioEdit = () => {
    if (!showSelf) return
    setBioDraft(profile?.bio || '')
    setBioOpen(true)
  }

  const saveBio = async () => {
    if (savingBio) return
    const text = bioDraft.trim()
    if (text.length > 9) {
      void Taro.showToast({ title: '签名最多 9 个字', icon: 'none' })
      return
    }
    setSavingBio(true)
    try {
      const res = await updateMyCommunityProfile({
        bio: text || null,
      })
      setProfile((p) => (p ? { ...p, bio: res.item.bio } : p))
      setBioOpen(false)
      void Taro.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '保存失败',
        icon: 'none',
      })
    } finally {
      setSavingBio(false)
    }
  }

  const onFollow = async () => {
    if (!profile || profile.isSelf) return
    try {
      const res = await toggleCommunityFollow(profile.wecomUserId)
      setProfile((p) =>
        p
          ? {
              ...p,
              following: res.following,
              stats: {
                ...p.stats,
                followerCount: Math.max(
                  0,
                  p.stats.followerCount + (res.following ? 1 : -1),
                ),
              },
            }
          : p,
      )
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const onDeletePost = async (post: CommunityPost) => {
    if (!post.isAuthor && !showSelf) return
    const ok = await Taro.showModal({
      title: '删除动态',
      content: '删除后不可恢复，正文与图片/视频将一并清除',
      confirmText: '删除',
      confirmColor: '#FF3B30',
    })
    if (!ok.confirm) return
    try {
      void Taro.showLoading({ title: '删除中', mask: true })
      await deleteCommunityPost(post.id)
      void Taro.hideLoading()
      setPosts((prev) => prev.filter((p) => p.id !== post.id))
      setProfile((p) =>
        p
          ? {
              ...p,
              stats: {
                ...p.stats,
                postCount: Math.max(0, (p.stats.postCount || 0) - 1),
              },
            }
          : p,
      )
      void Taro.showToast({ title: '已删除', icon: 'success' })
    } catch (e) {
      void Taro.hideLoading()
      void Taro.showToast({
        title: e instanceof Error ? e.message : '删除失败',
        icon: 'none',
      })
    }
  }

  const previewMedia = (post: CommunityPost, index = 0) => {
    const { urls, isVideo } = getMediaThumbs(post)
    if (isVideo) {
      const video = (post.media || []).find((m) => m.type === 'video')
      if (!video?.url) return
      const url = resolveAssetUrl(video.url)
      const poster = video.coverUrl
        ? resolveAssetUrl(video.coverUrl)
        : undefined
      try {
        Taro.setStorageSync('__community_video_preview__', {
          url,
          poster: poster || '',
          ts: Date.now(),
        })
      } catch {
        // ignore
      }
      void Taro.navigateTo({
        url: `/pages/community/video-preview/index?url=${encodeURIComponent(url)}${
          poster ? `&poster=${encodeURIComponent(poster)}` : ''
        }`,
      })
      return
    }
    const full = urls.map((u) => resolveAssetUrl(u)).filter(Boolean)
    if (!full.length) return
    void Taro.previewImage({
      current: full[Math.max(0, Math.min(index, full.length - 1))],
      urls: full,
    })
  }

  const goCompose = () => {
    void Taro.navigateTo({ url: '/pages/community/compose/index' })
  }

  /** 点动态内容区 → 帖子详情（对齐 oo 详情页） */
  const goPostDetail = (postId: string) => {
    if (!postId) return
    void Taro.navigateTo({
      url: `/pages/community/detail/index?id=${encodeURIComponent(postId)}`,
    })
  }

  const coverSrc = profile?.coverUrl
    ? resolveAssetUrl(profile.coverUrl)
    : ''

  return (
    <PageShell className={styles.page} backgroundColor="#ffffff">
      <PageNav
        {...nav}
        title={showSelf ? '' : profile?.displayName || '资料'}
        showBack
        immersive
        backgroundColor="transparent"
        titleColor="#ffffff"
        backIconColor="#ffffff"
      />
      {loading ? (
        <StateBlock icon="loading" title="请稍等一下" />
      ) : error ? (
        <StateBlock
          icon="error"
          title="暂时打不开"
          description={error}
          actionText="再试一次"
          onAction={() => void load()}
        />
      ) : !profile ? (
        <StateBlock icon="empty" title="用户不存在" />
      ) : (
        <View className={styles.body}>
          {/*
            封面交互（本人）：
            - 无自定义封面：品牌渐变 + 正中「点击上传图片」；点封面区选图裁切
            - 已上传封面：不显示文案；点封面任意处再次选图裁切
            - 头像仍 stopPropagation，不触发换封面
          */}
          <View
            className={`${styles.coverWrap} ${
              showSelf ? styles.coverTappable : ''
            }`}
            onClick={() => {
              if (showSelf && !uploadingCover) void changeCover()
            }}
          >
            {coverSrc ? (
              <Image
                className={styles.coverImg}
                src={coverSrc}
                mode="aspectFill"
              />
            ) : (
              <View className={styles.coverBrand}>
                <View className={`${styles.coverBubble} ${styles.coverBubble1}`} />
                <View className={`${styles.coverBubble} ${styles.coverBubble2}`} />
                <View className={`${styles.coverBubble} ${styles.coverBubble3}`} />
                <View className={`${styles.coverBubble} ${styles.coverBubble4}`} />
              </View>
            )}

            {showSelf && !coverSrc ? (
              <View className={styles.coverEmptyHint}>
                <Text className={styles.coverEmptyHintText}>
                  {uploadingCover ? '上传中…' : '点击上传图片'}
                </Text>
              </View>
            ) : null}

            {showSelf && coverSrc && uploadingCover ? (
              <View className={styles.coverEmptyHint}>
                <Text className={styles.coverEmptyHintText}>上传中…</Text>
              </View>
            ) : null}

            <View
              className={styles.nameOnCover}
              onClick={(e) => e.stopPropagation()}
            >
              <Text className={styles.nameText}>{profile.displayName}</Text>
            </View>

            {/* 仅展示默认头像，不可换 */}
            <View
              className={styles.avatarFloat}
              onClick={(e) => e.stopPropagation()}
            >
              {profile.avatarUrl ? (
                <Image
                  className={styles.avatarImg}
                  src={resolveAssetUrl(profile.avatarUrl)}
                  mode="aspectFill"
                />
              ) : (
                <View className={styles.avatarLetter}>
                  <Text>{(profile.displayName || '主').slice(0, 1)}</Text>
                </View>
              )}
            </View>
          </View>

          <View className={styles.profileMeta}>
            <View
              className={styles.bioTap}
              onClick={() => {
                if (showSelf) openBioEdit()
              }}
            >
              {profile.bio ? (
                <Text className={styles.bioText}>{profile.bio}</Text>
              ) : (
                <Text className={styles.bioPlaceholder}>
                  {showSelf ? '点击添加签名' : '这个人很懒，还没写签名'}
                </Text>
              )}
            </View>

            <View className={styles.badges}>
              {profile.kind === 'staff' || profile.roleLabel ? (
                <Text className={styles.role}>
                  {profile.roleLabel || '官方'}
                </Text>
              ) : null}
              {tierMeta ? (
                <Text
                  className={styles.tier}
                  style={{
                    background: `linear-gradient(135deg, ${tierMeta.color}, ${tierMeta.colorEnd})`,
                  }}
                >
                  {tierMeta.name}
                </Text>
              ) : null}
            </View>

            {!showSelf ? (
              <View
                className={`${styles.followBtn} ${
                  profile.following ? styles.followBtnOn : ''
                }`}
                onClick={() => void onFollow()}
              >
                <Text className={styles.followBtnText}>
                  {profile.following ? '已关注' : '关注'}
                </Text>
              </View>
            ) : null}
          </View>

          <View className={styles.timeline}>
            {showSelf && !dayGroups.some((g) => g.kind === 'today') ? (
              <View className={styles.dayBlock}>
                <View className={styles.dayLeft}>
                  <Text className={styles.dayLabel}>今天</Text>
                </View>
                <View className={styles.dayRight}>
                  <View className={styles.todayCompose} onClick={goCompose}>
                    <View className={styles.todayCamera} />
                  </View>
                </View>
              </View>
            ) : null}

            {dayGroups.length === 0 && !showSelf ? (
              <View className={styles.empty}>
                <StateBlock icon="empty" title="暂无公开动态" />
              </View>
            ) : null}

            {dayGroups.length === 0 && showSelf ? (
              <View className={styles.empty}>
                <StateBlock
                  icon="empty"
                  title="还没有发过动态"
                  actionText="去发布"
                  onAction={goCompose}
                />
              </View>
            ) : null}

            {dayGroups.map((group) => (
              <View key={group.key} className={styles.dayBlock}>
                <View className={styles.dayLeft}>
                  {group.kind === 'today' ? (
                    <Text className={styles.dayLabel}>今天</Text>
                  ) : group.kind === 'yesterday' ? (
                    <Text className={styles.dayLabel}>昨天</Text>
                  ) : (
                    <Text>
                      <Text className={styles.dayBig}>{group.day}</Text>
                      <Text className={styles.daySmall}>{group.month}月</Text>
                    </Text>
                  )}
                </View>
                <View className={styles.dayRight}>
                  {group.kind === 'today' && showSelf ? (
                    <View className={styles.todayCompose} onClick={goCompose}>
                      <View className={styles.todayCamera} />
                    </View>
                  ) : null}

                  {group.posts.map((post) => {
                    const thumb = getMediaThumbs(post)
                    const hasMedia = thumb.urls.length > 0
                    return (
                      <View
                        key={post.id}
                        className={styles.momentItem}
                        onClick={() => goPostDetail(post.id)}
                      >
                        {hasMedia ? (
                          <View
                            className={styles.momentMediaCol}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MomentsMedia
                              urls={thumb.urls}
                              isVideo={thumb.isVideo}
                              onPreview={(i) => previewMedia(post, i)}
                            />
                          </View>
                        ) : null}
                        <View className={styles.momentTextCol}>
                          {post.body ? (
                            <Text className={styles.momentBody}>
                              {post.body}
                            </Text>
                          ) : null}
                          <View className={styles.momentMeta}>
                            <Text className={styles.momentTime}>
                              {formatPostTime(
                                post.createdAt || post.publishedAt || '',
                              )}
                            </Text>
                            {showSelf ? (
                              <Text
                                className={styles.momentDel}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  void onDeletePost(post)
                                }}
                              >
                                删除
                              </Text>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    )
                  })}
                </View>
              </View>
            ))}

            {/* 有内容时：分割线 + 已经到底了（对齐社区首页） */}
            {posts.length > 0 ||
            (showSelf && dayGroups.some((g) => g.kind === 'today')) ? (
              <View className={styles.endLine}>
                <View className={styles.endLineRule} />
                <Text className={styles.endLineText}>已经到底了</Text>
                <View className={styles.endLineRule} />
              </View>
            ) : null}
          </View>
        </View>
      )}

      {/* 签名 · 居中卡片 */}
      {bioOpen ? (
        <View
          className={styles.bioMask}
          catchMove
          onClick={() => setBioOpen(false)}
        >
          <View
            className={styles.bioCard}
            onClick={(e) => e.stopPropagation()}
          >
            <Text className={styles.bioCardTitle}>个性签名</Text>
            <View className={styles.bioField}>
              <Input
                className={styles.bioInput}
                type="text"
                value={bioDraft}
                maxlength={9}
                placeholder="最多 9 个字"
                placeholderStyle="color:#C0C4CC;text-align:left;"
                focus
                onInput={(e) =>
                  setBioDraft((e.detail.value || '').slice(0, 9))
                }
              />
              <Text className={styles.bioCount}>{bioDraft.length}/9</Text>
            </View>
            <View className={styles.bioCardActions}>
              <View
                className={styles.bioCardBtn}
                onClick={() => setBioOpen(false)}
              >
                <Text className={styles.bioCardBtnText}>取消</Text>
              </View>
              <View
                className={`${styles.bioCardBtn} ${styles.bioCardBtnPrimary}`}
                onClick={() => void saveBio()}
              >
                <Text className={styles.bioCardBtnText}>
                  {savingBio ? '保存中…' : '保存'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      ) : null}
    </PageShell>
  )
}
