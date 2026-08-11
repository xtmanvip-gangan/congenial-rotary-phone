import { Image, Text, View } from '@tarojs/components'
import Taro, { usePageScroll, usePullDownRefresh, useRouter } from '@tarojs/taro'
import { useCallback, useEffect, useRef, useState } from 'react'
import heroFeedbackIcon from '@/assets/page-hero/feedback.png'
import ListSkeleton from '@/components/ListSkeleton'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import {
  listMyApplicationFeedback,
  type ApplicationFeedbackItem,
} from '@/services/training'
import { useSessionStore } from '@/store/session'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'
import { formatDateTime } from '@/utils/format'
import styles from './index.module.scss'

type FeedbackItem = ApplicationFeedbackItem

/**
 * 课后反馈详情
 * 作业/反馈都直接挂在已学课程下，本页只展示老师反馈正文，无列表、无数据概览。
 * 入参：id（反馈 id）优先；缺省时用 courseId 取该课最新一条。
 */
export default function FeedbackDetailPage() {
  const router = useRouter()
  const feedbackId = router.params.id || ''
  const courseId = router.params.courseId || ''
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [item, setItem] = useState<FeedbackItem | null>(null)
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const contentTopGapPx = Math.round(
    (30 * (Taro.getSystemInfoSync().windowWidth || 375)) / 750,
  )

  const load = useCallback(
    async (options?: { pullDown?: boolean }) => {
      const pullDown = Boolean(options?.pullDown)
      if (!feedbackId && !courseId) {
        setError('反馈信息不太完整，请从已学课程重新进入')
        setItem(null)
        setLoading(false)
        if (pullDown) Taro.stopPullDownRefresh()
        return
      }
      if (!pullDown) setLoading(true)
      setError(null)
      try {
        await ensureAppSession()
        const current = useSessionStore.getState().session
        if (current?.mode === 'mock') {
          setItem(null)
          return
        }
        const res = await listMyApplicationFeedback()
        const items = res.items ?? []
        let picked: FeedbackItem | null = null
        if (feedbackId) {
          picked = items.find((it) => it.id === feedbackId) || null
        }
        if (!picked && courseId) {
          const scoped = items.filter((it) => it.course?.id === courseId)
          picked =
            [...scoped].sort((a, b) => {
              const ta = new Date(a.updatedAt || 0).getTime()
              const tb = new Date(b.updatedAt || 0).getTime()
              return tb - ta
            })[0] || null
        }
        setItem(picked)
        if (!picked) {
          setError(null)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '反馈加载失败')
        setItem(null)
      } finally {
        if (!pullDown) setLoading(false)
        if (pullDown) Taro.stopPullDownRefresh()
      }
    },
    [feedbackId, courseId],
  )

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

  const showHero = !loading && !!item
  const needCare = Boolean(item?.interventionNeeded)
  const metaParts = item
    ? [
        item.operator?.displayName
          ? `运营老师 ${item.operator.displayName}`
          : '',
        item.updatedAt ? `更新于 ${formatDateTime(item.updatedAt)}` : '',
        item.weekStart ? `周起始 ${item.weekStart}` : '',
      ].filter(Boolean)
    : []

  const navBackground = brandNavBackground(navProgress)
  const navIconColor = brandNavTitleColor(navProgress)

  function renderBody() {
    if (loading || (authLoading && !session && !item)) {
      return <ListSkeleton rows={3} />
    }
    if (authError && !session && !item) {
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
          title="反馈加载失败"
          description={error}
          actionText="重新加载一下"
          onAction={() => void load()}
        />
      )
    }
    if (!item) {
      return (
        <StateBlock
          icon="empty"
          title="暂无课后反馈"
          description="运营老师登记后会出现在这里"
          actionText="去已学课程看看"
          onAction={() => {
            void Taro.navigateTo({ url: '/pages/learned/index' })
          }}
        />
      )
    }

    const hasNote = Boolean(item.observationNote)
    const hasIssue = Boolean(item.replayIssue)

    return (
      <>
        <View className={styles.detailCard}>
          <View
            className={`${styles.cardAccent} ${
              needCare ? styles.cardAccentWarn : ''
            }`}
          />
          <View className={styles.cardMain}>
            <View className={styles.cardTopRow}>
              <Text className={styles.typeChip}>老师反馈</Text>
              {needCare ? (
                <Text className={styles.warnPill}>需要关注</Text>
              ) : (
                <Text className={styles.okPill}>已登记</Text>
              )}
            </View>
            {metaParts.length > 0 ? (
              <Text className={styles.cardMeta}>{metaParts.join(' · ')}</Text>
            ) : null}
          </View>

          <View className={styles.fields}>
            {hasNote ? (
              <View className={styles.field}>
                <Text className={styles.label}>观察记录</Text>
                <Text className={styles.value}>{item.observationNote}</Text>
              </View>
            ) : null}
            {hasIssue ? (
              <View
                className={`${styles.field} ${
                  needCare ? styles.fieldWarn : ''
                }`}
              >
                <Text className={styles.label}>回放问题</Text>
                <Text className={styles.value}>{item.replayIssue}</Text>
              </View>
            ) : null}
            {!hasNote && !hasIssue ? (
              <View className={styles.field}>
                <Text className={`${styles.value} ${styles.valueMuted}`}>
                  这条反馈还没有正文说明
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {item.nextCourse?.title ? (
          <View className={styles.nextCard}>
            <Text className={styles.nextLabel}>下一门课程</Text>
            <Text className={styles.nextValue}>{item.nextCourse.title}</Text>
          </View>
        ) : null}
      </>
    )
  }

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
          {showHero ? (
            <View className={styles.heroStack}>
              <View className={styles.heroCopy}>
                <Text className={styles.heroEyebrow}>课后反馈</Text>
                <Text className={styles.heroTitle}>
                  {item!.course?.title || '培训课程'}
                </Text>
                <Text className={styles.heroSub}>
                  {needCare
                    ? '老师建议你重点关注一下'
                    : '老师给你的课后反馈'}
                </Text>
              </View>
              <View className={styles.heroVisual}>
                <View className={styles.heroIconGlow} />
                <Image
                  className={styles.heroIcon}
                  src={heroFeedbackIcon}
                  mode="aspectFit"
                />
              </View>
            </View>
          ) : !loading ? (
            <View className={styles.heroStack}>
              <View className={styles.heroCopy}>
                <Text className={styles.heroEyebrow}>课后反馈</Text>
                <Text className={styles.heroTitle}>课后反馈</Text>
                <Text className={styles.heroSub}>老师登记后会出现在这里</Text>
              </View>
              <View className={styles.heroVisual}>
                <View className={styles.heroIconGlow} />
                <Image
                  className={styles.heroIcon}
                  src={heroFeedbackIcon}
                  mode="aspectFit"
                />
              </View>
            </View>
          ) : null}

          {renderBody()}
        </View>
      </View>
    </PageShell>
  )
}
