import { Image, Input, ScrollView, Text, View } from '@tarojs/components'
import Taro, {
  useDidShow,
  usePullDownRefresh,
  useReachBottom,
} from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import iconCompose from '@/assets/community/compose.png'
import iconMoments from '@/assets/community/moments.png'
import CommunityPostCard from '@/components/community/PostCard'
import ListSkeleton from '@/components/ListSkeleton'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import SegmentTabs from '@/components/SegmentTabs'
import StateBlock from '@/components/StateBlock'
import { useBrandNavScroll } from '@/hooks/useBrandNavScroll'
import { ensureAppSession } from '@/services/auth'
import {
  listCommunityPosts,
  listCommunityTags,
  toggleCommunityFollow,
  toggleCommunityLike,
  type CommunityPost,
  type CommunityTag,
} from '@/services/community'
import {
  navigateToComposeWithDraft,
  pickWithSourceSheet,
  type ComposeMode,
} from '@/services/community-compose-draft'
import { useSessionStore } from '@/store/session'
import styles from './index.module.scss'

/** 频道筛：全部 / 广场 / 官方 / 求助（滑动胶囊同学习中心） */
const CHANNELS: Array<{ key: string; label: string }> = [
  { key: '', label: '全部' },
  { key: 'plaza', label: '广场' },
  { key: 'official', label: '官方' },
  { key: 'help', label: '求助' },
]

export default function CommunityFeedPage() {
  const nav = useBrandNavScroll()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [channel, setChannel] = useState('')
  const [tagId, setTagId] = useState('')
  const [tags, setTags] = useState<CommunityTag[]>([])
  const [items, setItems] = useState<CommunityPost[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  const [keyword, setKeyword] = useState('')
  /** 评论框打开时隐藏发帖 FAB，避免挡表情面板 */
  const [composeBlocking, setComposeBlocking] = useState(false)
  /** 飞机展开：图文 / 视频（mounted + open 分离，保证进出场动画） */
  const [fabMenuMounted, setFabMenuMounted] = useState(false)
  const [fabMenuOpen, setFabMenuOpen] = useState(false)
  const fabCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closeFabMenu = useCallback(() => {
    setFabMenuOpen(false)
    if (fabCloseTimer.current) clearTimeout(fabCloseTimer.current)
    fabCloseTimer.current = setTimeout(() => {
      setFabMenuMounted(false)
      fabCloseTimer.current = null
    }, 260)
  }, [])

  const openFabMenu = useCallback(() => {
    if (fabCloseTimer.current) {
      clearTimeout(fabCloseTimer.current)
      fabCloseTimer.current = null
    }
    setFabMenuMounted(true)
    // 下一帧再 open，触发 CSS transition
    setTimeout(() => setFabMenuOpen(true), 16)
  }, [])

  const toggleFabExpand = useCallback(() => {
    if (fabMenuOpen || fabMenuMounted) closeFabMenu()
    else openFabMenu()
  }, [fabMenuOpen, fabMenuMounted, closeFabMenu, openFabMenu])

  useEffect(() => {
    if (composeBlocking) closeFabMenu()
  }, [composeBlocking, closeFabMenu])

  useEffect(
    () => () => {
      if (fabCloseTimer.current) clearTimeout(fabCloseTimer.current)
    },
    [],
  )

  const likeLock = useRef<Set<string>>(new Set())
  const skipShowOnce = useRef(true)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(
    async (options?: {
      pullDown?: boolean
      reset?: boolean
      quiet?: boolean
    }) => {
      const pullDown = Boolean(options?.pullDown)
      const reset = options?.reset !== false
      const quiet = Boolean(options?.quiet)
      const kw = keyword.trim()
      if (reset && !pullDown && !quiet) setLoading(true)
      if (!quiet) setError(null)
      try {
        await ensureAppSession()
        const session = useSessionStore.getState().session
        if (session?.mode === 'mock') {
          setItems([])
          setTags([])
          setCursor(null)
          return
        }
        if (reset) {
          const tagRes = await listCommunityTags()
          setTags(tagRes.items ?? [])
        }
        const res = await listCommunityPosts({
          channel: channel || undefined,
          tagId: tagId || undefined,
          keyword: kw || undefined,
          take: 20,
        })
        setItems(res.items ?? [])
        setCursor(res.nextCursor)
      } catch (e) {
        if (!quiet) setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        if (reset && !pullDown && !quiet) setLoading(false)
        if (pullDown) Taro.stopPullDownRefresh()
      }
    },
    [channel, tagId, keyword],
  )

  useEffect(() => {
    void load({ reset: true })
    skipShowOnce.current = true
  }, [load])

  useDidShow(() => {
    if (skipShowOnce.current) {
      skipShowOnce.current = false
      return
    }
    void load({ reset: true, quiet: true })
  })

  usePullDownRefresh(() => {
    void load({ pullDown: true, reset: true })
  })

  useReachBottom(() => {
    if (!cursor || loadingMore) return
    void (async () => {
      setLoadingMore(true)
      try {
        const res = await listCommunityPosts({
          channel: channel || undefined,
          tagId: tagId || undefined,
          keyword: keyword.trim() || undefined,
          cursor,
          take: 20,
        })
        setItems((prev) => [...prev, ...(res.items ?? [])])
        setCursor(res.nextCursor)
      } catch {
        // ignore
      } finally {
        setLoadingMore(false)
      }
    })()
  })

  const applySearch = (raw: string) => {
    const next = raw.trim()
    setKeyword(next)
    setSearchDraft(next)
  }

  const onSearchInput = (value: string) => {
    setSearchDraft(value)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!value.trim()) {
      setKeyword('')
      return
    }
    searchTimer.current = setTimeout(() => {
      setKeyword(value.trim())
    }, 400)
  }

  const clearSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    setSearchDraft('')
    setKeyword('')
  }

  /**
   * 图文 / 视频 → 拍摄|相册 → 本地草稿进发帖页（发送时才上传）
   */
  const startCompose = async (mode: ComposeMode) => {
    closeFabMenu()
    const items = await pickWithSourceSheet(
      mode,
      mode === 'image' ? 9 : 1,
    )
    if (!items?.length) return
    navigateToComposeWithDraft({
      mode,
      items,
      ts: Date.now(),
    })
  }

  const goMine = () => {
    closeFabMenu()
    // 统一资料页 · 无 uid = 本人动态
    void Taro.navigateTo({ url: '/pages/community/profile/index' })
  }

  /** 仅官方长文进详情 */
  const openOfficialDetail = (id: string) => {
    void Taro.navigateTo({
      url: `/pages/community/detail/index?id=${id}`,
    })
  }

  const openProfile = (wecomUserId: string) => {
    if (!wecomUserId) return
    const selfId = useSessionStore.getState().session?.user?.wecomUserId
    // 本人与他人同一资料页；本人不带 uid
    if (selfId && wecomUserId === selfId) {
      void Taro.navigateTo({ url: '/pages/community/profile/index' })
      return
    }
    void Taro.navigateTo({
      url: `/pages/community/profile/index?uid=${encodeURIComponent(wecomUserId)}`,
    })
  }

  const onLike = async (post: CommunityPost) => {
    if (likeLock.current.has(post.id)) return
    likeLock.current.add(post.id)
    const nextLiked = !post.likedByMe
    const delta = nextLiked ? 1 : -1
    setItems((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? {
              ...p,
              likedByMe: nextLiked,
              likeCount: Math.max(0, (p.likeCount || 0) + delta),
            }
          : p,
      ),
    )
    try {
      const res = await toggleCommunityLike(post.id)
      setItems((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, ...res.item } : p)),
      )
    } catch (err) {
      setItems((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                likedByMe: post.likedByMe,
                likeCount: post.likeCount,
              }
            : p,
        ),
      )
      void Taro.showToast({
        title: err instanceof Error ? err.message : '操作失败',
        icon: 'none',
      })
    } finally {
      likeLock.current.delete(post.id)
    }
  }

  const onFollow = async (post: CommunityPost) => {
    const uid = post.author.wecomUserId
    if (!uid || post.isAuthor) return
    const next = !post.followingAuthor
    setItems((prev) =>
      prev.map((p) =>
        p.author.wecomUserId === uid
          ? { ...p, followingAuthor: next }
          : p,
      ),
    )
    try {
      const res = await toggleCommunityFollow(uid)
      setItems((prev) =>
        prev.map((p) =>
          p.author.wecomUserId === uid
            ? { ...p, followingAuthor: res.following }
            : p,
        ),
      )
      void Taro.showToast({
        title: res.following ? '已关注' : '已取消关注',
        icon: 'none',
      })
    } catch (e) {
      setItems((prev) =>
        prev.map((p) =>
          p.author.wecomUserId === uid
            ? { ...p, followingAuthor: post.followingAuthor }
            : p,
        ),
      )
      void Taro.showToast({
        title: e instanceof Error ? e.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const emptyTitle = keyword
    ? '没有相关动态'
    : !channel
      ? '还没有动态'
      : '还没有动态'
  const emptyDesc = keyword
    ? `没有找到「${keyword}」相关内容，换个词试试`
    : !channel
      ? '发第一条，和大家分享今天的成长'
      : '发第一条，和大家分享今天的成长'

  return (
    <PageShell className={styles.page} backgroundColor="#f7f8fa">
      <PageNav title="主播圈" {...nav} />

      <View className={styles.content}>
        {/* 通栏搜索 · 产品要求保留在内容上方 */}
        <View className={styles.searchBar}>
          <View className={styles.searchInner}>
            <Text className={styles.searchIcon}>⌕</Text>
            <Input
              className={styles.searchInput}
              value={searchDraft}
              type="text"
              confirmType="search"
              placeholder="搜索动态、话题或作者"
              placeholderClass={styles.searchPlaceholder}
              onInput={(e) => onSearchInput(e.detail.value)}
              onConfirm={(e) => applySearch(e.detail.value)}
            />
            {searchDraft ? (
              <View className={styles.searchClear} onClick={clearSearch}>
                <Text className={styles.searchClearX}>×</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Banner · YOYO 设计稿 */}
        <View className={styles.heroSection}>
          <View className={styles.heroCard}>
            <View className={styles.heroCopy}>
              <Text className={styles.heroTitle}>
                <Text className={styles.heroTitleLine}>今天也要</Text>
                <Text className={styles.heroTitleLine}>好好发声呀</Text>
              </Text>
              <View
                className={styles.heroPublish}
                onClick={() => openFabMenu()}
              >
                <Text className={styles.heroPublishText}>发布动态 +</Text>
              </View>
            </View>
            {/* 插画位：颜色占位，待换正式图 */}
            <View className={styles.heroArt} aria-hidden>
              <View className={styles.heroArtBlob} />
              <View className={styles.heroArtBlobSoft} />
            </View>
          </View>
        </View>

        {/* 频道筛 · 与全站 SegmentTabs slide 一致 */}
        <View className={styles.filterSection}>
          <SegmentTabs
            variant="slide"
            value={channel || 'all'}
            onChange={(key) => {
              setChannel(key === 'all' ? '' : key)
              setTagId('')
            }}
            items={CHANNELS.map((c) => ({
              key: c.key || 'all',
              label: c.label,
            }))}
          />

          {/* 话题：横向滑动 Chip，左右与卡片同 $page-padding */}
          {tags.length > 0 ? (
            <ScrollView
              scrollX
              enhanced
              showScrollbar={false}
              className={styles.topicScroll}
            >
              <View className={styles.topicTrack}>
                {tags.map((t) => {
                  const on = tagId === t.id
                  return (
                    <View
                      key={t.id}
                      className={`${styles.topicChip} ${on ? styles.topicChipOn : ''}`}
                      onClick={() => setTagId(on ? '' : t.id)}
                    >
                      <Text className={styles.topicChipText}>#{t.name}</Text>
                    </View>
                  )
                })}
              </View>
            </ScrollView>
          ) : null}

          {/* 选中话题 · 醒目筛选条 + 实心清除 */}
          {tagId ? (
            <View className={styles.topicActiveBar}>
              <View className={styles.topicActiveMain}>
                <Text className={styles.topicActiveLabel}>当前话题</Text>
                <Text className={styles.topicActiveHash}>
                  #{tags.find((t) => t.id === tagId)?.name || '话题'}
                </Text>
              </View>
              <View
                className={styles.topicActiveClearBtn}
                onClick={() => setTagId('')}
              >
                <Text className={styles.topicActiveClearText}>清除 ×</Text>
              </View>
            </View>
          ) : null}

          {keyword ? (
            <View className={styles.searchHint}>
              <Text className={styles.searchHintText}>
                「{keyword}」· {items.length}
                {cursor ? '+' : ''} 条结果
              </Text>
              <Text className={styles.searchHintClear} onClick={clearSearch}>
                清除
              </Text>
            </View>
          ) : null}
        </View>

        {/* Feed 卡片流 */}
        <View className={styles.feed}>
          {loading ? (
            <View className={styles.skeletonPad}>
              <ListSkeleton rows={3} />
            </View>
          ) : error ? (
            <View className={styles.emptyWrap}>
              <StateBlock
                icon="error"
                title="暂时打不开"
                description={error}
                actionText="再试一次"
                onAction={() => void load({ reset: true })}
              />
            </View>
          ) : items.length === 0 ? (
            <View className={styles.emptyWrap}>
              <StateBlock
                icon="empty"
                title={emptyTitle}
                description={emptyDesc}
                actionText={keyword ? '清除搜索' : '发布动态'}
                onAction={() => {
                  if (keyword) {
                    clearSearch()
                    return
                  }
                  openFabMenu()
                }}
              />
            </View>
          ) : (
            items.map((post) => (
              <CommunityPostCard
                key={post.id}
                post={post}
                onLike={onLike}
                onFollow={onFollow}
                onOpenProfile={openProfile}
                onTagClick={(id) => setTagId(id)}
                onOpenDetail={
                  post.channel === 'official' || post.author.kind === 'staff'
                    ? openOfficialDetail
                    : undefined
                }
                onCommentCountChange={(postId, count) => {
                  setItems((prev) =>
                    prev.map((p) =>
                      p.id === postId ? { ...p, commentCount: count } : p,
                    ),
                  )
                }}
                onDeleted={(postId) => {
                  setItems((prev) => prev.filter((p) => p.id !== postId))
                }}
                onComposeOpenChange={setComposeBlocking}
              />
            ))
          )}
          {loadingMore ? <Text className={styles.more}>正在准备…</Text> : null}
          {!loadingMore && cursor ? (
            <Text className={styles.more}>上拉看更多</Text>
          ) : null}
          {!loading && !cursor && items.length > 0 ? (
            <Text className={styles.more}>已经到底啦</Text>
          ) : null}
        </View>
      </View>

      {/* 竖胶囊：上发帖（向上展开图文/视频）· 下我的动态 */}
      {!composeBlocking ? (
        <>
          {fabMenuMounted ? (
            <View
              className={`${styles.fabMask} ${fabMenuOpen ? styles.fabMaskOn : ''}`}
              onClick={() => closeFabMenu()}
            />
          ) : null}
          <View className={styles.fabRoot}>
            {fabMenuMounted ? (
              <View className={styles.fabExpand}>
                <View
                  className={`${styles.fabExpandBtn} ${fabMenuOpen ? styles.fabExpandBtnOn : ''}`}
                  style={{ transitionDelay: fabMenuOpen ? '40ms' : '0ms' }}
                  hoverClass={styles.fabExpandBtnHover}
                  hoverStayTime={80}
                  onClick={() => void startCompose('image')}
                >
                  <Text className={styles.fabExpandText}>图文</Text>
                </View>
                <View
                  className={`${styles.fabExpandBtn} ${fabMenuOpen ? styles.fabExpandBtnOn : ''}`}
                  style={{ transitionDelay: fabMenuOpen ? '80ms' : '0ms' }}
                  hoverClass={styles.fabExpandBtnHover}
                  hoverStayTime={80}
                  onClick={() => void startCompose('video')}
                >
                  <Text className={styles.fabExpandText}>视频</Text>
                </View>
              </View>
            ) : null}
            <View className={styles.fabStack}>
              <View
                className={`${styles.fabItem} ${fabMenuOpen ? styles.fabItemActive : ''}`}
                hoverClass={styles.fabItemHover}
                hoverStayTime={80}
                onClick={toggleFabExpand}
              >
                <Image
                  className={styles.fabIcon}
                  src={iconCompose}
                  mode="aspectFit"
                />
              </View>
              <View className={styles.fabDivider} />
              <View
                className={styles.fabItem}
                hoverClass={styles.fabItemHover}
                hoverStayTime={80}
                onClick={goMine}
              >
                <Image
                  className={styles.fabIcon}
                  src={iconMoments}
                  mode="aspectFit"
                />
              </View>
            </View>
          </View>
        </>
      ) : null}
    </PageShell>
  )
}
