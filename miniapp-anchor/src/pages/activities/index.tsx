import { Button, ScrollView, Text, View, Image } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import StateBlock from '@/components/StateBlock'
import StatusTag from '@/components/StatusTag'
import { ensureAppSession } from '@/services/auth'
import { getAvailableActivities } from '@/services/activities'
import { resolveAssetUrl } from '@/services/request'
import { useSessionStore } from '@/store/session'
import type { AvailableActivityItem } from '@/types/activity'
import { formatCountdown, formatDateTime, getActivityPhase, getActivityPhaseText, type ActivityPhase } from '@/utils/format'
import styles from './index.module.scss'

type ActivityFilter = 'all' | ActivityPhase

const filterOptions: Array<{ label: string; value: ActivityFilter }> = [
  { label: '全部', value: 'all' },
  { label: '未开始', value: 'upcoming' },
  { label: '进行中', value: 'ongoing' },
  { label: '已结束', value: 'ended' },
]

export default function ActivitiesPage() {
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFilter, setSelectedFilter] = useState<ActivityFilter>('all')
  const [items, setItems] = useState<AvailableActivityItem[]>([])
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedFilter === 'all') {
        return true
      }

      return getActivityPhase(item, currentTime) === selectedFilter
    })
  }, [currentTime, items, selectedFilter])

  async function loadActivities(showToast = false) {
    setLoading(true)
    setError(null)

    try {
      await ensureAppSession()
      const response = await getAvailableActivities()
      setItems(response.items)
      if (showToast) {
        Taro.showToast({ title: '活动已刷新', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[Activities] 加载活动失败', requestError)
      setError(requestError instanceof Error ? requestError.message : '活动列表加载失败')
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }

  useEffect(() => {
    if (!hydrated) {
      return
    }

    void loadActivities()
  }, [hydrated])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now())
    }, 60_000)

    return () => {
      clearInterval(timer)
    }
  }, [])

  usePullDownRefresh(() => {
    void loadActivities(true)
  })

  return (
    <View className="pageShell">
      <View className="heroCard">
        <Text className="heroEyebrow">主播活动提报平台</Text>
        <Text className="heroTitle">你好，{session?.user.name || '主播'}</Text>
        <Text className="heroDesc">
          {session?.mode === 'mock'
            ? '当前是预览模式，界面和流程可体验，正式环境会自动走企业微信登录。'
            : '进行中的活动会直接显示提报入口。'}
        </Text>
      </View>

      <View className="sectionStack">
        <View className="panelCard">
          <Text className="panelTitle">活动筛选</Text>
          <Text className="panelDesc">按活动状态快速筛选，进入进行中活动就能直接提报。</Text>
          <ScrollView scrollX className={styles.filterBar}>
            <View className={styles.filterInner}>
              {filterOptions.map((option) => {
                const isActive = option.value === selectedFilter
                return (
                  <Button
                    key={option.value}
                    className={`${styles.filterButton} ${isActive ? styles.filterButtonActive : ''}`}
                    onClick={() => setSelectedFilter(option.value)}
                  >
                    <Text className={styles.filterButtonText}>{option.label}</Text>
                  </Button>
                )
              })}
            </View>
          </ScrollView>
        </View>

        {loading || (authLoading && !session) ? (
          <StateBlock icon="loading" title="正在加载活动" description="马上就好，系统正在整理可参与的活动。" />
        ) : authError && !session ? (
          <StateBlock
            icon="error"
            title="登录暂时失败"
            description={authError}
            actionText="重新尝试"
            onAction={() => {
              void loadActivities()
            }}
          />
        ) : error ? (
          <StateBlock
            icon="error"
            title="活动加载失败"
            description={error}
            actionText="重新加载"
            onAction={() => {
              void loadActivities()
            }}
          />
        ) : filteredItems.length === 0 ? (
          <StateBlock icon="empty" title="当前没有符合条件的活动" description="切换上方筛选标签，或者稍后再来看看。" />
        ) : (
          filteredItems.map((item) => {
            const phase = getActivityPhase(item, currentTime)
            const phaseText = getActivityPhaseText(phase)
            const phaseTone =
              phase === 'ongoing' ? 'success' : phase === 'upcoming' ? 'brand' : 'neutral'

            return (
              <View key={item.id} className={`panelCard ${styles.card}`}>
                <View>
                  {item.coverUrl ? (
                    <Image
                      className={styles.coverImage}
                      src={resolveAssetUrl(item.coverUrl)}
                      mode="aspectFill"
                    />
                  ) : null}
                  <View className={styles.titleRow}>
                    <Text className={styles.title}>{item.name}</Text>
                    <StatusTag text={item.type.typeName} tone="brand" />
                    <StatusTag text={phaseText} tone={phaseTone} />
                  </View>
                  <Text className={styles.timeLine}>
                    {formatDateTime(item.startAt)} - {formatDateTime(item.endAt)}
                  </Text>
                  {phase === 'upcoming' ? (
                    <Text className="panelDesc">距离开始还有：{formatCountdown(item.startAt, currentTime)}</Text>
                  ) : null}
                  {item.description ? <Text className={styles.desc}>{item.description}</Text> : null}
                </View>

                <View className={styles.metaRow}>
                  <Text className="chip">活动类型：{item.type.typeName}</Text>
                  <Text className="chip">统计方式：{item.type.aggregationMode === 'daily' ? '按天累计' : '按场次统计'}</Text>
                </View>

                <View className={styles.actionRow}>
                  <Button
                    className={`secondaryButton ${styles.actionButton}`}
                    onClick={() => {
                      const coverParam = item.coverUrl ? `&coverUrl=${encodeURIComponent(item.coverUrl)}` : ''
                      void Taro.navigateTo({
                        url: `/pages/activity-records/index?activityId=${item.id}&activityName=${encodeURIComponent(item.name)}${coverParam}`,
                      })
                    }}
                  >
                    看我的记录
                  </Button>
                  <Button
                    className={`primaryButton ${styles.actionButton}`}
                    disabled={phase !== 'ongoing'}
                    onClick={() => {
                      if (phase !== 'ongoing') {
                        return
                      }

                      void Taro.navigateTo({
                        url: `/pages/submit/index?activityId=${item.id}`,
                      })
                    }}
                  >
                    {phase === 'ongoing' ? '立即提报' : phase === 'upcoming' ? '未开始' : '已结束'}
                  </Button>
                </View>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}
