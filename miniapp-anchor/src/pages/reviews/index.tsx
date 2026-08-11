import { Image, Text, View } from '@tarojs/components'
import Taro, { usePageScroll, usePullDownRefresh } from '@tarojs/taro'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import heroReviewsIcon from '@/assets/page-hero/reviews.png'
import ListSkeleton from '@/components/ListSkeleton'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import { getMyDailyReviews, type MyDailyReviewItem } from '@/services/reviews'
import { useSessionStore } from '@/store/session'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'
import styles from './index.module.scss'

/** 低频场景：全部 / 近 30 天 / 近 90 天（与答疑页一致） */
type TimeFilter = 'all' | 'd30' | 'd90'

const TIME_TABS: Array<{ key: TimeFilter; label: string; days: number | null }> =
  [
    { key: 'all', label: '全部', days: null },
    { key: 'd30', label: '近 30 天', days: 30 },
    { key: 'd90', label: '近 90 天', days: 90 },
  ]

function withinDays(iso: string, days: number | null) {
  if (days == null) return true
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return true
  return t >= Date.now() - days * 24 * 60 * 60 * 1000
}

export default function ReviewsPage() {
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<MyDailyReviewItem[]>([])
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const contentTopGapPx = Math.round(
    (30 * (Taro.getSystemInfoSync().windowWidth || 375)) / 750,
  )

  const load = useCallback(async (options?: { pullDown?: boolean }) => {
    const pullDown = Boolean(options?.pullDown)
    if (!pullDown) setLoading(true)
    setError(null)
    try {
      await ensureAppSession()
      const res = await getMyDailyReviews()
      setItems(res.items ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '复盘加载失败')
    } finally {
      if (!pullDown) setLoading(false)
      if (pullDown) Taro.stopPullDownRefresh()
    }
  }, [])

  const filterDays =
    TIME_TABS.find((t) => t.key === timeFilter)?.days ?? null

  const filteredItems = useMemo(
    () => items.filter((item) => withinDays(item.reviewDate, filterDays)),
    [items, filterDays],
  )

  /** 概览始终看全量；列表跟筛选 */
  const stats = useMemo(() => ({ total: items.length }), [items])

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

  function renderList() {
    if (loading || (authLoading && !session && !items.length)) {
      return <ListSkeleton rows={3} />
    }
    if (authError && !session && items.length === 0) {
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
          title="复盘加载失败"
          description={error}
          actionText="重新加载一下"
          onAction={() => void load()}
        />
      )
    }
    if (items.length === 0) {
      return (
        <StateBlock
          icon="empty"
          title="还没有复盘"
          description="运营记录的每日复盘会显示在这里"
        />
      )
    }
    if (filteredItems.length === 0) {
      const label =
        TIME_TABS.find((t) => t.key === timeFilter)?.label || '当前'
      return (
        <StateBlock
          icon="empty"
          title={`${label}里暂时还没有复盘`}
          description="可以切换到「全部」看看更早的记录"
          actionText="看看全部"
          onAction={() => setTimeFilter('all')}
        />
      )
    }

    return (
      <View className={styles.groupList}>
        {filteredItems.map((item) => {
          const fields: Array<{
            label: string
            value: string
            tone?: 'ok' | 'warn'
          }> = []
          if (item.bestThing) {
            fields.push({ label: '今日亮点', value: item.bestThing, tone: 'ok' })
          }
          if (item.biggestProblem) {
            fields.push({
              label: '主要问题',
              value: item.biggestProblem,
              tone: 'warn',
            })
          }
          if (item.tomorrowFocus) {
            fields.push({ label: '调优建议', value: item.tomorrowFocus })
          }

          return (
            <View key={item.id} className={styles.card}>
              <View className={styles.cardAccent} />
              <View className={styles.cardMain}>
                <View className={styles.cardTopRow}>
                  <Text className={styles.typeChip}>每日复盘</Text>
                </View>
                <Text className={styles.cardTitle}>{item.reviewDate}</Text>
                {item.operator?.displayName ? (
                  <Text className={styles.cardMeta}>
                    运营老师 {item.operator.displayName}
                  </Text>
                ) : null}
              </View>
              <View className={styles.fields}>
                {fields.length > 0 ? (
                  fields.map((f) => (
                    <View
                      key={f.label}
                      className={`${styles.field} ${
                        f.tone === 'ok' ? styles.fieldHighlight : ''
                      } ${f.tone === 'warn' ? styles.fieldProblem : ''}`}
                    >
                      <Text className={styles.label}>{f.label}</Text>
                      <Text className={styles.value}>{f.value}</Text>
                    </View>
                  ))
                ) : (
                  <View className={styles.field}>
                    <Text className={`${styles.value} ${styles.valueMuted}`}>
                      这条复盘还没有正文
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )
        })}
      </View>
    )
  }

  const showChrome = !loading && items.length > 0
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
              <Text className={styles.heroEyebrow}>每日复盘</Text>
              <Text className={styles.heroTitle}>我的复盘</Text>
              <Text className={styles.heroSub}>
                运营记录后会出现在这里
              </Text>
            </View>
            <View className={styles.overviewWrap}>
              {showChrome ? (
                <View
                  className={`${styles.overviewCard} ${styles.overviewCardOk}`}
                >
                  <View className={styles.overviewSingle}>
                    <Text className={styles.overviewSingleLabel}>
                      复盘场数
                    </Text>
                    <Text className={styles.overviewSingleValue}>
                      {stats.total}
                    </Text>
                  </View>
                </View>
              ) : (
                <View className={styles.overviewCardPlaceholder} />
              )}
              <View className={styles.heroVisual}>
                <View className={styles.heroIconGlow} />
                <Image
                  className={styles.heroIcon}
                  src={heroReviewsIcon}
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
                    width: `calc((100% - 16rpx) / ${TIME_TABS.length})`,
                    transform: `translateX(${
                      Math.max(
                        0,
                        TIME_TABS.findIndex((t) => t.key === timeFilter),
                      ) * 100
                    }%)`,
                  }}
                />
                {TIME_TABS.map((tab) => {
                  const active = timeFilter === tab.key
                  return (
                    <View
                      key={tab.key}
                      className={styles.segItem}
                      onClick={() => setTimeFilter(tab.key)}
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
