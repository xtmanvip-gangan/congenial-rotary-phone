import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { formatRoleLabel, getStaffNavGroups, isStaffRole } from '../lib/navConfig'
import { RoleWorkspaceSwitcher } from './RoleWorkspaceSwitcher'

const SIDEBAR_COLLAPSED_KEY = 'shouji-sidebar-collapsed'

export function AppShell() {
  const { session, logout } = useAuth()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  })

  const role = session?.user.role
  const groups = useMemo(
    () => (role && isStaffRole(role) ? getStaffNavGroups(role) : []),
    [role],
  )

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  if (!session || !role || !isStaffRole(role)) {
    return <Outlet />
  }

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-[248px]'

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* 桌面侧栏 */}
      <aside
        className={[
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200/80 bg-white lg:flex',
          sidebarWidth,
          'transition-[width] duration-200',
        ].join(' ')}
      >
        <div
          className={[
            'flex h-14 items-center border-b border-slate-100 px-3',
            collapsed ? 'justify-center' : 'justify-between gap-2',
          ].join(' ')}
        >
          {!collapsed ? (
            <div className="min-w-0 pl-1">
              <p className="truncate text-sm font-semibold text-brand-700">悦总统</p>
              <p className="truncate text-[11px] text-slate-400">培训中台</p>
            </div>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-700">
              悦
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
            title={collapsed ? '展开导航' : '折叠导航'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => (
            <div key={group.title} className="mb-4">
              {!collapsed ? (
                <p className="mb-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {group.title}
                </p>
              ) : (
                <div className="mb-1 border-t border-slate-100 first:border-0" />
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          [
                            'group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition',
                            collapsed ? 'justify-center' : '',
                            isActive
                              ? 'bg-brand-50 text-brand-700'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                          ].join(' ')
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive ? (
                              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-brand-600" />
                            ) : null}
                            <Icon
                              className={[
                                'h-4 w-4 shrink-0',
                                isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600',
                              ].join(' ')}
                            />
                            {!collapsed ? <span className="truncate">{item.label}</span> : null}
                          </>
                        )}
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        {!collapsed ? (
          <div className="border-t border-slate-100 px-3 py-3 text-[11px] leading-4 text-slate-400">
            当前角色：{formatRoleLabel(role)}
          </div>
        ) : null}
      </aside>

      {/* 移动端抽屉 */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="关闭菜单"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[280px] flex-col bg-white shadow-soft">
            <div className="flex h-14 items-center justify-between border-b border-slate-100 px-4">
              <div>
                <p className="text-sm font-semibold text-brand-700">悦总统</p>
                <p className="text-[11px] text-slate-400">培训中台</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              {groups.map((group) => (
                <div key={group.title} className="mb-4">
                  <p className="mb-1.5 px-2 text-[11px] font-medium text-slate-400">
                    {group.title}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      return (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                              [
                                'flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium',
                                isActive
                                  ? 'bg-brand-50 text-brand-700'
                                  : 'text-slate-600 hover:bg-slate-50',
                              ].join(' ')
                            }
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            {item.label}
                          </NavLink>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 紧凑顶栏 */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="打开菜单"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 lg:hidden">
              <p className="truncate text-sm font-semibold text-brand-700">悦总统</p>
            </div>
            <div className="hidden min-w-0 sm:block lg:pl-0">
              <p className="truncate text-sm text-slate-500">
                礼物收集与培训运营
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-[10rem] truncate text-sm font-medium text-slate-900">
                {session.user.name}
              </p>
              <p className="text-xs text-slate-400">{formatRoleLabel(role)}</p>
            </div>
            <RoleWorkspaceSwitcher />
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 sm:px-3 sm:py-2 sm:text-sm"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden px-3 py-4 sm:px-5 sm:py-5 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
