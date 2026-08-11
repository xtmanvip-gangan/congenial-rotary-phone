import { Button, Image, Text, View } from '@tarojs/components'
import Taro, {
  getCurrentInstance,
  usePageScroll,
  usePullDownRefresh,
} from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import ListSkeleton from '@/components/ListSkeleton'
import StateBlock from '@/components/StateBlock'
import StatusTag from '@/components/StatusTag'
import { getActivityDetail } from '@/services/activities'
import { ensureAppSession } from '@/services/auth'
import { getErrorMessage, resolveAssetUrl } from '@/services/request'
import { getMySubmissions } from '@/services/submissions'
import { useSessionStore } from '@/store/session'
import type { SubmissionRecordItem } from '@/types/submission'
import { canMutateBusiness } from '@/utils/capability'
import { getSubmissionListStatusMeta } from '@/utils/format'
import {
  BRAND_NAV_FADE_RANGE,
  brandNavBackground,
  brandNavTitleColor,
} from '@/utils/brand-nav'
import styles from './index.module.scss'

/**
 * 本场提报记录
 * 从「提报记录」或活动列表进入：只展示当前活动下的每次提报
 * 封面：优先路由 coverUrl；缺失时拉活动详情补全（避免无封面 Hero 误显）
 */

function decodeParam(value: string | undefined) {
  if (!value) return ''
  try {
    // 部分端会二次 encode，尽量解到可读 URL
    let out = value
    for (let i = 0; i < 2; i += 1) {
      const next = decodeURIComponent(out)
      if (next === out) break
      out = next
    }
    return out
  } catch {
    return value
  }
}

/** 待审核 / 已驳回可改；已通过 / 已发放不可改 */
function canEditRecord(
  item: SubmissionRecordItem,
  canMutate: boolean,
): boolean {
  if (!canMutate) return false
  if (item.grantStatus === 'granted') return false
  if (item.reviewStatus === 'approved') return false
  return true
}

function isTodoItem(item: SubmissionRecordItem) {
  return item.reviewStatus === 'pending' || item.reviewStatus === 'rejected'
}

function buildGiftLine(item: SubmissionRecordItem): string {
  const isPk = item.activity.typeCode === 'pk_score'
  if (isPk && item.pkValue != null) {
    return `PK ${item.pkValue}`
  }
  if (item.items?.length) {
    const text = item.items
      .map((e) => `${e.itemName}×${e.quantity}`)
      .join('；')
    return text.length > 28 ? `${text.slice(0, 28)}…` : text
  }
  return '—'
}

function buildRewardLine(item: SubmissionRecordItem): string {
  if (!item.rewardSummaryText) return '奖励待揭晓'
  const t = item.rewardSummaryText
  const body = t.length > 24 ? `${t.slice(0, 24)}…` : t
  return `奖励 · ${body}`
}

type DayGroup = {
  liveDate: string
  items: SubmissionRecordItem[]
}

export default function ActivityRecordsPage() {
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const params = useMemo(() => getCurrentInstance().router?.params ?? {}, [])
  const activityId = params.activityId ?? ''
  const routeActivityName = decodeParam(params.activityName)
  const routeCoverUrl = decodeParam(params.coverUrl)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<SubmissionRecordItem[]>([])
  /** 路由可能不带封面（从「我的提报」进入），详情接口补全 */
  const [activityName, setActivityName] = useState(routeActivityName)
  const [coverUrl, setCoverUrl] = useState(routeCoverUrl)
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const contentTopGapPx = Math.round(
    (30 * (Taro.getSystemInfoSync().windowWidth || 375)) / 750,
  )
  const canMutate = canMutateBusiness(session)

  const stats = useMemo(() => {
    const total = items.length
    const pending = items.filter((i) => i.reviewStatus === 'pending').length
    const rejected = items.filter((i) => i.reviewStatus === 'rejected').length
    const todo = items.filter(isTodoItem).length
    const done = total - todo
    return { total, pending, rejected, todo, done }
  }, [items])

  const dayGroups = useMemo((): DayGroup[] => {
    const map = new Map<string, SubmissionRecordItem[]>()
    for (const item of items) {
      const key = item.liveDate || '未知日期'
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    const groups = Array.from(map.entries()).map(([liveDate, list]) => {
      const sorted = [...list].sort((a, b) => {
        const ta = `${a.liveStartTime || ''} ${a.createdAt || ''}`
        const tb = `${b.liveStartTime || ''} ${b.createdAt || ''}`
        return tb.localeCompare(ta)
      })
      return { liveDate, items: sorted }
    })
    groups.sort((a, b) => b.liveDate.localeCompare(a.liveDate))
    return groups
  }, [items])

  async function loadRecords(options?: {
    pullDown?: boolean
    showToast?: boolean
  }) {
    const pullDown = Boolean(options?.pullDown)
    if (!activityId) {
      setItems([])
      setError('活动信息不太完整，请返回上一页重新进入')
      setLoading(false)
      if (pullDown) Taro.stopPullDownRefresh()
      return
    }

    if (!pullDown) setLoading(true)
    setError(null)

    try {
      await ensureAppSession()
      // 列表与活动详情并行：补封面 / 活动名，避免有封面却落成无封面 Hero
      const [submissionsResult, detailResult] = await Promise.allSettled([
        getMySubmissions(activityId),
        getActivityDetail(activityId),
      ])

      if (submissionsResult.status === 'fulfilled') {
        setItems(submissionsResult.value.items)
      } else {
        throw submissionsResult.reason
      }

      if (detailResult.status === 'fulfilled') {
        const detail = detailResult.value.item
        if (detail?.name) {
          setActivityName((prev) => prev || detail.name)
        }
        if (detail?.coverUrl) {
          setCoverUrl((prev) => prev || detail.coverUrl || '')
        }
      } else {
        console.warn(
          '[ActivityRecords] 活动详情加载失败，封面可能缺失',
          detailResult.reason,
        )
      }

      if (options?.showToast) {
        Taro.showToast({ title: '已帮你刷新记录', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[ActivityRecords] 加载记录失败', requestError)
      setError(getErrorMessage(requestError, '记录加载失败'))
    } finally {
      if (!pullDown) setLoading(false)
      if (pullDown) Taro.stopPullDownRefresh()
    }
  }

  useEffect(() => {
    // 切换活动时先用路由参数，详情返回后再补封面
    setActivityName(routeActivityName)
    setCoverUrl(routeCoverUrl)
  }, [activityId, routeActivityName, routeCoverUrl])

  useEffect(() => {
    if (!hydrated) return
    void loadRecords()
  }, [activityId, hydrated])

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

  const navBackground = brandNavBackground(navProgress)
  const navTitleColor = brandNavTitleColor(navProgress)
  const navTitle = activityName || '本场记录'

  function openDetail(id: string) {
    void Taro.navigateTo({
      url: `/pages/record-detail/index?recordId=${id}`,
    })
  }

  function openEdit(id: string) {
    void Taro.navigateTo({
      url: `/pages/submit/index?recordId=${id}`,
    })
  }

  function renderStatusBlock(variant: 'inHero' | 'card') {
    if (items.length === 0) return null
    const hasTodo = stats.todo > 0
    const title = hasTodo
      ? `还有 ${stats.todo} 条需要你处理`
      : '本场都很顺利，没有待办'
    const rootClass =
      variant === 'inHero'
        ? `${styles.statusBlock} ${
            hasTodo ? styles.statusBlockTodo : styles.statusBlockOk
          }`
        : `${styles.statusCard} ${
            hasTodo ? styles.statusCardTodo : styles.statusCardOk
          }`

    return (
      <View className={rootClass}>
        <Text
          className={
            variant === 'inHero' ? styles.statusTitle : styles.statusTitle
          }
        >
          {title}
        </Text>
        <View className={styles.statusChips}>
          <Text className={styles.statusChip}>一共 {stats.total} 条</Text>
          {stats.pending > 0 ? (
            <Text
              className={`${styles.statusChip} ${styles.statusChipWarn}`}
            >
              审核中 {stats.pending}
            </Text>
          ) : null}
          {stats.rejected > 0 ? (
            <Text
              className={`${styles.statusChip} ${styles.statusChipError}`}
            >
              已驳回 {stats.rejected}
            </Text>
          ) : null}
          <Text className={`${styles.statusChip} ${styles.statusChipOk}`}>
            已完结 {stats.done}
          </Text>
        </View>
      </View>
    )
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
          actionText="返回上一页"
          onAction={() => {
            void Taro.navigateBack({ delta: 1 })
          }}
        />
      )
    }
    if (items.length === 0) {
      return (
        <StateBlock
          icon="empty"
          title="本场还没有提报"
          actionText="返回上一页"
          onAction={() => {
            void Taro.navigateBack({ delta: 1 })
          }}
        />
      )
    }

    return (
      <View className={styles.timeline}>
        {dayGroups.map((group) => (
          <View key={group.liveDate} className={styles.dayGroup}>
            <View className={styles.dayHeader}>
              <Text className={styles.dayDate}>{group.liveDate}</Text>
              <Text className={styles.dayCount}>
                {group.items.length} 次提报
              </Text>
            </View>
            <View className={styles.dayList}>
              {group.items.map((item) => {
                const editable = canEditRecord(item, canMutate)
                const st = getSubmissionListStatusMeta(item)
                const rejected = item.reviewStatus === 'rejected'
                const pending = item.reviewStatus === 'pending'
                return (
                  <View
                    key={item.id}
                    className={`${styles.row} ${
                      rejected ? styles.rowReject : ''
                    }`}
                    onClick={() => openDetail(item.id)}
                  >
                    <View className={styles.rowMain}>
                      <View className={styles.rowTop}>
                        <View className={styles.timeMark}>
                          <View
                            className={`${styles.timeBar} ${
                              rejected
                                ? styles.timeBarReject
                                : pending
                                  ? styles.timeBarPending
                                  : ''
                            }`}
                          />
                          <Text className={styles.rowTime}>
                            {item.liveStartTime || '--:--'}
                          </Text>
                        </View>
                        <StatusTag text={st.text} tone={st.tone} />
                      </View>
                      <Text className={styles.rowSummary} numberOfLines={1}>
                        {buildGiftLine(item)}
                      </Text>
                      {item.rejectReason ? (
                        <Text
                          className={styles.rowRejectText}
                          numberOfLines={2}
                        >
                          驳回原因：{item.rejectReason}
                        </Text>
                      ) : (
                        <Text className={styles.rowSub} numberOfLines={1}>
                          {buildRewardLine(item)}
                        </Text>
                      )}
                    </View>
                    <View className={styles.rowSide}>
                      {editable ? (
                        <Button
                          className={styles.rowEdit}
                          hoverClass="none"
                          onClick={(e) => {
                            e.stopPropagation?.()
                            openEdit(item.id)
                          }}
                        >
                          {rejected ? '重新提交' : '修改提报'}
                        </Button>
                      ) : (
                        <Text className={styles.rowArrow}>›</Text>
                      )}
                    </View>
                  </View>
                )
              })}
            </View>
          </View>
        ))}
      </View>
    )
  }

  const showStatus = !loading && items.length > 0
  const displayName = activityName || routeActivityName || '本场提报记录'
  const hasCover = Boolean(coverUrl && coverUrl.trim())

  return (
    <PageShell
      className={styles.page}
      backgroundColor="#EEF1F6"
      backgroundTextStyle="dark"
    >
      <View className={styles.pageWash} />
      <PageNav
        title={navTitle}
        showBack
        background={navBackground}
        titleColor={navTitleColor}
        backIconColor={navTitleColor}
        titleOpacity={1}
      />
      <View
        className={styles.content}
        style={{ paddingTop: `${contentTopGapPx}px` }}
      >
        <View className={styles.stack}>
          {hasCover ? (
            <>
              <View className={styles.heroCover}>
                <Image
                  className={styles.heroCoverImage}
                  src={resolveAssetUrl(coverUrl)}
                  mode="aspectFill"
                />
                <View className={styles.heroCoverFade} />
                <Text className={styles.heroCoverTitle}>{displayName}</Text>
              </View>
              {showStatus ? renderStatusBlock('card') : null}
            </>
          ) : (
            <View className={styles.heroCard}>
              <Text className={styles.heroTitle}>{displayName}</Text>
              {showStatus ? renderStatusBlock('inHero') : null}
            </View>
          )}

          {renderList()}
        </View>
      </View>
    </PageShell>
  )
}
