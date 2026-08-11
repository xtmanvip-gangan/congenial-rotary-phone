import { Button, Input, Picker, Text, View } from '@tarojs/components'
import Taro, { useDidHide, usePageScroll, useRouter, useUnload } from '@tarojs/taro'
import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/components/Modal'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import { getActivityDetail } from '@/services/activities'
import { previewRemoteImages, toUploadPath } from '@/services/request'
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
import { guardMutateBusiness } from '@/utils/capability'
import { getCurrentDateValue, getCurrentTimeValue } from '@/utils/format'
import { mapSubmitApiError } from '@/utils/submit-errors'
import { useSessionStore } from '@/store/session'
import styles from './index.module.scss'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'


type GiftRow = {
  id: string
  itemName: string
  quantity: string
}

type FieldErrors = {
  liveDate?: string
  liveStartTime?: string
  attachments?: string
  gifts?: string
  pkValue?: string
}

export default function SubmitPage() {
  const router = useRouter()
  // useRouter 比 getCurrentInstance 首次读 params 更稳，避免空 activityId
  const params = router.params ?? {}
  const recordId = decodeRouteParam(params.recordId)
  const activityId = decodeRouteParam(params.activityId)
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
  const [deleteTarget, setDeleteTarget] = useState<SubmissionAttachment | null>(
    null,
  )
  const [previewLoading, setPreviewLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [navProgress, setNavProgress] = useState(0)
  const [successOpen, setSuccessOpen] = useState(false)
  const navProgressRef = useRef(0)
  const dirtyRef = useRef(false)
  const submittedOkRef = useRef(false)

  function markDirty() {
    dirtyRef.current = true
  }

  function guardLeave() {
    if (submittedOkRef.current || !dirtyRef.current || submitting) return
    // 小程序无法真正拦截返回，离开前 toast 提醒
    Taro.showToast({ title: '内容未提交', icon: 'none', duration: 2000 })
  }

  useUnload(() => {
    guardLeave()
  })

  useDidHide(() => {
    // 切后台不提示；仅真正离开页时 useUnload 会触发
  })
  /** 与导航下方间距：PageNav 自带占位，这里只补 30rpx 级空隙（转 px 保证生效） */
  const contentTopGapPx = Math.round(
    (30 * (Taro.getSystemInfoSync().windowWidth || 375)) / 750,
  )

  const normalizedGiftItems = useMemo(() => {
    return giftRows
      .map((row) => ({
        itemName: row.itemName.trim(),
        quantity: Number(row.quantity),
      }))
      .filter((item) => item.itemName && Number.isFinite(item.quantity) && item.quantity > 0)
  }, [giftRows])
  const giftFormConfig =
    pageData?.item.formConfig.mode === 'gift_collection'
      ? pageData.item.formConfig
      : null
  const pkFormConfig =
    pageData?.item.formConfig.mode === 'pk_score'
      ? pageData.item.formConfig
      : null
  const maxAttachmentCount = 9
  const totalAttachmentCount = existingAttachments.length + localFiles.length
  const canAddMoreAttachments = totalAttachmentCount < maxAttachmentCount
  const allGiftItemsSelected =
    giftFormConfig != null &&
    giftRows.filter((row) => row.itemName.trim()).length >=
      giftFormConfig.giftItems.length
  // 不用 useMemo：部分构建链会把“仅 hooks 副作用”的 useMemo 结果丢掉，
  // 导致 JSX 里引用未定义的 pkTiers，PK 页渲染崩溃后反复停在加载态。
  const pkTiers =
    pkFormConfig == null
      ? []
      : [...(pkFormConfig.rewardRules ?? [])]
          .sort((a, b) => Number(a.threshold) - Number(b.threshold))
          .map((rule) => ({
            label:
              rule.rangeLabel ||
              (rule.maxThreshold != null
                ? `${rule.threshold}–${rule.maxThreshold}`
                : `${rule.threshold}+`),
            reward: rule.rewardLabel,
          }))

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
    if (response.anchorProfile.assignmentStatus === 'pending_confirmation') {
      throw new Error(
        '运营尚未确认归属，暂不可提报。请等待运营老师确认后再提交活动记录。',
      )
    }
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
    if (response.item.operatorAssignmentStatus !== 'confirmed') {
      throw new Error(
        '运营尚未确认归属，暂不可修改提报。请等待运营老师确认后再操作。',
      )
    }
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
  const pageTitle = isEditMode ? '修改提报' : '活动提报'

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
      markDirty()
      setFieldErrors((e) => ({ ...e, attachments: undefined }))
    } catch (chooseError) {
      if ((chooseError as { errMsg?: string }).errMsg?.includes('cancel')) {
        return
      }

      console.error('[Submit] 选择截图失败', chooseError)
      Taro.showToast({ title: '选择截图失败', icon: 'none' })
    }
  }

  function handleDeleteExistingAttachment(attachment: SubmissionAttachment) {
    if (!recordId) {
      return
    }
    setDeleteTarget(attachment)
  }

  async function confirmDeleteAttachment() {
    if (!recordId || !deleteTarget) {
      return
    }
    const attachment = deleteTarget
    setDeleteTarget(null)
    try {
      await removeSubmissionAttachment(recordId, attachment.id)
      setExistingAttachments((current) =>
        current.filter((item) => item.id !== attachment.id),
      )
      Taro.showToast({ title: '已删除', icon: 'success' })
    } catch (requestError) {
      console.error('[Submit] 删除截图失败', requestError)
      Taro.showToast({
        title:
          requestError instanceof Error
            ? requestError.message
            : '删除截图失败',
        icon: 'none',
      })
    }
  }

  function handleRemoveLocalFile(filePath: string) {
    markDirty()
    setLocalFiles((current) => current.filter((item) => item.path !== filePath))
  }

  function updateGiftRow(rowId: string, key: 'itemName' | 'quantity', value: string) {
    markDirty()
    setFieldErrors((e) => ({ ...e, gifts: undefined }))
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

  function validateForm(): FieldErrors {
    const next: FieldErrors = {}
    if (!liveDate) next.liveDate = '请选择直播日期'
    if (!liveStartTime) next.liveStartTime = '请选择开播时间'
    if (existingAttachments.length === 0 && localFiles.length === 0) {
      next.attachments = '请至少上传 1 张截图'
    }
    if (pageData?.item.formConfig.mode === 'gift_collection') {
      if (normalizedGiftItems.length === 0) {
        next.gifts = '请至少填写一项礼物数量'
      }
    }
    if (pageData?.item.formConfig.mode === 'pk_score') {
      if (!pkValue.trim() || Number(pkValue) <= 0) {
        next.pkValue = '请填写有效的 PK 值'
      }
    }
    return next
  }

  async function handleSubmit() {
    if (!pageData) {
      return
    }

    if (pageData.anchorProfile.assignmentStatus !== 'confirmed') {
      Taro.showToast({
        title: '运营确认归属后才可提报',
        icon: 'none',
      })
      return
    }
    if (!guardMutateBusiness(useSessionStore.getState().session)) {
      return
    }

    const nextErrors = validateForm()
    setFieldErrors(nextErrors)
    const firstKey = (
      ['liveDate', 'liveStartTime', 'attachments', 'gifts', 'pkValue'] as const
    ).find((k) => nextErrors[k])
    if (firstKey) {
      Taro.showToast({ title: nextErrors[firstKey] || '请完善表单', icon: 'none' })
      void Taro.pageScrollTo({
        selector: `#field-${firstKey}`,
        duration: 280,
      }).catch(() => {
        // 部分基础库无 selector 时忽略
      })
      return
    }

    setSubmitting(true)

    try {
      const uploadResult = localFiles.length > 0 ? await uploadImages(localFiles) : { items: [] }
      // 后端只认 /api/uploads/submission-proofs/...；展示用绝对 URL 提交前必须还原
      const attachmentUrls = [
        ...existingAttachments.map((item) => item.fileUrl),
        ...uploadResult.items.map((item) => item.fileUrl),
      ]
        .map((url) => toUploadPath(url))
        .filter(Boolean)

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
      } else {
        await createSubmission(payload)
      }

      submittedOkRef.current = true
      dirtyRef.current = false
      setSuccessOpen(true)
    } catch (requestError) {
      console.error('[Submit] 提交失败', requestError)
      const raw =
        requestError instanceof Error
          ? requestError.message
          : '提交失败，请稍后再试'
      const mapped = mapSubmitApiError(raw)
      if (Object.keys(mapped.fields).length > 0) {
        setFieldErrors((prev) => ({ ...prev, ...mapped.fields }))
        const scrollKey = (
          ['liveDate', 'liveStartTime', 'attachments', 'gifts', 'pkValue'] as const
        ).find((k) => mapped.fields[k])
        if (scrollKey) {
          void Taro.pageScrollTo({
            selector: `#field-${scrollKey}`,
            duration: 280,
          }).catch(() => null)
        }
      }
      Taro.showToast({
        title: mapped.toast,
        icon: 'none',
        duration: 2800,
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <PageShell
        className={styles.page}
        backgroundColor="#f7f8fa"
        backgroundTextStyle="dark"
      >
        <View className={styles.pageWash} />
        <PageNav
          title={pageTitle}
          showBack
          background={navBackground}
          titleColor={navTitleColor}
          backIconColor={navTitleColor}
          showBorder={false}
          blur={false}
          titleOpacity={1}
        />
        <View
          className={styles.content}
          style={{ paddingTop: `${contentTopGapPx}px` }}
        >
          <StateBlock
            icon="loading"
            title="加载中"
          />
        </View>
      </PageShell>
    )
  }

  if (error || !pageData) {
    return (
      <PageShell
        className={styles.page}
        backgroundColor="#f7f8fa"
        backgroundTextStyle="dark"
      >
        <View className={styles.pageWash} />
        <PageNav
          title={pageTitle}
          showBack
          background={navBackground}
          titleColor={navTitleColor}
          backIconColor={navTitleColor}
          showBorder={false}
          blur={false}
          titleOpacity={1}
        />
        <View
          className={styles.content}
          style={{ paddingTop: `${contentTopGapPx}px` }}
        >
          <StateBlock
            icon="error"
            title="提报页打开失败"
            description={error || '暂时无法提报'}
            actionText="返回活动列表"
            onAction={() => {
              Taro.navigateBack({ delta: 1 })
            }}
          />
        </View>
      </PageShell>
    )
  }

  const giftItems = giftFormConfig?.giftItems ?? []

  return (
    <PageShell
      className={styles.page}
      backgroundColor="#f7f8fa"
      backgroundTextStyle="dark"
    >
      <View className={styles.pageWash} />
      <PageNav
        title={pageTitle}
        showBack
        background={navBackground}
        titleColor={navTitleColor}
        backIconColor={navTitleColor}
        showBorder={false}
        blur={false}
        titleOpacity={1}
      />

      <View
        className={styles.content}
        style={{ paddingTop: `${contentTopGapPx}px` }}
      >
        <View className={styles.contentInner}>
          {/* 活动名卡：雾蓝渐变，无图 */}
          <View className={styles.heroCard}>
            <Text className={styles.heroTitle}>{pageData.item.name}</Text>
          </View>

          {/* 基础信息 */}
          <View className={styles.panel}>
            <Text className={styles.panelTitle}>基础信息</Text>
            <View className={styles.grid}>
              <View className={styles.fieldBlock}>
                <Text className={styles.fieldLabel}>主播姓名</Text>
                <View className={styles.fieldValue}>
                  {pageData.anchorProfile.anchorDisplayName}
                </View>
              </View>
              <View className={styles.fieldBlock}>
                <Text className={styles.fieldLabel}>固定运营老师</Text>
                <View className={styles.fieldValue}>
                  {pageData.anchorProfile.operator.displayName}
                </View>
                {pageData.anchorProfile.assignmentStatus ===
                'pending_confirmation' ? (
                  <Text className={styles.fieldHint}>归属待确认，暂不可提报</Text>
                ) : null}
              </View>
              <View id="field-liveDate" className={styles.fieldBlock}>
                <Text className={styles.fieldLabel}>直播日期</Text>
                <Picker
                  mode="date"
                  value={liveDate}
                  onChange={(event: { detail: { value: string } }) => {
                    markDirty()
                    setLiveDate(event.detail.value)
                    setFieldErrors((e) => ({ ...e, liveDate: undefined }))
                  }}
                >
                  <View
                    className={`${styles.fieldValue} ${
                      !liveDate ? styles.fieldValueMuted : ''
                    } ${fieldErrors.liveDate ? styles.fieldValueError : ''}`}
                  >
                    {liveDate || '请选择直播日期'}
                  </View>
                </Picker>
                {fieldErrors.liveDate ? (
                  <Text className={styles.fieldError}>{fieldErrors.liveDate}</Text>
                ) : null}
              </View>
              <View id="field-liveStartTime" className={styles.fieldBlock}>
                <Text className={styles.fieldLabel}>开播时间</Text>
                <Picker
                  mode="time"
                  value={liveStartTime}
                  onChange={(event: { detail: { value: string } }) => {
                    markDirty()
                    setLiveStartTime(event.detail.value)
                    setFieldErrors((e) => ({ ...e, liveStartTime: undefined }))
                  }}
                >
                  <View
                    className={`${styles.fieldValue} ${
                      !liveStartTime ? styles.fieldValueMuted : ''
                    } ${fieldErrors.liveStartTime ? styles.fieldValueError : ''}`}
                  >
                    {liveStartTime || '请选择开播时间'}
                  </View>
                </Picker>
                {fieldErrors.liveStartTime ? (
                  <Text className={styles.fieldError}>
                    {fieldErrors.liveStartTime}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* 截图 */}
          <View id="field-attachments" className={styles.panel}>
            <Text className={styles.panelTitle}>截图上传</Text>
            <Text className={styles.fieldHint}>
              {totalAttachmentCount} / {maxAttachmentCount} 张 · 至少 1 张
            </Text>
            {fieldErrors.attachments ? (
              <Text className={styles.fieldError}>{fieldErrors.attachments}</Text>
            ) : null}
            {existingAttachments.length > 0 ? (
              <View className={styles.attachmentList}>
                {existingAttachments.map((attachment, index) => (
                  <View key={attachment.id} className={styles.attachmentItem}>
                    <Text className={styles.attachmentName}>
                      已上传截图 {index + 1}
                    </Text>
                    <View className={styles.attachActions}>
                      <Button
                        className={styles.tinyBtn}
                        hoverClass="none"
                        onClick={() => {
                          void previewRemoteImages(
                            existingAttachments.map((item) => item.fileUrl),
                            attachment.fileUrl,
                          )
                        }}
                      >
                        查看
                      </Button>
                      <Button
                        className={styles.tinyBtn}
                        hoverClass="none"
                        onClick={() =>
                          void handleDeleteExistingAttachment(attachment)
                        }
                      >
                        删除
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            {localFiles.length > 0 ? (
              <View className={styles.attachmentList}>
                {localFiles.map((file, index) => (
                  <View key={file.path} className={styles.attachmentItem}>
                    <Text className={styles.attachmentName}>
                      {file.name || `待上传 ${index + 1}`}
                    </Text>
                    <View className={styles.attachActions}>
                      <Button
                        className={styles.tinyBtn}
                        hoverClass="none"
                        onClick={() => {
                          Taro.previewImage({
                            current: file.path,
                            urls: localFiles.map((item) => item.path),
                          })
                        }}
                      >
                        预览
                      </Button>
                      <Button
                        className={styles.tinyBtn}
                        hoverClass="none"
                        onClick={() => handleRemoveLocalFile(file.path)}
                      >
                        移除
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            <Button
              className={styles.uploadBtn}
              hoverClass="none"
              disabled={!canAddMoreAttachments}
              onClick={() => void handleChooseImages()}
            >
              {canAddMoreAttachments ? '添加截图' : '已达上限'}
            </Button>
          </View>

          {/* 礼物 / PK */}
          <View
            id={
              pageData.item.formConfig.mode === 'gift_collection'
                ? 'field-gifts'
                : 'field-pkValue'
            }
            className={styles.panel}
          >
            <Text className={styles.panelTitle}>
              {pageData.item.formConfig.mode === 'gift_collection'
                ? '礼物填写'
                : 'PK 填写'}
            </Text>
            {fieldErrors.gifts ? (
              <Text className={styles.fieldError}>{fieldErrors.gifts}</Text>
            ) : null}
            {fieldErrors.pkValue ? (
              <Text className={styles.fieldError}>{fieldErrors.pkValue}</Text>
            ) : null}
            <View className={styles.section}>
              {pageData.item.formConfig.mode === 'gift_collection' ? (
                <>
                  {giftRows.map((row, rowIndex) => {
                    // 其他行已选中的礼物：本行不展示（当前行已选保留）
                    const usedByOthers = new Set(
                      giftRows
                        .filter((item) => item.id !== row.id)
                        .map((item) => item.itemName.trim())
                        .filter(Boolean),
                    )
                    const availableGifts = giftItems.filter(
                      (item) =>
                        !usedByOthers.has(item.itemName) ||
                        item.itemName === row.itemName,
                    )
                    const availableNames = availableGifts.map(
                      (item) => item.itemName,
                    )
                    const selected = giftItems.find(
                      (item) => item.itemName === row.itemName,
                    )
                    const price = selected?.unitPriceYuan
                    const showPrice =
                      price != null && Number.isFinite(price) && price > 0
                    const pickerIndex = Math.max(
                      0,
                      availableNames.findIndex((n) => n === row.itemName),
                    )

                    return (
                      <View key={row.id} className={styles.rowCard}>
                        <View className={styles.rowTop}>
                          <Text className={styles.rowIndex}>
                            礼物 {rowIndex + 1}
                          </Text>
                          {giftRows.length > 1 ? (
                            <Button
                              className={styles.rowRemove}
                              hoverClass="none"
                              onClick={() => removeGiftRow(row.id)}
                            >
                              删除
                            </Button>
                          ) : null}
                        </View>

                        <View className={styles.fieldBlock}>
                          <Text className={styles.fieldLabel}>选择礼物</Text>
                          {giftItems.length > 0 && giftItems.length <= 12 ? (
                            <View className={styles.giftChipRow}>
                              {availableGifts.map((item) => {
                                const active = row.itemName === item.itemName
                                return (
                                  <Button
                                    key={item.itemName}
                                    className={`${styles.giftChip} ${
                                      active ? styles.giftChipActive : ''
                                    }`}
                                    hoverClass="none"
                                    onClick={() =>
                                      updateGiftRow(
                                        row.id,
                                        'itemName',
                                        item.itemName,
                                      )
                                    }
                                  >
                                    {item.itemName}
                                  </Button>
                                )
                              })}
                            </View>
                          ) : (
                            <Picker
                              mode="selector"
                              range={availableNames}
                              value={pickerIndex}
                              onChange={(event: {
                                detail: { value: string | number }
                              }) => {
                                const nextIndex = Number(event.detail.value)
                                updateGiftRow(
                                  row.id,
                                  'itemName',
                                  availableNames[nextIndex] ?? '',
                                )
                              }}
                            >
                              <View
                                className={`${styles.fieldValue} ${
                                  !row.itemName ? styles.fieldValueMuted : ''
                                }`}
                              >
                                {row.itemName || '请选择礼物'}
                              </View>
                            </Picker>
                          )}
                        </View>

                        <View className={styles.fieldBlock}>
                          <Text className={styles.fieldLabel}>数量</Text>
                          <View className={styles.qtyRow}>
                            <Input
                              className={styles.qtyInput}
                              type="digit"
                              value={row.quantity}
                              placeholder="0"
                              onInput={(event: {
                                detail: { value: string }
                              }) =>
                                updateGiftRow(
                                  row.id,
                                  'quantity',
                                  event.detail.value,
                                )
                              }
                            />
                            <Text className={styles.qtyUnit}>个</Text>
                          </View>
                          {showPrice ? (
                            <Text
                              className={`${styles.fieldHint} ${styles.fieldHintAccent}`}
                            >
                              单价 ¥{Number(price).toFixed(2)}
                              {row.quantity && Number(row.quantity) > 0
                                ? ` · 共计 ¥${(
                                    Number(price) * Number(row.quantity)
                                  ).toFixed(2)}`
                                : ''}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    )
                  })}
                  {!allGiftItemsSelected ? (
                    <Button
                      className={styles.addGiftBtn}
                      hoverClass="none"
                      onClick={() => addGiftRow()}
                    >
                      ＋ 新增礼物项
                    </Button>
                  ) : (
                    <Text className={styles.fieldHint}>
                      当前活动礼物已全部添加
                    </Text>
                  )}
                </>
              ) : (
                <View className={styles.fieldBlock}>
                  <Text className={styles.fieldLabel}>本场 PK 值</Text>
                  <Input
                    className={styles.pkInput}
                    type="digit"
                    value={pkValue}
                    placeholder="输入 PK 值"
                    onInput={(event: { detail: { value: string } }) => {
                      markDirty()
                      setPkValue(event.detail.value)
                      setFieldErrors((e) => ({ ...e, pkValue: undefined }))
                    }}
                  />
                  {pkTiers.length > 0 ? (
                    <View className={styles.tierList}>
                      <Text className={styles.tierHint}>奖励档位</Text>
                      {pkTiers.map((tier) => (
                        <View key={tier.label} className={styles.tierRow}>
                          <Text className={styles.tierLabel}>{tier.label}</Text>
                          <Text className={styles.tierReward}>
                            {tier.reward}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          </View>

          {/* 奖励预览 */}
          <View className={styles.panel}>
            <Text className={styles.panelTitle}>奖励预览</Text>
            <View className={styles.rewardBlock}>
              {previewLoading ? (
                <Text className={styles.rewardEmpty}>计算中…</Text>
              ) : previewData ? (
                <>
                  {/* 本次填写：兔兔样式 */}
                  {previewData.mode === 'gift_collection' &&
                  previewData.selectedItems.length > 0 ? (
                    <View className={styles.previewSection}>
                      <Text className={styles.previewSectionTitle}>
                        本次填写
                      </Text>
                      <View className={styles.giftStatList}>
                        {previewData.selectedItems.map(
                          (item: SubmissionEntryItem) => (
                            <View
                              key={`sel-${item.itemName}`}
                              className={`${styles.giftStatRow} ${styles.giftStatRowAccent}`}
                            >
                              <Text className={styles.giftStatName}>
                                {item.itemName}
                              </Text>
                              <Text className={styles.giftStatQty}>
                                ×{item.quantity}
                              </Text>
                            </View>
                          ),
                        )}
                      </View>
                    </View>
                  ) : null}

                  {previewData.mode === 'pk_score' ? (
                    <View className={styles.previewSection}>
                      <Text className={styles.previewSectionTitle}>
                        本场 PK
                      </Text>
                      <Text className={styles.pkPreviewValue}>
                        {previewData.pkValue}
                      </Text>
                    </View>
                  ) : null}

                  <View className={styles.previewSection}>
                    <Text className={styles.previewSectionTitle}>
                      预计命中奖励
                    </Text>
                    {previewData.matchedRewards.length > 0 ? (
                      <View className={styles.giftStatList}>
                        {previewData.matchedRewards.map((rule, index) => {
                          const unit = pageData.item.type.metricUnit || ''
                          // 同行：≥xx=奖励（符号表示「大于」）
                          const formula = rule.rangeLabel
                            ? `${rule.rangeLabel}=${rule.rewardLabel}`
                            : rule.compareMode === 'eq'
                              ? `=${rule.threshold}${unit}=${rule.rewardLabel}`
                              : rule.maxThreshold != null
                                ? `${rule.threshold}–${rule.maxThreshold}${unit}=${rule.rewardLabel}`
                                : `≥${rule.threshold}${unit}=${rule.rewardLabel}`
                          const qty =
                            previewData.mode === 'gift_collection' &&
                            rule.itemName
                              ? previewData.dailyTotals.find(
                                  (d) => d.itemName === rule.itemName,
                                )?.quantity
                              : previewData.mode === 'pk_score'
                                ? previewData.pkValue
                                : null

                          return (
                            <View
                              key={`${rule.itemName || 'reward'}-${index}`}
                              className={styles.hitRow}
                            >
                              <View className={styles.hitLeft}>
                                <Text className={styles.hitGiftPill}>
                                  {rule.itemName ||
                                    (previewData.mode === 'pk_score'
                                      ? 'PK'
                                      : '奖励')}
                                </Text>
                                <Text className={styles.hitFormula} numberOfLines={1}>
                                  {formula}
                                </Text>
                              </View>
                              {qty != null ? (
                                <Text className={styles.hitQty}>
                                  累计 ×{qty}
                                </Text>
                              ) : null}
                            </View>
                          )
                        })}
                      </View>
                    ) : (
                      <Text className={styles.rewardEmpty}>暂未命中奖励</Text>
                    )}
                  </View>
                </>
              ) : (
                <Text className={styles.rewardEmpty}>填写后显示预计奖励</Text>
              )}
            </View>
          </View>
        </View>
      </View>

      <View className={styles.bottomBar}>
        <Button
          className={styles.submitBtn}
          hoverClass="none"
          loading={submitting}
          disabled={submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting
            ? '提交中'
            : isEditMode
              ? '保存修改'
              : '确认提交'}
        </Button>
      </View>

      <Modal
        visible={Boolean(deleteTarget)}
        title="确认删除"
        content="删除后不可恢复。"
        confirmText="删除"
        cancelText="取消"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteAttachment()}
      />

      <Modal
        visible={successOpen}
        title={isEditMode ? '已重新提交' : '提交成功'}
        content="运营审核通过后会通知你。可先查看本活动记录，或返回继续浏览活动。"
        confirmText="查看本活动记录"
        cancelText="返回活动列表"
        maskClosable={false}
        onConfirm={() => {
          setSuccessOpen(false)
          void Taro.redirectTo({
            url: `/pages/activity-records/index?activityId=${pageData.item.id}&activityName=${encodeURIComponent(pageData.item.name)}`,
          })
        }}
        onCancel={() => {
          setSuccessOpen(false)
          void Taro.redirectTo({ url: '/pages/activities/index' })
        }}
      />
    </PageShell>
  )
}

function buildRowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function decodeRouteParam(value: string | undefined) {
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
