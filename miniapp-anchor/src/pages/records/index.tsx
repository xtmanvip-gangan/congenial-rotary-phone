import { Button, Text, View } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useState } from 'react'
import StateBlock from '@/components/StateBlock'
import StatusTag from '@/components/StatusTag'
import { ensureAppSession } from '@/services/auth'
import { getMySubmissions } from '@/services/submissions'
import { useSessionStore } from '@/store/session'
import type { SubmissionRecordItem } from '@/types/submission'
import { formatDateTime, getGrantStatusText, getReviewStatusText } from '@/utils/format'
import styles from './index.module.scss'

export default function RecordsPage() {
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<SubmissionRecordItem[]>([])

  async function loadRecords(showToast = false) {
    setLoading(true)
    setError(null)

    try {
      await ensureAppSession()
      const response = await getMySubmissions()
      setItems(response.items)
      if (showToast) {
        Taro.showToast({ title: '记录已刷新', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[Records] 加载记录失败', requestError)
      setError(requestError instanceof Error ? requestError.message : '记录加载失败')
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }

  useEffect(() => {
    if (!hydrated) {
      return
    }

    void loadRecords()
  }, [hydrated])

  usePullDownRefresh(() => {
    void loadRecords(true)
  })

  return (
    <View className="pageShell">
      <View className="heroCard">
        <Text className="heroEyebrow">主播活动提报平台</Text>
        <Text className="heroTitle">我的记录</Text>
        <Text className="heroDesc">
          {session?.mode === 'mock'
            ? '这里展示的是预览记录样例，正式环境会同步你的真实提报记录。'
            : '审核状态、发放状态和驳回原因都会在这里集中查看。'}
        </Text>
      </View>

      <View className="sectionStack">
        {loading || (authLoading && !session) ? (
          <StateBlock icon="loading" title="正在加载记录" description="马上就好，系统正在整理您的提报数据。" />
        ) : authError && !session ? (
          <StateBlock
            icon="error"
            title="登录暂时失败"
            description={authError}
            actionText="重新尝试"
            onAction={() => {
              void loadRecords()
            }}
          />
        ) : error ? (
          <StateBlock
            icon="error"
            title="记录加载失败"
            description={error}
            actionText="重新加载"
            onAction={() => {
              void loadRecords()
            }}
          />
        ) : items.length === 0 ? (
          <StateBlock icon="empty" title="还没有提报记录" description="切换上方筛选标签，或者去活动大厅看看吧。" />
        ) : (
          items.map((item) => {
            const reviewTone =
              item.reviewStatus === 'approved'
                ? 'success'
                : item.reviewStatus === 'rejected'
                  ? 'danger'
                  : 'warning'
            const grantTone = item.grantStatus === 'granted' ? 'success' : 'neutral'
            const canEdit = item.reviewStatus !== 'approved' && item.grantStatus !== 'granted'

            return (
              <View key={item.id} className={`panelCard ${styles.recordCard}`}>
                <View className={styles.titleRow}>
                  <Text className={styles.title}>{item.activity.name}</Text>
                  <StatusTag text={item.activity.typeName} tone="brand" />
                  {item.operatorAssignmentStatus === 'pending_confirmation' ? (
                    <StatusTag text="归属待确认" tone="warning" />
                  ) : null}
                  <StatusTag text={getReviewStatusText(item.reviewStatus)} tone={reviewTone} />
                  <StatusTag text={getGrantStatusText(item.grantStatus)} tone={grantTone} />
                </View>

                <View className={styles.infoBlock}>
                  <Text className={styles.infoLine}>
                    直播时间：{item.liveDate} {item.liveStartTime}
                  </Text>
                  <Text className={styles.infoLine}>运营老师：{item.operatorName}</Text>
                  <Text className={styles.infoLine}>提交时间：{formatDateTime(item.createdAt)}</Text>
                  <Text className={styles.infoLine}>命中奖励：{item.rewardSummaryText}</Text>
                  {item.rejectReason ? (
                    <Text className={`${styles.infoLine} errorText`}>驳回原因：{item.rejectReason}</Text>
                  ) : null}
                </View>

                <View className={styles.actionRow}>
                  <Button
                    className={`secondaryButton ${styles.actionButton}`}
                    onClick={() => {
                      void Taro.navigateTo({
                        url: `/pages/record-detail/index?recordId=${item.id}`,
                      })
                    }}
                  >
                    查看详情
                  </Button>
                  {canEdit ? (
                    <Button
                      className={`primaryButton ${styles.actionButton}`}
                      onClick={() => {
                        void Taro.navigateTo({
                          url: `/pages/submit/index?recordId=${item.id}`,
                        })
                      }}
                    >
                      修改记录
                    </Button>
                  ) : null}
                </View>
              </View>
            )
          })
        )}
      </View>
    </View>
  )
}
