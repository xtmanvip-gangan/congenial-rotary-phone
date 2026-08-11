import { Button, Image, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import dayjs from 'dayjs'
import { useCallback, useEffect, useMemo, useState } from 'react'
import ListSkeleton from '@/components/ListSkeleton'
import StateBlock from '@/components/StateBlock'
import { getAvailableActivities } from '@/services/activities'
import { ensureAppSession } from '@/services/auth'
import { getErrorMessage, resolveAssetUrl } from '@/services/request'
import { useSessionStore } from '@/store/session'
import type { AvailableActivityItem } from '@/types/activity'
import { canMutateBusiness, isBrowseOnly } from '@/utils/capability'
import {
  formatCountdown,
  formatDateTime,
  getActivityPhase,
  getActivityPhaseText,
  isActivityReportable,
  isActivityStarted,
  type ActivityPhase,
} from '@/utils/format'
import styles from './ActivityListShell.module.scss'

/** 仅进行中 / 已结束（不展示「全部」） */
type ActivityFilter = ActivityPhase

const FILTER_TABS: Array<{ label: string; value: ActivityFilter }> = [
  { label: '进行中', value: 'ongoing' },
  { label: '已结束', value: 'ended' },
]

function getTimeProgress(
  startAt: string,
  endAt: string,
  currentTime: number,
): number {
  const start = dayjs(startAt).valueOf()
  const end = dayjs(endAt).valueOf()
  if (end <= start) return 0
  if (currentTime <= start) return 0
  if (currentTime >= end) return 1
  return (currentTime - start) / (end - start)
}

function getRemainingLabel(
  endAt: string,
  currentTime: number,
  phase: ActivityPhase,
): string | null {
  if (phase === 'ended') return null
  const end = dayjs(endAt).valueOf()
  if (currentTime >= end) return null
  const diffMs = end - currentTime
  const days = Math.floor(diffMs / (24 * 60 * 60_000))
  const hours = Math.floor((diffMs % (24 * 60 * 60_000)) / (60 * 60_000))
  if (days > 0) return `还剩 ${days} 天 ${hours} 小时`
  if (hours > 0) return `还剩 ${hours} 小时`
  const minutes = Math.max(Math.floor(diffMs / 60_000), 1)
  return `还剩 ${minutes} 分钟`
}

export type ActivityListShellProps = {
  defaultFilter?: string
  refreshKey?: number
}

function normalizeFilter(raw?: string): ActivityFilter {
  return raw === 'ended' ? 'ended' : 'ongoing'
}

export default function ActivityListShell({
  defaultFilter = 'ongoing',
  refreshKey = 0,
}: ActivityListShellProps) {
  const { session, authLoading, authError } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>(() =>
    normalizeFilter(defaultFilter),
  )
  const [items, setItems] = useState<AvailableActivityItem[]>([])
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [descExpandedIds, setDescExpandedIds] = useState<
    Record<string, boolean>
  >({})

  const pendingConfirm = isBrowseOnly(session)
  const canSubmit = canMutateBusiness(session)

  const filteredItems = useMemo(() => {
    return items.filter(
      (item) => getActivityPhase(item, currentTime) === selectedFilter,
    )
  }, [currentTime, items, selectedFilter])

  const fullCards = useMemo(() => {
    if (selectedFilter !== 'ongoing') return []
    return filteredItems
  }, [filteredItems, selectedFilter])

  const compactItems = useMemo(() => {
    if (selectedFilter === 'ongoing') return []
    return filteredItems
  }, [filteredItems, selectedFilter])

  const loadActivities = useCallback(
    async (options?: { pullDown?: boolean }) => {
      const pullDown = Boolean(options?.pullDown)
      if (useSessionStore.getState().authLoading) {
        if (!pullDown) setLoading(true)
        return
      }

      if (!pullDown) setLoading(true)
      setError(null)

      try {
        const existing = useSessionStore.getState().session
        if (existing?.mode === 'real' && existing.token) {
          void ensureAppSession().catch((e) => {
            console.warn('[ActivityListShell] 后台刷新登录态失败', e)
          })
        } else {
          await ensureAppSession()
        }
        const response = await getAvailableActivities()
        setItems(Array.isArray(response?.items) ? response.items : [])
        if (pullDown) {
          Taro.showToast({ title: '已帮你刷新活动', icon: 'success' })
        }
      } catch (requestError) {
        console.error('[ActivityListShell] 加载失败', requestError)
        const message = getErrorMessage(requestError, '活动列表加载失败')
        if (pullDown) {
          Taro.showToast({ title: message, icon: 'none' })
        } else {
          setError(message)
          setItems([])
        }
      } finally {
        if (!pullDown) setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (authLoading) return
    void loadActivities({ pullDown: refreshKey > 0 })
  }, [loadActivities, refreshKey, session?.token, authLoading])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  function openRecords(item: AvailableActivityItem) {
    const coverParam = item.coverUrl
      ? `&coverUrl=${encodeURIComponent(item.coverUrl)}`
      : ''
    void Taro.navigateTo({
      url: `/pages/activity-records/index?activityId=${item.id}&activityName=${encodeURIComponent(item.name)}${coverParam}`,
    })
  }

  function openSubmit(item: AvailableActivityItem) {
    const phase = getActivityPhase(item, currentTime)
    const inReportWindow = isActivityReportable(item, currentTime)
    if (!inReportWindow || phase === 'ended') return
    if (!canSubmit) {
      void Taro.showToast({
        title: pendingConfirm ? '运营确认后才可提报' : '当前还不能提报',
        icon: 'none',
      })
      return
    }
    void Taro.navigateTo({
      url: `/pages/submit/index?activityId=${item.id}`,
    })
  }

  function getActionLabel(item: AvailableActivityItem) {
    const phase = getActivityPhase(item, currentTime)
    const started = isActivityStarted(item, currentTime)
    if (phase === 'ended') return '已结束'
    if (!started) return '还没开始'
    if (!canSubmit) return pendingConfirm ? '等待确认' : '暂不可提报'
    return '去提报'
  }

  function toggleDesc(activityId: string) {
    setDescExpandedIds((prev) => ({
      ...prev,
      [activityId]: !prev[activityId],
    }))
  }

  function renderFeatureCard(item: AvailableActivityItem) {
    const phase = getActivityPhase(item, currentTime)
    const phaseText = getActivityPhaseText(phase)
    const started = isActivityStarted(item, currentTime)
    const inReportWindow = isActivityReportable(item, currentTime)
    const canReport = inReportWindow && canSubmit
    const description = item.description?.trim() || ''
    const progress = getTimeProgress(item.startAt, item.endAt, currentTime)
    const remaining = getRemainingLabel(item.endAt, currentTime, phase)
    const modeLabel =
      item.type.aggregationMode === 'daily' ? '按天累计' : '按场次统计'
    const phaseClass =
      phase === 'ongoing' ? styles.phaseOngoing : styles.phaseEnded
    const actionLabel = getActionLabel(item)
    const descOpen = Boolean(descExpandedIds[item.id])

    return (
      <View key={item.id} className={styles.featureCard}>
        <View className={styles.featureCardBody}>
          <View className={styles.featureCover}>
            {item.coverUrl ? (
              <Image
                className={styles.featureCoverImage}
                src={resolveAssetUrl(item.coverUrl)}
                mode="aspectFill"
              />
            ) : (
              <View className={styles.featureCoverPlaceholder}>
                <Text className={styles.featureCoverText}>进行中</Text>
              </View>
            )}
            <View className={styles.featureCoverFade} />
            <View className={styles.featureCoverBadges}>
              <Text className={`${styles.phasePill} ${phaseClass}`}>
                {phaseText}
              </Text>
            </View>
          </View>

          <View className={styles.featureBody}>
            <Text className={styles.featureTitle}>{item.name}</Text>

            <View className={styles.timeline}>
              <View className={styles.timelineLabels}>
                <Text className={styles.timelineTime}>
                  {formatDateTime(item.startAt)}
                </Text>
                <Text className={styles.timelineTime}>
                  {formatDateTime(item.endAt)}
                </Text>
              </View>
              <View className={styles.timelineTrack}>
                <View
                  className={styles.timelineFill}
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
                <View
                  className={styles.timelineDot}
                  style={{ left: `${Math.round(progress * 100)}%` }}
                />
              </View>
              <View className={styles.timelineMeta}>
                <Text className={styles.timelineHint}>开始</Text>
                {remaining ? (
                  <Text className={styles.timelineRemain}>{remaining}</Text>
                ) : (
                  <Text className={styles.timelineHint}>
                    {phase === 'ended' ? '已结束' : '进行中'}
                  </Text>
                )}
                <Text className={styles.timelineHint}>结束</Text>
              </View>
            </View>

            {!started && phase === 'ongoing' ? (
              <Text className={styles.countdown}>
                距开始还有 {formatCountdown(item.startAt, currentTime)}
              </Text>
            ) : null}

            {description ? (
              <View className={styles.descBlock}>
                <Text
                  className={`${styles.descText} ${
                    descOpen ? styles.descTextOpen : ''
                  }`}
                >
                  {description}
                </Text>
                {description.length > 48 ? (
                  <Text
                    className={styles.descToggle}
                    onClick={() => toggleDesc(item.id)}
                  >
                    {descOpen ? '收起' : '展开看看'}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View className={styles.chipRow}>
              <Text className={styles.infoChip}>{item.type.typeName}</Text>
              <Text className={styles.infoChip}>{modeLabel}</Text>
              {item.ruleCount > 0 ? (
                <Text className={styles.infoChip}>
                  {item.ruleCount} 条奖励规则
                </Text>
              ) : null}
            </View>
          </View>

          {/* 操作区上方虚线分割（票根感，无半圆缺口） */}
          <View className={styles.ticketTear} aria-hidden>
            <View className={styles.ticketDash} />
          </View>

          <View className={styles.featureActions}>
            <Button
              className={styles.actionSecondary}
              hoverClass="none"
              onClick={() => openRecords(item)}
            >
              本场记录
            </Button>
            <Button
              className={styles.actionPrimary}
              hoverClass="none"
              disabled={!canReport}
              onClick={() => openSubmit(item)}
            >
              {actionLabel}
            </Button>
          </View>
        </View>
      </View>
    )
  }

  /** 已结束：不可提报，轻卡 + 已结束标签 + 本场记录入口 */
  function renderEndedCard(item: AvailableActivityItem) {
    const modeLabel =
      item.type.aggregationMode === 'daily' ? '按天累计' : '按场次统计'
    const typeName = item.type.typeName

    return (
      <View
        key={item.id}
        className={styles.endedCard}
        onClick={() => openRecords(item)}
      >
        <View className={styles.endedMain}>
          <View className={styles.endedTop}>
            <Text className={styles.endedTag}>已结束</Text>
            {typeName ? (
              <Text className={styles.endedType}>{typeName}</Text>
            ) : null}
            <Text className={styles.endedMode}>{modeLabel}</Text>
          </View>
          <Text className={styles.endedName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text className={styles.endedTime} numberOfLines={1}>
            {formatDateTime(item.startAt)} – {formatDateTime(item.endAt)}
          </Text>
          {item.entrySummary ? (
            <Text className={styles.endedHint} numberOfLines={1}>
              {item.entrySummary}
            </Text>
          ) : null}
        </View>
        <Text className={styles.endedArrow}>›</Text>
      </View>
    )
  }

  function renderContent() {
    if (loading || (authLoading && !session)) {
      return <ListSkeleton rows={2} withCover />
    }
    if (authError && !session) {
      return (
        <StateBlock
          icon="error"
          title="暂时进不来"
          description={authError}
          actionText="再试一次"
          onAction={() => void loadActivities()}
        />
      )
    }
    if (error) {
      return (
        <StateBlock
          icon="error"
          title="活动加载失败"
          description={error}
          actionText="重新加载一下"
          onAction={() => void loadActivities()}
        />
      )
    }
    if (filteredItems.length === 0) {
      return (
        <StateBlock
          icon="empty"
          title={
            selectedFilter === 'ongoing'
              ? '暂时没有进行中的活动'
              : '还没有已结束的活动'
          }
        />
      )
    }

    return (
      <View className={styles.contentStack}>
        {fullCards.length > 0 ? (
          <View className={styles.fullList}>
            {fullCards.map((item) => renderFeatureCard(item))}
          </View>
        ) : null}

        {compactItems.length > 0 ? (
          <View
            className={`${styles.moreList} ${
              fullCards.length > 0 ? styles.moreListAfterFull : ''
            }`}
          >
            {compactItems.map((item) => renderEndedCard(item))}
          </View>
        ) : null}
      </View>
    )
  }

  const filterIndex = Math.max(
    0,
    FILTER_TABS.findIndex((t) => t.value === selectedFilter),
  )

  return (
    <View className={styles.sectionBlock}>
      <View className={styles.filterPanel}>
        {pendingConfirm ? (
          <View className={styles.readonlyBanner}>
            <Text className={styles.readonlyBannerText}>
              运营确认中 · 可以先逛逛
            </Text>
          </View>
        ) : null}

        <View className={styles.segBar}>
          <View
            className={styles.segPill}
            style={{
              width: `calc((100% - 16rpx) / ${FILTER_TABS.length})`,
              transform: `translateX(${filterIndex * 100}%)`,
            }}
          />
          {FILTER_TABS.map((tab) => {
            const active = selectedFilter === tab.value
            return (
              <View
                key={tab.value}
                className={styles.segItem}
                onClick={() => setSelectedFilter(tab.value)}
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

      <View className={styles.listInCard}>{renderContent()}</View>
    </View>
  )
}
