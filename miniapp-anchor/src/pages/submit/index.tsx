import { Button, Image, Input, Picker, Text, View } from '@tarojs/components'
import Taro, {
  getCurrentInstance,
  useDidHide,
  useLoad,
  usePageScroll,
  useRouter,
  useUnload,
} from '@tarojs/taro'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Modal from '@/components/Modal'
import PageNav from '@/components/PageNav'
import PageShell from '@/components/PageShell'
import StateBlock from '@/components/StateBlock'
import { ensureAppSession } from '@/services/auth'
import { getActivityDetail } from '@/services/activities'
import {
  getErrorMessage,
  previewRemoteImages,
  toUploadPath,
} from '@/services/request'
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
} from '@/types/submission'
import { guardMutateBusiness } from '@/utils/capability'
import {
  formatDateTime,
  getCurrentDateValue,
  getCurrentTimeValue,
} from '@/utils/format'
import { mapSubmitApiError } from '@/utils/submit-errors'
import { useSessionStore } from '@/store/session'
import heroSubmitIcon from '@/assets/page-hero/submit.png'
import { BRAND_NAV_FADE_RANGE, brandNavBackground, brandNavTitleColor } from '@/utils/brand-nav'
import styles from './index.module.scss'

const LOAD_TIMEOUT_MS = 18_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}超时，请检查网络后重试`))
    }, ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}


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
  /**
   * 路由参数：分包页 onLoad 最稳；useRouter / getCurrentInstance 作兜底。
   * 历史 bug：params 空或卡死 → 提报页一直「加载中」。
   */
  const [routeIds, setRouteIds] = useState(() =>
    pickRouteIds(router.params, getCurrentInstance().router?.params),
  )
  const recordId = routeIds.recordId
  const activityId = routeIds.activityId
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
  const loadSeqRef = useRef(0)

  useLoad((options) => {
    const next = pickRouteIds(options as Record<string, string | undefined>)
    if (next.activityId || next.recordId) {
      setRouteIds(next)
    }
  })

  // useRouter 晚到的 params 再补一次
  useEffect(() => {
    const next = pickRouteIds(router.params)
    if (
      (next.activityId && next.activityId !== routeIds.activityId) ||
      (next.recordId && next.recordId !== routeIds.recordId)
    ) {
      setRouteIds((prev) => ({
        activityId: next.activityId || prev.activityId,
        recordId: next.recordId || prev.recordId,
      }))
    }
  }, [router.params, routeIds.activityId, routeIds.recordId])

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
  const contentTopGapPx = useMemo(() => {
    try {
      const w = Taro.getSystemInfoSync().windowWidth || 375
      return Math.round((30 * w) / 750)
    } catch {
      return 15
    }
  }, [])

  const normalizedGiftItems = useMemo(() => {
    return giftRows
      .map((row) => ({
        itemName: row.itemName.trim(),
        quantity: Number(row.quantity),
      }))
      .filter((item) => item.itemName && Number.isFinite(item.quantity) && item.quantity > 0)
  }, [giftRows])

  const formMode = pageData?.item?.formConfig?.mode
  const giftFormConfig =
    formMode === 'gift_collection' && pageData?.item?.formConfig
      ? pageData.item.formConfig
      : null
  const pkFormConfig =
    formMode === 'pk_score' && pageData?.item?.formConfig
      ? pageData.item.formConfig
      : null
  const maxAttachmentCount = 9
  const totalAttachmentCount = existingAttachments.length + localFiles.length
  const canAddMoreAttachments = totalAttachmentCount < maxAttachmentCount
  const giftItems = giftFormConfig?.giftItems ?? []
  const allGiftItemsSelected =
    giftFormConfig != null &&
    giftRows.filter((row) => row.itemName.trim()).length >= giftItems.length
  // 不用 useMemo 包 pkTiers：部分构建链会把结果丢掉导致渲染崩溃 → 反复停在加载态
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
            reward: rule.rewardLabel || '',
          }))

  const applyActivityDetail = useCallback((response: ActivityDetailResponse) => {
    if (!response?.item?.formConfig) {
      throw new Error('活动表单配置不完整，请联系运营')
    }
    if (response.anchorProfile?.assignmentStatus === 'pending_confirmation') {
      throw new Error(
        '运营尚未确认归属，暂不可提报。请等待运营老师确认后再提交活动记录。',
      )
    }
    setPageData({
      item: response.item,
      anchorProfile: {
        id: response.anchorProfile?.id ?? '',
        anchorDisplayName:
          response.anchorProfile?.anchorDisplayName || '主播',
        assignmentStatus:
          response.anchorProfile?.assignmentStatus || 'confirmed',
        operator: {
          id: response.anchorProfile?.operator?.id ?? '',
          displayName:
            response.anchorProfile?.operator?.displayName || '运营老师',
        },
      },
    })
    if (response.item.formConfig.mode === 'gift_collection') {
      const gifts = response.item.formConfig.giftItems ?? []
      setGiftRows([
        {
          id: buildRowId(),
          itemName: gifts[0]?.itemName ?? '',
          quantity: '',
        },
      ])
      setPkValue('')
    } else {
      setGiftRows([{ id: buildRowId(), itemName: '', quantity: '' }])
    }
  }, [])

  const applySubmissionDetail = useCallback(
    (response: SubmissionDetailResponse) => {
      const activity = response?.item?.activity
      if (!activity?.formConfig) {
        throw new Error('活动表单配置不完整，请联系运营')
      }
      if (response.item.operatorAssignmentStatus !== 'confirmed') {
        throw new Error(
          '运营尚未确认归属，暂不可修改提报。请等待运营老师确认后再操作。',
        )
      }
      setPageData({
        item: activity,
        anchorProfile: {
          id: '',
          anchorDisplayName: response.item.anchorName || '主播',
          assignmentStatus: response.item.operatorAssignmentStatus,
          operator: {
            id: response.item.operatorId || '',
            displayName: response.item.operatorName || '运营老师',
          },
        },
      })
      setLiveDate(response.item.liveDate)
      setLiveStartTime(response.item.liveStartTime)
      setExistingAttachments(response.item.attachments ?? [])
      setLocalFiles([])
      if (activity.formConfig.mode === 'gift_collection') {
        const items = response.item.items ?? []
        setGiftRows(
          items.length > 0
            ? items.map((item) => ({
                id: buildRowId(),
                itemName: item.itemName,
                quantity: String(item.quantity),
              }))
            : [{ id: buildRowId(), itemName: '', quantity: '' }],
        )
        setPkValue('')
      } else {
        setPkValue(
          response.item.pkValue != null ? String(response.item.pkValue) : '',
        )
      }
      setPreviewData(null)
    },
    [],
  )

  const loadPage = useCallback(async () => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    setError(null)

    let keepLoadingForReroute = false

    try {
      // 已有登录态时不阻塞在 /me 刷新（弱网下会拖死加载）
      const existing = useSessionStore.getState().session
      if (existing?.mode === 'real' && existing.token) {
        void ensureAppSession().catch((e) => {
          console.warn('[Submit] 后台刷新登录态失败', e)
        })
      } else {
        await withTimeout(ensureAppSession(), LOAD_TIMEOUT_MS, '登录')
      }

      if (seq !== loadSeqRef.current) return

      if (recordId) {
        const response = await withTimeout(
          getSubmissionDetail(recordId),
          LOAD_TIMEOUT_MS,
          '加载记录',
        )
        if (seq !== loadSeqRef.current) return

        if (response.item.grantStatus === 'granted') {
          throw new Error('这条记录已经发放，不能再修改。')
        }

        if (response.item.reviewStatus === 'approved') {
          throw new Error('这条记录已经审核通过，不能再修改。')
        }

        applySubmissionDetail(response)
      } else if (activityId) {
        const response = await withTimeout(
          getActivityDetail(activityId),
          LOAD_TIMEOUT_MS,
          '加载活动',
        )
        if (seq !== loadSeqRef.current) return
        applyActivityDetail(response)
      } else {
        // 参数可能尚未注入：再读一次实例路由并触发重载
        const retry = pickRouteIds(
          getCurrentInstance().router?.params,
          router.params,
        )
        if (retry.recordId || retry.activityId) {
          keepLoadingForReroute = true
          setRouteIds(retry)
          return
        }
        throw new Error('缺少活动编号，暂时无法进入提报页。')
      }
    } catch (requestError) {
      if (seq !== loadSeqRef.current) return
      console.error('[Submit] 加载页面失败', requestError)
      setError(getErrorMessage(requestError, '提报页加载失败'))
      setPageData(null)
    } finally {
      if (seq === loadSeqRef.current && !keepLoadingForReroute) {
        setLoading(false)
      }
    }
  }, [
    activityId,
    applyActivityDetail,
    applySubmissionDetail,
    recordId,
    router.params,
  ])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

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

  // 顶栏：无标题；透明 → 滚动磨砂白
  const navBackground = brandNavBackground(navProgress)
  const navIconColor = brandNavTitleColor(navProgress)
  useEffect(() => {
    if (!pageData?.item?.id) {
      return
    }

    const currentActivityId = pageData.item.id
    const mode = pageData.item.formConfig?.mode
    const canPreviewGift =
      mode === 'gift_collection' && normalizedGiftItems.length > 0
    const canPreviewPk =
      mode === 'pk_score' && pkValue.trim() && Number(pkValue) > 0

    if (!liveDate || (!canPreviewGift && !canPreviewPk)) {
      setPreviewData(null)
      setPreviewLoading(false)
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
        sizeType: ['original'],
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
        title: getErrorMessage(requestError, '删除截图失败'),
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

  function bumpGiftQty(rowId: string, delta: number) {
    const row = giftRows.find((item) => item.id === rowId)
    if (!row) return
    const current = Number(row.quantity)
    const base = Number.isFinite(current) ? current : 0
    const next = Math.max(0, base + delta)
    updateGiftRow(rowId, 'quantity', next === 0 ? '' : String(next))
  }

  function validateForm(): FieldErrors {
    const next: FieldErrors = {}
    if (!liveDate) next.liveDate = '请选择直播日期'
    if (!liveStartTime) next.liveStartTime = '请选择开播时间'
    if (existingAttachments.length === 0 && localFiles.length === 0) {
      next.attachments = '请至少上传 1 张截图'
    }
    if (pageData?.item?.formConfig?.mode === 'gift_collection') {
      if (normalizedGiftItems.length === 0) {
        next.gifts = '请至少填写一项礼物数量'
      }
    }
    if (pageData?.item?.formConfig?.mode === 'pk_score') {
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

    if (pageData.anchorProfile?.assignmentStatus !== 'confirmed') {
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
        items:
          pageData.item.formConfig?.mode === 'gift_collection'
            ? normalizedGiftItems
            : undefined,
        pkValue:
          pageData.item.formConfig?.mode === 'pk_score'
            ? Number(pkValue)
            : undefined,
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
      const raw = getErrorMessage(requestError, '提交失败，请稍后再试')
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

  const activityPeriodLine =
    pageData?.item?.startAt && pageData?.item?.endAt
      ? `${formatDateTime(pageData.item.startAt)} – ${formatDateTime(pageData.item.endAt)}`
      : ''

  function renderPageChrome(body: ReactNode) {
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
          {body}
        </View>
      </PageShell>
    )
  }

  if (loading) {
    return renderPageChrome(
      <StateBlock icon="loading" title="正在打开提报…" />,
    )
  }

  if (error || !pageData) {
    return renderPageChrome(
      <StateBlock
        icon="error"
        title="暂时打不开"
        description={error || '请稍后再试一次'}
        actionText="重新加载一下"
        onAction={() => {
          void loadPage()
        }}
      />,
    )
  }

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
        {/* 结构：渐变头（标题+图标）+ 双层弧面表单台 */}
        <View className={styles.headZone}>
          <View className={styles.headCopy}>
            <Text className={styles.heroEyebrow}>
              {isEditMode
                ? '修改提报'
                : formMode === 'gift_collection'
                  ? '礼物提报'
                  : 'PK 提报'}
            </Text>
            <Text className={styles.heroTitle}>{pageData.item.name}</Text>
            {activityPeriodLine ? (
              <Text className={styles.heroPeriod}>{activityPeriodLine}</Text>
            ) : null}
          </View>
          <View className={styles.headIconWrap}>
            <View className={styles.heroIconGlow} />
            <Image
              className={styles.heroIcon}
              src={heroSubmitIcon}
              mode="aspectFit"
            />
          </View>
        </View>

        <View className={styles.formStage}>
          {/* 底层弧：异色唇边 */}
          <View className={styles.sheetBase} aria-hidden />
          {/* 上层弧：白表单，无投影 */}
          <View className={styles.formSheet}>
          <View
            className={`${styles.resultStrip} ${
              (previewData?.matchedRewards?.length ?? 0) > 0
                ? styles.resultStripHit
                : ''
            }`}
          >
            <View className={styles.resultMain}>
              <Text className={styles.resultKicker}>奖励预览</Text>
              {previewLoading ? (
                <Text className={styles.resultTitle}>计算中…</Text>
              ) : previewData &&
                (previewData.matchedRewards?.length ?? 0) > 0 ? (
                <Text className={styles.resultTitle}>
                  预计命中 {previewData.matchedRewards.length} 档
                </Text>
              ) : (
                <Text className={styles.resultTitle}>暂未命中</Text>
              )}
            </View>
            <Text className={styles.resultSide}>
              {previewLoading
                ? '填写后更新'
                : previewData &&
                    (previewData.matchedRewards?.length ?? 0) > 0
                  ? '当日累计参考'
                  : formMode === 'gift_collection'
                    ? '填礼物后显示'
                    : '填 PK 后显示'}
            </Text>
            {previewData && (previewData.matchedRewards?.length ?? 0) > 0 ? (
              <View className={styles.resultList}>
                {(previewData.matchedRewards ?? []).map((rule, index) => {
                  const unit = pageData.item.type?.metricUnit || ''
                  const formula = rule.rangeLabel
                    ? `${rule.rangeLabel}=${rule.rewardLabel}`
                    : rule.compareMode === 'eq'
                      ? `=${rule.threshold}${unit}=${rule.rewardLabel}`
                      : rule.maxThreshold != null
                        ? `${rule.threshold}–${rule.maxThreshold}${unit}=${rule.rewardLabel}`
                        : `≥${rule.threshold}${unit}=${rule.rewardLabel}`
                  return (
                    <View
                      key={`${rule.itemName || 'reward'}-${index}`}
                      className={styles.resultHitRow}
                    >
                      <Text className={styles.resultHitName}>
                        {rule.itemName ||
                          (previewData.mode === 'pk_score' ? 'PK' : '奖励')}
                      </Text>
                      <Text className={styles.resultHitFormula}>{formula}</Text>
                      {/* 右侧：获得奖励个数（每档命中 1 份） */}
                      <Text className={styles.resultHitQty}>1个</Text>
                    </View>
                  )
                })}
              </View>
            ) : null}
          </View>

          <View className={styles.panel}>
            <View className={styles.panelHead}>
              <View className={styles.stepBadge}>
                <Text className={styles.stepNum}>1</Text>
              </View>
              <Text className={styles.panelTitle}>本场信息</Text>
            </View>
            <View className={styles.identityRow}>
              <Text className={styles.identityChip}>
                {pageData.anchorProfile?.anchorDisplayName || '主播'}
              </Text>
              <Text className={styles.identityChip}>
                运营 · {pageData.anchorProfile?.operator?.displayName || '老师'}
              </Text>
              {pageData.anchorProfile?.assignmentStatus ===
              'pending_confirmation' ? (
                <Text
                  className={`${styles.identityChip} ${styles.identityChipWarn}`}
                >
                  归属待确认
                </Text>
              ) : null}
            </View>
            <View className={`${styles.grid} ${styles.gridAfterChips}`}>
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
                      fieldErrors.liveDate ? styles.fieldValueError : ''
                    } ${!liveDate ? styles.fieldValueMuted : ''}`}
                  >
                    {liveDate || '请选择日期'}
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
                      fieldErrors.liveStartTime ? styles.fieldValueError : ''
                    } ${!liveStartTime ? styles.fieldValueMuted : ''}`}
                  >
                    {liveStartTime || '请选择时间'}
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

          <View id="field-attachments" className={styles.panel}>
            <View className={styles.panelHead}>
              <View className={styles.stepBadge}>
                <Text className={styles.stepNum}>2</Text>
              </View>
              <Text className={styles.panelTitle}>截图上传</Text>
              <Text className={styles.panelMeta}>
                {totalAttachmentCount}/{maxAttachmentCount}
              </Text>
            </View>
            {fieldErrors.attachments ? (
              <Text className={styles.fieldError}>{fieldErrors.attachments}</Text>
            ) : null}
            <View className={styles.shotGrid}>
              {existingAttachments.map((attachment, index) => (
                <View key={attachment.id} className={styles.shotCell}>
                  <Image
                    className={styles.shotImg}
                    src={attachment.fileUrl}
                    mode="aspectFill"
                    onClick={() => {
                      void previewRemoteImages(
                        existingAttachments.map((item) => item.fileUrl),
                        attachment.fileUrl,
                      )
                    }}
                  />
                  <Text className={styles.shotBadge}>已传 {index + 1}</Text>
                  <Text
                    className={styles.shotDel}
                    onClick={() => void handleDeleteExistingAttachment(attachment)}
                  >
                    ×
                  </Text>
                </View>
              ))}
              {localFiles.map((file, index) => (
                <View key={file.path} className={styles.shotCell}>
                  <Image
                    className={styles.shotImg}
                    src={file.path}
                    mode="aspectFill"
                    onClick={() => {
                      Taro.previewImage({
                        current: file.path,
                        urls: localFiles.map((item) => item.path),
                      })
                    }}
                  />
                  <Text className={styles.shotBadge}>新 {index + 1}</Text>
                  <Text
                    className={styles.shotDel}
                    onClick={() => handleRemoveLocalFile(file.path)}
                  >
                    ×
                  </Text>
                </View>
              ))}
            </View>
            <Button
              className={styles.uploadBtn}
              hoverClass="none"
              disabled={!canAddMoreAttachments}
              onClick={() => void handleChooseImages()}
            >
              {canAddMoreAttachments ? '添加截图' : '已达上限'}
            </Button>
          </View>

          <View
            id={formMode === 'gift_collection' ? 'field-gifts' : 'field-pkValue'}
            className={styles.panel}
          >
            <View className={styles.panelHead}>
              <View className={styles.stepBadge}>
                <Text className={styles.stepNum}>3</Text>
              </View>
              <Text className={styles.panelTitle}>
                {formMode === 'gift_collection' ? '礼物填写' : 'PK 填写'}
              </Text>
              <Text className={styles.panelMeta}>必填</Text>
            </View>
            {fieldErrors.gifts ? (
              <Text className={styles.fieldError}>{fieldErrors.gifts}</Text>
            ) : null}
            {fieldErrors.pkValue ? (
              <Text className={styles.fieldError}>{fieldErrors.pkValue}</Text>
            ) : null}
            <View className={styles.section}>
              {formMode === 'gift_collection' ? (
                <>
                  {giftRows.map((row, rowIndex) => {
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
                            <View className={styles.stepper}>
                              <Button
                                className={styles.stepBtn}
                                hoverClass="none"
                                onClick={() => bumpGiftQty(row.id, -1)}
                              >
                                −
                              </Button>
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
                              <Button
                                className={styles.stepBtn}
                                hoverClass="none"
                                onClick={() => bumpGiftQty(row.id, 1)}
                              >
                                ＋
                              </Button>
                            </View>
                            <Text className={styles.qtyUnit}>个</Text>
                          </View>
                          {showPrice ? (
                            <Text
                              className={`${styles.fieldHint} ${styles.fieldHintAccent}`}
                            >
                              单价 ¥{Number(price).toFixed(2)}
                              {row.quantity && Number(row.quantity) > 0
                                ? ` · 小计 ¥${(
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
                      新增礼物项
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
                    placeholder="0"
                    onInput={(event: { detail: { value: string } }) => {
                      markDirty()
                      setPkValue(event.detail.value)
                      setFieldErrors((e) => ({ ...e, pkValue: undefined }))
                    }}
                  />
                  {pkTiers.length > 0 ? (
                    <View className={styles.tierList}>
                      <Text className={styles.tierHint}>奖励档位表</Text>
                      {pkTiers.map((tier) => (
                        <View key={tier.label} className={styles.tierRow}>
                          <Text className={styles.tierLabel}>{tier.label}</Text>
                          <Text className={styles.tierReward}>{tier.reward}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              )}
            </View>
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
        title={isEditMode ? '已保存' : '提交成功'}
        content="运营审核通过后会通知你。可查看本活动记录，或返回活动列表。"
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

function decodeRouteParam(value: string | undefined | null) {
  if (value == null || value === '') return ''
  const raw = String(value)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function pickRouteIds(
  ...sources: Array<Record<string, string | undefined> | undefined | null>
): { activityId: string; recordId: string } {
  let activityId = ''
  let recordId = ''
  for (const src of sources) {
    if (!src) continue
    if (!activityId) {
      activityId = decodeRouteParam(
        src.activityId ?? src.activityid ?? src.activity_id,
      )
    }
    if (!recordId) {
      recordId = decodeRouteParam(
        src.recordId ?? src.recordid ?? src.record_id ?? src.id,
      )
    }
  }
  return { activityId, recordId }
}
