import { Navigate, useLocation } from 'react-router-dom'
import { useAppSelector } from '@/store/hooks'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)
  const location = useLocation()

  if (!isAuthenticated) {
    // Redirect to login page with return url
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // If user is authenticated but email is not verified, redirect to OTP
  if (user && !user.isEmailVerified) {
    return <Navigate to="/otp" replace />
  }

  return <>{children}</>
}

interface PublicRouteProps {
  children: React.ReactNode
  redirectTo?: string
}

export function PublicRoute({ children, redirectTo = '/dashboard' }: PublicRouteProps) {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)

  if (isAuthenticated) {
    // If user is authenticated but email is not verified, redirect to OTP
    if (user && !user.isEmailVerified) {
      return <Navigate to="/otp" replace />
    }
    // If user is authenticated and verified, redirect to dashboard
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
