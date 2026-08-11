import { Image, Input, Text, View } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'
import iconComment from '@/assets/community/comment.png'
import iconCommentWhite from '@/assets/community/comment-white.png'
import iconDelete from '@/assets/community/delete.png'
import iconHeartFill from '@/assets/community/heart-fill.png'
import iconHeartOutline from '@/assets/community/heart-outline.png'
import iconHeartOutlineWhite from '@/assets/community/heart-outline-white.png'
import CommunityMediaGrid from '@/components/community/MediaGrid'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { useBrandNavScroll } from '@/hooks/useBrandNavScroll'
import { ensureAppSession } from '@/services/auth'
import {
  createCommunityComment,
  deleteCommunityComment,
  deleteCommunityPost,
  getCommunityPost,
  listCommunityComments,
  listCommunityLikers,
  toggleCommunityLike,
  type CommunityComment,
  type CommunityLiker,
  type CommunityPost,
} from '@/services/community'
import { resolveAssetUrl } from '@/services/request'
import { useSessionStore } from '@/store/session'
import styles from './index.module.scss'

/** 用评论作者/本人头像补齐点赞名单（API 无 avatar 时） */
function enrichLikerAvatars(
  items: CommunityLiker[],
  comments: CommunityComment[],
  postAuthor?: { wecomUserId: string; avatarUrl: string | null },
  meAvatar?: string | null,
): CommunityLiker[] {
  const map = new Map<string, string>()
  if (postAuthor?.avatarUrl) {
    map.set(postAuthor.wecomUserId, postAuthor.avatarUrl)
  }
  for (const c of comments) {
    if (c.author.avatarUrl) map.set(c.author.wecomUserId, c.author.avatarUrl)
    for (const r of c.replies || []) {
      if (r.author.avatarUrl) {
        map.set(r.author.wecomUserId, r.author.avatarUrl)
      }
    }
  }
  return items.map((l) => {
    if (l.avatarUrl) return l
    const fromMe = l.isMe ? meAvatar || null : null
    const fromMap = map.get(l.wecomUserId) || null
    return { ...l, avatarUrl: fromMe || fromMap }
  })
}

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

function formatDetailTime(iso: string) {
  const t = dayjs(iso)
  if (!t.isValid()) return ''
  return t.format('YYYY年M月D日 HH:mm')
}

/** 评论时间 · 对齐 oo「4月12日 17:16」 */
function formatCommentTime(iso: string) {
  const t = dayjs(iso)
  if (!t.isValid()) return ''
  if (t.year() === dayjs().year()) return t.format('M月D日 HH:mm')
  return t.format('YYYY年M月D日 HH:mm')
}

export default function CommunityDetailPage() {
  const nav = useBrandNavScroll()
  const router = useRouter()
  const id = router.params.id || ''
  const focusComment = router.params.focus === 'comment'
  const meAvatar = useSessionStore((s) => s.session?.user.avatarUrl ?? null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [post, setPost] = useState<CommunityPost | null>(null)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [commentCursor, setCommentCursor] = useState<string | null>(null)
  const [loadingMoreComments, setLoadingMoreComments] = useState(false)
  const [likers, setLikers] = useState<CommunityLiker[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState<CommunityComment | null>(null)
  /** 抽屉是否在 DOM 中（用于收起动画） */
  const [menuMounted, setMenuMounted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [inputFocus, setInputFocus] = useState(false)

  const openMenu = () => {
    if (menuMounted && menuOpen) {
      closeMenu()
      return
    }
    setMenuMounted(true)
    // 下一帧再开动画，保证从右向左抽屉滑出
    setTimeout(() => setMenuOpen(true), 16)
  }

  const closeMenu = () => {
    setMenuOpen(false)
    setTimeout(() => setMenuMounted(false), 220)
  }

  const load = useCallback(async () => {
    if (!id) {
      setError('缺少帖子')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      await ensureAppSession()
      const [postRes, commentRes, likeRes] = await Promise.all([
        getCommunityPost(id),
        listCommunityComments(id, { take: 30 }),
        listCommunityLikers(id, { take: 40 }).catch(() => ({
          total: 0,
          items: [] as CommunityLiker[],
        })),
      ])
      const nextPost = postRes.item
      const nextComments = commentRes.items ?? []
      setPost(nextPost)
      setComments(nextComments)
      setCommentCursor(commentRes.nextCursor)
      setLikers(
        enrichLikerAvatars(
          likeRes.items ?? [],
          nextComments,
          nextPost.author,
          useSessionStore.getState().session?.user.avatarUrl,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (focusComment && !loading && post) {
      openCompose(null)
    }
  }, [focusComment, loading, post])

  const refreshLikers = async (postId: string) => {
    try {
      const res = await listCommunityLikers(postId, { take: 40 })
      setLikers((prev) =>
        enrichLikerAvatars(
          res.items ?? [],
          comments,
          post?.author,
          meAvatar,
        ).map((l) => {
          // 保留本轮乐观补上的头像
          if (l.avatarUrl) return l
          const old = prev.find((p) => p.wecomUserId === l.wecomUserId)
          return old?.avatarUrl ? { ...l, avatarUrl: old.avatarUrl } : l
        }),
      )
    } catch {
      // ignore
    }
  }

  const closeCompose = () => {
    setComposeOpen(false)
    setEmojiOpen(false)
    setInputFocus(false)
    setReplyTo(null)
  }

  /** 与首页一致：底部弹出评论条 + 表情 */
  const openCompose = (target: CommunityComment | null) => {
    closeMenu()
    setReplyTo(target)
    setComposeOpen(true)
    setEmojiOpen(false)
    setInputFocus(true)
  }

  const appendEmoji = (emo: string) => {
    setCommentDraft((d) => `${d}${emo}`.slice(0, 200))
  }

  const onLike = async () => {
    if (!post) return
    closeMenu()
    try {
      const res = await toggleCommunityLike(post.id)
      setPost(res.item)
      // 乐观名单 · 带头像
      if (res.liked) {
        setLikers((prev) => {
          if (prev.some((l) => l.isMe)) return prev
          return [
            {
              wecomUserId: '__me__',
              displayName: '我',
              avatarUrl: meAvatar,
              isMe: true,
            },
            ...prev,
          ]
        })
      } else {
        setLikers((prev) => prev.filter((l) => !l.isMe))
      }
      void refreshLikers(post.id)
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '操作失败',
        icon: 'none',
      })
    }
  }

  const onSend = async () => {
    const text = commentDraft.trim()
    if (!post || !text || sending) return
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
      setPost((p) =>
        p ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p,
      )
      closeCompose()
      void Taro.showToast({ title: '已发布', icon: 'success' })
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '发送失败',
        icon: 'none',
      })
    } finally {
      setSending(false)
    }
  }

  const onDelete = async () => {
    if (!post) return
    const ok = await Taro.showModal({
      title: '删除动态',
      content: '删除后不可恢复，正文与图片/视频将一并清除',
      confirmText: '删除',
      confirmColor: '#FF3B30',
    })
    if (!ok.confirm) return
    try {
      await deleteCommunityPost(post.id)
      void Taro.showToast({ title: '已删除', icon: 'success' })
      setTimeout(() => void Taro.navigateBack(), 400)
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '删除失败',
        icon: 'none',
      })
    }
  }

  const loadMoreComments = async () => {
    if (!id || !commentCursor || loadingMoreComments) return
    setLoadingMoreComments(true)
    try {
      const res = await listCommunityComments(id, {
        take: 30,
        cursor: commentCursor,
      })
      setComments((prev) => [...prev, ...(res.items ?? [])])
      setCommentCursor(res.nextCursor)
    } catch {
      // ignore
    } finally {
      setLoadingMoreComments(false)
    }
  }

  const removeComment = async (comment: CommunityComment) => {
    if (!comment.isAuthor) return
    try {
      await deleteCommunityComment(comment.id)
      setComments((prev) =>
        prev
          .filter((c) => c.id !== comment.id)
          .map((c) => ({
            ...c,
            replies: (c.replies || []).filter((r) => r.id !== comment.id),
          })),
      )
      setPost((p) =>
        p
          ? { ...p, commentCount: Math.max(0, (p.commentCount || 0) - 1) }
          : p,
      )
      void Taro.showToast({ title: '已删除', icon: 'none' })
    } catch (e) {
      void Taro.showToast({
        title: e instanceof Error ? e.message : '删除失败',
        icon: 'none',
      })
    }
  }

  const copyComment = (c: CommunityComment) => {
    void Taro.setClipboardData({
      data: c.body,
      success: () => {
        void Taro.showToast({ title: '已复制', icon: 'none' })
      },
    })
  }

  /**
   * 评论交互
   * - 别人：弹出回复框
   * - 自己：微信原生 ActionSheet（复制 / 删除，取消由系统提供）
   *   比自绘底栏更接近客户端原生观感与动效
   */
  const onTapComment = async (c: CommunityComment) => {
    closeMenu()
    if (!c.isAuthor) {
      openCompose(c)
      return
    }
    try {
      const { tapIndex } = await Taro.showActionSheet({
        itemList: ['复制', '删除'],
        itemColor: '#000000',
      })
      if (tapIndex === 0) {
        copyComment(c)
      } else if (tapIndex === 1) {
        await removeComment(c)
      }
    } catch {
      // 用户点取消 / 点遮罩
    }
  }

  const openProfile = (wecomUserId: string) => {
    if (!wecomUserId || wecomUserId === '__me__') {
      void Taro.navigateTo({ url: '/pages/community/profile/index' })
      return
    }
    const selfId = useSessionStore.getState().session?.user?.wecomUserId
    if (selfId && wecomUserId === selfId) {
      void Taro.navigateTo({ url: '/pages/community/profile/index' })
      return
    }
    void Taro.navigateTo({
      url: `/pages/community/profile/index?uid=${encodeURIComponent(wecomUserId)}`,
    })
  }

  const showPanel =
    (post?.likeCount || 0) > 0 ||
    likers.length > 0 ||
    comments.length > 0 ||
    (post?.commentCount || 0) > 0

  return (
    <PageShell className={styles.page} backgroundColor="#ffffff">
      <PageNav title="详情" showBack {...nav} />
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
      ) : !post ? (
        <StateBlock icon="empty" title="动态不存在" />
      ) : (
        <>
          {menuMounted ? (
            <View
              className={styles.menuMask}
              catchMove
              onClick={closeMenu}
            />
          ) : null}

          <View className={styles.bodyWrap}>
            {post.isAuthor && post.status !== 'approved' ? (
              <Text className={styles.statusBar}>
                {post.status === 'pending'
                  ? '审核中，通过后将出现在信息流'
                  : `未通过${post.rejectReason ? `：${post.rejectReason}` : ''}`}
              </Text>
            ) : null}

            <View className={styles.header}>
              <View
                className={styles.avatar}
                onClick={() => openProfile(post.author.wecomUserId)}
              >
                {post.author.avatarUrl ? (
                  <Image
                    className={styles.avatarImg}
                    src={resolveAssetUrl(post.author.avatarUrl)}
                    mode="aspectFill"
                  />
                ) : null}
              </View>
              <View className={styles.mainCol}>
                <Text
                  className={styles.name}
                  onClick={() => openProfile(post.author.wecomUserId)}
                >
                  {post.author.displayName}
                  {(post.author.kind === 'staff' ||
                    post.channel === 'official') && (
                    <Text className={styles.badge}>官</Text>
                  )}
                </Text>
                {post.title ? (
                  <Text className={styles.body}>
                    {post.title}
                    {post.body ? `\n${post.body}` : ''}
                  </Text>
                ) : (
                  <Text className={styles.body}>{post.body}</Text>
                )}

                {post.tags?.length ? (
                  <View className={styles.topics}>
                    {post.tags.map((t) => (
                      <Text key={t.id} className={styles.topic}>
                        #{t.name}
                      </Text>
                    ))}
                  </View>
                ) : null}

                <View className={styles.mediaWrap}>
                  <CommunityMediaGrid
                    media={post.media}
                    variant="detail"
                    stopPropagation={false}
                  />
                </View>

                <View className={styles.metaRow}>
                  <View className={styles.metaLeft}>
                    <Text className={styles.metaTime}>
                      {formatDetailTime(post.createdAt || post.publishedAt || '')}
                    </Text>
                    {post.isAuthor ? (
                      <Image
                        className={styles.metaTrash}
                        src={iconDelete}
                        mode="aspectFit"
                        onClick={() => void onDelete()}
                      />
                    ) : null}
                  </View>
                  <View className={styles.metaRight}>
                    {/* 与首页 PostCard：从 ·· 向左抽屉滑出 */}
                    {menuMounted ? (
                      <View
                        className={`${styles.actionMenu} ${
                          menuOpen
                            ? styles.actionMenuOpen
                            : styles.actionMenuClose
                        }`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <View
                          className={styles.actionMenuItem}
                          onClick={() => void onLike()}
                        >
                          <Image
                            className={styles.actionMenuIcon}
                            src={
                              post.likedByMe
                                ? iconHeartFill
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
                          onClick={() => openCompose(null)}
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
              </View>
            </View>

            {/* 赞评通栏 · 对齐 oo：不嵌在头像右侧，占满内容宽 */}
            {showPanel ? (
              <View className={styles.panel}>
                {(post.likeCount > 0 || likers.length > 0) && (
                  <View
                    className={
                      comments.length > 0
                        ? styles.likeBar
                        : styles.likeBarOnly
                    }
                  >
                    <Image
                      className={styles.likeHeartIcon}
                      src={iconHeartOutline}
                      mode="aspectFit"
                    />
                    <View className={styles.likeAvatars}>
                      {(likers.length
                        ? likers
                        : post.likedByMe
                          ? [
                              {
                                wecomUserId: '__me__',
                                displayName: '我',
                                avatarUrl: null as string | null,
                                isMe: true,
                              },
                            ]
                          : []
                      )
                        .slice(0, 24)
                        .map((l) => (
                          <View
                            key={l.wecomUserId}
                            className={styles.likeAvatar}
                            onClick={() => openProfile(l.wecomUserId)}
                          >
                            {l.avatarUrl ? (
                              <Image
                                className={styles.likeAvatarImg}
                                src={resolveAssetUrl(l.avatarUrl)}
                                mode="aspectFill"
                              />
                            ) : (
                              <View className={styles.likeAvatarLetter}>
                                <Text>
                                  {(l.displayName || '用').slice(0, 1)}
                                </Text>
                              </View>
                            )}
                          </View>
                        ))}
                    </View>
                  </View>
                )}

                {comments.length > 0 ? (
                  <View className={styles.commentList}>
                    {comments.map((c, idx) => (
                      <View key={c.id} className={styles.commentBlock}>
                        <View
                          className={styles.commentRow}
                          onClick={() => void onTapComment(c)}
                        >
                          <View className={styles.commentIconCol}>
                            {idx === 0 ? (
                              <Image
                                className={styles.commentBubbleIcon}
                                src={iconComment}
                                mode="aspectFit"
                              />
                            ) : null}
                          </View>
                          <View className={styles.commentAvatar}>
                            {c.author.avatarUrl ? (
                              <Image
                                className={styles.commentAvatarImg}
                                src={resolveAssetUrl(c.author.avatarUrl)}
                                mode="aspectFill"
                              />
                            ) : (
                              <View className={styles.commentAvatarLetter}>
                                <Text>
                                  {(c.author.displayName || '用').slice(0, 1)}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View className={styles.commentBodyCol}>
                            <View className={styles.commentHead}>
                              <Text className={styles.commentName}>
                                {c.author.displayName}
                              </Text>
                              <Text className={styles.commentTime}>
                                {formatCommentTime(c.createdAt)}
                              </Text>
                            </View>
                            <Text className={styles.commentText}>
                              {c.body}
                            </Text>
                          </View>
                        </View>

                        {(c.replies || []).map((r) => (
                          <View
                            key={r.id}
                            className={styles.commentRow}
                            onClick={() => void onTapComment(r)}
                          >
                            <View className={styles.commentIconCol} />
                            <View className={styles.commentAvatar}>
                              {r.author.avatarUrl ? (
                                <Image
                                  className={styles.commentAvatarImg}
                                  src={resolveAssetUrl(r.author.avatarUrl)}
                                  mode="aspectFill"
                                />
                              ) : (
                                <View className={styles.commentAvatarLetter}>
                                  <Text>
                                    {(r.author.displayName || '用').slice(
                                      0,
                                      1,
                                    )}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View className={styles.commentBodyCol}>
                              <View className={styles.commentHead}>
                                <Text className={styles.commentName}>
                                  {r.author.displayName}
                                </Text>
                                <Text className={styles.commentTime}>
                                  {formatCommentTime(r.createdAt)}
                                </Text>
                              </View>
                              <Text className={styles.commentText}>
                                <Text className={styles.commentReplyHint}>
                                  回复{c.author.displayName}：
                                </Text>
                                {r.body}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                    {commentCursor ? (
                      <View
                        className={styles.loadMore}
                        onClick={() => void loadMoreComments()}
                      >
                        <Text className={styles.loadMoreText}>
                          {loadingMoreComments ? '正在准备…' : '加载更多评论'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* 与首页 PostCard 一致：点 ·· 评论 / 点别人评论 后弹出 */}
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
                    onConfirm={() => void onSend()}
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
                    onClick={() => void onSend()}
                  >
                    {sending ? '…' : '发送'}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
        </>
      )}
    </PageShell>
  )
}
