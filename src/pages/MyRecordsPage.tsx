import { useQuery } from '@tanstack/react-query'
import { Eye, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'
import { grantStatusClassMap, grantStatusTextMap, reviewStatusClassMap, reviewStatusTextMap } from '../lib/statusBadges'

type SubmissionRecordItem = {
  id: string
  activity: {
    id: string
    name: string
    typeName: string
  }
  anchorName: string
  operatorName: string
  liveDate: string
  liveStartTime: string
  reviewStatus: 'pending' | 'approved' | 'rejected'
  grantStatus: 'pending' | 'granted'
  rejectReason: string | null
  createdAt: string
  items: Array<{
    itemName: string
    quantity: number
  }>
  attachmentUrls: string[]
  rewardSummaryText: string
}

type MySubmissionsResponse = {
  items: SubmissionRecordItem[]
}

export function MyRecordsPage() {
  const navigate = useNavigate()
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewImageError, setPreviewImageError] = useState(false)
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null)
  const recordsQuery = useQuery({
    queryKey: ['my-submissions'],
    queryFn: () => apiJson<MySubmissionsResponse>('/submissions/mine'),
  })

  function handleOpenPreview(url: string) {
    setPreviewImageError(false)
    setPreviewImageUrl(url)
  }

  function handleClosePreview() {
    setPreviewImageError(false)
    setPreviewImageUrl(null)
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-none lg:rounded-3xl lg:p-6 lg:shadow-soft">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600">我的记录</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">最近提交记录</h2>
          <p className="mt-2 hidden text-sm leading-6 text-slate-500 lg:block">查看提报进度、审核结果和发放状态。</p>
        </div>
        <button
          type="button"
          onClick={() => void recordsQuery.refetch()}
          className="app-btn-secondary"
        >
          <RefreshCw className="h-4 w-4" />
          刷新记录
        </button>
      </div>

      {recordsQuery.isLoading ? (
        <LoadingBlock text="正在加载记录，请稍候..." minHeightClassName="min-h-64" />
      ) : recordsQuery.isError ? (
        <ErrorBlock message={recordsQuery.error instanceof Error ? recordsQuery.error.message : '记录加载失败'} />
      ) : recordsQuery.data && recordsQuery.data.items.length > 0 ? (
        <div className="mt-6 space-y-4">
          {recordsQuery.data.items.map((item) => {
            const isExpanded = expandedRecordId === item.id

            return (
              <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 lg:rounded-3xl lg:p-5">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-slate-900">{item.activity.name}</h3>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                  {item.activity.typeName}
                </span>
                <span className={reviewStatusClassMap[item.reviewStatus]}>{reviewStatusTextMap[item.reviewStatus]}</span>
                <span className={grantStatusClassMap[item.grantStatus]}>{grantStatusTextMap[item.grantStatus]}</span>
              </div>

              <div className="mt-3 space-y-2 text-sm text-slate-500">
                <p>直播时间：{item.liveDate} {item.liveStartTime}</p>
                <p className="line-clamp-2">命中奖励：{item.rewardSummaryText}</p>
              </div>

              <div className="mt-4 flex flex-col gap-3 lg:hidden">
                <button
                  type="button"
                  onClick={() => setExpandedRecordId((current) => (current === item.id ? null : item.id))}
                  className="app-btn-secondary w-full justify-center px-4 py-2 text-xs"
                >
                  {isExpanded ? '收起详情' : '展开详情'}
                </button>
              </div>

              <div className={isExpanded ? 'mt-4 space-y-4' : 'mt-4 hidden space-y-4 lg:block'}>
                <div className="grid gap-2 text-sm text-slate-500 lg:grid-cols-2">
                  <p>运营老师：{item.operatorName}</p>
                  <p>提交时间：{formatDateTime(item.createdAt)}</p>
                </div>

                <div className="rounded-2xl bg-white px-4 py-4">
                  <p className="text-sm font-medium text-slate-700">本次填写内容</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.items.map((entry) => (
                      <span
                        key={`${item.id}-${entry.itemName}`}
                        className="rounded-full bg-slate-100 px-3 py-2 text-xs text-slate-600"
                      >
                        {entry.itemName}：{entry.quantity}
                      </span>
                    ))}
                  </div>
                </div>

                {item.rejectReason ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                    驳回原因：{item.rejectReason}
                  </div>
                ) : null}

                {item.attachmentUrls.length > 0 ? (
                  <div className="flex flex-wrap gap-3">
                    {item.attachmentUrls.map((url, index) => (
                      <button
                        key={`${item.id}-attachment-${index}`}
                        type="button"
                        onClick={() => handleOpenPreview(url)}
                        className="app-btn-secondary px-4 py-2 text-xs text-brand-700 hover:text-brand-800"
                      >
                        <Eye className="h-4 w-4" />
                        查看截图 {index + 1}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {item.reviewStatus === 'rejected' ? (
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <p className="text-sm text-amber-700">该记录已驳回，可修改后重新提交。</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/app/records/${item.id}`)}
                    className="app-btn-primary w-full justify-center px-4 py-2 lg:w-auto"
                  >
                    重新编辑
                  </button>
                </div>
              ) : null}
            </article>
            )
          })}
        </div>
      ) : (
        <EmptyState title="还没有提报记录" description="去活动列表选择活动后开始提报。" />
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
    </section>
  )
}
