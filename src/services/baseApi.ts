import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { RootState } from '@/store'
import { API_BASE_URL } from '@/lib/env'

export const TAGS = {
  Auth: 'Auth',
  User: 'User',
  PdfProcessing: 'PdfProcessing',
} as const

type Tags = typeof TAGS[keyof typeof TAGS]

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE_URL,
  prepareHeaders: (headers, { getState }) => {
    const state = getState() as RootState
    const token = state.auth.accessToken
    if (token) headers.set('authorization', `Bearer ${token}`)
    headers.set('accept', 'application/json')
    return headers
  },
  credentials: 'include',
})

const baseQueryWithReauth: typeof rawBaseQuery = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions)

  // Only attempt refresh for protected, non-auth endpoints
  const urlPath = typeof args === 'string' ? args : (args as any)?.url ?? ''
  const isAuthPath = urlPath.startsWith('/auth/')

  if (!isAuthPath && result.error && (result.error as any).status === 401) {
    const state = api.getState() as RootState
    const refreshToken = state.auth.refreshToken
    if (refreshToken) {
      const refreshResult = await rawBaseQuery(
        {
          url: '/auth/refresh',
          method: 'POST',
          body: { refreshToken },
        },
        api,
        extraOptions,
      )
      const data = (refreshResult as any).data as { data?: { accessToken?: string } }
      const newAccessToken = data?.data?.accessToken
      if (newAccessToken) {
        // Dispatch action to update tokens in Redux
        api.dispatch({ type: 'auth/updateTokens', payload: { accessToken: newAccessToken } })
        return rawBaseQuery(args, api, extraOptions)
      } else {
        // Dispatch logout action
        api.dispatch({ type: 'auth/logout' })
      }
    }
  }

  return result
}

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: Object.values(TAGS) as Tags[],
  keepUnusedDataFor: 60,
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
})


