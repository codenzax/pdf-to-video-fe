import { baseApi, TAGS } from '@/services/baseApi'

// Request/response types aligned with backend routes
type LoginRequest = { email: string; password: string }
type LoginResponse = { accessToken: string; refreshToken?: string; user?: unknown }

type RegisterRequest = {
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
}
type RegisterResponse = { accessToken?: string; refreshToken?: string; user?: unknown }

type ForgotPasswordRequest = { email: string }
type GenericMessageResponse = { message?: string }

type VerifyOtpRequest = { email: string; otp: string }
type VerifyOtpAndLoginRequest = VerifyOtpRequest

type ResendOtpRequest = { email: string }

type ResetPasswordRequest = { token: string; newPassword: string }

type RefreshRequest = { refreshToken: string }
type RefreshResponse = { accessToken: string }

type ChangePasswordRequest = { currentPassword: string; newPassword: string }
type DeleteAccountRequest = { password: string }

type UserProfile = { id: number; email: string; firstName?: string; lastName?: string; phone?: string }
type UpdateProfileRequest = Partial<Pick<UserProfile, 'firstName' | 'lastName' | 'phone'>>

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // POST /auth/register
    register: build.mutation<RegisterResponse, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      invalidatesTags: [TAGS.Auth],
      transformResponse: (resp: any) => resp?.data ?? resp,
    }),

    // POST /auth/login
    login: build.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: [TAGS.Auth],
      transformResponse: (resp: any) => {
        if (resp && typeof resp === 'object') {
          return { ...(resp.data ?? resp), message: resp.message }
        }
        return resp
      },
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          if (data?.accessToken) localStorage.setItem('accessToken', data.accessToken)
          if ((data as any)?.refreshToken) localStorage.setItem('refreshToken', (data as any).refreshToken!)
        } catch {}
      },
    }),

    // POST /auth/forgot-password
    forgotPassword: build.mutation<GenericMessageResponse, ForgotPasswordRequest>({
      query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }),
    }),

    // POST /auth/verify-otp
    verifyOtp: build.mutation<GenericMessageResponse, VerifyOtpRequest>({
      query: (body) => ({ url: '/auth/verify-otp', method: 'POST', body }),
      invalidatesTags: [TAGS.Auth],
    }),

    // POST /auth/verify-otp-and-login
    verifyOtpAndLogin: build.mutation<LoginResponse, VerifyOtpAndLoginRequest>({
      query: (body) => ({ url: '/auth/verify-otp-and-login', method: 'POST', body }),
      invalidatesTags: [TAGS.Auth],
      transformResponse: (resp: any) => {
        if (resp && typeof resp === 'object') {
          return { ...(resp.data ?? resp), message: resp.message }
        }
        return resp
      },
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          if (data?.accessToken) localStorage.setItem('accessToken', data.accessToken)
          if ((data as any)?.refreshToken) localStorage.setItem('refreshToken', (data as any).refreshToken!)
        } catch {}
      },
    }),

    // POST /auth/resend-otp
    resendOtp: build.mutation<GenericMessageResponse, ResendOtpRequest>({
      query: (body) => ({ url: '/auth/resend-otp', method: 'POST', body }),
    }),

    // POST /auth/reset-password
    resetPassword: build.mutation<GenericMessageResponse, ResetPasswordRequest>({
      query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }),
    }),

    // POST /auth/refresh
    refresh: build.mutation<RefreshResponse, RefreshRequest>({
      query: (body) => ({ url: '/auth/refresh', method: 'POST', body }),
      transformResponse: (resp: any) => resp?.data ?? resp,
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          const { data } = await queryFulfilled
          if (data?.accessToken) localStorage.setItem('accessToken', data.accessToken)
        } catch {}
      },
    }),

    // POST /auth/logout
    logout: build.mutation<GenericMessageResponse, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      invalidatesTags: [TAGS.Auth, TAGS.User],
      async onQueryStarted(_arg, { queryFulfilled }) {
        try {
          await queryFulfilled
        } finally {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
        }
      },
    }),

    // GET /auth/profile
    getProfile: build.query<UserProfile, void>({
      query: () => ({ url: '/auth/profile', method: 'GET' }),
      providesTags: [TAGS.User],
      transformResponse: (resp: any) => resp?.data ?? resp,
    }),

    // PUT /auth/profile
    updateProfile: build.mutation<UserProfile, UpdateProfileRequest>({
      query: (body) => ({ url: '/auth/profile', method: 'PUT', body }),
      invalidatesTags: [TAGS.User],
      transformResponse: (resp: any) => resp?.data ?? resp,
    }),

    // POST /auth/change-password
    changePassword: build.mutation<GenericMessageResponse, ChangePasswordRequest>({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
    }),

    // DELETE /auth/delete-account
    deleteAccount: build.mutation<GenericMessageResponse, DeleteAccountRequest>({
      query: (body) => ({ url: '/auth/delete-account', method: 'DELETE', body }),
      invalidatesTags: [TAGS.Auth, TAGS.User],
    }),
  }),
})

export const {
  useRegisterMutation,
  useLoginMutation,
  useForgotPasswordMutation,
  useVerifyOtpMutation,
  useVerifyOtpAndLoginMutation,
  useResendOtpMutation,
  useResetPasswordMutation,
  useRefreshMutation,
  useLogoutMutation,
  useGetProfileQuery,
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
} = authApi


