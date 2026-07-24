import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Eye, RefreshCw } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { useConfirmDialog } from '../components/useConfirmDialog'
import { apiJson, getApiBaseUrl } from '../lib/api'
import {
  type AdminSubmissionsResponse,
  SummaryMetric,
  SubmissionDetailCard,
  groupSubmissionsForDisplay,
} from './adminRecordsShared'

type ActivitiesResponse = {
  items: Array<{
    id: string
    name: string
    coverUrl: string | null
    type: {
      typeName: string
    }
  }>
}

type RecordStatusFilter = 'all' | 'pending_review' | 'approved' | 'rejected' | 'pending_grant' | 'granted'

export function AdminRecordActivityDetailPage() {
  const { activityId } = useParams<{ activityId: string }>()
  const { session } = useAuth()
  const showOperatorColumn = session?.user.role === 'super_admin'
  const queryClient = useQueryClient()
  const { confirm, dialog } = useConfirmDialog()
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null)
  const [expandedProcessingId, setExpandedProcessingId] = useState<string | null>(null)
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({})
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [statusFilter, setStatusFilter] = useState<RecordStatusFilter>('all')
  const [operatorFilter, setOperatorFilter] = useState('')
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewImageError, setPreviewImageError] = useState(false)
  const [feedbackMessages, setFeedbackMessages] = useState<
    Record<string, { type: 'success' | 'error'; message: string } | undefined>
  >({})

  const recordsQuery = useQuery({
    queryKey: ['admin-submissions', activityId],
    queryFn: () =>
      apiJson<AdminSubmissionsResponse>(
        `/submissions/admin?activityId=${encodeURIComponent(activityId ?? '')}&page=1&pageSize=200`,
      ),
    enabled: Boolean(activityId),
  })

  const activitiesQuery = useQuery({
    queryKey: ['activities', 'record-detail'],
    queryFn: () => apiJson<ActivitiesResponse>('/activities'),
  })

  const reviewMutation = useMutation({
    mutationFn: async (payload: {
      submissionId: string
      status: 'approved' | 'rejected'
      rejectReason?: string
    }) => {
      const { submissionId, ...body } = payload

      return apiJson(`/submissions/${submissionId}/review`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
    },
  })

  const grantMutation = useMutation({
    mutationFn: async (payload: {
      submissionId: string
    }) =>
      apiJson(`/submissions/${payload.submissionId}/grant`, {
        method: 'POST',
        body: JSON.stringify({
          status: 'granted',
        }),
      }),
  })

  const activityRecords = useMemo(
    () => (recordsQuery.data?.items ?? []).filter((item) => item.activity.id === activityId),
    [activityId, recordsQuery.data?.items],
  )

  const operatorOptions = useMemo(
    () => Array.from(new Set(activityRecords.map((item) => item.operatorName).filter(Boolean))).sort(),
    [activityRecords],
  )

  const filteredRecords = useMemo(
    () =>
      activityRecords.filter((item) => {
        if (dateStart && item.liveDate < dateStart) {
          return false
        }

        if (dateEnd && item.liveDate > dateEnd) {
          return false
        }

        if (statusFilter === 'pending_review' && item.reviewStatus !== 'pending') {
          return false
        }

        if (statusFilter === 'approved' && item.reviewStatus !== 'approved') {
          return false
        }

        if (statusFilter === 'rejected' && item.reviewStatus !== 'rejected') {
          return false
        }

        if (
          statusFilter === 'pending_grant' &&
          !(item.reviewStatus === 'approved' && item.grantStatus === 'pending')
        ) {
          return false
        }

        if (statusFilter === 'granted' && item.grantStatus !== 'granted') {
          return false
        }

        if (
          session?.user.role === 'super_admin' &&
          operatorFilter.trim() &&
          !(item.operatorName || '').includes(operatorFilter.trim())
        ) {
          return false
        }

        return true
      }),
    [activityRecords, dateEnd, dateStart, operatorFilter, session?.user.role, statusFilter],
  )

  const groupedItems = useMemo(() => groupSubmissionsForDisplay(filteredRecords), [filteredRecords])

  const activityMeta = useMemo(() => {
    const activityInfo = activitiesQuery.data?.items.find((item) => item.id === activityId)
    const firstRecord = activityRecords[0]

    if (!activityInfo && !firstRecord) {
      return null
    }

    const activityCover = activityInfo?.coverUrl ?? null

    const operatorNames = Array.from(new Set(activityRecords.map((item) => item.operatorName).filter(Boolean)))
    const anchorCount = new Set(activityRecords.map((item) => item.anchorUserId)).size
    const pendingReviewCount = activityRecords.filter((item) => item.reviewStatus === 'pending').length
    const pendingGrantCount = activityRecords.filter(
      (item) => item.reviewStatus === 'approved' && item.grantStatus === 'pending',
    ).length

    return {
      activity: {
        id: activityInfo?.id ?? firstRecord!.activity.id,
        name: activityInfo?.name ?? firstRecord!.activity.name,
        typeName: activityInfo?.type.typeName ?? firstRecord!.activity.typeName,
      },
      coverUrl: activityCover ? `${getApiBaseUrl().replace('/api', '')}${activityCover}` : null,
      operatorSummary: operatorNames.join('、') || '--',
      anchorCount,
      pendingReviewCount,
      pendingGrantCount,
      totalRecordCount: groupedItems.length,
      hasRecords: activityRecords.length > 0,
    }
  }, [activitiesQuery.data?.items, activityId, activityRecords, groupedItems.length])

  function handleOpenPreview(url: string) {
    setPreviewImageError(false)
    setPreviewImageUrl(url)
  }

  function handleClosePreview() {
    setPreviewImageError(false)
    setPreviewImageUrl(null)
  }

  async function refreshRecordData() {
    await Promise.all([
      recordsQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: ['admin-submissions'] }),
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] }),
    ])
  }

  async function handleApprove(submissionId: string) {
    try {
      await reviewMutation.mutateAsync({
        submissionId,
        status: 'approved',
      })
      await refreshRecordData()
      setFeedbackMessages((current) => ({
        ...current,
        [submissionId]: {
          type: 'success',
          message: '审核已通过，状态已更新。',
        },
      }))
    } catch (error) {
      setFeedbackMessages((current) => ({
        ...current,
        [submissionId]: {
          type: 'error',
          message: error instanceof Error ? error.message : '审核通过失败',
        },
      }))
    }
  }

  async function handleReject(submissionId: string) {
    const rejectReason = rejectReasons[submissionId]?.trim() ?? ''
    if (!rejectReason) {
      setFeedbackMessages((current) => ({
        ...current,
        [submissionId]: {
          type: 'error',
          message: '请先填写驳回原因，再执行驳回。',
        },
      }))
      return
    }

    const approved = await confirm({
      title: '确认驳回这条记录吗？',
      message: '驳回后主播端会看到最新状态并可以重新编辑后再次提交。',
      confirmText: '确认驳回',
      variant: 'danger',
    })
    if (!approved) {
      return
    }

    try {
      await reviewMutation.mutateAsync({
        submissionId,
        status: 'rejected',
        rejectReason,
      })
      setRejectReasons((current) => ({
        ...current,
        [submissionId]: '',
      }))
      await refreshRecordData()
      setFeedbackMessages((current) => ({
        ...current,
        [submissionId]: {
          type: 'success',
          message: '已驳回并保存原因，主播端会看到最新状态。',
        },
      }))
    } catch (error) {
      setFeedbackMessages((current) => ({
        ...current,
        [submissionId]: {
          type: 'error',
          message: error instanceof Error ? error.message : '驳回失败',
        },
      }))
    }
  }

  async function handleGrant(submissionId: string) {
    try {
      const approved = await confirm({
        title: '确认标记为已发放吗？',
        message: '确认后系统会直接把这条记录标记为已发放。',
        confirmText: '确认发放',
        variant: 'primary',
      })
      if (!approved) {
        return
      }

      await grantMutation.mutateAsync({
        submissionId,
      })
      await refreshRecordData()
      setFeedbackMessages((current) => ({
        ...current,
        [submissionId]: {
          type: 'success',
          message: '已标记为已发放。',
        },
      }))
    } catch (error) {
      setFeedbackMessages((current) => ({
        ...current,
        [submissionId]: {
          type: 'error',
          message: error instanceof Error ? error.message : '发放操作失败',
        },
      }))
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin/records" className="app-btn-secondary px-4 py-2">
              <ArrowLeft className="h-4 w-4" />
              返回活动列表
            </Link>
            <p className="text-sm font-medium text-brand-600">记录管理</p>
          </div>
          <button type="button" onClick={() => void recordsQuery.refetch()} className="app-btn-secondary">
            <RefreshCw className="h-4 w-4" />
            刷新记录
          </button>
        </div>

        {activityMeta ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            {activityMeta.coverUrl ? (
              <img
                src={activityMeta.coverUrl}
                alt={activityMeta.activity.name}
                className="h-32 w-full rounded-[32px] border border-slate-200 object-cover lg:w-56"
              />
            ) : (
              <div className="flex h-32 w-full items-center justify-center rounded-[32px] border border-slate-200 bg-slate-100 text-sm text-slate-400 lg:w-56">
                暂无封面
              </div>
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                {activityMeta.activity.name}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {activityMeta.activity.typeName}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {recordsQuery.isLoading || activitiesQuery.isLoading ? (
        <LoadingBlock text="正在加载活动记录，请稍候..." minHeightClassName="min-h-64" />
      ) : recordsQuery.isError || activitiesQuery.isError ? (
        <ErrorBlock
          message={
            recordsQuery.error instanceof Error
              ? recordsQuery.error.message
              : activitiesQuery.error instanceof Error
                ? activitiesQuery.error.message
                : '活动记录加载失败'
          }
        />
      ) : activityMeta ? (
        <>
          {activityMeta.hasRecords ? (
            <>
              <div className="mt-6 grid gap-3 rounded-[32px] border border-slate-200 bg-slate-50/80 p-4 xl:grid-cols-4">
                <SummaryMetric label="合并记录数" value={`${activityMeta.totalRecordCount} 条`} />
                <SummaryMetric label="涉及主播" value={`${activityMeta.anchorCount} 人`} />
                <SummaryMetric label="待审核" value={`${activityMeta.pendingReviewCount} 条`} />
                <SummaryMetric label="待发放" value={`${activityMeta.pendingGrantCount} 条`} />
              </div>

              <div className="mt-6 rounded-[32px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="grid gap-4 lg:grid-cols-[220px_220px_1fr]">
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">开始日期</span>
                    <input
                      type="date"
                      value={dateStart}
                      onChange={(event) => setDateStart(event.target.value)}
                      className="mt-2 app-field"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">结束日期</span>
                    <input
                      type="date"
                      value={dateEnd}
                      onChange={(event) => setDateEnd(event.target.value)}
                      className="mt-2 app-field"
                    />
                  </label>
                  {session?.user.role === 'super_admin' ? (
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">运营老师</span>
                      <input
                        type="text"
                        list="record-operator-options"
                        value={operatorFilter}
                        onChange={(event) => setOperatorFilter(event.target.value)}
                        placeholder="输入运营名字筛选"
                        className="mt-2 app-field"
                      />
                      <datalist id="record-operator-options">
                        {operatorOptions.map((name) => (
                          <option key={name} value={name} />
                        ))}
                      </datalist>
                    </label>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {recordStatusFilters.map((filter) => {
                    const active = statusFilter === filter.value

                    return (
                      <button
                        key={filter.value}
                        type="button"
                        onClick={() => setStatusFilter(filter.value)}
                        className={
                          active
                            ? 'inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white'
                            : 'inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700'
                        }
                      >
                        {filter.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {groupedItems.length > 0 ? (
            <div className="mt-6 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)]">
              <div
                className={`hidden border-b border-slate-200/90 bg-slate-50/90 px-5 py-3 lg:grid lg:items-center lg:gap-3 ${
                  showOperatorColumn
                    ? 'lg:grid-cols-[1.28fr_1.02fr_0.88fr_0.78fr_0.92fr_0.82fr_0.82fr_140px]'
                    : 'lg:grid-cols-[1.35fr_1.08fr_0.92fr_0.82fr_0.9fr_0.9fr_140px]'
                }`}
              >
                {(showOperatorColumn ? superAdminRecordOverviewHeaders : operatorRecordOverviewHeaders).map((header) => (
                  <p
                    key={header}
                    className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400"
                  >
                    {header}
                  </p>
                ))}
              </div>

              <div className="divide-y divide-slate-100">
              {groupedItems.map((group) => {
                const isExpanded = expandedSubmissionId === group.id

                return (
                  <article
                    key={group.id}
                    className="overflow-hidden bg-white transition duration-300 hover:bg-slate-50/40"
                  >
                    <div
                      className={`grid grid-cols-2 gap-x-3 gap-y-4 px-5 py-4 lg:items-center ${
                        showOperatorColumn
                          ? 'lg:grid-cols-[1.28fr_1.02fr_0.88fr_0.78fr_0.92fr_0.82fr_0.82fr_140px]'
                          : 'lg:grid-cols-[1.35fr_1.08fr_0.92fr_0.82fr_0.9fr_0.9fr_140px]'
                      }`}
                    >
                      <RecordOverviewCell label="主播昵称" className="col-span-2 lg:col-span-1">
                        <div>
                          <p className="text-base font-semibold tracking-tight text-slate-900 lg:text-[15px]">
                            {group.anchorName}
                          </p>
                          <p className="mt-1 text-xs text-slate-400 lg:hidden">
                            最近提交于 {formatRecentDateTime(group.latestCreatedAt)}
                          </p>
                        </div>
                      </RecordOverviewCell>

                      <RecordOverviewCell label="提交时间">
                        <span className="text-sm text-slate-600">{formatRecentDateTime(group.latestCreatedAt)}</span>
                      </RecordOverviewCell>

                      <RecordOverviewCell label="直播日期">
                        <span className="text-sm font-medium text-slate-700">{group.liveDate}</span>
                      </RecordOverviewCell>

                      <RecordOverviewCell label="当天记录">
                        <span className="text-sm font-medium text-slate-700">{group.submissionCount} 场</span>
                      </RecordOverviewCell>

                      {showOperatorColumn ? (
                        <RecordOverviewCell label="跟进运营">
                          <span className="text-sm text-slate-600">{group.operatorSummary}</span>
                        </RecordOverviewCell>
                      ) : null}

                      <RecordOverviewCell label="审核状态">
                        <span className={group.reviewSummaryClassName}>{group.reviewSummaryText}</span>
                      </RecordOverviewCell>

                      <RecordOverviewCell label="发放状态">
                        <span className={group.grantSummaryClassName}>{group.grantSummaryText}</span>
                      </RecordOverviewCell>

                      <div className="col-span-2 flex justify-end pt-1 lg:col-span-1 lg:justify-self-end lg:pt-0">
                        <button
                          type="button"
                          onClick={() => setExpandedSubmissionId(isExpanded ? null : group.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {isExpanded ? '收起详情' : '查看详情'}
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="border-t border-slate-100 bg-gradient-to-b from-slate-50/70 to-white px-5 py-4">
                        <div className="space-y-3">
                          {group.records.map((item, index) => {
                            const reviewBusy =
                              reviewMutation.isPending && reviewMutation.variables?.submissionId === item.id
                            const grantBusy =
                              grantMutation.isPending && grantMutation.variables?.submissionId === item.id

                            return (
                              <SubmissionDetailCard
                                key={item.id}
                                item={item}
                                index={index}
                                processingExpanded={expandedProcessingId === item.id}
                                reviewBusy={reviewBusy}
                                grantBusy={grantBusy}
                                feedback={feedbackMessages[item.id]}
                                rejectReason={rejectReasons[item.id] ?? ''}
                                onOpenPreview={handleOpenPreview}
                                onRejectReasonChange={(value) =>
                                  setRejectReasons((current) => ({
                                    ...current,
                                    [item.id]: value,
                                  }))
                                }
                                onToggleProcessing={() =>
                                  setExpandedProcessingId((current) => (current === item.id ? null : item.id))
                                }
                                onApprove={() => void handleApprove(item.id)}
                                onReject={() => void handleReject(item.id)}
                                onGrant={() => void handleGrant(item.id)}
                              />
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </article>
                )
              })}
              </div>
            </div>
              ) : (
                <div className="mt-6">
                  <EmptyState
                    title="当前筛选下暂无记录"
                    description="调整筛选条件后再试。"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="mt-6">
              <EmptyState
                title="当前活动暂无提报记录"
                description="主播开始提交后，这里会显示具体记录。"
              />
            </div>
          )}
        </>
      ) : (
        <EmptyState
          title="未找到该活动"
          description="可能无查看权限，或活动已被删除。"
        />
      )}

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

function formatRecentDateTime(value: string) {
  return value.slice(0, 16).replace('T', ' ')
}

function RecordOverviewCell({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 lg:hidden">{label}</p>
      <div className="mt-1 lg:mt-0">{children}</div>
    </div>
  )
}

const superAdminRecordOverviewHeaders = ['主播昵称', '提交时间', '直播日期', '当天记录', '跟进运营', '审核状态', '发放状态', '操作']
const operatorRecordOverviewHeaders = ['主播昵称', '提交时间', '直播日期', '当天记录', '审核状态', '发放状态', '操作']

const recordStatusFilters: Array<{ value: RecordStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'pending_review', label: '待审核' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
  { value: 'pending_grant', label: '待发放' },
  { value: 'granted', label: '已发放' },
]
