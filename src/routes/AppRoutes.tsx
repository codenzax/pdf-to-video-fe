import { Routes, Route, Navigate, Link } from 'react-router-dom'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import OTPPage from '@/pages/OTPPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import PdfToVideoPage from '@/pages/dashboard/PdfToVideoPage'
import ProfilePage from '@/pages/dashboard/ProfilePage'
import { ProtectedRoute, PublicRoute } from '@/components/routes/ProtectedRoute'
import ScriptGenerationPage from '@/pages/dashboard/ScriptGenerationPage'

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicRoute>
            <SignupPage />
          </PublicRoute>
        }
      />
      <Route
        path="/otp"
        element={
          <PublicRoute redirectTo="/dashboard">
            <OTPPage />
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            <ForgotPasswordPage />
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            <ResetPasswordPage />
          </PublicRoute>
        }
      />

      {/* Protected Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pdf-to-video"
        element={
          <ProtectedRoute>
            <PdfToVideoPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/script-generation"
        element={
          <ProtectedRoute>
            <ScriptGenerationPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <ProfilePage />
          </ProtectedRoute>
        }
      />
      {/* <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      /> */}

      {/* Default Routes */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route
        path="*"
        element={
          <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
            <div className="w-full max-w-sm text-center space-y-4">
              <p className="text-muted-foreground">Page not found.</p>
              <Link className="underline" to="/login">
                Go to Login
              </Link>
            </div>
          </div>
        }
      />
    </Routes>
  )
}
