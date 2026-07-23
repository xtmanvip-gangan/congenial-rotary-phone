import { Download, FileSpreadsheet, LoaderCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { getToken } from '../lib/auth'
import { apiJson, getApiBaseUrl } from '../lib/api'
import { isWecomEnvironment } from '../lib/browserEnv'
import { formatDateTimeRange } from '../lib/dateTime'
import { activityStatusClassMap, activityStatusTextMap } from '../lib/statusBadges'
import type { AdminSubmissionsResponse } from './adminRecordsShared'

type ActivityListResponse = {
  items: Array<{
    id: string
    name: string
    startAt: string
    endAt: string
    status: 'draft' | 'active' | 'ended' | 'disabled'
    itemCount: number
    ruleCount: number
    type: {
      typeName: string
    }
  }>
}

export function ExportCenterPage() {
  const { session } = useAuth()
  const [exportingActivityId, setExportingActivityId] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null)
  const [feedbackType, setFeedbackType] = useState<'success' | 'error' | null>(null)

  const activitiesQuery = useQuery({
    queryKey: ['export-activities'],
    queryFn: () => apiJson<ActivityListResponse>('/activities'),
  })

  const operatorRecordsQuery = useQuery({
    enabled: session?.user.role === 'operator',
    queryKey: ['export-operator-submissions'],
    queryFn: () => apiJson<AdminSubmissionsResponse>('/submissions/admin'),
  })

  const exportActivities = useMemo(() => {
    const allActivities = activitiesQuery.data?.items ?? []
    if (session?.user.role !== 'operator') {
      return allActivities
    }

    const allowedActivityIds = new Set((operatorRecordsQuery.data?.items ?? []).map((item) => item.activity.id))
    return allActivities.filter((activity) => allowedActivityIds.has(activity.id))
  }, [activitiesQuery.data?.items, operatorRecordsQuery.data?.items, session?.user.role])

  async function handleExport(activity: ActivityListResponse['items'][number]) {
    setExportingActivityId(activity.id)
    setFeedbackMessage(null)
    setFeedbackType(null)

    try {
      const token = getToken()
      const exportUrl = new URL(`${getApiBaseUrl()}/exports/submissions/xlsx`, window.location.origin)
      exportUrl.searchParams.set('activityId', activity.id)

      if (isWecomEnvironment()) {
        if (!token) {
          throw new Error('当前登录态无效，请重新登录后再导出。')
        }

        exportUrl.searchParams.set('token', token)
        const iframe = document.createElement('iframe')
        iframe.style.display = 'none'
        iframe.src = exportUrl.toString()
        document.body.appendChild(iframe)
        window.setTimeout(() => {
          iframe.remove()
        }, 60_000)

        setFeedbackType('success')
        setFeedbackMessage('已开始导出，请在企业微信中查看下载结果。')
        return
      }

      const headers = new Headers()

      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }

      const response = await fetch(exportUrl.toString(), {
        method: 'GET',
        headers,
      })

      if (!response.ok) {
        let message = `导出失败：${response.status}`

        try {
          const payload = (await response.json()) as { message?: string; error?: string }
          message = payload.message || payload.error || message
        } catch {
          message = `导出失败：${response.status}`
        }

        throw new Error(message)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `${activity.name}-${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)

      setFeedbackType('success')
      setFeedbackMessage('报表已开始下载。')
    } catch (error) {
      setFeedbackType('error')
      setFeedbackMessage(error instanceof Error ? error.message : '导出失败')
    } finally {
      setExportingActivityId(null)
    }
  }

  return (
    <div className="grid gap-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-brand-600">导出中心</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">活动记录报表导出</h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-500">
          {session?.user.role === 'operator'
            ? '按活动导出你权限范围内的记录报表，表格不包含截图链接。'
            : '按活动导出完整记录报表，表格不包含截图链接。'}
        </p>

        {feedbackMessage ? (
          <div
            className={`mt-6 rounded-2xl px-4 py-3 text-sm ${
              feedbackType === 'success'
                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border border-rose-200 bg-rose-50 text-rose-600'
            }`}
          >
            {feedbackMessage}
          </div>
        ) : null}

        {activitiesQuery.isLoading || operatorRecordsQuery.isLoading ? (
          <div className="mt-8">
            <LoadingBlock text="正在加载活动，请稍候..." minHeightClassName="min-h-48" />
          </div>
        ) : activitiesQuery.isError || operatorRecordsQuery.isError ? (
          <ErrorBlock
            message={
              activitiesQuery.error instanceof Error
                ? activitiesQuery.error.message
                : operatorRecordsQuery.error instanceof Error
                  ? operatorRecordsQuery.error.message
                  : '活动列表加载失败'
            }
          />
        ) : exportActivities.length > 0 ? (
          <div className="mt-6 space-y-4">
            {exportActivities.map((activity) => {
              const isExporting = exportingActivityId === activity.id

              return (
                <article
                  key={activity.id}
                  className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                        {activity.type.typeName}
                      </span>
                      <span className={activityStatusClassMap[activity.status]}>{activityStatusTextMap[activity.status]}</span>
                    </div>
                    <h3 className="mt-3 text-lg font-semibold text-slate-900">{activity.name}</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      活动时间：{formatDateTimeRange(activity.startAt, activity.endAt)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      已配置收集项 {activity.itemCount} 个，奖励规则 {activity.ruleCount} 条
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => void handleExport(activity)}
                    className="app-btn-primary px-5"
                  >
                    {isExporting ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        正在导出
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        导出
                      </>
                    )}
                  </button>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState
            title="当前暂无可导出活动"
            description={
              session?.user.role === 'operator'
                ? '你负责的活动产生记录后，可在这里导出报表。'
                : '活动产生记录后，可在这里导出报表。'
            }
          />
        )}
      </section>
    </div>
  )
}
