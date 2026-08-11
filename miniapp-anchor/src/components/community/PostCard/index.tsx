import { Image, Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import iconCommentWhite from '@/assets/community/comment-white.png'
import iconDelete from '@/assets/community/delete.png'
import iconHeartFill from '@/assets/community/heart-fill.png'
import iconHeartOutline from '@/assets/community/heart-outline.png'
import iconHeartOutlineWhite from '@/assets/community/heart-outline-white.png'
import CommunityMediaGrid from '@/components/community/MediaGrid'
import {
  createCommunityComment,
  deleteCommunityComment,
  deleteCommunityPost,
  listCommunityComments,
  listCommunityLikers,
  type CommunityComment,
  type CommunityLiker,
  type CommunityPost,
} from '@/services/community'
import { resolveAssetUrl } from '@/services/request'
import { formatRelativeTime } from '@/utils/format'
import { getTierMeta } from '@/utils/tier'
import styles from './index.module.scss'

const CHANNEL_TAG: Record<string, string> = {
  plaza: '广场',
  official: '官方',
  help: '求助',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '审核中',
  approved: '已通过',
  rejected: '未通过',
  taken_down: '已下架',
}

const BODY_COLLAPSE_LEN = 100
/** 点赞名单默认露出的名字数 */
const LIKER_PREVIEW = 8
/** 首页评论预览条数，超出点「更多」进详情 */
const COMMENT_PREVIEW = 3

const QUICK_EMOJIS = [
  '😀',
  '😁',
  '😂',
  '🤣',
  '😊',
  '😍',
  '😘',
  '😎',
  '🤔',
  '😅',
  '😭',
  '😤',
  '👍',
  '👏',
  '🙏',
  '💪',
  '🔥',
  '✨',
  '❤️',
  '🎉',
]

type Props = {
  post: CommunityPost
  onLike: (post: CommunityPost) => void
  onFollow: (post: CommunityPost) => void
  onOpenProfile: (wecomUserId: string) => void
  onTagClick?: (tagId: string) => void
  onOpenDetail?: (id: string) => void
  onCommentCountChange?: (postId: string, count: number) => void
  /** 自己的帖删除成功后，父级从列表移除 */
  onDeleted?: (postId: string) => void
  /** 评论框打开时通知父级（隐藏 FAB 等） */
  onComposeOpenChange?: (open: boolean) => void
  hideFollow?: boolean
  showStatus?: boolean
}

export default function CommunityPostCard({
  post,
  onLike,
  onFollow,
  onOpenProfile,
  onTagClick,
  onOpenDetail,
  onCommentCountChange,
  onDeleted,
  onComposeOpenChange,
  hideFollow,
  showStatus,
}: Props) {
  const [bodyExpanded, setBodyExpanded] = useState(false)
  /** 抽屉是否在 DOM 中 */
  const [menuMounted, setMenuMounted] = useState(false)
  /** 抽屉展开态（用于收起动画） */
  const [menuOpen, setMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [likers, setLikers] = useState<CommunityLiker[]>([])
  const [likersExpanded, setLikersExpanded] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null)
  /** 点自己的评论 → 白底操作层（复制/删除） */
  const [ownAction, setOwnAction] = useState<CommunityComment | null>(null)
  const [sending, setSending] = useState(false)
  const [loadingComments, setLoadingComments] = useState(false)
  const [inputFocus, setInputFocus] = useState(false)
  /** 删除中：防连点；乐观移除后仍等接口结果 */
  const [deleting, setDeleting] = useState(false)

  const tierMeta = getTierMeta(post.author.tier)
  const isOfficial =
    post.author.kind === 'staff' || post.channel === 'official'
  const canFollow =
    !hideFollow && !post.isAuthor && Boolean(post.author.wecomUserId)
  const canDelete = Boolean(post.isAuthor)
  const channelLabel = CHANNEL_TAG[post.channel] || ''
  const fullBody = post.title
    ? `${post.title}\n${post.body}`
    : post.body
  const needCollapse = fullBody.length > BODY_COLLAPSE_LEN
  const displayBody = useMemo(() => {
    if (!needCollapse || bodyExpanded) return fullBody
    return `${fullBody.slice(0, BODY_COLLAPSE_LEN)}…`
  }, [fullBody, needCollapse, bodyExpanded])


  const loadComments = useCallback(async () => {
    setLoadingComments(true)
    try {
      const res = await listCommunityComments(post.id, { take: 30 })
      setComments(res.items ?? [])
      setCommentsLoaded(true)
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '评论加载失败',
        icon: 'none',
      })
    } finally {
      setLoadingComments(false)
    }
  }, [post.id])

  const loadLikers = useCallback(async () => {
    try {
      const res = await listCommunityLikers(post.id, { take: 50 })
      setLikers(res.items ?? [])
    } catch {
      // 保留乐观名单
    }
  }, [post.id])

  useEffect(() => {
    setLikers([])
    setComments([])
    setCommentsLoaded(false)
    setLikersExpanded(false)
    if (post.likeCount > 0) void loadLikers()
    if (post.commentCount > 0) void loadComments()
  }, [post.id, loadLikers, loadComments])

  // 点赞数变化后拉取真实名单（延迟等接口落库）
  useEffect(() => {
    if (post.likeCount <= 0) {
      setLikers((prev) => (prev.length ? [] : prev))
      return
    }
    const t = setTimeout(() => {
      void loadLikers()
    }, 180)
    return () => clearTimeout(t)
  }, [post.likeCount, post.likedByMe, post.id, loadLikers])

  useEffect(() => {
    onComposeOpenChange?.(composeOpen)
    return () => onComposeOpenChange?.(false)
  }, [composeOpen, onComposeOpenChange])

  const openMenu = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.()
    setOwnAction(null)
    if (menuMounted && menuOpen) {
      closeMenu()
      return
    }
    setMenuMounted(true)
    // 下一帧再开动画，保证抽屉滑出
    setTimeout(() => setMenuOpen(true), 16)
  }

  const closeMenu = () => {
    setMenuOpen(false)
    setTimeout(() => setMenuMounted(false), 220)
  }

  const onTapLike = () => {
    closeMenu()
    // 乐观更新点赞名单，避免「… 等1人」
    if (post.likedByMe) {
      setLikers((prev) => prev.filter((l) => !l.isMe))
    } else {
      setLikers((prev) => {
        const rest = prev.filter((l) => !l.isMe)
        return [
          { wecomUserId: '__me__', displayName: '我', isMe: true },
          ...rest,
        ]
      })
    }
    onLike(post)
  }

  const onTapComment = async () => {
    closeMenu()
    setReplyTo(null)
    setComposeOpen(true)
    setEmojiOpen(false)
    setInputFocus(true)
    if (!commentsLoaded) await loadComments()
  }

  const closeCompose = () => {
    setComposeOpen(false)
    setEmojiOpen(false)
    setInputFocus(false)
    setReplyTo(null)
  }

  const appendEmoji = (emo: string) => {
    setCommentDraft((d) => `${d}${emo}`.slice(0, 200))
  }

  const sendComment = async () => {
    const text = commentDraft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const res = await createCommunityComment(post.id, {
        body: text,
        parentId: replyTo?.id,
      })
      setCommentDraft('')
      if (replyTo) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === replyTo.id
              ? {
                  ...c,
                  replies: [...(c.replies || []), res.item],
                }
              : c,
          ),
        )
      } else {
        setComments((prev) => [res.item, ...prev])
      }
      setReplyTo(null)
      setCommentsLoaded(true)
      onCommentCountChange?.(post.id, (post.commentCount || 0) + 1)
      closeCompose()
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '发送失败',
        icon: 'none',
      })
    } finally {
      setSending(false)
    }
  }

  const removeComment = async (c: CommunityComment) => {
    if (!c.isAuthor) return
    const ok = await Taro.showModal({
      title: '删除评论',
      content: '确定删除这条评论？',
    })
    if (!ok.confirm) return
    try {
      await deleteCommunityComment(c.id)
      setComments((prev) =>
        prev
          .filter((x) => x.id !== c.id)
          .map((x) => ({
            ...x,
            replies: (x.replies || []).filter((r) => r.id !== c.id),
          })),
      )
      setOwnAction(null)
      onCommentCountChange?.(
        post.id,
        Math.max(0, (post.commentCount || 0) - 1),
      )
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '删除失败',
        icon: 'none',
      })
    }
  }

  /**
   * 自己的帖删除（等接口成功再出列表）
   * - 防连点 + loading
   * - 成功才 onDeleted；失败保留帖子并提示
   */
  const removePost = async () => {
    if (!canDelete || deleting) return
    const ok = await Taro.showModal({
      title: '删除动态',
      content: '删除后不可恢复，正文与图片/视频将一并清除',
      confirmText: '删除',
      confirmColor: '#FF3B30',
    })
    if (!ok.confirm) return

    setDeleting(true)
    void Taro.showLoading({ title: '删除中', mask: true })
    try {
      await deleteCommunityPost(post.id)
      void Taro.hideLoading()
      onDeleted?.(post.id)
      void Taro.showToast({ title: '已删除', icon: 'success' })
    } catch (e) {
      void Taro.hideLoading()
      void Taro.showToast({
        title: e instanceof Error ? e.message : '删除失败',
        icon: 'none',
      })
    } finally {
      setDeleting(false)
    }
  }

  const copyComment = (c: CommunityComment) => {
    void Taro.setClipboardData({
      data: c.body,
      success: () => {
        void Taro.showToast({ title: '已复制', icon: 'none' })
      },
    })
    setOwnAction(null)
  }

  /** 点评论：自己的 → 白底操作层；别人的 → 直接回复 */
  const onTapCommentLine = (c: CommunityComment) => {
    if (c.isAuthor) {
      setOwnAction((cur) => (cur?.id === c.id ? null : c))
      closeMenu()
      return
    }
    setOwnAction(null)
    setReplyTo(c)
    setComposeOpen(true)
    setInputFocus(true)
    setEmojiOpen(false)
  }

  const previewLikers = likersExpanded
    ? likers
    : likers.slice(0, LIKER_PREVIEW)
  const hiddenLikerCount = Math.max(0, likers.length - LIKER_PREVIEW)

  const previewComments = comments.slice(0, COMMENT_PREVIEW)
  const hasMoreComments =
    (post.commentCount || 0) > COMMENT_PREVIEW ||
    comments.length > COMMENT_PREVIEW

  const goDetail = (e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.()
    if (onOpenDetail) {
      onOpenDetail(post.id)
      return
    }
    void Taro.navigateTo({
      url: `/pages/community/detail/index?id=${encodeURIComponent(post.id)}`,
    })
  }
  // 若接口未拉满但 total 更大
  const moreFromTotal = Math.max(
    0,
    (post.likeCount || 0) - previewLikers.length,
  )
  const showMoreLikers =
    !likersExpanded &&
    (hiddenLikerCount > 0 || moreFromTotal > hiddenLikerCount)

  const showPanel =
    post.likeCount > 0 ||
    post.commentCount > 0 ||
    comments.length > 0 ||
    likers.length > 0

  // 777 稿：名字用中文逗号分隔
  const likeNamesText =
    previewLikers.length > 0
      ? previewLikers.map((l) => (l.isMe ? '我' : l.displayName)).join('，')
      : post.likedByMe
        ? '我'
        : post.likeCount > 0
          ? ''
          : ''

  return (
    <View className={styles.item} onClick={() => setOwnAction(null)}>
      {/* 点空白收起 ·· 菜单（动画期间也保持） */}
      {menuMounted ? (
        <View
          className={styles.menuMask}
          catchMove
          onClick={(e) => {
            e.stopPropagation()
            closeMenu()
          }}
        />
      ) : null}
      {/* 点空白收起自己的操作层 */}
      {ownAction ? (
        <View
          className={styles.menuMask}
          catchMove
          onClick={(e) => {
            e.stopPropagation()
            setOwnAction(null)
          }}
        />
      ) : null}
      <View
        className={
          post.author.avatarUrl
            ? styles.avatar
            : `${styles.avatar} ${styles.avatarFallback}`
        }
        onClick={(e) => {
          e.stopPropagation()
          onOpenProfile(post.author.wecomUserId)
        }}
      >
        {post.author.avatarUrl ? (
          <Image
            className={styles.avatarImg}
            src={resolveAssetUrl(post.author.avatarUrl)}
            mode="aspectFill"
            lazyLoad
          />
        ) : (
          <Text className={styles.avatarLetter}>
            {(post.author.displayName || '主').slice(0, 1)}
          </Text>
        )}
      </View>

      <View className={styles.contentCol}>
        <View
          className={styles.nameRow}
          onClick={(e) => {
            e.stopPropagation()
            onOpenProfile(post.author.wecomUserId)
          }}
        >
          <Text className={styles.name}>{post.author.displayName}</Text>
          {/* 有段位才显示；无段位不展示。官方显示「官方」 */}
          {isOfficial ? (
            <Text className={styles.tagOfficial}>官方</Text>
          ) : tierMeta ? (
            <Text
              className={`${styles.tagTier} ${
                styles[`tagTier${tierMeta.level}` as 'tagTier1']
              }`}
            >
              {tierMeta.name}
            </Text>
          ) : null}
          {showStatus && post.status ? (
            <Text
              className={`${styles.tagStatus} ${
                post.status === 'pending'
                  ? styles.statusPending
                  : post.status === 'approved'
                    ? styles.statusOk
                    : styles.statusBad
              }`}
            >
              {STATUS_LABEL[post.status] || post.status}
            </Text>
          ) : null}
          {/* 运营标：置顶（冷静灰蓝）· 精华（暖金，原推荐） */}
          {post.pinnedAt ? (
            <Text className={styles.tagPin}>置顶</Text>
          ) : null}
          {post.recommended || post.recommendedAt ? (
            <Text className={styles.tagFeatured}>精华</Text>
          ) : null}
        </View>

        <Text className={styles.body}>{displayBody}</Text>
        {needCollapse && !bodyExpanded ? (
          <Text
            className={styles.expand}
            onClick={(e) => {
              e.stopPropagation()
              setBodyExpanded(true)
            }}
          >
            全文
          </Text>
        ) : null}
        {needCollapse && bodyExpanded && isOfficial && onOpenDetail ? (
          <Text
            className={styles.expand}
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetail(post.id)
            }}
          >
            查看详情
          </Text>
        ) : null}
        {needCollapse && bodyExpanded && !isOfficial ? (
          <Text
            className={styles.expand}
            onClick={(e) => {
              e.stopPropagation()
              setBodyExpanded(false)
            }}
          >
            收起
          </Text>
        ) : null}
        {isOfficial && onOpenDetail && !needCollapse ? (
          <Text
            className={styles.expand}
            onClick={(e) => {
              e.stopPropagation()
              onOpenDetail(post.id)
            }}
          >
            查看详情
          </Text>
        ) : null}

        {showStatus && post.rejectReason ? (
          <Text className={styles.rejectReason}>
            未通过原因：{post.rejectReason}
          </Text>
        ) : null}

        {post.tags?.length ? (
          <View className={styles.topics}>
            {post.tags.map((t) => (
              <Text
                key={t.id}
                className={styles.topicLink}
                onClick={(e) => {
                  e.stopPropagation()
                  onTagClick?.(t.id)
                }}
              >
                #{t.name}
              </Text>
            ))}
          </View>
        ) : null}

        <View
          className={styles.mediaWrap}
          onClick={(e) => e.stopPropagation()}
        >
          <CommunityMediaGrid media={post.media} variant="feed" />
        </View>

        <View className={styles.metaRow}>
          {/* 时间 · 广场/官方/互助 · [删除] · 置顶/推荐 */}
          <View className={styles.metaLeft}>
            <Text className={styles.metaText}>
              {formatRelativeTime(post.createdAt)}
            </Text>
            {channelLabel ? (
              <>
                <Text className={styles.metaDot}>·</Text>
                <Text className={styles.metaText}>{channelLabel}</Text>
              </>
            ) : null}
            {canDelete ? (
              <>
                <Text className={styles.metaDot}>·</Text>
                <View
                  className={
                    deleting
                      ? `${styles.deleteBtn} ${styles.deleteBtnBusy}`
                      : styles.deleteBtn
                  }
                  hoverClass={styles.deleteBtnHover}
                  hoverStayTime={80}
                  onClick={(e) => {
                    e.stopPropagation()
                    void removePost()
                  }}
                >
                  <Image
                    className={styles.deleteIcon}
                    src={iconDelete}
                    mode="aspectFit"
                  />
                </View>
              </>
            ) : null}
          </View>
          {canFollow ? (
            <Text
              className={
                post.followingAuthor
                  ? `${styles.followLink} ${styles.followLinkOn}`
                  : styles.followLink
              }
              onClick={(e) => {
                e.stopPropagation()
                onFollow(post)
              }}
            >
              {post.followingAuthor ? '已关注' : '关注'}
            </Text>
          ) : null}
          <View
            className={styles.moreWrap}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 22 图：抽屉滑出/收回 */}
            {menuMounted ? (
              <View
                className={`${styles.actionMenu} ${
                  menuOpen ? styles.actionMenuOpen : styles.actionMenuClose
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <View className={styles.actionMenuItem} onClick={onTapLike}>
                  <Image
                    className={styles.actionMenuIcon}
                    src={
                      post.likedByMe
                        ? iconHeartFill /* 已赞：红心，对应「取消」 */
                        : iconHeartOutlineWhite
                    }
                    mode="aspectFit"
                  />
                  <Text className={styles.actionMenuText}>
                    {post.likedByMe ? '取消' : '赞'}
                  </Text>
                </View>
                <View className={styles.actionMenuDivider} />
                <View
                  className={styles.actionMenuItem}
                  onClick={() => void onTapComment()}
                >
                  <Image
                    className={styles.actionMenuIcon}
                    src={iconCommentWhite}
                    mode="aspectFit"
                  />
                  <Text className={styles.actionMenuText}>评论</Text>
                </View>
              </View>
            ) : null}
            <View className={styles.moreBtn} onClick={openMenu}>
              <View className={styles.moreDot} />
              <View className={styles.moreDot} />
            </View>
          </View>
        </View>

        {showPanel ? (
          <View
            className={styles.panel}
            onClick={(e) => e.stopPropagation()}
          >
            {post.likeCount > 0 ? (
              <View
                className={
                  comments.length > 0 || post.commentCount > 0
                    ? styles.likeBar
                    : styles.likeBarOnly
                }
              >
                {/* 点赞名单：仅显示名字，不显示头像 */}
                <Image
                  className={styles.likeHeartIcon}
                  src={iconHeartOutline}
                  mode="aspectFit"
                />
                <Text className={styles.likeNames}>
                  {likeNamesText ||
                    (post.likedByMe ? '我' : post.likeCount > 0 ? '…' : '')}
                  {showMoreLikers && likeNamesText ? (
                    <Text
                      className={styles.likeMore}
                      onClick={() => {
                        setLikersExpanded(true)
                        if (likers.length < (post.likeCount || 0)) {
                          void loadLikers()
                        }
                      }}
                    >
                      {` 等${Math.max(hiddenLikerCount, moreFromTotal)}人`}
                    </Text>
                  ) : null}
                  {likersExpanded && likers.length > LIKER_PREVIEW ? (
                    <Text
                      className={styles.likeMore}
                      onClick={() => setLikersExpanded(false)}
                    >
                      {' '}
                      收起
                    </Text>
                  ) : null}
                </Text>
              </View>
            ) : null}

            {loadingComments ? (
              <Text className={styles.panelHint}>加载评论…</Text>
            ) : (
              <>
                {previewComments.map((c) => (
                  <View key={c.id} className={styles.cItem}>
                    <View
                      className={`${styles.cLineWrap} ${
                        ownAction?.id === c.id ? styles.cLineActive : ''
                      }`}
                      onClick={() => onTapCommentLine(c)}
                    >
                      <Text className={styles.cLine}>
                        <Text className={styles.cName}>
                          {c.author.displayName}
                        </Text>
                        <Text className={styles.cBody}>：{c.body}</Text>
                      </Text>
                    </View>
                    {/* 33 图：点自己评论 → 白卡片 复制/删除 */}
                    {ownAction?.id === c.id ? (
                      <View className={styles.ownActionPop}>
                        <View
                          className={styles.ownActionRow}
                          onClick={() => copyComment(c)}
                        >
                          <Text className={styles.ownActionText}>复制</Text>
                        </View>
                        <View className={styles.ownActionSep} />
                        <View
                          className={styles.ownActionRow}
                          onClick={() => void removeComment(c)}
                        >
                          <Text
                            className={`${styles.ownActionText} ${styles.ownActionDanger}`}
                          >
                            删除
                          </Text>
                        </View>
                      </View>
                    ) : null}
                    {(c.replies || []).map((r) => (
                      <View key={r.id} className={styles.cReply}>
                        <View
                          className={`${styles.cLineWrap} ${
                            ownAction?.id === r.id ? styles.cLineActive : ''
                          }`}
                          onClick={() => onTapCommentLine(r)}
                        >
                          <Text className={styles.cLine}>
                            <Text className={styles.cName}>
                              {r.author.displayName}
                              <Text className={styles.cReplyTo}>
                                回复{c.author.displayName}
                              </Text>
                            </Text>
                            <Text className={styles.cBody}>：{r.body}</Text>
                          </Text>
                        </View>
                        {ownAction?.id === r.id ? (
                          <View className={styles.ownActionPop}>
                            <View
                              className={styles.ownActionRow}
                              onClick={() => copyComment(r)}
                            >
                              <Text className={styles.ownActionText}>复制</Text>
                            </View>
                            <View className={styles.ownActionSep} />
                            <View
                              className={styles.ownActionRow}
                              onClick={() => void removeComment(r)}
                            >
                              <Text
                                className={`${styles.ownActionText} ${styles.ownActionDanger}`}
                              >
                                删除
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))}
                {hasMoreComments ? (
                  <Text className={styles.moreComments} onClick={goDetail}>
                    更多
                  </Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}
      </View>

      {composeOpen ? (
        <View
          className={styles.composeMask}
          catchMove
          onClick={closeCompose}
        >
          <View
            className={styles.composeSheet}
            onClick={(e) => e.stopPropagation()}
          >
            {replyTo ? (
              <Text className={styles.composeReplyHint}>
                回复 {replyTo.author.displayName}
                <Text
                  className={styles.composeReplyCancel}
                  onClick={() => setReplyTo(null)}
                >
                  {' '}
                  取消
                </Text>
              </Text>
            ) : null}

            {emojiOpen ? (
              <View className={styles.emojiPanel}>
                {QUICK_EMOJIS.map((emo) => (
                  <Text
                    key={emo}
                    className={styles.emojiItem}
                    onClick={() => appendEmoji(emo)}
                  >
                    {emo}
                  </Text>
                ))}
              </View>
            ) : null}

            <View className={styles.composeBar}>
              <Text
                className={styles.emojiToggle}
                onClick={() => {
                  setEmojiOpen((v) => !v)
                  setInputFocus(emojiOpen)
                }}
              >
                {emojiOpen ? '⌨️' : '😊'}
              </Text>
              <Input
                className={styles.composeInput}
                value={commentDraft}
                maxlength={200}
                focus={inputFocus && !emojiOpen}
                confirmType="send"
                adjustPosition
                holdKeyboard
                cursorSpacing={24}
                placeholder="评论"
                onInput={(e) => setCommentDraft(e.detail.value)}
                onConfirm={() => void sendComment()}
                onBlur={() => {
                  if (!emojiOpen) setInputFocus(false)
                }}
                onFocus={() => {
                  setEmojiOpen(false)
                  setInputFocus(true)
                }}
              />
              <Text
                className={
                  commentDraft.trim() && !sending
                    ? styles.composeSend
                    : styles.composeSendOff
                }
                onClick={() => void sendComment()}
              >
                {sending ? '…' : '发送'}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}
