import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import {
  formatRoleLabel,
  getStaffNavGroups,
  isStaffRole,
  type NavGroup,
  type NavItem,
} from '../lib/navConfig'
import { BrandLockup, CompanyLogo } from './BrandMark'
import { RoleWorkspaceSwitcher } from './RoleWorkspaceSwitcher'

const SIDEBAR_COLLAPSED_KEY = 'shouji-sidebar-collapsed'

function isNavActive(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to
  if (pathname === to) return true
  return pathname.startsWith(`${to}/`)
}

function SidebarNavLink({
  item,
  collapsed,
  pathname,
}: {
  item: NavItem
  collapsed: boolean
  pathname: string
}) {
  const active = isNavActive(pathname, item.to, item.end)
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={[
        'group relative flex items-center rounded-xl text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
      ].join(' ')}
    >
      {active ? (
        <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-600" />
      ) : null}
      <Icon
        className={[
          'h-[18px] w-[18px] shrink-0',
          active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600',
        ].join(' ')}
      />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </NavLink>
  )
}

function SidebarNav({
  groups,
  collapsed,
  pathname,
}: {
  groups: NavGroup[]
  collapsed: boolean
  pathname: string
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-2.5 py-3">
      {groups.map((group, groupIndex) => (
        <div
          key={group.title}
          className={groupIndex === 0 ? 'mb-3' : 'mb-3 border-t border-slate-100 pt-3'}
        >
          {!collapsed ? (
            <p className="mb-1.5 px-3 text-[11px] font-medium tracking-wide text-slate-400">
              {group.title}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <SidebarNavLink
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

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
  const nameInitial = session.user.name?.trim()?.charAt(0) || '用'

  return (
    <div className="flex min-h-screen bg-[#f4f8fb] text-slate-900">
      {/* 桌面侧栏 */}
      <aside
        className={[
          'sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-slate-200/90 bg-white lg:flex',
          sidebarWidth,
          'transition-[width] duration-200 ease-out',
        ].join(' ')}
      >
        <div
          className={[
            'flex h-14 shrink-0 items-center border-b border-slate-100',
            collapsed ? 'justify-center px-2' : 'gap-1 px-3',
          ].join(' ')}
        >
          {!collapsed ? (
            <div className="min-w-0 flex-1">
              <BrandLockup compact />
            </div>
          ) : (
            <CompanyLogo className="h-8 w-8" />
          )}
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
            title={collapsed ? '展开导航' : '折叠导航'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        <SidebarNav
          groups={groups}
          collapsed={collapsed}
          pathname={location.pathname}
        />

        <div
          className={[
            'shrink-0 border-t border-slate-100',
            collapsed ? 'px-2 py-3' : 'px-3 py-3',
          ].join(' ')}
        >
          {collapsed ? (
            <div
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700"
              title={`${session.user.name} · ${formatRoleLabel(role)}`}
            >
              {nameInitial}
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-2.5 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {nameInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">
                  {session.user.name}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {formatRoleLabel(role)}
                </p>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 移动端抽屉 */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            aria-label="关闭菜单"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-[min(288px,86vw)] flex-col bg-white shadow-soft">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-100 px-3">
              <BrandLockup compact />
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"
                onClick={() => setMobileOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarNav
              groups={groups}
              collapsed={false}
              pathname={location.pathname}
            />
            <div className="shrink-0 border-t border-slate-100 px-3 py-3">
              <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-2.5 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {nameInitial}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {session.user.name}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {formatRoleLabel(role)}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 紧凑顶栏：与侧栏同高 h-14 */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 bg-white/95 px-3 backdrop-blur-md sm:px-5">
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
              <BrandLockup compact />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 py-1 pl-1 pr-3 sm:flex">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {nameInitial}
              </div>
              <div className="min-w-0 text-left">
                <p className="max-w-[8rem] truncate text-sm font-medium leading-tight text-slate-900 lg:max-w-[10rem]">
                  {session.user.name}
                </p>
                <p className="text-[11px] leading-tight text-slate-400">
                  {formatRoleLabel(role)}
                </p>
              </div>
            </div>
            <RoleWorkspaceSwitcher />
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 sm:px-3 sm:py-2 sm:text-sm"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden px-3 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
