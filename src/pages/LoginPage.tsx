import { LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiJson } from '../lib/api'
import { isWecomEnvironment } from '../lib/browserEnv'
import { getRoleHomePath, type StoredSession } from '../lib/auth'

export function LoginPage() {
  const { hydrated, session, setSession } = useAuth()
  const [loading, setLoading] = useState(false)
  const [wecomLoading, setWecomLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const inWecom = useMemo(() => isWecomEnvironment(), [])
  const sessionExpired =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('reason') === 'session-expired'

  if (hydrated && session) {
    return <Navigate to={getRoleHomePath(session.user.role)} replace />
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await apiJson<StoredSession>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password,
        }),
      })
      setSession(result)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '登录失败，请检查账号或密码')
    } finally {
      setLoading(false)
    }
  }

  async function handleWecomLogin() {
    setWecomLoading(true)
    setError(null)

    try {
      const result = await apiJson<{ url: string }>('/auth/wecom/url', {
        method: 'GET',
      })

      if (!result.url) {
        throw new Error('暂时无法打开企业微信登录，请稍后重试')
      }

      window.location.href = result.url
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '暂时无法打开企业微信登录，请稍后重试')
      setWecomLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-brand-50/60 p-8 shadow-soft sm:p-10">
        <div className="inline-flex items-center gap-2 rounded-full bg-brand-600/10 px-3 py-1 text-xs font-semibold text-brand-700">
          {inWecom ? <ShieldCheck className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />}
          {inWecom ? '企业微信登录' : '账号登录'}
        </div>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">
          {inWecom ? '企业微信登录' : '账号密码登录'}
        </h2>

        <div className="mt-8 rounded-3xl border border-slate-200 bg-white/90 p-6">
          {sessionExpired ? (
            <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              登录已过期，请重新登录后继续。
            </p>
          ) : null}

          {inWecom ? (
            <button
              type="button"
              disabled={wecomLoading}
              onClick={() => void handleWecomLogin()}
              className="app-btn-primary w-full py-4 text-base font-semibold"
            >
              {wecomLoading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {wecomLoading ? '正在打开企业微信登录...' : '企业微信登录'}
            </button>
          ) : (
            <form onSubmit={handleLogin}>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">账号</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="请输入账号"
                  className="mt-2 app-field"
                />
              </label>

              <label className="mt-4 block">
                <span className="text-sm font-medium text-slate-700">密码</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="请输入密码"
                  className="mt-2 app-field"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="app-btn-primary mt-6 w-full py-4 text-base font-semibold"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                {loading ? '正在登录...' : '登录'}
              </button>
            </form>
          )}

          {error ? (
            <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
