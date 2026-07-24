import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { DailyReviewPanel } from '../components/DailyReviewPanel'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'

type Detail = {
  profile: { id: string; anchorDisplayName: string }
  reviews: {
    items: Array<{
      id: string
      reviewDate: string
      liveDurationMinutes: number | null
      sessionViewers: number | null
      peakOnline: number | null
      avgOnline: number | null
      newFans: number | null
      giftRevenueYuan: number | null
      pkCount: number | null
      bestThing: string | null
      biggestProblem: string | null
      tomorrowFocus: string | null
      leaderNote: string | null
      operator?: { id: string; displayName: string } | null
      createdAt: string
      updatedAt: string
    }>
    firstLiveReviewCompletedAt?: string | null
  }
}

/** 独立日复盘页（不进入档案） */
export function OperatorDailyReviewPage() {
  const { anchorId = '' } = useParams()

  const detailQuery = useQuery({
    queryKey: ['operator-anchor-detail', anchorId],
    enabled: Boolean(anchorId),
    queryFn: () =>
      apiJson<Detail>(
        `/operators/me/anchors/${encodeURIComponent(anchorId)}`,
      ),
  })

  if (detailQuery.isLoading) {
    return <LoadingBlock text="正在加载日复盘…" />
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="space-y-4">
        <Back />
        <ErrorBlock
          message={
            detailQuery.error instanceof Error
              ? detailQuery.error.message
              : '加载失败'
          }
        />
      </div>
    )
  }

  const name = detailQuery.data.profile.anchorDisplayName

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Back />
          <h2 className="mt-3 text-2xl font-semibold text-slate-900">
            {name} · 日复盘
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            按《主播日复盘表》记录开播数据与反思
          </p>
        </div>
        <button
          type="button"
          className="app-btn-secondary"
          disabled={detailQuery.isFetching}
          onClick={() => void detailQuery.refetch()}
        >
          <RefreshCw
            className={`h-4 w-4 ${detailQuery.isFetching ? 'animate-spin' : ''}`}
          />
          刷新
        </button>
      </div>

      <DailyReviewPanel
        anchorId={anchorId}
        items={detailQuery.data.reviews.items ?? []}
        canWrite
        canLeaderNote={false}
        queryKeyToInvalidate={['operator-anchor-detail', anchorId]}
      />
    </div>
  )
}

function Back() {
  return (
    <Link
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600"
      to="/operator/reviews"
    >
      <ArrowLeft className="h-4 w-4" />
      返回答疑复盘
    </Link>
  )
}
