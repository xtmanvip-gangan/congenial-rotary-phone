import { Button, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import StateBlock from '@/components/StateBlock'
import StatusTag from '@/components/StatusTag'
import { ensureAppSession } from '@/services/auth'
import { previewRemoteImages } from '@/services/request'
import { getSubmissionDetail } from '@/services/submissions'
import type { SubmissionDetailResponse } from '@/types/submission'
import { formatDateTime, getGrantStatusText, getReviewStatusText } from '@/utils/format'
import styles from './index.module.scss'

export default function RecordDetailPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<SubmissionDetailResponse | null>(null)
  const recordId = useMemo(() => getCurrentInstance().router?.params?.recordId ?? '', [])

  async function loadDetail() {
    setLoading(true)
    setError(null)

    try {
      await ensureAppSession()
      const response = await getSubmissionDetail(recordId)
      setDetail(response)
    } catch (requestError) {
      console.error('[RecordDetail] 加载详情失败', requestError)
      setError(requestError instanceof Error ? requestError.message : '记录详情加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!recordId) {
      setLoading(false)
      setError('缺少记录编号，暂时无法打开详情。')
      return
    }

    void loadDetail()
  }, [recordId])

  if (loading) {
    return (
      <View className="pageShell">
        <StateBlock title="正在加载记录详情" description="系统正在恢复这条记录的完整内容。" />
      </View>
    )
  }

  if (error || !detail) {
    return (
      <View className="pageShell">
        <StateBlock
          title="记录打开失败"
          description={error || '这条记录暂时无法查看。'}
          actionText="返回记录页"
          onAction={() => {
            Taro.navigateBack({ delta: 1 })
          }}
        />
      </View>
    )
  }

  const { item } = detail
  const reviewTone =
    item.reviewStatus === 'approved' ? 'success' : item.reviewStatus === 'rejected' ? 'danger' : 'warning'
  const grantTone = item.grantStatus === 'granted' ? 'success' : 'neutral'
  const canEdit = item.reviewStatus !== 'approved' && item.grantStatus !== 'granted'

  return (
    <View className="pageShell">
      <View className="heroCard">
        <Text className="heroEyebrow">主播活动提报平台</Text>
        <Text className="heroTitle">记录详情</Text>
        <Text className="heroDesc">查看这次提报的完整内容、截图、审核状态和处理结果。</Text>
      </View>

      <View className="sectionStack">
        <View className="panelCard">
          <View className={styles.row}>
            <StatusTag text={item.activity.type.typeName} tone="brand" />
            {item.operatorAssignmentStatus === 'pending_confirmation' ? (
              <StatusTag text="归属待确认" tone="warning" />
            ) : null}
            <StatusTag text={getReviewStatusText(item.reviewStatus)} tone={reviewTone} />
            <StatusTag text={getGrantStatusText(item.grantStatus)} tone={grantTone} />
          </View>
          <Text className="panelTitle">{item.activity.name}</Text>
          <Text className="panelDesc">{item.rewardSummaryText}</Text>
        </View>

        <View className="panelCard">
          <Text className="panelTitle">基础信息</Text>
          <View className={styles.section}>
            <Text className={styles.line}>主播姓名：{item.anchorName}</Text>
            <Text className={styles.line}>固定运营：{item.operatorName}</Text>
            <Text className={styles.line}>
              直播时间：{item.liveDate} {item.liveStartTime}
            </Text>
            <Text className={styles.line}>活动时间：{formatDateTime(item.activity.startAt)} - {formatDateTime(item.activity.endAt)}</Text>
            {item.rejectReason ? <Text className={`${styles.line} errorText`}>驳回原因：{item.rejectReason}</Text> : null}
          </View>
        </View>

        <View className="panelCard">
          <Text className="panelTitle">本次填写内容</Text>
          <View className="chipList">
            {item.activity.formConfig.mode === 'gift_collection' && item.items.length > 0 ? (
              item.items.map((entry) => (
                <Text key={`${item.id}-${entry.itemName}`} className="chip">
                  {entry.itemName}：{entry.quantity}
                </Text>
              ))
            ) : item.pkValue != null ? (
              <Text className="chip">PK 值：{item.pkValue}</Text>
            ) : (
              <Text className="chip">暂无填写内容</Text>
            )}
          </View>
        </View>

        <View className="panelCard">
          <Text className="panelTitle">截图附件</Text>
          <View className={styles.attachmentList}>
            {item.attachments.length > 0 ? (
              item.attachments.map((attachment, index) => (
                <Button
                  key={attachment.id}
                  className={`secondaryButton ${styles.attachmentButton}`}
                  onClick={() => {
                    void previewRemoteImages(
                      item.attachments.map((entry) => entry.fileUrl),
                      attachment.fileUrl,
                    )
                  }}
                >
                  查看截图 {index + 1}
                </Button>
              ))
            ) : (
              <Text className="panelDesc">这条记录暂时没有截图。</Text>
            )}
          </View>
        </View>

        {canEdit ? (
          <Button
            className="primaryButton"
            onClick={() => {
              void Taro.navigateTo({
                url: `/pages/submit/index?recordId=${item.id}`,
              })
            }}
          >
            去修改记录
          </Button>
        ) : null}
      </View>
    </View>
  )
}
