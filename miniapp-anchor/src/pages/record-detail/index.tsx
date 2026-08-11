import { Button, Image, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance, usePageScroll } from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import StatusTag from '@/components/StatusTag'
import heroDetailIcon from '@/assets/page-hero/record-detail.png'
import { ensureAppSession } from '@/services/auth'
import { previewRemoteImages, resolveAssetUrl } from '@/services/request'
import {
  getSubmissionDetail,
  previewSubmission,
} from '@/services/submissions'
import { useSessionStore } from '@/store/session'
import type { RewardRuleReference } from '@/types/activity'
import type { SubmissionDetailResponse } from '@/types/submission'
import { canMutateBusiness } from '@/utils/capability'
import {
  formatDateTime,
  getGrantStatusMeta,
  getReviewStatusMeta,
} from '@/utils/format'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'
import styles from './index.module.scss'

/**
 * 提报详情
 * 无封面海报；顶区氛围 + 缺省图标压在状态卡上
 */

export default function RecordDetailPage() {
  const session = useSessionStore((s) => s.session)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<SubmissionDetailResponse | null>(null)
  /** 与提报页「奖励预览」同结构的命中列表 */
  const [matchedRewards, setMatchedRewards] = useState<RewardRuleReference[]>(
    [],
  )
  const [navProgress, setNavProgress] = useState(0)
  const navProgressRef = useRef(0)
  const recordId = useMemo(
    () => getCurrentInstance().router?.params?.recordId ?? '',
    [],
  )
  const contentTopGapPx = Math.round(
    (30 * (Taro.getSystemInfoSync().windowWidth || 375)) / 750,
  )

  async function loadDetail() {
    setLoading(true)
    setError(null)
    setMatchedRewards([])

    try {
      await ensureAppSession()
      const response = await getSubmissionDetail(recordId)
      setDetail(response)

      const detailItem = response.item
      try {
        const preview = await previewSubmission({
          activityId: detailItem.activity.id,
          submissionId: detailItem.id,
          liveDate: detailItem.liveDate,
          items: detailItem.items?.length ? detailItem.items : undefined,
          pkValue:
            detailItem.pkValue != null ? Number(detailItem.pkValue) : undefined,
        })
        setMatchedRewards(preview.matchedRewards ?? [])
      } catch (previewError) {
        console.warn('[RecordDetail] 奖励明细预览失败', previewError)
        setMatchedRewards([])
      }
    } catch (requestError) {
      console.error('[RecordDetail] 加载详情失败', requestError)
      setError(
        requestError instanceof Error
          ? requestError.message
          : '记录详情加载失败',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!recordId) {
      setLoading(false)
      setError('缺少记录编号，暂时无法打开详情')
      return
    }
    void loadDetail()
  }, [recordId])

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
  const navIconColor = brandNavTitleColor(navProgress)

  function renderShell(body: ReactNode, options?: { noBar?: boolean }) {
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
          className={`${styles.content} ${
            options?.noBar ? styles.contentNoBar : ''
          }`}
          style={{ paddingTop: `${contentTopGapPx}px` }}
        >
          {body}
        </View>
      </PageShell>
    )
  }

  if (loading) {
    return renderShell(
      <StateBlock icon="loading" title="正在打开这条提报…" />,
      { noBar: true },
    )
  }

  if (error || !detail) {
    return renderShell(
      <StateBlock
        icon="error"
        title="暂时打不开"
        description={error || '请返回后重新打开'}
        actionText="返回上一页"
        onAction={() => {
          void Taro.navigateBack({ delta: 1 })
        }}
      />,
      { noBar: true },
    )
  }

  const { item } = detail
  const reviewMeta = getReviewStatusMeta(item.reviewStatus)
  const grantMeta = getGrantStatusMeta(item.grantStatus)
  const canEdit =
    canMutateBusiness(session) &&
    item.reviewStatus !== 'approved' &&
    item.grantStatus !== 'granted'
  const activityName = item.activity?.name || '活动提报'
  const liveLine = `${item.liveDate} ${item.liveStartTime || ''}`.trim()
  /** 顶区：仅活动周期时间，无前缀文案 */
  const activityPeriodLine = `${formatDateTime(item.activity.startAt)} – ${formatDateTime(item.activity.endAt)}`
  /** 本场信息：提报时间 */
  const submitTimeLine = item.createdAt
    ? formatDateTime(item.createdAt)
    : liveLine
  const hasMatched = matchedRewards.length > 0
  const rejected = item.reviewStatus === 'rejected'
  const statusCardTone = rejected
    ? styles.statusCardReject
    : hasMatched ||
        item.reviewStatus === 'approved' ||
        item.grantStatus === 'granted'
      ? styles.statusCardOk
      : ''

  const formMode = item.activity?.formConfig?.mode
  const metricUnit = item.activity?.type?.metricUnit || ''
  const filledContent =
    formMode === 'gift_collection' && item.items.length > 0 ? (
      item.items.map((entry) => (
        <Text key={`${item.id}-${entry.itemName}`} className={styles.chip}>
          {entry.itemName} × {entry.quantity}
        </Text>
      ))
    ) : item.pkValue != null ? (
      <Text className={styles.chip}>本场 PK · {item.pkValue}</Text>
    ) : (
      <Text className={`${styles.chip} ${styles.chipMuted}`}>暂无填写内容</Text>
    )

  return renderShell(
    <>
      <View className={styles.stack}>
        <View className={styles.heroStack}>
          <View className={styles.heroCopy}>
            <Text className={styles.heroEyebrow}>提报详情</Text>
            <Text className={styles.heroTitle}>{activityName}</Text>
            <Text className={styles.heroLive}>{activityPeriodLine}</Text>
          </View>

          <View className={styles.statusWrap}>
            <View className={`${styles.statusCard} ${statusCardTone}`}>
              <View className={styles.tagRow}>
                {item.activity?.type?.typeName ? (
                  <StatusTag text={item.activity.type.typeName} tone="brand" />
                ) : null}
                {item.operatorAssignmentStatus === 'pending_confirmation' ? (
                  <StatusTag text="归属待确认" tone="warning" />
                ) : null}
                <StatusTag text={reviewMeta.text} tone={reviewMeta.tone} />
                <StatusTag text={grantMeta.text} tone={grantMeta.tone} />
              </View>

              {/* 与提报页「奖励预览」同结构 */}
              <View
                className={`${styles.rewardBlock} ${
                  hasMatched ? styles.rewardBlockHit : ''
                }`}
              >
                <Text className={styles.rewardLabel}>命中奖励</Text>
                {hasMatched ? (
                  <>
                    <Text className={styles.rewardTitle}>
                      已命中 {matchedRewards.length} 档奖励
                    </Text>
                    <View className={styles.resultList}>
                      {matchedRewards.map((rule, index) => {
                        const formula = rule.rangeLabel
                          ? `${rule.rangeLabel}=${rule.rewardLabel}`
                          : rule.compareMode === 'eq'
                            ? `=${rule.threshold}${metricUnit}=${rule.rewardLabel}`
                            : rule.maxThreshold != null
                              ? `${rule.threshold}–${rule.maxThreshold}${metricUnit}=${rule.rewardLabel}`
                              : `≥${rule.threshold}${metricUnit}=${rule.rewardLabel}`
                        return (
                          <View
                            key={`${rule.itemName || 'reward'}-${index}`}
                            className={styles.resultHitRow}
                          >
                            <Text className={styles.resultHitName}>
                              {rule.itemName ||
                                (formMode === 'pk_score' ? 'PK' : '奖励')}
                            </Text>
                            <Text className={styles.resultHitFormula}>
                              {formula}
                            </Text>
                            {/* 右侧：获得奖励个数（每档命中 1 份） */}
                            <Text className={styles.resultHitQty}>1个</Text>
                          </View>
                        )
                      })}
                    </View>
                  </>
                ) : (
                  <Text className={styles.rewardEmpty}>
                    {item.rewardSummaryText?.trim() ||
                      (item.reviewStatus === 'pending'
                        ? '已提交，等待审核确认'
                        : '暂未命中奖励')}
                  </Text>
                )}
              </View>

              {item.rejectReason ? (
                <View className={styles.rejectBlock}>
                  <Text className={styles.rejectText}>
                    驳回原因：{item.rejectReason}
                  </Text>
                </View>
              ) : null}
            </View>

            <View className={styles.heroVisual}>
              <View className={styles.heroIconGlow} />
              <Image
                className={styles.heroIcon}
                src={heroDetailIcon}
                mode="aspectFit"
              />
            </View>
          </View>
        </View>

        <View className={styles.panel}>
          <View className={styles.panelHead}>
            <Text className={styles.panelTitle}>本场信息</Text>
          </View>
          <View className={styles.infoList}>
            <View className={styles.infoRow}>
              <Text className={styles.infoLabel}>主播</Text>
              <Text className={styles.infoValue}>{item.anchorName}</Text>
            </View>
            <View className={styles.infoRow}>
              <Text className={styles.infoLabel}>运营老师</Text>
              <Text className={styles.infoValue}>{item.operatorName}</Text>
            </View>
            <View className={styles.infoRow}>
              <Text className={styles.infoLabel}>直播时间</Text>
              <Text className={styles.infoValue}>{liveLine}</Text>
            </View>
            <View className={styles.infoRow}>
              <Text className={styles.infoLabel}>提报时间</Text>
              <Text className={styles.infoValue}>{submitTimeLine}</Text>
            </View>
          </View>
        </View>

        <View className={styles.panel}>
          <View className={styles.panelHead}>
            <Text className={styles.panelTitle}>本次填写</Text>
          </View>
          <View className={styles.chipList}>{filledContent}</View>
        </View>

        <View className={styles.panel}>
          <View className={styles.panelHead}>
            <Text className={styles.panelTitle}>截图附件</Text>
            {item.attachments.length > 0 ? (
              <Text className={styles.panelMeta}>
                共 {item.attachments.length} 张
              </Text>
            ) : null}
          </View>
          {item.attachments.length > 0 ? (
            <View className={styles.shotGrid}>
              {item.attachments.map((attachment) => (
                <View
                  key={attachment.id}
                  className={styles.shotItem}
                  onClick={() => {
                    void previewRemoteImages(
                      item.attachments.map((entry) => entry.fileUrl),
                      attachment.fileUrl,
                    )
                  }}
                >
                  <Image
                    className={styles.shotImage}
                    src={resolveAssetUrl(attachment.fileUrl)}
                    mode="aspectFill"
                  />
                </View>
              ))}
            </View>
          ) : (
            <Text className={styles.emptyHint}>还没有上传截图</Text>
          )}
        </View>
      </View>

      {canEdit ? (
        <View className={styles.footerBar}>
          <Button
            className={styles.editBtn}
            hoverClass="none"
            onClick={() => {
              void Taro.navigateTo({
                url: `/pages/submit/index?recordId=${item.id}`,
              })
            }}
          >
            {item.reviewStatus === 'rejected' ? '重新提交' : '修改提报'}
          </Button>
        </View>
      ) : null}
    </>,
    { noBar: !canEdit },
  )
}
