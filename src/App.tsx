import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './components/AuthGate'
import { AppShell } from './components/AppShell'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { ActivityManagementPage } from './pages/ActivityManagementPage'
import { AdminRecordActivityDetailPage } from './pages/AdminRecordActivityDetailPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { AdminRecordsPage } from './pages/AdminRecordsPage'
import { AuditActivationPage } from './pages/AuditActivationPage'
import { ExportCenterPage } from './pages/ExportCenterPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OperatorAnchorsPage } from './pages/OperatorAnchorsPage'
import { OperatorOnboardingPage } from './pages/OperatorOnboardingPage'
import { RuleManagementPage } from './pages/RuleManagementPage'
import { StaffHomePage } from './pages/StaffHomePage'
import { StaffManagementPage } from './pages/StaffManagementPage'
import { TrainingCoursesPage } from './pages/TrainingCoursesPage'
import { TrainingSessionsPage } from './pages/TrainingSessionsPage'
import { OperatorTrainingPage } from './pages/OperatorTrainingPage'
import { TrainingAttendancePage } from './pages/TrainingAttendancePage'
import { TrainingOperationsPage } from './pages/TrainingOperationsPage'
import { OperationsCenterPage } from './pages/OperationsCenterPage'
import { AnchorWebNoticePage } from './pages/AnchorWebNoticePage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />

      {/* 主播 Web 不承接业务，统一提示使用小程序 */}
      <Route
        path="/app/*"
        element={
          <AuthGate allowRoles={['anchor']}>
            <AnchorWebNoticePage />
          </AuthGate>
        }
      />

      {/* 员工后台：左侧导航 + 右侧内容 */}
      <Route
        element={
          <AuthGate
            allowRoles={[
              'super_admin',
              'operator',
              'audit_teacher',
              'training_teacher',
              'training_admin',
            ]}
          >
            <AppShell />
          </AuthGate>
        }
      >
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
          path="/admin/exports"
          element={
            <AuthGate allowRoles={['operator', 'super_admin']}>
              <ExportCenterPage />
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
          path="/operator/training"
          element={
            <AuthGate allowRoles={['operator']}>
              <OperatorTrainingPage />
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
          path="/training/attendance"
          element={
            <AuthGate
              allowRoles={['training_teacher', 'training_admin', 'super_admin']}
            >
              <TrainingAttendancePage />
            </AuthGate>
          }
        />
        <Route
          path="/training/operations"
          element={
            <AuthGate
              allowRoles={[
                'operator',
                'training_teacher',
                'training_admin',
                'super_admin',
              ]}
            >
              <TrainingOperationsPage />
            </AuthGate>
          }
        />
        <Route
          path="/operations"
          element={
            <AuthGate allowRoles={['training_admin', 'super_admin']}>
              <OperationsCenterPage />
            </AuthGate>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
