import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface User {
  id: number
  email: string
  firstName: string
  lastName: string
  isEmailVerified: boolean
  role?: string
  isActive: boolean
  lastLoginAt?: string
  createdAt: string
  updatedAt: string
}

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
}

const initialState: AuthState = {
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,
}

// Helper function to validate user data
const isValidUser = (user: User | null): boolean => {
  return !!(user && user.id && user.email)
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action: PayloadAction<{ user: User; accessToken: string; refreshToken?: string }>) => {
      const { user, accessToken, refreshToken } = action.payload
      state.user = user
      state.accessToken = accessToken
      state.refreshToken = refreshToken || null
      state.isAuthenticated = true
    },
    updateTokens: (state, action: PayloadAction<{ accessToken: string; refreshToken?: string }>) => {
      const { accessToken, refreshToken } = action.payload
      state.accessToken = accessToken
      state.refreshToken = refreshToken || state.refreshToken
    },
    updateUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload
    },
    logout: (state) => {
      state.user = null
      state.accessToken = null
      state.refreshToken = null
      state.isAuthenticated = false
    },
    clearInvalidState: (state) => {
      // If user is authenticated but has invalid user data or email not verified, clear everything
      if (state.isAuthenticated && (!isValidUser(state.user) || (state.user && !state.user.isEmailVerified))) {
        state.user = null
        state.accessToken = null
        state.refreshToken = null
        state.isAuthenticated = false
      }
    },
  },
})

export const { setCredentials, updateTokens, updateUser, logout, clearInvalidState } = authSlice.actions
export default authSlice.reducer
