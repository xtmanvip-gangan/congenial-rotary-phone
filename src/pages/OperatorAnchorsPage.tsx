import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type AnchorItem = {
  id: string
  wecomName: string
  anchorDisplayName: string
  assignmentStatus: string
  status: string
  activatedAt: string
}

type PendingAssignment = {
  id: string
  status: string
  createdAt: string
  anchor: AnchorItem
}

export function OperatorAnchorsPage() {
  const queryClient = useQueryClient()
  const pendingQuery = useQuery({
    queryKey: ['operator-pending-assignments'],
    queryFn: () =>
      apiJson<{ items: PendingAssignment[] }>(
        '/operators/me/assignments/pending',
      ),
  })
  const anchorsQuery = useQuery({
    queryKey: ['operator-anchors'],
    queryFn: () =>
      apiJson<{ items: AnchorItem[] }>('/operators/me/anchors'),
  })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['operator-pending-assignments'],
      }),
      queryClient.invalidateQueries({ queryKey: ['operator-anchors'] }),
    ])
  }
  const confirmMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      apiJson(`/operator-assignments/${assignmentId}/confirm`, {
        method: 'POST',
      }),
    onSuccess: refresh,
  })
  const rejectMutation = useMutation({
    mutationFn: (payload: { assignmentId: string; reason: string }) =>
      apiJson(`/operator-assignments/${payload.assignmentId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: payload.reason }),
      }),
    onSuccess: refresh,
  })

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-6">
        <p className="text-sm font-medium text-amber-700">需要处理</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">主播归属确认</h2>
        <div className="mt-5 space-y-3">
          {pendingQuery.data?.items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-amber-200 bg-white p-4">
              <h3 className="font-semibold text-slate-900">
                {item.anchor.anchorDisplayName}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                企微：{item.anchor.wecomName} · 激活：
                {formatDateTime(item.anchor.activatedAt)}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="app-btn-primary"
                  onClick={() => confirmMutation.mutate(item.id)}
                >
                  确认归属
                </button>
                <button
                  type="button"
                  className="app-btn-secondary"
                  onClick={() => {
                    const reason = window.prompt('请输入驳回原因')
                    if (reason?.trim()) {
                      rejectMutation.mutate({
                        assignmentId: item.id,
                        reason,
                      })
                    }
                  }}
                >
                  驳回
                </button>
              </div>
            </article>
          ))}
          {!pendingQuery.isLoading && !pendingQuery.data?.items.length ? (
            <p className="text-sm text-slate-500">暂无待确认主播。</p>
          ) : null}
        </div>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-brand-600">固定归属</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">我的主播</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {anchorsQuery.data?.items.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900">{item.anchorDisplayName}</h3>
              <p className="mt-1 text-sm text-slate-500">企微：{item.wecomName}</p>
              <p className="mt-1 text-xs text-slate-400">
                激活：{formatDateTime(item.activatedAt)}
              </p>
            </article>
          ))}
          {!anchorsQuery.isLoading && !anchorsQuery.data?.items.length ? (
            <p className="text-sm text-slate-500">还没有已确认归属的主播。</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
