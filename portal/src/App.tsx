import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { ConfigBanner, LoadingState, PortalLayout, PortalLogo } from './components/ui'
import { LoginPage, AuthCallbackPage } from './pages/LoginPage'
import { AcceptInvitePage } from './pages/AcceptInvitePage'
import { WelcomePage } from './pages/WelcomePage'
import { DashboardPage } from './pages/DashboardPage'
import { SetPasswordPage } from './pages/SetPasswordPage'
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage'
import { AdminFamiliesPage } from './pages/admin/AdminFamiliesPage'
import { AdminFamilyFormPage } from './pages/admin/AdminFamilyFormPage'
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage'
import { AdminSendEmailPage } from './pages/admin/AdminSendEmailPage'
import { Link } from 'react-router-dom'

function HomePage() {
  const { profile, loading } = useAuth()
  if (loading) return <PortalLayout><LoadingState /></PortalLayout>
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />
  if (profile?.family_id && !profile.welcome_completed_at) return <Navigate to="/welcome" replace />
  if (profile?.family_id) return <Navigate to="/app" replace />

  return (
    <PortalLayout>
      <ConfigBanner />
      <div className="text-center max-w-md mx-auto space-y-6">
        <div className="flex justify-center">
          <PortalLogo className="!h-32 sm:!h-36" />
        </div>
        <h1 className="text-3xl font-display portal-page-title">Client portal</h1>
        <p className="text-breeze-muted text-sm leading-relaxed">
          Client login for current Breeze Swim families. Use the invite link Brielle sent, or sign in with
          your email on file.
        </p>
        <Link
          to="/login"
          className="inline-flex rounded-full bg-breeze-pink px-8 py-3 text-sm font-bold text-white hover:bg-breeze-coral"
        >
          Client login
        </Link>
      </div>
    </PortalLayout>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PortalLayout><LoadingState /></PortalLayout>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  if (loading) return <PortalLayout><LoadingState /></PortalLayout>
  if (profile?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />
      <Route
        path="/welcome"
        element={
          <RequireAuth>
            <WelcomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/set-password"
        element={
          <RequireAuth>
            <SetPasswordPage />
          </RequireAuth>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminDashboardPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/families"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminFamiliesPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/payments"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminPaymentsPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/email"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminSendEmailPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route
        path="/admin/families/:id"
        element={
          <RequireAuth>
            <RequireAdmin>
              <AdminFamilyFormPage />
            </RequireAdmin>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
