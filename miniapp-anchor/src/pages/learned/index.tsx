import { Image, Text, View } from '@tarojs/components'
import Taro, { usePageScroll, usePullDownRefresh } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import heroLearnedIcon from '@/assets/page-hero/learned.png'
import ListSkeleton from '@/components/ListSkeleton'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import {
  listMyHomework,
  type HomeworkListItem,
} from '@/services/homework'
import {
  getMyTraining,
  listMyApplicationFeedback,
  type ApplicationFeedbackItem,
} from '@/services/training'
import { useSessionStore } from '@/store/session'
import type { TrainingProgress } from '@/types/training'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'
import { formatDateTime } from '@/utils/format'
import styles from './index.module.scss'

type FeedbackItem = ApplicationFeedbackItem

type CourseCard = {
  courseId: string
  title: string
  lastLearnedAt: string | null
  firstLearnedAt: string | null
  homeworks: HomeworkListItem[]
  feedbacks: FeedbackItem[]
}

/** 全部 | 待作业 | 有反馈 */
type LearnedFilter = 'all' | 'homework' | 'feedback'

const FILTER_TABS: Array<{ key: LearnedFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'homework', label: '待作业' },
  { key: 'feedback', label: '有反馈' },
]

function homeworkNeedsAction(h: HomeworkListItem) {
  return (
    h.canSubmit ||
    h.submission?.status === 'returned' ||
    !h.submission ||
    h.submission.status === 'draft'
  )
}

function homeworkChipLabel(items: HomeworkListItem[]): string | null {
  if (items.length === 0) return null
  const needAction = items.filter(homeworkNeedsAction)
  const pending = items.filter((h) => h.submission?.status === 'submitted')
  const graded = items.filter((h) => h.submission?.status === 'graded')
  if (needAction.length > 0) {
    return needAction.some((h) => h.submission?.status === 'returned')
      ? '需订正'
      : '待交'
  }
  if (pending.length > 0) return '待批'
  if (graded.length === items.length) return '已批'
  return `${items.length} 份`
}

function homeworkChipTone(
  label: string | null,
): 'warn' | 'info' | 'ok' | null {
  if (!label) return null
  if (label === '待交' || label === '需订正') return 'warn'
  if (label === '待批') return 'info'
  return 'ok'
}

function hasHomeworkTodo(card: CourseCard) {
  return card.homeworks.some(homeworkNeedsAction)
}

function feedbackChipLabel(items: FeedbackItem[]): string | null {
  if (items.length === 0) return null
  return items.length === 1 ? '有反馈' : `${items.length} 条`
}

export default function LearnedCoursesPage() {
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState<CourseCard[]>([])
  const [filter, setFilter] = useState<LearnedFilter>('all')
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const contentTopGapPx = Math.round(
    (30 * (Taro.getSystemInfoSync().windowWidth || 375)) / 750,
  )

  const stats = useMemo(() => {
    const total = cards.length
    const homeworkTodo = cards.filter(hasHomeworkTodo).length
    const withFeedback = cards.filter((c) => c.feedbacks.length > 0).length
    return { total, homeworkTodo, withFeedback }
  }, [cards])

  const filteredCards = useMemo(() => {
    if (filter === 'homework') return cards.filter(hasHomeworkTodo)
    if (filter === 'feedback') {
      return cards.filter((c) => c.feedbacks.length > 0)
    }
    return cards
  }, [cards, filter])

  const load = useCallback(async (options?: { pullDown?: boolean }) => {
    const pullDown = Boolean(options?.pullDown)
    if (!pullDown) setLoading(true)
    setError(null)
    try {
      await ensureAppSession()
      const current = useSessionStore.getState().session
      const isMock = current?.mode === 'mock'

      const [training, homeworkRes, feedbackRes] = await Promise.all([
        getMyTraining(),
        isMock
          ? Promise.resolve({ items: [] as HomeworkListItem[] })
          : listMyHomework().catch(() => ({ items: [] as HomeworkListItem[] })),
        isMock
          ? Promise.resolve({ items: [] as ApplicationFeedbackItem[] })
          : listMyApplicationFeedback().catch(() => ({
              items: [] as ApplicationFeedbackItem[],
            })),
      ])

      let learned: TrainingProgress[] = (training.progress ?? []).filter(
        (item) => item.status === 'learned',
      )
      if (learned.length === 0) {
        learned = (training.registrations ?? [])
          .filter((r) => r.status === 'learned')
          .map(
            (r) =>
              ({
                course: r.session.course,
                status: 'learned' as const,
                makeupStatus: 'none' as const,
                firstLearnedAt: r.session.scheduledStartAt,
                lastLearnedAt: r.session.scheduledEndAt,
              }) satisfies TrainingProgress,
          )
      }

      const byCourse = new Map<string, CourseCard>()
      for (const item of learned) {
        const id = item.course.id
        const prev = byCourse.get(id)
        if (!prev) {
          byCourse.set(id, {
            courseId: id,
            title: item.course.title,
            lastLearnedAt: item.lastLearnedAt,
            firstLearnedAt: item.firstLearnedAt,
            homeworks: [],
            feedbacks: [],
          })
        } else {
          const a = prev.lastLearnedAt || prev.firstLearnedAt
          const b = item.lastLearnedAt || item.firstLearnedAt
          if (a && b && new Date(b).getTime() > new Date(a).getTime()) {
            prev.lastLearnedAt = item.lastLearnedAt
            prev.firstLearnedAt = item.firstLearnedAt
          }
        }
      }

      for (const hw of homeworkRes.items ?? []) {
        const courseId = hw.courseId
        if (!courseId) continue
        let card = byCourse.get(courseId)
        if (!card) {
          card = {
            courseId,
            title: hw.courseTitle,
            lastLearnedAt: hw.scheduledStartAt,
            firstLearnedAt: hw.scheduledStartAt,
            homeworks: [],
            feedbacks: [],
          }
          byCourse.set(courseId, card)
        }
        card.homeworks.push(hw)
      }

      for (const fb of feedbackRes.items ?? []) {
        const courseId = fb.course?.id
        if (!courseId) continue
        const card = byCourse.get(courseId)
        if (card) card.feedbacks.push(fb)
      }

      const list = [...byCourse.values()].sort((a, b) => {
        const ta = new Date(a.lastLearnedAt || a.firstLearnedAt || 0).getTime()
        const tb = new Date(b.lastLearnedAt || b.firstLearnedAt || 0).getTime()
        return tb - ta
      })
      setCards(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    } finally {
      if (!pullDown) setLoading(false)
      if (pullDown) Taro.stopPullDownRefresh()
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    void load()
  }, [hydrated, load])

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

  /** 作业挂在已学课程下：直接进作业详情（优先待办/需订正） */
  function openHomework(card: CourseCard) {
    if (card.homeworks.length === 0) {
      Taro.showToast({ title: '这门课暂无作业', icon: 'none' })
      return
    }
    const primary =
      card.homeworks.find(homeworkNeedsAction) ||
      card.homeworks.find((h) => h.submission?.status === 'submitted') ||
      card.homeworks[0]
    void Taro.navigateTo({
      url: `/pages/homework-detail/index?id=${encodeURIComponent(primary.id)}`,
    })
  }

  /** 课后反馈挂在已学课程下：直接进反馈详情（取本课最新一条） */
  function openFeedback(card: CourseCard) {
    if (card.feedbacks.length === 0) {
      Taro.showToast({ title: '这门课暂无反馈', icon: 'none' })
      return
    }
    const primary = [...card.feedbacks].sort((a, b) => {
      const ta = new Date(a.updatedAt || 0).getTime()
      const tb = new Date(b.updatedAt || 0).getTime()
      return tb - ta
    })[0]
    void Taro.navigateTo({
      url: `/pages/feedback/index?id=${encodeURIComponent(primary.id)}&courseId=${encodeURIComponent(card.courseId)}`,
    })
  }

  function renderList() {
    if (loading || (authLoading && !session && !cards.length)) {
      return <ListSkeleton rows={3} />
    }
    if (authError && !session && cards.length === 0) {
      return (
        <StateBlock
          icon="error"
          title="登录暂时失败"
          description={authError}
          actionText="再试一次"
          onAction={() => void load()}
        />
      )
    }
    if (error) {
      return (
        <StateBlock
          icon="error"
          title="课程加载失败"
          description={error}
          actionText="重新加载一下"
          onAction={() => void load()}
        />
      )
    }
    if (cards.length === 0) {
      return (
        <StateBlock
          icon="empty"
          title="还没有已学课程"
          description="完成培训课后，作业与反馈会汇总在这里"
          actionText="去学习中心看看"
          onAction={() => {
            void Taro.navigateTo({ url: '/pages/training/index' })
          }}
        />
      )
    }
    if (filteredCards.length === 0) {
      const filterLabel =
        filter === 'homework'
          ? '待作业'
          : filter === 'feedback'
            ? '有反馈'
            : '当前'
      return (
        <StateBlock
          icon="empty"
          title={`${filterLabel}里暂时还没有`}
          actionText={filter !== 'all' ? '看看全部课程' : '去学习中心看看'}
          onAction={() => {
            if (filter !== 'all') {
              setFilter('all')
              return
            }
            void Taro.navigateTo({ url: '/pages/training/index' })
          }}
        />
      )
    }

    return (
      <View className={styles.groupList}>
        {filteredCards.map((card) => {
          const hwLabel = homeworkChipLabel(card.homeworks)
          const fbLabel = feedbackChipLabel(card.feedbacks)
          const hwTone = homeworkChipTone(hwLabel)
          const needsTodo = hasHomeworkTodo(card)
          const learnedAt =
            card.lastLearnedAt || card.firstLearnedAt
              ? formatDateTime(card.lastLearnedAt || card.firstLearnedAt || '')
              : ''

          return (
            <View key={card.courseId} className={styles.courseCard}>
              <View
                className={`${styles.cardHeadAccent} ${
                  needsTodo ? styles.cardHeadAccentTodo : ''
                }`}
              />
              <View className={styles.cardMain}>
                <View className={styles.cardTopRow}>
                  <Text className={styles.typeChip}>已学</Text>
                  {hwLabel ? (
                    <Text
                      className={
                        hwTone === 'warn'
                          ? styles.todoPill
                          : hwTone === 'info'
                            ? styles.infoPill
                            : styles.donePill
                      }
                    >
                      作业 · {hwLabel}
                    </Text>
                  ) : null}
                  {fbLabel ? (
                    <Text className={styles.donePill}>反馈 · {fbLabel}</Text>
                  ) : null}
                </View>
                <Text className={styles.cardTitle}>{card.title}</Text>
                <Text className={styles.cardMeta}>
                  {learnedAt ? `学完于 ${learnedAt}` : '已学完'}
                </Text>
              </View>

              <View className={styles.actionList}>
                <View
                  className={`${styles.actionRow} ${
                    card.homeworks.length === 0 ? styles.actionRowMuted : ''
                  }`}
                  onClick={() => openHomework(card)}
                >
                  <View
                    className={`${styles.actionTimeBar} ${
                      hwTone === 'warn' ? styles.actionTimeBarWarn : ''
                    } ${hwTone === 'ok' ? styles.actionTimeBarOk : ''}`}
                  />
                  <View className={styles.actionBody}>
                    <Text className={styles.actionTitle}>课程作业</Text>
                    <Text className={styles.actionHint}>
                      {card.homeworks.length === 0
                        ? '这门课暂无作业'
                        : hwLabel === '待交' || hwLabel === '需订正'
                          ? '还有作业需要你处理'
                          : hwLabel === '待批'
                            ? '作业已提交，等待批改'
                            : '查看作业与批改结果'}
                    </Text>
                  </View>
                  {hwLabel ? (
                    <Text
                      className={`${styles.actionBadge} ${
                        hwTone === 'warn'
                          ? styles.badgeWarn
                          : hwTone === 'info'
                            ? styles.badgeInfo
                            : styles.badgeOk
                      }`}
                    >
                      {hwLabel}
                    </Text>
                  ) : null}
                  <Text className={styles.actionArrow}>›</Text>
                </View>

                <View
                  className={`${styles.actionRow} ${
                    card.feedbacks.length === 0 ? styles.actionRowMuted : ''
                  }`}
                  onClick={() => openFeedback(card)}
                >
                  <View
                    className={`${styles.actionTimeBar} ${
                      card.feedbacks.length > 0 ? styles.actionTimeBarOk : ''
                    }`}
                  />
                  <View className={styles.actionBody}>
                    <Text className={styles.actionTitle}>课后反馈</Text>
                    <Text className={styles.actionHint}>
                      {card.feedbacks.length === 0
                        ? '这门课暂无课后反馈'
                        : '看看老师给你的课后反馈'}
                    </Text>
                  </View>
                  {fbLabel ? (
                    <Text
                      className={`${styles.actionBadge} ${styles.badgeOk}`}
                    >
                      {fbLabel}
                    </Text>
                  ) : null}
                  <Text className={styles.actionArrow}>›</Text>
                </View>
              </View>
            </View>
          )
        })}
      </View>
    )
  }

  const showChrome = !loading && cards.length > 0
  const navBackground = brandNavBackground(navProgress)
  const navIconColor = brandNavTitleColor(navProgress)

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
        title=""
        showTitle={false}
        showBack
        background={navBackground}
        backIconColor={navIconColor}
      />
      <View
        className={styles.content}
        style={{ paddingTop: `${contentTopGapPx}px` }}
      >
        <View className={styles.contentInner}>
          <View className={styles.heroStack}>
            <View className={styles.heroCopy}>
              <Text className={styles.heroEyebrow}>已学课程</Text>
              <Text className={styles.heroTitle}>我的课程</Text>
            </View>

            <View className={styles.overviewWrap}>
              {showChrome ? (
                <View
                  className={`${styles.overviewCard} ${
                    stats.homeworkTodo > 0
                      ? styles.overviewCardTodo
                      : styles.overviewCardOk
                  }`}
                >
                  <View className={styles.overviewStats}>
                    <View className={styles.overviewStat}>
                      <Text className={styles.overviewStatValue}>
                        {stats.total}
                      </Text>
                      <Text className={styles.overviewStatLabel}>
                        已学课程
                      </Text>
                    </View>
                    <View className={styles.overviewStatDivider} />
                    <View className={styles.overviewStat}>
                      <Text
                        className={`${styles.overviewStatValue} ${
                          stats.homeworkTodo > 0
                            ? styles.overviewStatWarn
                            : ''
                        }`}
                      >
                        {stats.homeworkTodo}
                      </Text>
                      <Text className={styles.overviewStatLabel}>
                        待作业
                      </Text>
                    </View>
                    <View className={styles.overviewStatDivider} />
                    <View className={styles.overviewStat}>
                      <Text
                        className={`${styles.overviewStatValue} ${styles.overviewStatOk}`}
                      >
                        {stats.withFeedback}
                      </Text>
                      <Text className={styles.overviewStatLabel}>
                        有反馈
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View className={styles.overviewCardPlaceholder} />
              )}

              <View className={styles.heroVisual}>
                <View className={styles.heroIconGlow} />
                <Image
                  className={styles.heroIcon}
                  src={heroLearnedIcon}
                  mode="aspectFit"
                />
              </View>
            </View>
          </View>

          {showChrome ? (
            <View className={styles.filterPanel}>
              <View className={styles.segBar}>
                <View
                  className={styles.segPill}
                  style={{
                    width: `calc((100% - 16rpx) / ${FILTER_TABS.length})`,
                    transform: `translateX(${
                      Math.max(
                        0,
                        FILTER_TABS.findIndex((t) => t.key === filter),
                      ) * 100
                    }%)`,
                  }}
                />
                {FILTER_TABS.map((tab) => {
                  const active = filter === tab.key
                  return (
                    <View
                      key={tab.key}
                      className={styles.segItem}
                      onClick={() => setFilter(tab.key)}
                    >
                      <Text
                        className={`${styles.segLabel} ${
                          active ? styles.segLabelActive : ''
                        }`}
                      >
                        {tab.label}
                      </Text>
                    </View>
                  )
                })}
              </View>
            </View>
          ) : null}

          {renderList()}
        </View>
      </View>
    </PageShell>
  )
}
