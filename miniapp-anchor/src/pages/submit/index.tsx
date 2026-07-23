import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro, { getCurrentInstance } from '@tarojs/taro'
import { useEffect, useMemo, useState } from 'react'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import { getActivityDetail } from '@/services/activities'
import { previewRemoteImages } from '@/services/request'
import {
  createSubmission,
  getSubmissionDetail,
  previewSubmission,
  removeSubmissionAttachment,
  updateSubmission,
  uploadImages,
} from '@/services/submissions'
import type { ActivityDetailResponse } from '@/types/activity'
import type {
  LocalImageFile,
  PreviewResponse,
  SubmissionAttachment,
  SubmissionDetailResponse,
  SubmissionEntryItem,
} from '@/types/submission'
import { getCurrentDateValue, getCurrentTimeValue } from '@/utils/format'
import styles from './index.module.scss'

type GiftRow = {
  id: string
  itemName: string
  quantity: string
}

export default function SubmitPage() {
  const params = useMemo(() => getCurrentInstance().router?.params ?? {}, [])
  const recordId = params.recordId ?? ''
  const activityId = params.activityId ?? ''
  const isEditMode = Boolean(recordId)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageData, setPageData] = useState<ActivityDetailResponse | null>(null)
  const [liveDate, setLiveDate] = useState(getCurrentDateValue())
  const [liveStartTime, setLiveStartTime] = useState(getCurrentTimeValue())
  const [giftRows, setGiftRows] = useState<GiftRow[]>([{ id: buildRowId(), itemName: '', quantity: '' }])
  const [pkValue, setPkValue] = useState('')
  const [existingAttachments, setExistingAttachments] = useState<SubmissionAttachment[]>([])
  const [localFiles, setLocalFiles] = useState<LocalImageFile[]>([])
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const normalizedGiftItems = useMemo(() => {
    return giftRows
      .map((row) => ({
        itemName: row.itemName.trim(),
        quantity: Number(row.quantity),
      }))
      .filter((item) => item.itemName && Number.isFinite(item.quantity) && item.quantity > 0)
  }, [giftRows])
  const giftFormConfig = pageData?.item.formConfig.mode === 'gift_collection' ? pageData.item.formConfig : null
  const maxAttachmentCount = 9
  const totalAttachmentCount = existingAttachments.length + localFiles.length
  const canAddMoreAttachments = totalAttachmentCount < maxAttachmentCount
  const allGiftItemsSelected =
    giftFormConfig != null &&
    giftRows.filter((row) => row.itemName.trim()).length >= giftFormConfig.giftItems.length

  async function loadPage() {
    setLoading(true)
    setError(null)

    try {
      await ensureAppSession()

      if (isEditMode) {
        const response = await getSubmissionDetail(recordId)

        if (response.item.grantStatus === 'granted') {
          throw new Error('这条记录已经发放，不能再修改。')
        }

        if (response.item.reviewStatus === 'approved') {
          throw new Error('这条记录已经审核通过，不能再修改。')
        }

        applySubmissionDetail(response)
      } else if (activityId) {
        const response = await getActivityDetail(activityId)
        applyActivityDetail(response)
      } else {
        throw new Error('缺少活动编号，暂时无法进入提报页。')
      }
    } catch (requestError) {
      console.error('[Submit] 加载页面失败', requestError)
      setError(requestError instanceof Error ? requestError.message : '提报页加载失败')
    } finally {
      setLoading(false)
    }
  }

  function applyActivityDetail(response: ActivityDetailResponse) {
    setPageData(response)
    if (response.item.formConfig.mode === 'gift_collection') {
      setGiftRows([
        {
          id: buildRowId(),
          itemName: response.item.formConfig.giftItems[0]?.itemName ?? '',
          quantity: '',
        },
      ])
      setPkValue('')
    } else {
      setGiftRows([{ id: buildRowId(), itemName: '', quantity: '' }])
    }
  }

  function applySubmissionDetail(response: SubmissionDetailResponse) {
    setPageData({
      item: response.item.activity,
      anchorProfile: {
        id: '',
        anchorDisplayName: response.item.anchorName,
        assignmentStatus: response.item.operatorAssignmentStatus,
        operator: {
          id: response.item.operatorId,
          displayName: response.item.operatorName,
        },
      },
    })
    setLiveDate(response.item.liveDate)
    setLiveStartTime(response.item.liveStartTime)
    setExistingAttachments(response.item.attachments)
    setLocalFiles([])
    if (response.item.activity.formConfig.mode === 'gift_collection') {
      setGiftRows(
        response.item.items.length > 0
          ? response.item.items.map((item) => ({
              id: buildRowId(),
              itemName: item.itemName,
              quantity: String(item.quantity),
            }))
          : [{ id: buildRowId(), itemName: '', quantity: '' }],
      )
      setPkValue('')
    } else {
      setPkValue(response.item.pkValue != null ? String(response.item.pkValue) : '')
    }
    setPreviewData(null)
  }

  useEffect(() => {
    void loadPage()
  }, [activityId, isEditMode, recordId])

  useEffect(() => {
    if (!pageData) {
      return
    }

    const currentActivityId = pageData.item.id
    const canPreviewGift =
      pageData.item.formConfig.mode === 'gift_collection' && normalizedGiftItems.length > 0
    const canPreviewPk =
      pageData.item.formConfig.mode === 'pk_score' && pkValue.trim() && Number(pkValue) > 0

    if (!liveDate || (!canPreviewGift && !canPreviewPk)) {
      setPreviewData(null)
      return
    }

    let cancelled = false
    setPreviewLoading(true)

    void (async () => {
      try {
        const response = await previewSubmission({
          activityId: currentActivityId,
          submissionId: isEditMode ? recordId : undefined,
          liveDate,
          items: canPreviewGift ? normalizedGiftItems : undefined,
          pkValue: canPreviewPk ? Number(pkValue) : undefined,
        })

        if (!cancelled) {
          setPreviewData(response)
        }
      } catch (previewError) {
        console.error('[Submit] 预览奖励失败', previewError)
        if (!cancelled) {
          setPreviewData(null)
        }
      }

      if (!cancelled) {
        setPreviewLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isEditMode, liveDate, normalizedGiftItems, pageData, pkValue, recordId])

  async function handleChooseImages() {
    if (!canAddMoreAttachments) {
      Taro.showToast({ title: '最多上传 9 张截图', icon: 'none' })
      return
    }

    try {
      const result = await Taro.chooseImage({
        count: Math.max(1, maxAttachmentCount - totalAttachmentCount),
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })

      const nextFiles = result.tempFilePaths.map((path: string, index: number) => ({
        path,
        name: path.split('/').pop() || `截图-${localFiles.length + index + 1}`,
      }))
      setLocalFiles((current) => [...current, ...nextFiles])
    } catch (chooseError) {
      if ((chooseError as { errMsg?: string }).errMsg?.includes('cancel')) {
        return
      }

      console.error('[Submit] 选择截图失败', chooseError)
      Taro.showToast({ title: '选择截图失败', icon: 'none' })
    }
  }

  async function handleDeleteExistingAttachment(attachment: SubmissionAttachment) {
    if (!recordId) {
      return
    }

    const result = await Taro.showModal({
      title: '确认删除',
      content: '删除后服务器里的这张截图也会被一起清理。',
      confirmColor: '#3A8E52',
    })

    if (!result.confirm) {
      return
    }

    try {
      await removeSubmissionAttachment(recordId, attachment.id)
      setExistingAttachments((current) => current.filter((item) => item.id !== attachment.id))
      Taro.showToast({ title: '已删除', icon: 'success' })
    } catch (requestError) {
      console.error('[Submit] 删除截图失败', requestError)
      Taro.showToast({
        title: requestError instanceof Error ? requestError.message : '删除截图失败',
        icon: 'none',
      })
    }
  }

  function handleRemoveLocalFile(filePath: string) {
    setLocalFiles((current) => current.filter((item) => item.path !== filePath))
  }

  function updateGiftRow(rowId: string, key: 'itemName' | 'quantity', value: string) {
    setGiftRows((current) =>
      current.map((row) => {
        if (row.id !== rowId) {
          return row
        }

        return {
          ...row,
          [key]: value,
        }
      }),
    )
  }

  function addGiftRow() {
    if (allGiftItemsSelected) {
      Taro.showToast({ title: '礼物项已经全部选完了', icon: 'none' })
      return
    }

    setGiftRows((current) => [...current, { id: buildRowId(), itemName: '', quantity: '' }])
  }

  function removeGiftRow(rowId: string) {
    setGiftRows((current) => {
      const nextRows = current.filter((row) => row.id !== rowId)
      return nextRows.length > 0 ? nextRows : [{ id: buildRowId(), itemName: '', quantity: '' }]
    })
  }

  async function handleSubmit() {
    if (!pageData) {
      return
    }

    if (!liveDate || !liveStartTime) {
      Taro.showToast({ title: '请选择直播时间', icon: 'none' })
      return
    }

    if (existingAttachments.length === 0 && localFiles.length === 0) {
      Taro.showToast({ title: '请至少上传一张截图', icon: 'none' })
      return
    }

    if (pageData.item.formConfig.mode === 'gift_collection' && normalizedGiftItems.length === 0) {
      Taro.showToast({ title: '请至少填写一项礼物数量', icon: 'none' })
      return
    }

    if (pageData.item.formConfig.mode === 'pk_score' && (!pkValue.trim() || Number(pkValue) <= 0)) {
      Taro.showToast({ title: '请填写有效的 PK 值', icon: 'none' })
      return
    }

    setSubmitting(true)

    try {
      const uploadResult = localFiles.length > 0 ? await uploadImages(localFiles) : { items: [] }
      const attachmentUrls = [
        ...existingAttachments.map((item) => item.fileUrl),
        ...uploadResult.items.map((item) => item.fileUrl),
      ]

      const payload = {
        activityId: isEditMode ? undefined : pageData.item.id,
        liveDate,
        liveStartTime,
        items: pageData.item.formConfig.mode === 'gift_collection' ? normalizedGiftItems : undefined,
        pkValue: pageData.item.formConfig.mode === 'pk_score' ? Number(pkValue) : undefined,
        attachmentUrls,
      }

      if (isEditMode) {
        await updateSubmission(recordId, payload)
        Taro.showToast({ title: '已重新提交', icon: 'success' })
      } else {
        await createSubmission(payload)
        Taro.showToast({
          title:
            pageData.anchorProfile.assignmentStatus === 'pending_confirmation'
              ? '已保存，归属确认后处理'
              : '提交成功',
          icon: 'success',
        })
      }

      setTimeout(() => {
        void Taro.redirectTo({
          url: `/pages/activity-records/index?activityId=${pageData.item.id}&activityName=${encodeURIComponent(pageData.item.name)}`,
        })
      }, 320)
    } catch (requestError) {
      console.error('[Submit] 提交失败', requestError)
      Taro.showToast({
        title: requestError instanceof Error ? requestError.message : '提交失败，请稍后再试',
        icon: 'none',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <View className="pageShell">
        <StateBlock title="正在加载提报页" description="系统正在整理活动配置和你的当前记录。" />
      </View>
    )
  }

  if (error || !pageData) {
    return (
      <View className="pageShell">
        <StateBlock
          title="提报页打开失败"
          description={error || '当前活动暂时无法提报。'}
          actionText="返回活动列表"
          onAction={() => {
            Taro.navigateBack({ delta: 1 })
          }}
        />
      </View>
    )
  }

  return (
    <View className="pageShell">
      <View className="heroCard">
        <Text className="heroEyebrow">{isEditMode ? '修改提报记录' : '主播活动提报平台'}</Text>
        <Text className="heroTitle">{pageData.item.name}</Text>
        <Text className="heroDesc">
          {pageData.item.formConfig.mode === 'gift_collection'
            ? '系统会按照当天累计数量自动预估奖励。'
            : '系统会根据本场 PK 值自动预估奖励。'}
        </Text>
      </View>

      <View className="sectionStack">
        <View className="panelCard">
          <Text className="panelTitle">基础信息</Text>
          <View className={styles.grid}>
            <View className="fieldBlock">
              <Text className="fieldLabel">主播姓名</Text>
              <View className="fieldValue">
                {pageData.anchorProfile.anchorDisplayName}
              </View>
            </View>
            <View className="fieldBlock">
              <Text className="fieldLabel">固定运营老师</Text>
              <View className="fieldValue">
                {pageData.anchorProfile.operator.displayName}
              </View>
              {pageData.anchorProfile.assignmentStatus ===
              'pending_confirmation' ? (
                <Text className="fieldHint">
                  当前归属待运营确认，本次提报会先保存，确认后自动进入处理。
                </Text>
              ) : null}
            </View>
            <View className="fieldBlock">
              <Text className="fieldLabel">直播日期</Text>
              <Picker
                mode="date"
                value={liveDate}
                onChange={(event: { detail: { value: string } }) => setLiveDate(event.detail.value)}
              >
                <View className="fieldValue">{liveDate || '请选择直播日期'}</View>
              </Picker>
            </View>
            <View className="fieldBlock">
              <Text className="fieldLabel">开播时间</Text>
              <Picker
                mode="time"
                value={liveStartTime}
                onChange={(event: { detail: { value: string } }) => setLiveStartTime(event.detail.value)}
              >
                <View className="fieldValue">{liveStartTime || '请选择开播时间'}</View>
              </Picker>
            </View>
          </View>
        </View>

        <View className="panelCard">
          <Text className="panelTitle">截图上传</Text>
          <Text className="panelDesc">至少保留一张截图。删除旧截图时，服务器上的原文件也会一起删除。</Text>
          <Text className="fieldHint">当前已选择 {totalAttachmentCount} / {maxAttachmentCount} 张截图</Text>
          {existingAttachments.length > 0 ? (
            <View className={styles.attachmentList}>
              {existingAttachments.map((attachment, index) => (
                <View key={attachment.id} className={styles.attachmentItem}>
                  <Button
                    className="tinyButton"
                    onClick={() => {
                      void previewRemoteImages(
                        existingAttachments.map((item) => item.fileUrl),
                        attachment.fileUrl,
                      )
                    }}
                  >
                    查看截图 {index + 1}
                  </Button>
                  <Button className="tinyButton" onClick={() => void handleDeleteExistingAttachment(attachment)}>
                    删除
                  </Button>
                </View>
              ))}
            </View>
          ) : null}
          {localFiles.length > 0 ? (
            <View className={styles.attachmentList}>
              {localFiles.map((file, index) => (
                <View key={file.path} className={styles.attachmentItem}>
                  <Text className={styles.attachmentName}>{file.name || `待上传截图 ${index + 1}`}</Text>
                  <Button
                    className="tinyButton"
                    onClick={() => {
                      Taro.previewImage({
                        current: file.path,
                        urls: localFiles.map((item) => item.path),
                      })
                    }}
                  >
                    预览
                  </Button>
                  <Button className="tinyButton" onClick={() => handleRemoveLocalFile(file.path)}>
                    移除
                  </Button>
                </View>
              ))}
            </View>
          ) : null}
          <Button className="secondaryButton" disabled={!canAddMoreAttachments} onClick={() => void handleChooseImages()}>
            选择截图
          </Button>
        </View>

        <View className="panelCard">
          <Text className="panelTitle">{pageData.item.formConfig.mode === 'gift_collection' ? '礼物填写项' : 'PK 填写项'}</Text>
          <View className={styles.section}>
            {pageData.item.formConfig.mode === 'gift_collection' ? (
              <>
                {giftRows.map((row) => {
                  const selectedNames = giftRows.filter((item) => item.id !== row.id).map((item) => item.itemName)
                  const selectableItems = (giftFormConfig?.giftItems ?? []).filter(
                    (item) => !selectedNames.includes(item.itemName) || item.itemName === row.itemName,
                  )
                  const range = selectableItems.map((item) => item.itemName)
                  const currentIndex = Math.max(0, range.findIndex((itemName) => itemName === row.itemName))

                  return (
                    <View key={row.id} className={styles.rowCard}>
                      <View className={styles.rowTop}>
                        <Text className={styles.rowTitle}>礼物项</Text>
                        <Button className="tinyButton" onClick={() => removeGiftRow(row.id)}>
                          删除
                        </Button>
                      </View>
                      <View className={styles.section}>
                        <View className="fieldBlock">
                          <Text className="fieldLabel">选择礼物</Text>
                          <Picker
                            mode="selector"
                            range={range}
                            value={currentIndex}
                            onChange={(event: BaseEventOrig<PickerSelectorProps.ChangeEventDetail>) => {
                              const nextIndex = Number(event.detail.value)
                              updateGiftRow(row.id, 'itemName', range[nextIndex] ?? '')
                            }}
                          >
                            <View className="fieldValue">{row.itemName || '请选择礼物'}</View>
                          </Picker>
                        </View>
                        <View className="fieldBlock">
                          <Text className="fieldLabel">礼物数量</Text>
                          <Input
                            className="fieldInput"
                            type="digit"
                            value={row.quantity}
                            placeholder="请输入礼物数量"
                            onInput={(event: { detail: { value: string } }) =>
                              updateGiftRow(row.id, 'quantity', event.detail.value)
                            }
                          />
                        </View>
                      </View>
                    </View>
                  )
                })}
                {!allGiftItemsSelected ? (
                  <Button className="secondaryButton" onClick={() => addGiftRow()}>
                    新增一项礼物
                  </Button>
                ) : (
                  <Text className="fieldHint">当前活动礼物项已全部添加完成</Text>
                )}
              </>
            ) : (
              <View className="fieldBlock">
                <Text className="fieldLabel">本场 PK 值</Text>
                <Input
                  className="fieldInput"
                  type="digit"
                  value={pkValue}
                  placeholder="请输入本场 PK 值"
                  onInput={(event: { detail: { value: string } }) => setPkValue(event.detail.value)}
                />
              </View>
            )}
          </View>
        </View>

        <View className="panelCard">
          <Text className="panelTitle">奖励预览</Text>
          <View className={styles.rewardBlock}>
            {previewLoading ? (
              <Text className={styles.rewardText}>系统正在计算本次预计奖励...</Text>
            ) : previewData ? (
              <>
                <Text className={styles.rewardText}>{previewData.rewardSummaryText}</Text>
                {'dailyTotals' in previewData && previewData.dailyTotals.length > 0 ? (
                  <View className="chipList">
                    {previewData.dailyTotals.map((item: SubmissionEntryItem) => (
                      <Text key={item.itemName} className="chip">
                        {item.itemName}：{item.quantity}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {previewData.matchedRewards.length > 0 ? (
                  <View className={styles.rewardList}>
                    {previewData.matchedRewards.map((rule, index) => (
                      <View key={`${rule.itemName || 'reward'}-${index}`} className={styles.rewardItem}>
                        <Text className={styles.rewardTitle}>{rule.rewardLabel}</Text>
                        <Text className={styles.rewardMeta}>
                          {rule.itemName ? `${rule.itemName} ` : ''}
                          {rule.compareMode === 'eq' ? '等于' : '达到'} {rule.threshold}
                          {pageData.item.type.metricUnit ? ` ${pageData.item.type.metricUnit}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <Text className={styles.rewardText}>填完上面的数据后，这里会自动显示预计奖励。</Text>
            )}
          </View>
        </View>

        {/* 底部沉浸式占位与操作区 */}
        <View style={{ height: '140rpx' }}></View>
        <View className={styles.bottomBar}>
          <Button className="primaryButton" style={{ height: '96rpx' }} loading={submitting} onClick={() => void handleSubmit()}>
            {isEditMode ? '保存修改记录' : '确认提交记录'}
          </Button>
        </View>
      </View>
    </View>
  )
}

function buildRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
