import { Navigate, useLocation } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store/hooks'
import { useEffect } from 'react'
import { clearInvalidState } from '@/store/authSlice'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)
  const location = useLocation()

  console.log('ProtectedRoute - isAuthenticated:', isAuthenticated)
  console.log('ProtectedRoute - user:', user)
  console.log('ProtectedRoute - user.isEmailVerified:', user?.isEmailVerified)

  if (!isAuthenticated) {
    console.log('Redirecting to login - not authenticated')
    // Redirect to login page with return url
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // If user is authenticated but email is not verified, redirect to OTP
  if (user && !user.isEmailVerified) {
    console.log('Redirecting to OTP - email not verified')
    return <Navigate to="/otp" replace />
  }

  console.log('Rendering protected content')
  return <>{children}</>
}

interface PublicRouteProps {
  children: React.ReactNode
  redirectTo?: string
}

export function PublicRoute({ children, redirectTo = '/dashboard' }: PublicRouteProps) {
  const { isAuthenticated, user } = useAppSelector((state) => state.auth)
  const dispatch = useAppDispatch()

  // Clear invalid auth state on app startup
  useEffect(() => {
    // Force clear auth state if user is stuck
    if (isAuthenticated && user && !user.isEmailVerified) {
      console.log('Clearing stuck auth state - user not properly verified')
      dispatch(clearInvalidState())
    } else {
      dispatch(clearInvalidState())
    }
  }, [dispatch, isAuthenticated, user])

  console.log('PublicRoute - isAuthenticated:', isAuthenticated)
  console.log('PublicRoute - user:', user)
  console.log('PublicRoute - user.isEmailVerified:', user?.isEmailVerified)

  if (isAuthenticated) {
    // If user is authenticated but email is not verified, redirect to OTP
    if (user && !user.isEmailVerified) {
      console.log('PublicRoute - redirecting to OTP (email not verified)')
      return <Navigate to="/otp" replace />
    }
    // If user is authenticated and verified, redirect to dashboard
    console.log('PublicRoute - redirecting to dashboard (authenticated and verified)')
    return <Navigate to={redirectTo} replace />
  }

  console.log('PublicRoute - rendering public content')
  return <>{children}</>
}
