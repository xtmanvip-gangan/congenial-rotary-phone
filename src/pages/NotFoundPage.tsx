import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { getRoleHomePath } from '../lib/auth'

export function NotFoundPage() {
  const { session } = useAuth()
  const homePath = session ? getRoleHomePath(session.user.role) : '/'

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-soft">
      <p className="text-sm font-medium text-brand-600">页面不存在</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">未找到你访问的页面</h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">请检查链接，或返回首页继续操作。</p>
      <Link to={homePath} className="mt-6 inline-flex w-full sm:w-auto app-btn-primary">
        返回首页
      </Link>
    </section>
  )
}
