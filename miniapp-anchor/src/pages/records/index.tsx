import { Image, Picker, Text, View } from '@tarojs/components'
import Taro, { usePageScroll, usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import ListSkeleton from '@/components/ListSkeleton'
import StateBlock from '@/components/StateBlock'
import heroRecordsIcon from '@/assets/page-hero/records.png'
import { ensureAppSession } from '@/services/auth'
import { getErrorMessage } from '@/services/request'
import { getMySubmissions } from '@/services/submissions'
import { useSessionStore } from '@/store/session'
import type { SubmissionRecordItem } from '@/types/submission'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'
import styles from './index.module.scss'

/**
 * 提报记录（从「我的」进入）
 * - 本页：主播参加过的活动总览 + 当前状态
 * - 单场明细：进入 activity-records（本场）
 */

/** 全部 | 有待处理 | 已全部完结（按活动维度） */
type RecordFilter = 'all' | 'todo' | 'done'

const FILTER_TABS: Array<{ key: RecordFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '待处理' },
  { key: 'done', label: '已完结' },
]

function isTodoItem(item: SubmissionRecordItem) {
  return item.reviewStatus === 'pending' || item.reviewStatus === 'rejected'
}

function formatLatestLabel(iso: string): string {
  if (!iso) return ''
  const day = iso.slice(0, 10)
  return day.length === 10 ? day : iso
}

type ActivityGroup = {
  activityId: string
  activityName: string
  typeName: string
  typeCode?: string
  submitCount: number
  todoCount: number
  latestAt: string
}

export default function RecordsPage() {
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<SubmissionRecordItem[]>([])
  const [filter, setFilter] = useState<RecordFilter>('all')
  const [activityFilter, setActivityFilter] = useState<string>('all')
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const contentTopGapPx = Math.round(
    (30 * (Taro.getSystemInfoSync().windowWidth || 375)) / 750,
  )

  /** 概览按「活动」维度，不是提报条数 */
  const stats = useMemo(() => {
    const byActivity = new Map<string, SubmissionRecordItem[]>()
    for (const item of items) {
      const id = item.activity.id
      const list = byActivity.get(id) ?? []
      list.push(item)
      byActivity.set(id, list)
    }
    let joined = 0 // 仍有待处理 = 还在跟进中的活动
    let done = 0
    byActivity.forEach((list) => {
      const hasTodo = list.some(isTodoItem)
      if (hasTodo) joined += 1
      else done += 1
    })
    return {
      total: byActivity.size,
      joined,
      done,
    }
  }, [items])

  const activityOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of items) {
      map.set(item.activity.id, item.activity.name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [items])

  /** 先按全部提报聚合成活动，再按筛选维度过滤 */
  const activityGroups = useMemo((): ActivityGroup[] => {
    const map = new Map<string, SubmissionRecordItem[]>()
    for (const item of items) {
      if (activityFilter !== 'all' && item.activity.id !== activityFilter) {
        continue
      }
      const id = item.activity.id
      const list = map.get(id) ?? []
      list.push(item)
      map.set(id, list)
    }

    const groups = Array.from(map.entries()).map(([activityId, list]) => {
      const sorted = [...list].sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || ''),
      )
      const first = sorted[0]
      const todoCount = sorted.filter(isTodoItem).length
      const latestAt = sorted[0]?.createdAt || sorted[0]?.liveDate || ''
      return {
        activityId,
        activityName: first.activity.name,
        typeName: first.activity.typeName,
        typeCode: first.activity.typeCode,
        submitCount: sorted.length,
        todoCount,
        latestAt,
      }
    })

    // 活动维度筛选：待处理 = 仍有待办；已完结 = 该场全部已处理完
    const filtered = groups.filter((g) => {
      if (filter === 'todo') return g.todoCount > 0
      if (filter === 'done') return g.todoCount === 0
      return true
    })

    filtered.sort((a, b) => {
      if (a.todoCount > 0 && b.todoCount === 0) return -1
      if (a.todoCount === 0 && b.todoCount > 0) return 1
      return b.latestAt.localeCompare(a.latestAt)
    })
    return filtered
  }, [activityFilter, filter, items])

  async function loadRecords(options?: {
    pullDown?: boolean
    showToast?: boolean
  }) {
    const pullDown = Boolean(options?.pullDown)
    if (!pullDown) setLoading(true)
    setError(null)

    try {
      await ensureAppSession()
      const response = await getMySubmissions()
      setItems(response.items)
      if (options?.showToast) {
        Taro.showToast({ title: '已帮你刷新记录', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[Records] 加载记录失败', requestError)
      setError(getErrorMessage(requestError, '记录加载失败'))
    } finally {
      if (!pullDown) setLoading(false)
      if (pullDown) Taro.stopPullDownRefresh()
    }
  }

  useEffect(() => {
    if (!hydrated) return
    void loadRecords()
  }, [hydrated])

  usePullDownRefresh(() => {
    void loadRecords({ pullDown: true, showToast: true })
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

  // 顶栏无标题；透明 → 滚动磨砂白；箭头随背景变色
  const navBackground = brandNavBackground(navProgress)
  const navIconColor = brandNavTitleColor(navProgress)

  function openActivityRecords(group: ActivityGroup) {
    void Taro.navigateTo({
      url: `/pages/activity-records/index?activityId=${group.activityId}&activityName=${encodeURIComponent(group.activityName)}`,
    })
  }

  function renderList() {
    if (loading || (authLoading && !session)) {
      return <ListSkeleton rows={3} />
    }
    if (authError && !session) {
      return (
        <StateBlock
          icon="error"
          title="登录暂时失败"
          description={authError}
          actionText="再试一次"
          onAction={() => void loadRecords()}
        />
      )
    }
    if (error) {
      return (
        <StateBlock
          icon="error"
          title="记录加载失败"
          description={error}
          actionText="重新加载一下"
          onAction={() => void loadRecords()}
        />
      )
    }
    if (items.length === 0) {
      return (
        <StateBlock
          icon="empty"
          title="还没有提报记录"
          actionText="去活动广场看看"
          onAction={() => {
            void Taro.navigateTo({ url: '/pages/activities/index' })
          }}
        />
      )
    }
    if (activityGroups.length === 0) {
      const filterLabel =
        filter === 'todo' ? '待处理' : filter === 'done' ? '已完结' : '当前'
      return (
        <StateBlock
          icon="empty"
          title={`${filterLabel}里暂时还没有`}
          actionText={filter !== 'all' ? '看看全部活动' : '去活动广场看看'}
          onAction={() => {
            if (filter !== 'all') {
              setFilter('all')
              setActivityFilter('all')
              return
            }
            void Taro.navigateTo({ url: '/pages/activities/index' })
          }}
        />
      )
    }

    return (
      <View className={styles.groupList}>
        {activityGroups.map((group) => {
          const latestLabel = formatLatestLabel(group.latestAt)
          return (
            <View
              key={group.activityId}
              className={styles.activityCard}
              onClick={() => openActivityRecords(group)}
            >
              <View
                className={`${styles.cardHeadAccent} ${
                  group.todoCount > 0 ? styles.cardHeadAccentTodo : ''
                }`}
              />
              <View className={styles.cardBody}>
                <View className={styles.cardTopRow}>
                  <Text className={styles.typeChip}>{group.typeName}</Text>
                  {group.todoCount > 0 ? (
                    <Text className={styles.todoPill}>
                      还有 {group.todoCount} 条待处理
                    </Text>
                  ) : (
                    <Text className={styles.donePill}>本场已完结</Text>
                  )}
                </View>
                <Text className={styles.cardTitle} numberOfLines={2}>
                  {group.activityName}
                </Text>
                <View className={styles.cardMetaRow}>
                  <Text className={styles.cardMeta}>
                    已提报 {group.submitCount} 次
                    {latestLabel ? ` · 最近 ${latestLabel}` : ''}
                  </Text>
                </View>
              </View>
              <Text className={styles.cardArrow}>›</Text>
            </View>
          )
        })}
      </View>
    )
  }

  const showChrome = !loading && items.length > 0

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
          {/*
            顶区：标题在上；数据卡上提；
            图标大半在渐变、下半压在数据卡上
          */}
          <View className={styles.heroStack}>
            <View className={styles.heroCopy}>
              <Text className={styles.heroEyebrow}>活动记录</Text>
              <Text className={styles.heroTitle}>我的活动</Text>
            </View>

            <View className={styles.overviewWrap}>
              {showChrome ? (
                <View
                  className={`${styles.overviewCard} ${
                    stats.joined > 0
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
                        活动总数
                      </Text>
                    </View>
                    <View className={styles.overviewStatDivider} />
                    <View className={styles.overviewStat}>
                      <Text
                        className={`${styles.overviewStatValue} ${
                          stats.joined > 0 ? styles.overviewStatWarn : ''
                        }`}
                      >
                        {stats.joined}
                      </Text>
                      <Text className={styles.overviewStatLabel}>
                        我参加的
                      </Text>
                    </View>
                    <View className={styles.overviewStatDivider} />
                    <View className={styles.overviewStat}>
                      <Text
                        className={`${styles.overviewStatValue} ${styles.overviewStatOk}`}
                      >
                        {stats.done}
                      </Text>
                      <Text className={styles.overviewStatLabel}>已完结</Text>
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
                  src={heroRecordsIcon}
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

              {activityOptions.length > 1 ? (
                <View className={styles.filterActivity}>
                  <Text className={styles.filterActivityLabel}>活动</Text>
                  <Picker
                    mode="selector"
                    range={[
                      '全部活动',
                      ...activityOptions.map((opt) => opt.name),
                    ]}
                    value={
                      activityFilter === 'all'
                        ? 0
                        : Math.max(
                            0,
                            activityOptions.findIndex(
                              (opt) => opt.id === activityFilter,
                            ) + 1,
                          )
                    }
                    onChange={(event: {
                      detail: { value: string | number }
                    }) => {
                      const idx = Number(event.detail.value)
                      if (idx <= 0) {
                        setActivityFilter('all')
                        return
                      }
                      const next = activityOptions[idx - 1]
                      if (next) setActivityFilter(next.id)
                    }}
                  >
                    <View
                      className={`${styles.filterSelect} ${
                        activityFilter !== 'all'
                          ? styles.filterSelectActive
                          : ''
                      }`}
                    >
                      <Text
                        className={`${styles.filterSelectText} ${
                          activityFilter === 'all'
                            ? styles.filterSelectPlaceholder
                            : ''
                        }`}
                        numberOfLines={1}
                      >
                        {activityFilter === 'all'
                          ? '全部活动'
                          : activityOptions.find(
                              (o) => o.id === activityFilter,
                            )?.name || '全部活动'}
                      </Text>
                      <View className={styles.filterSelectCaret} />
                    </View>
                  </Picker>
                </View>
              ) : null}
            </View>
          ) : null}

          {renderList()}
        </View>
      </View>
    </PageShell>
  )
}
