import { LoaderCircle, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiJson } from '../lib/api'
import { getRoleHomePath, type StoredSession } from '../lib/auth'

type LoginResponse = StoredSession

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setSession } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state') ?? undefined

    if (!code) {
      setError('未获取到企业微信登录信息，请从企业微信重新进入。')
      return
    }

    async function finishLogin() {
      try {
        const result = await apiJson<LoginResponse>('/auth/wecom/callback', {
          method: 'POST',
          body: JSON.stringify({ code, state }),
        })

        setSession(result)
        navigate(getRoleHomePath(result.user.role), { replace: true })
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : '企业微信登录失败，请重新进入后再试')
      }
    }

    void finishLogin()
  }, [navigate, searchParams, setSession])

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-slate-50/80 p-8 text-center shadow-soft">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-slate-900">正在登录中</h2>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          正在确认你的身份信息，完成后将自动进入对应页面。
        </p>

        {error ? (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-left text-sm leading-6 text-rose-600">
            {error}
          </div>
        ) : (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-50 px-4 py-2 text-sm text-brand-700">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            正在登录...
          </div>
        )}
      </div>
    </div>
  )
}
