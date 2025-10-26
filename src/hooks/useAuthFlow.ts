import { useNavigate } from 'react-router-dom'
import { useLoginMutation, useRegisterMutation, useForgotPasswordMutation, useResetPasswordMutation, useVerifyOtpAndLoginMutation, useResendOtpMutation } from '@/services/authApi'
import { useAppDispatch } from '@/store/hooks'
import { setCredentials, User } from '@/store/authSlice'
import { toast } from 'sonner'

export function useHandleLogin() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [login, state] = useLoginMutation()

  async function submit(credentials: { email: string; password: string }) {
    try {
      const res = await login(credentials)
      if ('data' in res) {
        const data: any = res.data
        if (data?.accessToken) {
          // Store user data in Redux
          dispatch(setCredentials({
            user: data.user,
            accessToken: data.accessToken,
            refreshToken: data.refreshToken
          }))
          toast.success('Logged in successfully')
          navigate('/dashboard', { replace: true })
        } else if (data?.email) {
          console.log(res)
          toast.info(data.message)
          localStorage.setItem('pendingEmail', data.email)
          navigate('/otp', { replace: true })
        }
      } else if ('error' in res) {
        const err: any = res.error
        // Handle validation errors with specific field messages
        if (err?.data?.data && Array.isArray(err.data.data)) {
          const firstError = err.data.data[0]
          toast.error(firstError?.message || err?.data?.message || 'Login failed')
        } else {
          toast.error(err?.data?.message || 'Login failed')
        }
      }
    } catch (e) {
      toast.error('Something went wrong')
    }
  }

  return { submit, isLoading: state.isLoading }
}

export function useHandleSignup() {
  const navigate = useNavigate()
  const [registerUser, state] = useRegisterMutation()

  async function submit(values: { firstName: string; lastName: string; email: string; password: string; confirmPassword: string }) {
    if (values.password !== values.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    try {
      const res = await registerUser({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      })
      if ('data' in res) {
        localStorage.setItem('pendingEmail', values.email)
        toast.info('Account created. Please verify your email.')
        navigate('/otp', { replace: true })
      } else if ('error' in res) {
        const err: any = res.error
        // Handle validation errors with specific field messages
        if (err?.data?.data && Array.isArray(err.data.data)) {
          const firstError = err.data.data[0]
          toast.error(firstError?.message || err?.data?.message || 'Signup failed')
        } else {
          toast.error(err?.data?.message || 'Signup failed')
        }
      }
    } catch (e) {
      toast.error('Something went wrong')
    }
  }

  return { submit, isLoading: state.isLoading }
}

export function useHandleForgotPassword() {
  const navigate = useNavigate()
  const [forgotPassword, state] = useForgotPasswordMutation()

  async function submit(email: string) {
    try {
      const res = await forgotPassword({ email })
      if ('data' in res) {
        localStorage.setItem('pendingEmail', email)
        const message = (res.data as any)?.message || 'Reset link has been sent to your email.'
        toast.info(message)
        navigate('/login', { replace: true })
      } else if ('error' in res) {
        const err: any = res.error
        // Handle validation errors with specific field messages
        if (err?.data?.data && Array.isArray(err.data.data)) {
          const firstError = err.data.data[0]
          toast.error(firstError?.message || err?.data?.message || 'Request failed')
        } else {
          const msg = err?.data?.message || (err?.status === 404 ? 'Email not found' : 'Request failed')
          toast.error(msg)
        }
      }
    } catch (e) {
      toast.error('Something went wrong')
    }
  }

  return { submit, isLoading: state.isLoading }
}

export function useHandleResetPassword() {
  const navigate = useNavigate()
  const [resetPassword, state] = useResetPasswordMutation()

  async function submit(token: string, newPassword: string) {
    try {
      const res = await resetPassword({ token, newPassword })
      if ('data' in res) {
        toast.success('Password reset successfully')
        navigate('/login', { replace: true })
      } else if ('error' in res) {
        const err: any = res.error
        // Handle validation errors with specific field messages
        if (err?.data?.data && Array.isArray(err.data.data)) {
          const firstError = err.data.data[0]
          toast.error(firstError?.message || err?.data?.message || 'Reset failed')
        } else {
          const msg = err?.data?.message || (err?.status === 401 ? 'Invalid or expired token' : 'Reset failed')
          toast.error(msg)
        }
      }
    } catch (e) {
      toast.error('Something went wrong')
    }
  }

  return { submit, isLoading: state.isLoading }
}

export function useHandleOtp() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [verifyOtpAndLogin, verifyState] = useVerifyOtpAndLoginMutation()
  const [resendOtp, resendState] = useResendOtpMutation()

  async function submit(otp: string, email?: string) {
    const targetEmail = email || localStorage.getItem('pendingEmail')
    if (!targetEmail) {
      toast.error('Missing email for verification')
      return
    }
    try {
      const res = await verifyOtpAndLogin({ email: targetEmail, otp })
      console.log('OTP verification response:', res)
      if ('data' in res && res.data?.accessToken) {
        console.log('User data from backend:', res.data.user)
        
        // Ensure user has isEmailVerified set to true
        const userData = {
          ...(res.data.user as object),
          isEmailVerified: true
        }
        
        // Store user data in Redux
        dispatch(setCredentials({
          user: userData as User,
          accessToken: res.data.accessToken,
          refreshToken: res.data.refreshToken
        }))
        
        toast.success('Email verified, you are logged in')
        localStorage.removeItem('pendingEmail')
        
        // Force navigation after a small delay
        setTimeout(() => {
          console.log('Navigating to dashboard...')
          navigate('/dashboard', { replace: true })
        }, 100)
      } else if ('error' in res) {
        const err: any = res.error
        console.error('OTP verification error:', err)
        // Handle validation errors with specific field messages
        if (err?.data?.data && Array.isArray(err.data.data)) {
          const firstError = err.data.data[0]
          toast.error(firstError?.message || err?.data?.message || 'Invalid code')
        } else {
          toast.error(err?.data?.message || 'Invalid code')
        }
      }
    } catch (e) {
      console.error('OTP verification exception:', e)
      toast.error('Something went wrong')
    }
  }

  async function resend(email?: string) {
    const targetEmail = email || localStorage.getItem('pendingEmail')
    if (!targetEmail) {
      toast.error('No email to resend to')
      return
    }
    try {
      const res = await resendOtp({ email: targetEmail })
      if ('data' in res) {
        toast.info('OTP resent')
      } else if ('error' in res) {
        const err: any = res.error
        // Handle validation errors with specific field messages
        if (err?.data?.data && Array.isArray(err.data.data)) {
          const firstError = err.data.data[0]
          toast.error(firstError?.message || err?.data?.message || 'Failed to resend')
        } else {
          toast.error(err?.data?.message || 'Failed to resend')
        }
      }
    } catch (e) {
      toast.error('Something went wrong')
    }
  }

  return { submit, resend, isLoading: verifyState.isLoading, isResending: resendState.isLoading }
}