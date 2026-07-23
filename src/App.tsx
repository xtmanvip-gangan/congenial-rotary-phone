import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { AuthGate } from './components/AuthGate'
import { RoleWorkspaceSwitcher } from './components/RoleWorkspaceSwitcher'
import { useAuth } from './auth/AuthContext'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { AnchorActivitiesPage } from './pages/AnchorActivitiesPage'
import { AnchorSubmitPage } from './pages/AnchorSubmitPage'
import { ActivityManagementPage } from './pages/ActivityManagementPage'
import { AdminRecordActivityDetailPage } from './pages/AdminRecordActivityDetailPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { AdminRecordsPage } from './pages/AdminRecordsPage'
import { AuditActivationPage } from './pages/AuditActivationPage'
import { ExportCenterPage } from './pages/ExportCenterPage'
import { LoginPage } from './pages/LoginPage'
import { MyRecordsPage } from './pages/MyRecordsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OperatorAnchorsPage } from './pages/OperatorAnchorsPage'
import { OperatorOnboardingPage } from './pages/OperatorOnboardingPage'
import { RuleManagementPage } from './pages/RuleManagementPage'
import { StaffHomePage } from './pages/StaffHomePage'
import { StaffManagementPage } from './pages/StaffManagementPage'
import { TrainingCoursesPage } from './pages/TrainingCoursesPage'
import { TrainingSessionsPage } from './pages/TrainingSessionsPage'
import { OperatorTrainingPage } from './pages/OperatorTrainingPage'
import type { AppRole } from './lib/auth'

function App() {
  const { session, logout } = useAuth()
  const useMobileShell = !session || session.user.role === 'anchor'

  return (
    <div className={useMobileShell ? 'min-h-screen px-0 py-0 lg:px-8 lg:py-6' : 'min-h-screen px-4 py-6 sm:px-6 lg:px-8'}>
      <div
        className={
          useMobileShell
            ? 'mx-auto flex min-h-screen w-full flex-col bg-white lg:min-h-[calc(100vh-3rem)] lg:max-w-7xl lg:rounded-[28px] lg:border lg:border-slate-200/70 lg:bg-white/85 lg:shadow-soft lg:backdrop-blur'
            : 'mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col rounded-[28px] border border-slate-200/70 bg-white/85 shadow-soft backdrop-blur'
        }
      >
        <header
          className={
            useMobileShell
              ? 'border-b border-slate-200/80 px-4 py-4 sm:px-6 lg:px-6 lg:py-5'
              : 'border-b border-slate-200/80 px-6 py-5 sm:px-8'
          }
        >
          <div
            className={
              session
                ? 'flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'
                : 'flex flex-col items-center justify-center gap-2 text-center'
            }
          >
            <div className={session ? '' : 'max-w-2xl'}>
              <p className="text-sm font-medium text-brand-600">礼物收集活动管理系统</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                主播活动提报平台
              </h1>
            </div>
            {session ? (
              <div
                className={
                  useMobileShell
                    ? 'flex flex-col items-start gap-2 rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-soft sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-4'
                    : 'flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-soft'
                }
              >
                <div>
                  <p className={useMobileShell ? 'text-lg font-semibold text-slate-900 lg:text-xl' : 'text-xl font-semibold text-slate-900'}>
                    {session.user.name}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">当前角色：{formatRole(session.user.role)}</p>
                </div>
                <RoleWorkspaceSwitcher />
                <button
                  type="button"
                  onClick={logout}
                  className={useMobileShell ? 'app-btn-secondary px-4 py-2 sm:px-5 sm:py-3' : 'app-btn-secondary px-5 py-3'}
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </button>
              </div>
            ) : null}
          </div>

          {session ? <HeaderNavigation role={session.user.role} /> : null}
        </header>

        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 lg:px-4 lg:py-4">
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route
              path="/app/activities"
              element={
                <AuthGate allowRoles={['anchor']}>
                  <AnchorActivitiesPage />
                </AuthGate>
              }
            />
            <Route
              path="/app/activities/:activityId/submit"
              element={
                <AuthGate allowRoles={['anchor']}>
                  <AnchorSubmitPage />
                </AuthGate>
              }
            />
            <Route
              path="/app/records"
              element={
                <AuthGate allowRoles={['anchor']}>
                  <MyRecordsPage />
                </AuthGate>
              }
            />
            <Route
              path="/app/records/:recordId"
              element={
                <AuthGate allowRoles={['anchor']}>
                  <AnchorSubmitPage />
                </AuthGate>
              }
            />
            <Route
              path="/admin/staff"
              element={
                <AuthGate allowRoles={['super_admin']}>
                  <StaffManagementPage />
                </AuthGate>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <AuthGate allowRoles={['super_admin']}>
                  <AdminDashboardPage />
                </AuthGate>
              }
            />
            <Route
              path="/admin/records"
              element={
                <AuthGate allowRoles={['operator', 'super_admin']}>
                  <AdminRecordsPage />
                </AuthGate>
              }
            />
            <Route
              path="/admin/records/activity/:activityId"
              element={
                <AuthGate allowRoles={['operator', 'super_admin']}>
                  <AdminRecordActivityDetailPage />
                </AuthGate>
              }
            />
            <Route
              path="/admin/activities"
              element={
                <AuthGate allowRoles={['super_admin']}>
                  <ActivityManagementPage />
                </AuthGate>
              }
            />
            <Route
              path="/admin/rules"
              element={
                <AuthGate allowRoles={['operator', 'super_admin']}>
                  <RuleManagementPage />
                </AuthGate>
              }
            />
            <Route
              path="/admin/operators"
              element={
                <AuthGate allowRoles={['super_admin']}>
                  <Navigate to="/admin/staff" replace />
                </AuthGate>
              }
            />
            <Route
              path="/audit/activations"
              element={
                <AuthGate allowRoles={['audit_teacher', 'training_admin']}>
                  <AuditActivationPage />
                </AuthGate>
              }
            />
            <Route
              path="/operator/anchors"
              element={
                <AuthGate allowRoles={['operator']}>
                  <OperatorAnchorsPage />
                </AuthGate>
              }
            />
            <Route
              path="/operator/anchors/:anchorId/onboarding"
              element={
                <AuthGate allowRoles={['operator']}>
                  <OperatorOnboardingPage />
                </AuthGate>
              }
            />
            <Route
              path="/staff/home"
              element={
                <AuthGate
                  allowRoles={[
                    'audit_teacher',
                    'operator',
                    'training_teacher',
                    'training_admin',
                  ]}
                >
                  <StaffHomePage />
                </AuthGate>
              }
            />
            <Route
              path="/training/courses"
              element={
                <AuthGate allowRoles={['training_admin']}>
                  <TrainingCoursesPage />
                </AuthGate>
              }
            />
            <Route
              path="/training/sessions"
              element={
                <AuthGate allowRoles={['training_teacher', 'training_admin']}>
                  <TrainingSessionsPage />
                </AuthGate>
              }
            />
            <Route
              path="/operator/training"
              element={
                <AuthGate allowRoles={['operator']}>
                  <OperatorTrainingPage />
                </AuthGate>
              }
            />
            <Route
              path="/admin/exports"
              element={
                <AuthGate allowRoles={['operator', 'super_admin']}>
                  <ExportCenterPage />
                </AuthGate>
              }
            />
            <Route
              path="*"
              element={<NotFoundPage />}
            />
          </Routes>
        </main>
      </div>
    </div>
  )
}
type NavigationItem = {
  label: string
  to: string
}

function HeaderNavigation({ role }: { role: AppRole }) {
  const items = getNavigationItems(role)

  return (
    <nav
      className={
        role === 'anchor'
          ? 'mt-4 flex gap-2 overflow-x-auto border-t border-slate-200/80 pt-4 lg:mt-5 lg:flex-wrap lg:gap-3 lg:pt-5'
          : 'mt-5 flex flex-wrap gap-3 border-t border-slate-200/80 pt-5'
      }
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            [
              role === 'anchor'
                ? 'whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-medium transition lg:px-4'
                : 'rounded-2xl px-4 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-brand-600 text-white shadow-soft'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700',
            ].join(' ')
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function getNavigationItems(role: AppRole): NavigationItem[] {
  if (role === 'anchor') {
    return [
      { label: '活动列表', to: '/app/activities' },
      { label: '我的记录', to: '/app/records' },
    ]
  }

  if (role === 'super_admin') {
    return [
      { label: '员工与角色', to: '/admin/staff' },
      { label: '后台首页', to: '/admin/dashboard' },
      { label: '活动记录', to: '/admin/records' },
      { label: '活动管理', to: '/admin/activities' },
      { label: '规则管理', to: '/admin/rules' },
      { label: '导出中心', to: '/admin/exports' },
    ]
  }

  if (role === 'operator') {
    return [
      { label: '我的主播', to: '/operator/anchors' },
      { label: '培训代报名', to: '/operator/training' },
      { label: '活动记录', to: '/admin/records' },
      { label: '规则管理', to: '/admin/rules' },
      { label: '导出中心', to: '/admin/exports' },
    ]
  }

  if (role === 'training_admin') {
    return [
      { label: '课程管理', to: '/training/courses' },
      { label: '排课与场次', to: '/training/sessions' },
      { label: '主播激活', to: '/audit/activations' },
      { label: '工作台', to: '/staff/home' },
    ]
  }

  if (role === 'training_teacher') {
    return [
      { label: '场次执行', to: '/training/sessions' },
      { label: '工作台', to: '/staff/home' },
    ]
  }

  if (role === 'audit_teacher') {
    return [
      { label: '主播激活', to: '/audit/activations' },
      { label: '工作台', to: '/staff/home' },
    ]
  }

  return [{ label: '工作台', to: '/staff/home' }]
}

function formatRole(role: AppRole) {
  if (role === 'anchor') {
    return '主播'
  }

  if (role === 'operator') {
    return '运营老师'
  }

  if (role === 'audit_teacher') {
    return '审核老师'
  }

  if (role === 'training_teacher') {
    return '培训老师'
  }

  if (role === 'training_admin') {
    return '培训管理员'
  }

  return '超级管理员'
}

export default App
