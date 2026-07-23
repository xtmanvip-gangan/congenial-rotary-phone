import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, Plus, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBlock } from '../components/ErrorBlock'
import { LoadingBlock } from '../components/LoadingBlock'
import { apiJson } from '../lib/api'
import { formatDateTime } from '../lib/dateTime'

type OperatorItem = {
  id: string
  displayName: string
  wecomUserId: string
  username: string
  status: 'active' | 'disabled'
  createdAt: string
  updatedAt: string
}

type OperatorsResponse = {
  items: OperatorItem[]
}

type OperatorMutationResponse = {
  item: OperatorItem
}

const operatorsQueryKey = ['operators']

export function OperatorManagementPage() {
  const queryClient = useQueryClient()
  const [displayName, setDisplayName] = useState('')
  const [wecomUserId, setWecomUserId] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const operatorsQuery = useQuery({
    queryKey: operatorsQueryKey,
    queryFn: () => apiJson<OperatorsResponse>('/operators'),
  })

  const createMutation = useMutation({
    mutationFn: async (payload: {
      displayName: string
      username: string
      password: string
      wecomUserId?: string
    }) =>
      apiJson<OperatorMutationResponse>('/operators', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      setDisplayName('')
      setWecomUserId('')
      setUsername('')
      setPassword('')
      setSubmitError(null)
      await queryClient.invalidateQueries({ queryKey: operatorsQueryKey })
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : '新增运营老师失败')
    },
  })

  const statusMutation = useMutation({
    mutationFn: async (payload: { operatorId: string; status: 'active' | 'disabled' }) =>
      apiJson<OperatorMutationResponse>(`/operators/${payload.operatorId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: payload.status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: operatorsQueryKey })
    },
  })

  const activeCount = useMemo(
    () => operatorsQuery.data?.items.filter((item) => item.status === 'active').length ?? 0,
    [operatorsQuery.data?.items],
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)

    createMutation.mutate({
      displayName,
      username,
      password,
      wecomUserId: wecomUserId.trim() || undefined,
    })
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-600/10 px-3 py-1 text-xs font-medium text-brand-700">
          <ShieldCheck className="h-4 w-4" />
          超级管理员功能
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">后台账号管理</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          在这里创建运营老师后台账号。后台账号使用独立的账号密码登录；如果后续还需要接收企微通知，可以补填企微 UserId。
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">运营老师姓名</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="例如：王老师"
              className="mt-2 app-field"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">登录账号</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="例如：wanglaoshi"
              className="mt-2 app-field"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">初始密码</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 6 位"
              className="mt-2 app-field"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">企微 UserId</span>
            <input
              value={wecomUserId}
              onChange={(event) => setWecomUserId(event.target.value)}
              placeholder="选填，用于接收企微通知"
              className="mt-2 app-field"
            />
          </label>

          {submitError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {submitError}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={createMutation.isPending}
            className="app-btn-primary w-full"
          >
            {createMutation.isPending ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                正在保存
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                新增后台账号
              </>
            )}
          </button>
        </form>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-600">当前已配置</p>
            <h3 className="mt-1 text-2xl font-semibold text-slate-900">
              共 {operatorsQuery.data?.items.length ?? 0} 个后台账号，启用中 {activeCount} 个
            </h3>
          </div>
          <button
            type="button"
            onClick={() => void operatorsQuery.refetch()}
            className="app-btn-secondary"
          >
            <RefreshCw className="h-4 w-4" />
            刷新列表
          </button>
        </div>

        {operatorsQuery.isLoading ? (
          <LoadingBlock text="正在加载后台账号列表..." minHeightClassName="min-h-64" />
        ) : operatorsQuery.isError ? (
          <ErrorBlock message={operatorsQuery.error instanceof Error ? operatorsQuery.error.message : '列表加载失败'} />
        ) : operatorsQuery.data && operatorsQuery.data.items.length > 0 ? (
          <div className="mt-6 space-y-4">
            {operatorsQuery.data.items.map((item) => {
              const isActive = item.status === 'active'

              return (
                <article
                  key={item.id}
                  className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                        <UserRound className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h4 className="text-lg font-semibold text-slate-900">{item.displayName}</h4>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {isActive ? '启用中' : '已停用'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">登录账号：{item.username}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          企微 UserId：{item.wecomUserId || '未绑定'}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          创建时间：{formatDateTime(item.createdAt)} | 更新时间：{formatDateTime(item.updatedAt)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={statusMutation.isPending}
                      onClick={() =>
                        statusMutation.mutate({
                          operatorId: item.id,
                          status: isActive ? 'disabled' : 'active',
                        })
                      }
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition bg-transparent ${
                        isActive
                          ? 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'
                          : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {statusMutation.isPending ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                          正在更新
                        </>
                      ) : isActive ? (
                        '停用账号'
                      ) : (
                        '重新启用'
                      )}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <EmptyState title="还没有后台账号" description="先在左侧创建账号，创建后运营老师即可直接使用账号密码登录后台。" />
        )}
      </section>
    </div>
  )
}
