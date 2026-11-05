import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { App } from './App'
import { useAuthStore } from './state/authStore'
import { AdminAnalytics } from './ui/admin/AdminAnalytics'
import { AdminCity } from './ui/admin/AdminCity'
import { AdminClock } from './ui/admin/AdminClock'
import { AdminCompliance } from './ui/admin/AdminCompliance'
import { AdminDashboard } from './ui/admin/AdminDashboard'
import { AdminEconomy } from './ui/admin/AdminEconomy'
import { AdminEvents } from './ui/admin/AdminEvents'
import { AdminInvestors } from './ui/admin/AdminInvestors'
import { AdminLayout } from './ui/admin/AdminLayout'
import { AdminLogs } from './ui/admin/AdminLogs'
import { AdminMissionBuilder } from './ui/admin/AdminMissionBuilder'
import { AdminMissions } from './ui/admin/AdminMissions'
import { AdminNpcs } from './ui/admin/AdminNpcs'
import { AdminPlayerDetail } from './ui/admin/AdminPlayerDetail'
import { AdminPlayers } from './ui/admin/AdminPlayers'
import { AdminRules } from './ui/admin/AdminRules'
import { AdminSectors } from './ui/admin/AdminSectors'
import { AdminSettings } from './ui/admin/AdminSettings'
import { AdminStages } from './ui/admin/AdminStages'
import { AdminUsers } from './ui/admin/AdminUsers'
import { BusinessCreationPage } from './ui/front/BusinessCreationPage'
import { ForgotPasswordPage } from './ui/front/ForgotPasswordPage'
import { LandingPage } from './ui/front/LandingPage'
import { LoginPage } from './ui/front/LoginPage'
import { RegisterPage } from './ui/front/RegisterPage'
import { VerifyEmailPage } from './ui/front/VerifyEmailPage'
import { homePathFor } from './ui/front/homePath'
import { LecturerAssignmentBuilder } from './ui/lecturer/LecturerAssignmentBuilder'
import { LecturerAssignments } from './ui/lecturer/LecturerAssignments'
import { LecturerClassDetail } from './ui/lecturer/LecturerClassDetail'
import { LecturerClasses } from './ui/lecturer/LecturerClasses'
import { LecturerCompanies } from './ui/lecturer/LecturerCompanies'
import { LecturerDashboard } from './ui/lecturer/LecturerDashboard'
import { LecturerEvents } from './ui/lecturer/LecturerEvents'
import { LecturerGrading } from './ui/lecturer/LecturerGrading'
import { LecturerLayout } from './ui/lecturer/LecturerLayout'
import { LecturerLeaderboard } from './ui/lecturer/LecturerLeaderboard'
import { LecturerLive } from './ui/lecturer/LecturerLive'
import { LecturerNotifications } from './ui/lecturer/LecturerNotifications'
import { LecturerObjectives } from './ui/lecturer/LecturerObjectives'
import { LecturerPerformance } from './ui/lecturer/LecturerPerformance'
import { LecturerReports } from './ui/lecturer/LecturerReports'
import { LecturerScenarios } from './ui/lecturer/LecturerScenarios'
import { LecturerSettings } from './ui/lecturer/LecturerSettings'
import { LecturerStudents } from './ui/lecturer/LecturerStudents'

/**
 * The application's front door.
 *
 * Public screens (landing, sign-up, verification, sign-in) sit above the game.
 * Everything behind a login is guarded by role, and the guard reads the role
 * the server assigned to the account — not anything the client claims.
 */
export function Root() {
  const status = useAuthStore((s) => s.status)

  useEffect(() => {
    void useAuthStore.getState().bootstrap()
  }, [])

  if (status === 'loading') return <Splash />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify" element={<VerifyEmailPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        <Route
          path="/onboarding/business"
          element={
            <RequireRole role="PLAYER">
              <BusinessCreationPage />
            </RequireRole>
          }
        />

        <Route
          path="/play"
          element={
            <RequirePlayer>
              <App />
            </RequirePlayer>
          }
        />

        <Route
          path="/admin"
          element={
            <RequireRole role="ADMIN">
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="players" element={<AdminPlayers />} />
          <Route path="players/:id" element={<AdminPlayerDetail />} />
          <Route path="stages" element={<AdminStages />} />
          <Route path="missions" element={<AdminMissions />} />
          <Route path="missions/new" element={<AdminMissionBuilder />} />
          <Route path="missions/:id" element={<AdminMissionBuilder />} />
          <Route path="npcs" element={<AdminNpcs />} />
          <Route path="investors" element={<AdminInvestors />} />
          <Route path="sectors" element={<AdminSectors />} />
          <Route path="city" element={<AdminCity />} />
          <Route path="clock" element={<AdminClock />} />
          <Route path="economy" element={<AdminEconomy />} />
          <Route path="rules" element={<AdminRules />} />
          <Route path="compliance" element={<AdminCompliance />} />
          <Route path="events" element={<AdminEvents />} />
          <Route path="analytics" element={<AdminAnalytics />} />
          <Route path="logs" element={<AdminLogs />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>

        <Route
          path="/lecturer"
          element={
            <RequireRole role="LECTURER">
              <LecturerLayout />
            </RequireRole>
          }
        >
          <Route index element={<LecturerDashboard />} />
          <Route path="classes" element={<LecturerClasses />} />
          <Route path="classes/:id" element={<LecturerClassDetail />} />
          <Route path="students" element={<LecturerStudents />} />
          <Route path="companies" element={<LecturerCompanies />} />
          <Route path="assignments" element={<LecturerAssignments />} />
          <Route path="assignments/new" element={<LecturerAssignmentBuilder />} />
          <Route path="assignments/:id" element={<LecturerAssignmentBuilder />} />
          <Route path="scenarios" element={<LecturerScenarios />} />
          <Route path="objectives" element={<LecturerObjectives />} />
          <Route path="live" element={<LecturerLive />} />
          <Route path="events" element={<LecturerEvents />} />
          <Route path="performance" element={<LecturerPerformance />} />
          <Route path="grading" element={<LecturerGrading />} />
          <Route path="leaderboard" element={<LecturerLeaderboard />} />
          <Route path="reports" element={<LecturerReports />} />
          <Route path="notifications" element={<LecturerNotifications />} />
          <Route path="settings" element={<LecturerSettings />} />
          <Route path="*" element={<Navigate to="/lecturer" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

/** Requires a signed-in account holding the given role. */
function RequireRole({ role, children }: { role: 'PLAYER' | 'ADMIN' | 'LECTURER'; children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)

  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />
  if (user.role !== role) return <Navigate to={homePathFor(user, profile)} replace />
  return <>{children}</>
}

/** Requires a player who has already created their business. */
function RequirePlayer({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)

  if (status !== 'authenticated' || !user) return <Navigate to="/login" replace />
  if (user.role !== 'PLAYER') return <Navigate to={homePathFor(user, profile)} replace />
  if (!profile) return <Navigate to="/onboarding/business" replace />
  return <>{children}</>
}

function Splash() {
  return (
    <div className="front">
      <div className="fo-auth">
        <div style={{ textAlign: 'center' }}>
          <span className="fo-brand__mark" style={{ margin: '0 auto 12px' }}>
            B
          </span>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading BUSINESSLIFE…</p>
        </div>
      </div>
    </div>
  )
}
