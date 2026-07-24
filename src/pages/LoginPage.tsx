import { LoaderCircle, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiJson } from '../lib/api'
import { isWecomEnvironment } from '../lib/browserEnv'
import { getRoleHomePath, type StoredSession } from '../lib/auth'

/**
 * 品牌标：默认 public/brand-logo.svg
 * 若有公司正式 logo，把文件放到 public/brand-logo.png 并改下方 src 即可
 */
function BrandMark({ className = '' }: { className?: string }) {
  return (
    <img src="/brand-logo.svg" alt="悦总统" className={className} />
  )
}

export function LoginPage() {
  const { hydrated, session, setSession } = useAuth()
  const [loading, setLoading] = useState(false)
  const [wecomLoading, setWecomLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const usernameRef = useRef<HTMLInputElement>(null)
  const inWecom = useMemo(() => isWecomEnvironment(), [])
  const sessionExpired =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('reason') === 'session-expired'

  useEffect(() => {
    if (!inWecom && hydrated && !session) {
      usernameRef.current?.focus()
    }
  }, [hydrated, inWecom, session])

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
      setError(
        nextError instanceof Error
          ? nextError.message
          : '暂时无法打开企业微信登录，请稍后重试',
      )
      setWecomLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex h-12 items-center border-b border-slate-200/80 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandMark className="h-8 w-8 rounded-lg object-contain shadow-sm" />
          <p className="text-sm font-semibold text-slate-900">悦总统</p>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft lg:grid-cols-[1.05fr_0.95fr]">
          {/* 左侧品牌区：几何光晕 + logo，文案极简 */}
          <section className="relative hidden overflow-hidden lg:flex lg:min-h-[440px] lg:flex-col lg:justify-between lg:px-10 lg:py-12">
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(145deg, #387eea 0%, #275fcb 48%, #1e3a8a 100%)',
              }}
            />
            {/* 装饰光斑 */}
            <div
              className="pointer-events-none absolute -left-16 -top-20 h-64 w-64 rounded-full opacity-40 blur-3xl"
              style={{ background: 'radial-gradient(circle, #93c5fd 0%, transparent 70%)' }}
            />
            <div
              className="pointer-events-none absolute -bottom-24 -right-10 h-72 w-72 rounded-full opacity-30 blur-3xl"
              style={{ background: 'radial-gradient(circle, #60a5fa 0%, transparent 70%)' }}
            />
            <div
              className="pointer-events-none absolute left-1/3 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full opacity-20 blur-2xl"
              style={{ background: 'radial-gradient(circle, #fff 0%, transparent 70%)' }}
            />
            {/* 细网格纹理 */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.9) 1px, transparent 1px)',
                backgroundSize: '28px 28px',
              }}
            />

            <div className="relative z-10">
              <BrandMark className="h-14 w-14 rounded-2xl object-contain shadow-lg ring-1 ring-white/25" />
              <h1 className="mt-8 text-3xl font-semibold tracking-tight text-white">
                悦总统
              </h1>
              <p className="mt-2 text-base text-blue-100/90">主播培训中台</p>
            </div>

            <p className="relative z-10 text-sm text-blue-100/70">内部系统</p>
          </section>

          {/* 右侧表单：少文案 */}
          <section className="flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-12">
            {!hydrated ? (
              <div className="flex flex-col items-center justify-center py-16 text-sm text-slate-500">
                <LoaderCircle className="h-6 w-6 animate-spin text-brand-600" />
              </div>
            ) : (
              <>
                <div className="mb-6 flex items-center gap-3 lg:hidden">
                  <BrandMark className="h-10 w-10 rounded-xl object-contain shadow-sm" />
                  <div>
                    <p className="text-base font-semibold text-slate-900">悦总统</p>
                    <p className="text-xs text-slate-400">主播培训中台</p>
                  </div>
                </div>

                <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                  {inWecom ? '员工登录' : '账号登录'}
                </h2>

                {sessionExpired ? (
                  <p className="mt-3 text-sm text-amber-700">登录已过期，请重新登录</p>
                ) : null}

                <div className="mt-6">
                  {inWecom ? (
                    <button
                      type="button"
                      disabled={wecomLoading}
                      onClick={() => void handleWecomLogin()}
                      className="app-btn-primary w-full py-3.5 text-sm font-semibold"
                    >
                      {wecomLoading ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" />
                      )}
                      {wecomLoading ? '正在打开…' : '企业微信登录'}
                    </button>
                  ) : (
                    <form onSubmit={handleLogin} className="space-y-4">
                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">账号</span>
                        <input
                          ref={usernameRef}
                          name="username"
                          autoComplete="username"
                          value={username}
                          onChange={(event) => setUsername(event.target.value)}
                          placeholder="账号"
                          className="mt-1.5 app-field"
                          required
                        />
                      </label>

                      <label className="block">
                        <span className="text-sm font-medium text-slate-700">密码</span>
                        <input
                          type="password"
                          name="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="密码"
                          className="mt-1.5 app-field"
                          required
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={loading || !username.trim() || !password}
                        className="app-btn-primary w-full py-3.5 text-sm font-semibold"
                      >
                        {loading ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <LockKeyhole className="h-4 w-4" />
                        )}
                        {loading ? '登录中…' : '登录'}
                      </button>
                    </form>
                  )}

                  {error ? (
                    <p
                      role="alert"
                      className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
                    >
                      {error}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
