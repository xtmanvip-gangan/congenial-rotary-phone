import { LoaderCircle, LockKeyhole, ShieldCheck, Smartphone } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
      {/* 顶条：与后台品牌一致 */}
      <header className="flex h-12 items-center border-b border-slate-200/80 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">
            悦
          </span>
          <div>
            <p className="text-sm font-semibold leading-none text-slate-900">悦总统</p>
            <p className="mt-0.5 text-[11px] leading-none text-slate-400">主播培训中台</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft lg:grid-cols-[1.05fr_0.95fr]">
          {/* 左侧说明 */}
          <section className="relative hidden flex-col justify-between bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-10 text-white lg:flex">
            <div>
              <p className="text-sm font-medium text-brand-100">内部运营后台</p>
              <h1 className="mt-3 text-2xl font-semibold leading-snug tracking-tight">
                礼物收集与培训运营
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-6 text-brand-100/90">
                统一管理主播开通、岗前孵化、礼物提报审核，以及培训排课与参会认定。
              </p>
            </div>

            <ul className="mt-10 space-y-3 text-sm text-brand-50/95">
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" />
                超级管理员：外部浏览器账号密码登录
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" />
                审核 / 运营 / 培训：企业微信自建应用进入
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/80" />
                主播：请使用企业微信小程序，不在本页登录
              </li>
            </ul>

            <p className="mt-10 text-xs text-brand-200/80">悦总统 · 内部系统，请勿外传账号</p>
          </section>

          {/* 右侧表单 */}
          <section className="flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-12">
            {!hydrated ? (
              <div className="flex flex-col items-center justify-center py-16 text-sm text-slate-500">
                <LoaderCircle className="h-6 w-6 animate-spin text-brand-600" />
                <p className="mt-3">正在准备登录…</p>
              </div>
            ) : (
              <>
                <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {inWecom ? (
                    <>
                      <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
                      企业微信环境
                    </>
                  ) : (
                    <>
                      <LockKeyhole className="h-3.5 w-3.5 text-brand-600" />
                      超级管理员入口
                    </>
                  )}
                </div>

                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
                  {inWecom ? '员工登录' : '账号登录'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {inWecom
                    ? '使用已开通后台权限的企微账号进入对应工作台。'
                    : '仅超级管理员可在此使用账号密码登录。员工请从企业微信自建应用进入。'}
                </p>

                {sessionExpired ? (
                  <div
                    role="status"
                    className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800"
                  >
                    登录已过期，请重新登录后继续。
                  </div>
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
                      {wecomLoading ? '正在打开企业微信…' : '企业微信一键登录'}
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
                          placeholder="请输入管理员账号"
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
                          placeholder="请输入密码"
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
                        {loading ? '正在登录…' : '登录后台'}
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

                <div className="mt-8 flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 text-xs leading-5 text-slate-500">
                  <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <p>
                    主播请打开企业微信小程序完成档案开通、活动提报与培训报名，无需在本页登录。
                  </p>
                </div>
              </>
            )}
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200/80 bg-white px-4 py-3 text-center text-[11px] text-slate-400">
        悦总统内部系统 · 仅限授权人员使用
      </footer>
    </div>
  )
}
