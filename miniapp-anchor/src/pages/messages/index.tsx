import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, usePageScroll, usePullDownRefresh } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import SegmentTabs from '@/components/SegmentTabs'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import { getErrorMessage } from '@/services/request'
import { COLOR_ERROR } from '@/styles/design-tokens'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'
import {
  clearInboxMessages,
  listInboxMessages,
  markAllInboxRead,
  markInboxRead,
  type InboxMessage,
} from '@/services/inbox'
import {
  navigateInboxUrl,
  resolveInboxNavigateUrl,
} from '@/utils/inbox-link'
import { MESSAGE_TAB_INDEX, syncMessageBadge } from '@/utils/message-badge'
import styles from './index.module.scss'

type TabKey = 'all' | 'unread'
type CategoryKey = 'all' | 'activity' | 'training' | 'community' | 'system'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'unread', label: '未读' },
]

const CATEGORY_FILTERS: { key: CategoryKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'activity', label: '活动' },
  { key: 'training', label: '培训' },
  { key: 'community', label: '圈子' },
  { key: 'system', label: '系统' },
]

const CATEGORY_LABEL: Record<Exclude<CategoryKey, 'all'>, string> = {
  activity: '活动',
  training: '培训',
  community: '圈子',
  system: '系统',
}

function stripBrandPrefix(title: string) {
  return title.replace(/^【[^】]*】\s*/g, '').trim()
}

function messageCategory(item: InboxMessage): Exclude<CategoryKey, 'all'> {
  const type = item.notificationType || ''
  const business = item.businessType || ''
  if (
    type.startsWith('community_') ||
    type.includes('community') ||
    business === 'community_post' ||
    business === 'community'
  ) {
    return 'community'
  }
  if (
    type.includes('homework') ||
    type.includes('training') ||
    type.includes('session') ||
    type.includes('incubation') ||
    business === 'training' ||
    business === 'session' ||
    business === 'training_homework' ||
    business === 'training_registration' ||
    business === 'training_session' ||
    business === 'training_reminder' ||
    business === 'training_attendance' ||
    business === 'training_incubation_reminder' ||
    business === 'training_application_feedback'
  ) {
    return 'training'
  }
  // 日复盘 / 答疑归系统，勿被 review_* 提报类误伤
  if (
    type.includes('daily_review') ||
    type.includes('review_daily') ||
    business === 'daily_review' ||
    type.includes('qa_') ||
    business === 'qa_record'
  ) {
    return 'system'
  }
  if (
    type.includes('review') ||
    type.includes('grant') ||
    type.includes('submission') ||
    business === 'submission'
  ) {
    return 'activity'
  }
  return 'system'
}

function getMessageTitle(item: InboxMessage): string {
  const type = item.notificationType || ''
  switch (type) {
    case 'review_approved':
      return '提报审核已通过'
    case 'review_rejected':
      return '提报审核未通过'
    case 'grant_completed':
      return '奖励已发放'
    case 'submission_created':
      return '有新的提报待处理'
    case 'submission_resubmitted':
      return '主播已重新提交提报'
    case 'training_registered':
      return '培训报名成功'
    case 'training_waitlisted':
      return '培训已进入候补'
    case 'training_promoted':
    case 'training_waitlist_promoted':
      return '候补已补位'
    case 'training_cancelled':
    case 'training_registration_cancelled':
    case 'training_session_cancelled':
      return '培训课程已取消'
    case 'training_session_rescheduled':
      return '培训课程已改期'
    case 'training_one_hour_reminder':
      return '培训约 1 小时后开始'
    case 'training_learned':
    case 'training_attendance_learned':
      return '课程已记为已学'
    case 'training_needs_makeup':
    case 'training_attendance_needs_makeup':
      return '课程需补学'
    case 'training_incubation_daily_anchor':
      return '孵化标准课待办汇总'
    case 'training_recommendation':
      return '有人推荐了课程给你'
    case 'training_homework_published':
      return '有新的课后作业'
    case 'training_homework_graded':
      return '作业已批改'
    case 'training_homework_returned':
      return '作业需订正'
    case 'training_feedback_ready':
      return '收到课后反馈'
    case 'assignment_confirmed':
      return '运营归属已确认'
    case 'assignment_rejected':
      return '运营归属被驳回'
    case 'activation_operator_assigned':
      return '运营老师已分配'
    case 'anchor_activation_invitation':
      return '主播档案开通提醒'
    case 'onboarding_awaiting_confirm':
      return '岗前有节点待你确认'
    case 'daily_review_created':
      return '运营已填写日复盘'
    case 'qa_record_created':
      return '运营登记了答疑'
    case 'community_post_approved':
      return '主播圈帖子已通过'
    case 'community_post_rejected':
      return '主播圈帖子未通过'
    case 'community_comment':
      return '主播圈收到新评论'
    case 'community_comment_rejected':
      return '主播圈评论未通过'
    case 'tier_monthly_up':
      return '段位已提升'
    case 'tier_monthly_down':
      return '段位有更新'
    default: {
      if (type.startsWith('training_')) {
        return stripBrandPrefix(item.title || '') || '培训通知'
      }
      const cleaned = stripBrandPrefix(item.title || '')
      if (cleaned) return cleaned
      const firstLine = (item.content || '').split(/\n/)[0]?.trim() || ''
      if (firstLine.length > 32) return `${firstLine.slice(0, 32)}…`
      return firstLine || '你有一条新消息'
    }
  }
}

/** 列表副文案：驳回优先展示「未通过原因」，其余展示正文摘要 */
function getMessagePreview(item: InboxMessage): string {
  const content = (item.content || '').trim()
  if (!content) return ''

  const type = item.notificationType || ''
  const isReject =
    type === 'community_post_rejected' ||
    type === 'review_rejected' ||
    type.includes('reject')

  if (isReject) {
    const m = content.match(/(?:未通过原因|驳回原因)[：:]\s*([^\n]+)/)
    if (m?.[1]) {
      const reason = m[1].trim()
      if (reason) return `未通过原因：${reason}`
    }
  }

  const cleaned = content
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('点击本消息'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return ''
  if (cleaned.length > 72) return `${cleaned.slice(0, 72)}…`
  return cleaned
}

function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const now = Date.now()
  const diff = Math.max(0, now - t)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`

  const d = new Date(t)
  const today = new Date()
  const yesterday = new Date(now - day)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`

  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return `昨天 ${hm}`
  }
  if (d.getFullYear() === today.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
  }
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function applyBadgeCount(count: number) {
  if (count > 0) {
    void Taro.setTabBarBadge({
      index: MESSAGE_TAB_INDEX,
      text: count > 99 ? '99+' : String(count),
    }).catch(() => null)
  } else {
    void Taro.removeTabBarBadge({ index: MESSAGE_TAB_INDEX }).catch(() => null)
  }
}

export default function MessagesPage() {
  const [tab, setTab] = useState<TabKey>('all')
  const [category, setCategory] = useState<CategoryKey>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<InboxMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [markingAll, setMarkingAll] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  /** 防止连点 / 路由锁导致第二次点没反应；回页时强制解锁 */
  const openingRef = useRef(false)
  const tabRef = useRef(tab)
  tabRef.current = tab

  const load = useCallback(
    async (options?: { pullDown?: boolean; silent?: boolean }) => {
      const pullDown = Boolean(options?.pullDown)
      const silent = Boolean(options?.silent) || pullDown
      if (!silent) {
        setLoading(true)
      }
      setError(null)
      try {
        await ensureAppSession()
        const res = await listInboxMessages({
          unreadOnly: tab === 'unread',
        })
        setItems(res.items ?? [])
        const count = res.unreadCount ?? 0
        setUnreadCount(count)
        setTotalCount(res.totalCount ?? res.items?.length ?? 0)
        applyBadgeCount(count)
      } catch (e) {
        setError(getErrorMessage(e, '消息加载失败'))
      } finally {
        if (!silent) {
          setLoading(false)
        }
        if (pullDown) {
          Taro.stopPullDownRefresh()
        }
      }
    },
    [tab],
  )

  const hasLoadedOnce = useRef(false)
  useEffect(() => {
    void load().finally(() => {
      hasLoadedOnce.current = true
    })
  }, [tab, load])

  useDidShow(() => {
    openingRef.current = false
    if (!hasLoadedOnce.current) return
    void load({ silent: true })
  })

  usePullDownRefresh(() => {
    void load({ pullDown: true })
  })

  usePageScroll(({ scrollTop }) => {
    const next = Math.min(Math.max(scrollTop / BRAND_NAV_FADE_RANGE, 0), 1)
    const prev = navProgressRef.current
    if (
      Math.abs(next - prev) < 0.04 &&
      !(prev > 0 && next === 0) &&
      !(prev < 1 && next === 1)
    ) {
      return
    }
    navProgressRef.current = next
    setNavProgress(next)
  })

  const filteredItems = useMemo(() => {
    if (category === 'all') return items
    return items.filter((item) => messageCategory(item) === category)
  }, [items, category])

  const readCount = Math.max(0, totalCount - unreadCount)

  async function handleOpen(item: InboxMessage) {
    if (openingRef.current) return
    openingRef.current = true

    const url = resolveInboxNavigateUrl(item)

    if (!item.read) {
      setItems((prev) => {
        if (tabRef.current === 'unread') {
          return prev.filter((row) => row.id !== item.id)
        }
        return prev.map((row) =>
          row.id === item.id
            ? { ...row, read: true, readAt: new Date().toISOString() }
            : row,
        )
      })
      setUnreadCount((n) => {
        const next = Math.max(0, n - 1)
        applyBadgeCount(next)
        return next
      })
      void markInboxRead(item.id).catch(() => null)
    }

    if (!url) {
      openingRef.current = false
      void Taro.showToast({ title: '暂无对应页面', icon: 'none' })
      return
    }

    try {
      await navigateInboxUrl(url)
    } catch {
      void Taro.showToast({
        title: '打开失败了，请稍后再试一次',
        icon: 'none',
      })
    } finally {
      setTimeout(() => {
        openingRef.current = false
      }, 400)
    }
  }

  async function handleMarkAll() {
    if (markingAll || unreadCount <= 0) return
    setMarkingAll(true)
    try {
      await markAllInboxRead()
      void Taro.showToast({ title: '已全部已读', icon: 'success' })
      void load({ silent: true })
      void syncMessageBadge()
    } catch (e) {
      void Taro.showToast({
        title: getErrorMessage(e, '操作没有成功'),
        icon: 'none',
      })
    } finally {
      setMarkingAll(false)
    }
  }

  function handleClearTap() {
    if (clearing || totalCount <= 0) return
    const itemList =
      readCount > 0 && unreadCount > 0
        ? ['清空已读消息', '清空全部消息']
        : unreadCount > 0 && readCount === 0
          ? ['清空全部消息']
          : ['清空已读消息']

    void Taro.showActionSheet({ itemList })
      .then((res) => {
        const label = itemList[res.tapIndex]
        if (!label) return
        const scope: 'read' | 'all' = label.includes('全部') ? 'all' : 'read'
        void confirmAndClear(scope)
      })
      .catch(() => null)
  }

  async function confirmAndClear(scope: 'read' | 'all') {
    const content =
      scope === 'all'
        ? '会删掉全部消息（含未读），删后无法恢复。确定清空吗？'
        : '会删掉已读消息，未读会保留。确定清空吗？'
    const { confirm } = await Taro.showModal({
      title: scope === 'all' ? '清空全部消息' : '清空已读消息',
      content,
      confirmText: '清空',
      confirmColor: COLOR_ERROR,
      cancelText: '先留着',
    })
    if (!confirm) return

    setClearing(true)
    try {
      const res = await clearInboxMessages(scope)
      const deleted = res.deleted ?? 0
      if (deleted === 0) {
        void Taro.showToast({
          title: scope === 'all' ? '没有可清空的消息' : '没有已读消息可清空',
          icon: 'none',
        })
      } else {
        void Taro.showToast({
          title: `已清空 ${deleted} 条`,
          icon: 'success',
        })
      }
      setUnreadCount(res.unreadCount ?? 0)
      applyBadgeCount(res.unreadCount ?? 0)
      void load({ silent: true })
      void syncMessageBadge()
    } catch (e) {
      void Taro.showToast({
        title: getErrorMessage(e, '清空没有成功'),
        icon: 'none',
      })
    } finally {
      setClearing(false)
    }
  }

  function renderEmpty() {
    if (tab === 'unread' && items.length === 0) {
      return (
        <View className={styles.emptyWrap}>
          <StateBlock icon="empty" title="没有未读消息" />
        </View>
      )
    }
    if (category !== 'all' && items.length > 0 && filteredItems.length === 0) {
      return (
        <View className={styles.emptyWrap}>
          <StateBlock icon="empty" title="该分类暂无消息" />
        </View>
      )
    }
    return (
      <View className={styles.emptyWrap}>
        <StateBlock icon="empty" title="暂无消息" />
      </View>
    )
  }

  const navBackground = brandNavBackground(navProgress)
  const navTitleColor = brandNavTitleColor(navProgress)

  return (
    <PageShell
      className={styles.page}
      backgroundColor="#EEF1F6"
      backgroundTextStyle="dark"
    >
      <View className={styles.pageGradient} aria-hidden>
        <View className={styles.gradOrbA} />
        <View className={styles.gradOrbB} />
        <View className={styles.gradArc} />
        <View className={styles.gradFade} />
      </View>
      <PageNav
        title="消息"
        showBack={false}
        background={navBackground}
        titleColor={navTitleColor}
      />
      <View className={styles.content}>
        <View className={styles.controlBar}>
          <SegmentTabs
            variant="slide"
            density="hug"
            value={tab}
            onChange={(key) => setTab(key as TabKey)}
            items={TABS.map((item) => ({
              key: item.key,
              label: item.label,
              badge:
                item.key === 'unread' && unreadCount > 0
                  ? unreadCount
                  : undefined,
            }))}
          />

          <View className={styles.actions}>
            {unreadCount > 0 ? (
              <Text
                className={`${styles.actionLink} ${
                  markingAll ? styles.actionLinkDisabled : ''
                }`}
                onClick={() => void handleMarkAll()}
              >
                {markingAll ? '处理中' : '全部已读'}
              </Text>
            ) : null}
            {totalCount > 0 ? (
              <Text
                className={`${styles.actionLink} ${
                  clearing ? styles.actionLinkDisabled : ''
                }`}
                onClick={handleClearTap}
              >
                {clearing ? '清空中' : '清空'}
              </Text>
            ) : null}
          </View>
        </View>

        <View className={styles.filterRail}>
          {CATEGORY_FILTERS.map((chip) => {
            const active = category === chip.key
            return (
              <View
                key={chip.key}
                className={styles.filterItem}
                hoverClass={styles.filterItemHover}
                hoverStayTime={80}
                onClick={() => setCategory(chip.key)}
              >
                <Text
                  className={`${styles.filterLabel} ${
                    active ? styles.filterLabelActive : ''
                  }`}
                >
                  {chip.label}
                </Text>
                {active ? <View className={styles.filterUnderline} /> : null}
              </View>
            )
          })}
        </View>

        {loading ? (
          <StateBlock icon="loading" title="请稍等一下" />
        ) : error ? (
          <StateBlock
            icon="error"
            title="消息加载失败"
            description={error}
            actionText="再试一次"
            onAction={() => void load()}
          />
        ) : filteredItems.length === 0 ? (
          renderEmpty()
        ) : (
          <View className={styles.listCard}>
            {filteredItems.map((item, index) => {
              const cat = messageCategory(item)
              const canNavigate = Boolean(resolveInboxNavigateUrl(item))
              const title = getMessageTitle(item)
              const preview = getMessagePreview(item)
              const isLast = index === filteredItems.length - 1
              const isRejectPreview =
                preview.startsWith('未通过原因：') ||
                (item.notificationType || '').includes('reject')

              return (
                <View
                  key={item.id}
                  className={`${styles.row} ${
                    item.read ? styles.rowRead : styles.rowUnread
                  } ${isLast ? styles.rowLast : ''} ${
                    preview ? styles.rowWithPreview : ''
                  }`}
                  hoverClass={styles.rowHover}
                  hoverStayTime={100}
                  onClick={() => void handleOpen(item)}
                >
                  <View className={styles.main}>
                    <Text
                      className={`${styles.title} ${
                        item.read ? styles.titleRead : ''
                      }`}
                    >
                      {title}
                    </Text>
                    {preview ? (
                      <Text
                        className={`${styles.preview} ${
                          isRejectPreview ? styles.previewReject : ''
                        }`}
                      >
                        {preview}
                      </Text>
                    ) : null}
                    <View className={styles.metaRow}>
                      <Text className={styles.metaText}>
                        {formatRelativeTime(item.createdAt)}
                      </Text>
                      <Text className={styles.metaDot}>·</Text>
                      <Text className={styles.metaText}>
                        {CATEGORY_LABEL[cat]}
                      </Text>
                    </View>
                  </View>

                  {canNavigate ? (
                    <View className={styles.action}>
                      <Text className={styles.chevron}>›</Text>
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        )}
      </View>
    </PageShell>
  )
}
