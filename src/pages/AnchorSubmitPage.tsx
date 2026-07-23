import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Gift, ImagePlus, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { FileUploadField } from '../components/FileUploadField'
import { useConfirmDialog } from '../components/useConfirmDialog'
import { uploadFilesXhr, apiJson } from '../lib/api'

type ActivityDetailResponse = {
  item: {
    id: string
    name: string
    startAt: string
    endAt: string
    description: string | null
    type: {
      typeCode: string
      typeName: string
      aggregationMode: string
      metricUnit: string | null
    }
    formConfig:
      | {
          mode: 'gift_collection'
          giftItems: Array<{ itemName: string }>
          rewardRules: Array<RewardRuleReference>
        }
      | {
          mode: 'pk_score'
          rewardRules: Array<RewardRuleReference>
        }
  }
  operators: Array<{
    id: string
    displayName: string
  }>
}

type SubmissionDetailResponse = {
  item: {
    id: string
    anchorName: string
    operatorId: string
    liveDate: string
    liveStartTime: string
    reviewStatus: 'pending' | 'approved' | 'rejected'
    grantStatus: 'pending' | 'granted'
    rejectReason: string | null
    attachments: Array<{
      id: string
      fileUrl: string
    }>
    items: Array<{
      itemName: string
      quantity: number
    }>
    pkValue: number | null
    activity: ActivityDetailResponse['item']
  }
  operators: ActivityDetailResponse['operators']
}

type RewardRuleReference = {
  itemName: string | null
  threshold: number
  rewardType: string
  rewardLabel: string
  compareMode: 'gte' | 'eq'
}

type UploadImagesResponse = {
  items: Array<{
    fileName: string
    fileUrl: string
  }>
}

type GiftSelectionRow = {
  id: string
  itemName: string
  quantity: string
}

type PreviewResponse =
  | {
      mode: 'gift_collection'
      liveDate: string
      selectedItems: Array<{
        itemName: string
        quantity: number
      }>
      dailyTotals: Array<{
        itemName: string
        quantity: number
      }>
      matchedRewards: Array<RewardRuleReference>
      rewardSummaryText: string
    }
  | {
      mode: 'pk_score'
      pkValue: number
      matchedRewards: Array<RewardRuleReference>
      rewardSummaryText: string
    }

export function AnchorSubmitPage() {
  const { activityId, recordId } = useParams<{ activityId?: string; recordId?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const isEditMode = Boolean(recordId)
  const [anchorName, setAnchorName] = useState('')
  const [anchorNameTouched, setAnchorNameTouched] = useState(false)
  const [operatorId, setOperatorId] = useState('')
  const [liveDate, setLiveDate] = useState(getTodayDate())
  const [liveStartTime, setLiveStartTime] = useState('')
  const [giftRows, setGiftRows] = useState<GiftSelectionRow[]>(() => [createGiftSelectionRow()])
  const [pkValue, setPkValue] = useState('')
  const [existingAttachments, setExistingAttachments] = useState<Array<{ id: string; fileUrl: string }>>([])
  const [files, setFiles] = useState<File[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [initializedRecordId, setInitializedRecordId] = useState<string | null>(null)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewImageError, setPreviewImageError] = useState(false)
  const [rewardDetailsOpen, setRewardDetailsOpen] = useState(false)
  const { confirm, dialog } = useConfirmDialog()

  const activityQuery = useQuery({
    enabled: Boolean(activityId) && !isEditMode,
    queryKey: ['anchor-activity-detail', activityId],
    queryFn: () => apiJson<ActivityDetailResponse>(`/submissions/available-activities/${activityId}`),
  })

  const submissionQuery = useQuery({
    enabled: Boolean(recordId),
    queryKey: ['my-submission-detail', recordId],
    queryFn: () => apiJson<SubmissionDetailResponse>(`/submissions/mine/${recordId}`),
  })

  const pageData = isEditMode
    ? submissionQuery.data
      ? {
          item: submissionQuery.data.item.activity,
          operators: submissionQuery.data.operators,
        }
      : undefined
    : activityQuery.data

  const currentActivityId = isEditMode ? submissionQuery.data?.item.activity.id : activityId

  useEffect(() => {
    if (!isEditMode && session?.user.name && !anchorNameTouched && !anchorName) {
      setAnchorName(session.user.name)
    }
  }, [anchorName, anchorNameTouched, isEditMode, session?.user.name])

  useEffect(() => {
    if (isEditMode || !activityQuery.data) {
      return
    }

    const formConfig = activityQuery.data.item.formConfig

    if (!operatorId && activityQuery.data.operators.length > 0) {
      setOperatorId(activityQuery.data.operators[0].id)
    }

    if (formConfig.mode === 'gift_collection') {
      setGiftRows((current) => {
        if (current.length > 0) {
          return current
        }

        return [createGiftSelectionRow(formConfig.giftItems[0]?.itemName ?? '')]
      })
    }
  }, [activityQuery.data, isEditMode, operatorId])

  useEffect(() => {
    if (!isEditMode || !submissionQuery.data) {
      return
    }

    const submission = submissionQuery.data.item
    if (initializedRecordId === submission.id) {
      return
    }

    setAnchorName(submission.anchorName)
    setOperatorId(submission.operatorId)
    setLiveDate(submission.liveDate)
    setLiveStartTime(submission.liveStartTime)
    setExistingAttachments(submission.attachments)
    setFiles([])
    setSubmitError(null)

    if (submission.activity.formConfig.mode === 'gift_collection') {
      setGiftRows(
        submission.items.length > 0
          ? submission.items.map((item) => createGiftSelectionRow(item.itemName, String(item.quantity)))
          : [createGiftSelectionRow(submission.activity.formConfig.giftItems[0]?.itemName ?? '')],
      )
      setPkValue('')
    } else {
      setPkValue(submission.pkValue != null ? String(submission.pkValue) : '')
      setGiftRows([createGiftSelectionRow()])
    }

    setInitializedRecordId(submission.id)
  }, [initializedRecordId, isEditMode, submissionQuery.data])

  const rewardHintText = useMemo(() => {
    if (!pageData) {
      return ''
    }

    return pageData.item.type.typeCode === 'gift_collection'
      ? '奖励会按当天累计结果自动计算。'
      : '奖励会按本场 PK 值自动计算。'
  }, [pageData])

  function handleOpenPreview(url: string) {
    setPreviewImageError(false)
    setPreviewImageUrl(url)
  }

  function handleClosePreview() {
    setPreviewImageError(false)
    setPreviewImageUrl(null)
  }

  const giftFormConfig =
    pageData?.item.formConfig.mode === 'gift_collection' ? pageData.item.formConfig : null
  const metricUnit = pageData?.item.type.metricUnit ?? ''

  const normalizedGiftItems = useMemo(
    () =>
      giftRows
        .map((row) => ({
          itemName: row.itemName,
          quantity: Number(row.quantity),
        }))
        .filter((item) => item.itemName && Number.isFinite(item.quantity) && item.quantity > 0),
    [giftRows],
  )

  const previewQuery = useQuery({
    enabled:
      Boolean(currentActivityId) &&
      Boolean(pageData) &&
      Boolean(liveDate) &&
      ((pageData?.item.formConfig.mode === 'gift_collection' && normalizedGiftItems.length > 0) ||
        (pageData?.item.formConfig.mode === 'pk_score' && Boolean(pkValue.trim()))),
    queryKey: [
      'submission-preview',
      currentActivityId,
      recordId,
      liveDate,
      normalizedGiftItems,
      pkValue,
      pageData?.item.formConfig.mode,
    ],
    queryFn: () =>
      apiJson<PreviewResponse>('/submissions/preview', {
        method: 'POST',
        body: JSON.stringify({
          activityId: currentActivityId,
          submissionId: isEditMode ? recordId : undefined,
          liveDate,
          items: pageData?.item.formConfig.mode === 'gift_collection' ? normalizedGiftItems : undefined,
          pkValue: pageData?.item.formConfig.mode === 'pk_score' ? Number(pkValue) : undefined,
        }),
      }),
  })

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!pageData || !currentActivityId) {
        throw new Error(isEditMode ? '记录信息还未加载完成' : '活动信息还未加载完成')
      }

      if (!anchorName.trim()) {
        throw new Error('请填写主播姓名')
      }

      if (!operatorId) {
        throw new Error('请选择运营老师')
      }

      if (!liveDate) {
        throw new Error('请选择直播日期')
      }

      if (!liveStartTime) {
        throw new Error('请选择开播时间')
      }

      if (existingAttachments.length === 0 && files.length === 0) {
        throw new Error('请至少上传一张截图')
      }

      const uploadResult = files.length > 0 ? await uploadImages(files) : { items: [] }
      const attachmentUrls = [...existingAttachments.map((item) => item.fileUrl), ...uploadResult.items.map((item) => item.fileUrl)]

      if (pageData.item.formConfig.mode === 'gift_collection') {
        if (normalizedGiftItems.length === 0) {
          throw new Error('请至少填写一项礼物数量')
        }

        if (isEditMode && recordId) {
          return apiJson(`/submissions/mine/${recordId}`, {
            method: 'PUT',
            body: JSON.stringify({
              anchorName: anchorName.trim(),
              operatorId,
              liveDate,
              liveStartTime,
              items: normalizedGiftItems,
              attachmentUrls,
            }),
          })
        }

        return apiJson('/submissions', {
          method: 'POST',
          body: JSON.stringify({
            activityId: currentActivityId,
            anchorName: anchorName.trim(),
            operatorId,
            liveDate,
            liveStartTime,
            items: normalizedGiftItems,
            attachmentUrls,
          }),
        })
      }

      if (!pkValue.trim()) {
        throw new Error('请填写本场 PK 值')
      }

      if (isEditMode && recordId) {
        return apiJson(`/submissions/mine/${recordId}`, {
          method: 'PUT',
          body: JSON.stringify({
            anchorName: anchorName.trim(),
            operatorId,
            liveDate,
            liveStartTime,
            pkValue: Number(pkValue),
            attachmentUrls,
          }),
        })
      }

      return apiJson('/submissions', {
        method: 'POST',
        body: JSON.stringify({
          activityId: currentActivityId,
          anchorName: anchorName.trim(),
          operatorId,
          liveDate,
          liveStartTime,
          pkValue: Number(pkValue),
          attachmentUrls,
        }),
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['my-submissions'] })
      if (recordId) {
        void queryClient.invalidateQueries({ queryKey: ['my-submission-detail', recordId] })
      }
      navigate('/app/records')
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : isEditMode ? '重新提交失败' : '提交失败')
    },
  })

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachment: { id: string; fileUrl: string }) => {
      if (!recordId) {
        throw new Error('当前记录不存在')
      }

      return apiJson(`/submissions/mine/${recordId}/attachments/${attachment.id}`, {
        method: 'DELETE',
      })
    },
    onSuccess: (_data, attachment) => {
      setExistingAttachments((current) => current.filter((item) => item.id !== attachment.id))
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : '删除截图失败')
    },
  })

  function handleGiftRowItemChange(rowId: string, itemName: string) {
    setGiftRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, itemName } : row)),
    )
  }

  function handleGiftRowQuantityChange(rowId: string, quantity: string) {
    setGiftRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, quantity } : row)),
    )
  }

  function handleAddGiftRow() {
    setGiftRows((current) => [...current, createGiftSelectionRow()])
  }

  function handleRemoveGiftRow(rowId: string) {
    setGiftRows((current) => {
      if (current.length === 1) {
        return [createGiftSelectionRow()]
      }

      return current.filter((row) => row.id !== rowId)
    })
  }

  async function handleRemoveExistingAttachment(attachment: { id: string; fileUrl: string }) {
    const approved = await confirm({
      title: '确认删除这张截图吗？',
      message: '删除后服务器上的文件也会被清理，建议确认无误再删除。',
      confirmText: '确认删除',
      variant: 'danger',
    })
    if (!approved) {
      return
    }
    deleteAttachmentMutation.mutate(attachment)
  }

  function handleRemoveSelectedFile(fileIndex: number) {
    setFiles((current) => current.filter((_, index) => index !== fileIndex))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    submitMutation.mutate()
  }

  const isPageLoading = isEditMode ? submissionQuery.isLoading : activityQuery.isLoading
  const isPageError = isEditMode ? submissionQuery.isError : activityQuery.isError
  const pageErrorMessage = isEditMode
    ? submissionQuery.error instanceof Error
      ? submissionQuery.error.message
      : '记录详情加载失败'
    : activityQuery.error instanceof Error
      ? activityQuery.error.message
      : '活动信息加载失败'

  return (
    <section className="grid gap-4 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-none lg:rounded-3xl lg:p-6 lg:shadow-soft"
      >
        {isPageLoading ? (
          <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            {isEditMode ? '正在加载记录详情...' : '正在加载提报活动...'}
          </div>
        ) : isPageError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-600">
            {pageErrorMessage}
          </div>
        ) : pageData ? (
          <>
            <div className="border-b border-slate-200 pb-4 lg:pb-5">
              <p className="text-sm font-medium text-brand-600">{isEditMode ? '修改提报记录' : '主播提报页'}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                {pageData.item.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">{rewardHintText}</p>
              {isEditMode && submissionQuery.data?.item.rejectReason ? (
                <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  驳回原因：{submissionQuery.data.item.rejectReason}
                </div>
              ) : null}
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">主播姓名</span>
                <input
                  value={anchorName}
                  onChange={(event) => {
                    setAnchorNameTouched(true)
                    setAnchorName(event.target.value)
                  }}
                  className="mt-2 app-field"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">运营老师</span>
                <select
                  value={operatorId}
                  onChange={(event) => setOperatorId(event.target.value)}
                  className="mt-2 app-select"
                >
                  <option value="">请选择运营老师</option>
                  {pageData.operators.map((operator) => (
                    <option key={operator.id} value={operator.id}>
                      {operator.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">直播日期</span>
                <input
                  type="date"
                  value={liveDate}
                  onChange={(event) => setLiveDate(event.target.value)}
                  className="mt-2 app-field"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">开播时间</span>
                <input
                  type="time"
                  value={liveStartTime}
                  onChange={(event) => setLiveStartTime(event.target.value)}
                  className="mt-2 app-field"
                />
              </label>
            </div>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:rounded-3xl">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <ImagePlus className="h-4 w-4 text-brand-600" />
                截图上传
              </div>
              <p className="mt-2 text-sm text-slate-500">
                {isEditMode
                  ? '可删除旧截图或补充新截图。'
                  : '上传直播截图（支持多选）。'}
              </p>
              {existingAttachments.length > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {existingAttachments.map((attachment, index) => (
                    <span
                      key={attachment.id}
                      className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs text-slate-600"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(attachment.fileUrl)}
                        className="inline-flex items-center gap-2 text-brand-700 transition hover:text-brand-800"
                      >
                        <Eye className="h-4 w-4" />
                        已上传截图 {index + 1}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingAttachment(attachment)}
                        disabled={deleteAttachmentMutation.isPending && deleteAttachmentMutation.variables?.id === attachment.id}
                        className="inline-flex items-center gap-1 text-rose-500 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:text-rose-300"
                      >
                        {deleteAttachmentMutation.isPending &&
                        deleteAttachmentMutation.variables?.id === attachment.id
                          ? '删除中'
                          : '删除'}
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-4">
                <FileUploadField
                  label="上传截图"
                  accept="image/*"
                  multiple
                  files={files}
                  onChange={(next) => {
                    if (next.length > 0) {
                      setFiles((current) => [...current, ...next])
                    }
                  }}
                  onRemove={handleRemoveSelectedFile}
                />
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:rounded-3xl">
              {pageData.item.formConfig.mode === 'gift_collection' ? (
                <>
                  <h3 className="text-base font-semibold text-slate-900">礼物填写项</h3>
                  <p className="mt-1 text-sm text-slate-500">选择礼物并填写数量，可新增多项。</p>
                  <div className="mt-4 space-y-3">
                    {giftRows.map((row, index) => {
                      const selectedItemNames = giftRows
                        .filter((item) => item.id !== row.id)
                        .map((item) => item.itemName)
                        .filter(Boolean)

                      return (
                        <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <p className="text-sm font-medium text-slate-700">礼物项 {index + 1}</p>
                            <button
                              type="button"
                              onClick={() => handleRemoveGiftRow(row.id)}
                              className="app-btn-danger px-4 py-2 text-xs"
                            >
                              <Trash2 className="h-4 w-4" />
                              删除
                            </button>
                          </div>

                          <div className="mt-3 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
                            <label className="block">
                              <span className="text-xs font-medium text-slate-500">选择礼物</span>
                              <select
                                value={row.itemName}
                                onChange={(event) => handleGiftRowItemChange(row.id, event.target.value)}
                                className="mt-2 app-select"
                              >
                                <option value="">请选择礼物</option>
                                {giftFormConfig?.giftItems.map((item) => (
                                  <option
                                    key={item.itemName}
                                    value={item.itemName}
                                    disabled={selectedItemNames.includes(item.itemName)}
                                  >
                                    {item.itemName}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block">
                              <span className="text-xs font-medium text-slate-500">礼物数量</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.quantity}
                                onChange={(event) => handleGiftRowQuantityChange(row.id, event.target.value)}
                                placeholder="请输入数量"
                                className="mt-2 app-field"
                              />
                            </label>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={handleAddGiftRow}
                    className="app-btn-secondary mt-4"
                  >
                    <Plus className="h-4 w-4" />
                    新增一项礼物
                  </button>
                </>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-slate-900">PK 填写项</h3>
                  <p className="mt-1 text-sm text-slate-500">填写本场 PK 值。</p>
                  <label className="mt-4 block rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="text-sm font-medium text-slate-700">本场 PK 值</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={pkValue}
                      onChange={(event) => setPkValue(event.target.value)}
                      placeholder="例如：5000"
                      className="mt-3 app-field"
                    />
                  </label>
                </>
              )}
            </section>

            {submitError ? (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {submitError}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={submitMutation.isPending}
                className="app-btn-primary w-full justify-center px-5 lg:w-auto"
              >
                {submitMutation.isPending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    正在提交
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {isEditMode ? '重新提交记录' : '提交记录'}
                  </>
                )}
              </button>
            </div>
          </>
        ) : null}
      </form>

      <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-none lg:rounded-3xl lg:p-6 lg:shadow-soft">
        <p className="text-sm font-medium text-brand-600">奖励参考</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-900">提交前奖励预览</h3>
        <p className="mt-2 hidden text-sm leading-6 text-slate-500 lg:block">根据当前填写内容实时预估奖励结果。</p>

        {pageData?.item.formConfig.mode === 'gift_collection' ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Gift className="h-4 w-4 text-brand-600" />
              本次预计奖励
            </div>

            {previewQuery.isLoading ? (
              <div className="mt-3 flex items-center text-sm text-slate-500">
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                正在计算奖励，请稍候...
              </div>
            ) : previewQuery.data?.mode === 'gift_collection' ? (
              <>
                <p className="mt-3 text-sm text-slate-600">{previewQuery.data.rewardSummaryText}</p>

                {(previewQuery.data.dailyTotals.length > 0 || previewQuery.data.matchedRewards.length > 0) ? (
                  <div className="mt-4 lg:hidden">
                    <button
                      type="button"
                      onClick={() => setRewardDetailsOpen((current) => !current)}
                      className="app-btn-secondary w-full justify-center px-4 py-2 text-xs"
                    >
                      {rewardDetailsOpen ? '收起详情' : '展开详情'}
                    </button>
                  </div>
                ) : null}

                <div className={rewardDetailsOpen ? 'mt-4 space-y-4' : 'mt-4 hidden space-y-4 lg:block'}>
                  {previewQuery.data.dailyTotals.length > 0 ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">今日累计后数量</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {previewQuery.data.dailyTotals.map((item) => (
                          <span key={item.itemName} className="rounded-full bg-white px-3 py-2 text-xs text-slate-600">
                            {item.itemName}：{item.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                      填写后会自动预估奖励。
                    </div>
                  )}

                  {previewQuery.data.matchedRewards.length > 0 ? (
                    <div className="space-y-2">
                      {previewQuery.data.matchedRewards.map((rule, index) => (
                        <div
                          key={`${rule.itemName ?? 'reward'}-${index}`}
                          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                        >
                          <p className="text-sm font-medium text-emerald-800">{rule.rewardLabel}</p>
                          <p className="mt-1 text-xs text-emerald-700">
                            {rule.itemName ? `${rule.itemName} ` : ''}
                            {rule.compareMode === 'eq' ? '等于' : '达到'} {rule.threshold}
                            {metricUnit ? ` ${metricUnit}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
                填写后会自动预估奖励。
              </div>
            )}
          </div>
        ) : null}
      </aside>

      {previewImageUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-8">
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-soft">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <p className="text-sm font-medium text-slate-700">截图预览</p>
              <button type="button" onClick={handleClosePreview} className="app-btn-secondary px-4 py-2">
                关闭
              </button>
            </div>

            <div className="max-h-[72vh] overflow-auto bg-slate-50 px-5 py-5">
              {previewImageError ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-700">
                  截图文件不存在，可能已被删除或清理。
                </div>
              ) : (
                <img
                  src={previewImageUrl}
                  alt="截图预览"
                  onError={() => setPreviewImageError(true)}
                  className="mx-auto max-h-[64vh] w-auto rounded-2xl border border-slate-200 bg-white object-contain"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {dialog}
    </section>
  )
}

async function uploadImages(files: File[]) {
  const formData = new FormData()
  
  // 核心修复：读取为 ArrayBuffer 再转 Blob，切断与原生 <input> 的联系
  for (const file of files) {
    const arrayBuffer = await file.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: file.type })
    formData.append('files', blob, file.name)
  }

  try {
    return await uploadFilesXhr<UploadImagesResponse>('/submissions/upload-images', formData)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : '截图上传失败')
  }
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10)
}

function createGiftSelectionRow(itemName = '', quantity = ''): GiftSelectionRow {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemName,
    quantity,
  }
}
