import { Button, Text, View, Image } from '@tarojs/components'
import Taro, { getCurrentInstance, usePullDownRefresh } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import StateBlock from '@/components/StateBlock'
import StatusTag from '@/components/StatusTag'
import { ensureAppSession } from '@/services/auth'
import { getMySubmissions } from '@/services/submissions'
import { resolveAssetUrl } from '@/services/request'
import { useSessionStore } from '@/store/session'
import type { SubmissionRecordItem } from '@/types/submission'
import { formatDateTime, getGrantStatusText, getReviewStatusText } from '@/utils/format'
import styles from './index.module.scss'

function decodeParam(value: string | undefined) {
  if (!value) {
    return ''
  }

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export default function ActivityRecordsPage() {
  const { session, authLoading, authError, hydrated } = useSessionStore()
  const params = useMemo(() => getCurrentInstance().router?.params ?? {}, [])
  const activityId = params.activityId ?? ''
  const activityName = decodeParam(params.activityName)
  const coverUrl = decodeParam(params.coverUrl)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<SubmissionRecordItem[]>([])

  async function loadRecords(showToast = false) {
    if (!activityId) {
      setItems([])
      setError('当前活动信息不完整，请返回活动列表重新进入。')
      setLoading(false)
      Taro.stopPullDownRefresh()
      return
    }

    setLoading(true)
    setError(null)

    try {
      await ensureAppSession()
      const response = await getMySubmissions(activityId)
      setItems(response.items)
      if (showToast) {
        Taro.showToast({ title: '记录已刷新', icon: 'success' })
      }
    } catch (requestError) {
      console.error('[ActivityRecords] 加载记录失败', requestError)
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
  }, [activityId, hydrated])

  usePullDownRefresh(() => {
    void loadRecords(true)
  })

  return (
    <View className="pageShell">
      {coverUrl ? (
        <View className={styles.heroCover}>
          <Image
            className={styles.heroCoverImage}
            src={resolveAssetUrl(coverUrl)}
            mode="aspectFill"
          />
          <View className={styles.heroCoverOverlay}>
            <Text className={styles.heroCoverTitle}>{activityName || '活动记录'}</Text>
          </View>
        </View>
      ) : (
        <View className="heroCard">
          <Text className="heroEyebrow">主播活动提报平台</Text>
          <Text className="heroTitle">{activityName ? `${activityName}记录` : '活动记录'}</Text>
          <Text className="heroDesc">
            {session?.mode === 'mock'
              ? '这里展示当前活动的预览记录样例，正式环境会同步你的真实提报记录。'
              : '该活动的记录和进度会显示在这里。'}
          </Text>
        </View>
      )}

      <View className="sectionStack">
        {loading || (authLoading && !session) ? (
          <StateBlock icon="loading" title="正在加载活动记录" description="系统正在同步当前活动的提报记录，请稍等。" />
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
            actionText="返回活动列表"
            onAction={() => {
              Taro.navigateBack({ delta: 1 })
            }}
          />
        ) : items.length === 0 ? (
          <StateBlock
            icon="empty"
            title="当前活动还没有提交记录"
            description="完成提报后，记录会显示在这里。"
            actionText="返回活动列表"
            onAction={() => {
              Taro.navigateBack({ delta: 1 })
            }}
          />
        ) : (
          items.map((item) => {
            const reviewTone =
              item.reviewStatus === 'approved'
                ? 'success'
                : item.reviewStatus === 'rejected'
                  ? 'error'
                  : 'warning'
            const grantTone = item.grantStatus === 'granted' ? 'success' : 'neutral'
            const canEdit = item.reviewStatus !== 'approved' && item.grantStatus !== 'granted'

            return (
              <View key={item.id} className={`panelCard ${styles.recordCard}`}>
                <View className={styles.titleRow}>
                  <Text className={styles.title}>{item.activity.name}</Text>
                  <StatusTag text={item.activity.typeName} tone="brand" />
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
