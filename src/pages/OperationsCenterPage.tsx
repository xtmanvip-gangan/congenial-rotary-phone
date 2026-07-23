import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from 'lucide-react'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import type { IntegrationIncident, SystemJobRun } from '../lib/dashboard'
import { formatDateTime } from '../lib/dateTime'

export function OperationsCenterPage() {
  const queryClient = useQueryClient()
  const jobsQuery = useQuery({
    queryKey: ['operations', 'job-runs'],
    queryFn: () =>
      apiJson<{ items: SystemJobRun[] }>('/operations/job-runs'),
  })
  const incidentsQuery = useQuery({
    queryKey: ['operations', 'incidents'],
    queryFn: () =>
      apiJson<{ items: IntegrationIncident[] }>('/operations/incidents'),
  })
  const closeMutation = useMutation({
    mutationFn: (incidentId: string) =>
      apiJson(`/operations/incidents/${incidentId}/close`, {
        method: 'POST',
        body: JSON.stringify({ reason: '培训管理员已人工核对处理' }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['operations'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const loading = jobsQuery.isLoading || incidentsQuery.isLoading
  const error = jobsQuery.error ?? incidentsQuery.error

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">系统运维</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-900">
          任务监控与接口异常中心
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          查看培训定时任务的执行结果，以及企微、腾讯会议需要人工处理的异常。
        </p>
      </div>

      {loading ? <LoadingBlock text="正在加载运行状态..." /> : null}
      {error ? (
        <ErrorBlock message={error instanceof Error ? error.message : '运维数据加载失败'} />
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-lg font-semibold text-slate-900">最近任务</h3>
          <div className="mt-4 space-y-3">
            {(jobsQuery.data?.items ?? []).map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-800">{jobLabel(item.jobCode)}</p>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  扫描 {item.scannedCount} · 成功 {item.successCount} · 失败 {item.failureCount}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {formatDateTime(item.startedAt)}
                </p>
                {item.lastError ? (
                  <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {item.lastError}
                  </p>
                ) : null}
              </article>
            ))}
            {!loading && (jobsQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">暂时没有任务运行记录。</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
          <h3 className="text-lg font-semibold text-slate-900">外部接口异常</h3>
          <div className="mt-4 space-y-3">
            {(incidentsQuery.data?.items ?? []).map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <p className="font-medium text-slate-800">
                      {providerLabel(item.provider)} · {item.operation}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-2 text-sm text-slate-600">{item.errorMessage}</p>
                <p className="mt-2 text-xs text-slate-400">
                  发生 {item.occurrenceCount} 次 · 最近 {formatDateTime(item.lastOccurredAt)}
                </p>
                {item.status === 'open' ? (
                  <button
                    type="button"
                    className="app-btn-secondary mt-3 px-4 py-2"
                    disabled={closeMutation.isPending}
                    onClick={() => closeMutation.mutate(item.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    标记已处理
                  </button>
                ) : null}
              </article>
            ))}
            {!loading && (incidentsQuery.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">当前没有接口异常。</p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: string }) {
  const success = status === 'succeeded' || status === 'recovered' || status === 'closed'
  const running = status === 'running'
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
        success
          ? 'bg-emerald-50 text-emerald-700'
          : running
            ? 'bg-sky-50 text-sky-700'
            : 'bg-amber-50 text-amber-700',
      ].join(' ')}
    >
      {running ? <RefreshCw className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
      {status}
    </span>
  )
}

function providerLabel(provider: string) {
  if (provider === 'wecom') return '企业微信'
  if (provider === 'tencent_meeting') return '腾讯会议'
  return provider
}

function jobLabel(jobCode: string) {
  if (jobCode === 'training.one_hour_reminders') return '开课前一小时提醒'
  if (jobCode === 'notifications.retry_failed') return '失败通知重试'
  return jobCode
}
