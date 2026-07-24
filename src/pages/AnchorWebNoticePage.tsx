import { useAuth } from '../auth/AuthContext'
import { BrandLockup } from '../components/BrandMark'
import { formatRoleLabel } from '../lib/navConfig'

/** 主播业务由企业微信小程序承接，Web 端仅提示 */
export function AnchorWebNoticePage() {
  const { session, logout } = useAuth()

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-soft">
        <div className="flex justify-center">
          <BrandLockup />
        </div>
        <h1 className="mt-6 text-center text-xl font-semibold text-slate-900">
          请使用主播小程序
        </h1>
        <p className="mt-3 text-center text-sm leading-6 text-slate-500">
          主播功能请在企业微信小程序中使用；本页为管理端入口。
        </p>
        {session ? (
          <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
            当前登录：{session.user.name}
            <span className="text-slate-400"> · </span>
            {formatRoleLabel(session.user.role)}
          </div>
        ) : null}
        <button
          type="button"
          onClick={logout}
          className="app-btn-primary mt-6 w-full"
        >
          退出登录
        </button>
      </div>
    </div>
  )
}
