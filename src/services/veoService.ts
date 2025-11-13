import { API_BASE_URL } from '@/lib/env'
import axios from 'axios'
import { store } from '@/store'
import { updateTokens } from '@/store/authSlice'

export interface VideoGenerationRequest {
  sentence: string
  context?: string
  duration?: number
}

export interface VideoGenerationResponse {
  videoId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  thumbnailUrl?: string
  duration?: number
  metadata?: {
    prompt: string
    generatedAt: string
  }
}

export interface VideoStatusResponse {
  videoId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  thumbnailUrl?: string
  duration?: number
  progress?: number
  error?: string
}

class VeoService {
  private baseURL: string
  private axiosInstance: ReturnType<typeof axios.create> | null = null

  constructor() {
    // Match the pattern used in grobidApi.ts - use API_BASE_URL directly
    // If API_BASE_URL is http://localhost:3001, append /api/v1/video
    // If API_BASE_URL already includes /api/v1, this will still work correctly
    const base = API_BASE_URL.endsWith('/api/v1') ? API_BASE_URL : `${API_BASE_URL}/api/v1`
    this.baseURL = `${base}/video`
  }

  /**
   * Get authentication token from Redux store or localStorage
   * Uses same pattern as baseApi.ts for consistency
   */
  private getAuthToken(): string | null {
    // Method 1: Get from Redux store directly (same as baseApi.ts)
    try {
      const state = store.getState() as { auth: { accessToken: string | null } }
      const reduxToken = state?.auth?.accessToken
      if (reduxToken) {
        // Also sync to localStorage for consistency
        localStorage.setItem('accessToken', reduxToken)
        return reduxToken
      }
    } catch (e) {
      console.warn('Failed to get token from Redux store:', e)
    }

    // Method 2: Get from localStorage
    const localStorageToken = localStorage.getItem('accessToken')
    if (localStorageToken) {
      return localStorageToken
    }
    
    // Method 3: Fallback to Redux persist store
    const authData = localStorage.getItem('persist:root')
    if (authData) {
      try {
        const parsed = JSON.parse(authData)
        const auth = parsed.auth ? JSON.parse(parsed.auth) : null
        if (auth?.accessToken) {
          const persistToken = auth.accessToken
          // Sync to localStorage and return
          localStorage.setItem('accessToken', persistToken)
          return persistToken
        }
      } catch (e) {
        console.warn('Failed to parse Redux persist data:', e)
      }
    }
    
    // No token found - this is a critical issue
    console.error('VeoService: No access token found in Redux store, localStorage, or persist store')
    console.error('User may need to log in again')
    
    return null
  }

  /**
   * Get axios instance with auth headers and automatic token refresh
   */
  private getAxiosInstance() {
    // Always return existing instance if available (interceptors check token on each request)
    if (this.axiosInstance) {
      return this.axiosInstance
    }

    const instance = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Request interceptor to add token - MUST run before every request
    instance.interceptors.request.use(
      (config) => {
        const token = this.getAuthToken()
        if (token) {
          config.headers.Authorization = `Bearer ${token}`
        } else {
          // Log error if token is missing
          console.error('VeoService: No access token available for request', config.url)
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    // Response interceptor to handle token refresh on 401
    instance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config

        // If 401 and haven't retried yet
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true

          try {
            // Get refresh token from Redux or localStorage
            const state = store.getState() as { auth: { refreshToken: string | null } }
            let refreshToken = state?.auth?.refreshToken || localStorage.getItem('refreshToken')
            
            if (!refreshToken) {
              const errorMsg = error.response?.data?.message || 'Authentication required'
              return Promise.reject(new Error(errorMsg))
            }

            const base = API_BASE_URL.endsWith('/api/v1') ? API_BASE_URL : `${API_BASE_URL}/api/v1`
            
            // Refresh token - handle both success and error responses
            let refreshResponse
            try {
              refreshResponse = await axios.post(
                `${base}/auth/refresh`,
                { refreshToken },
                { timeout: 10000 } // 10 second timeout
              )
            } catch (refreshAxiosError) {
              // If refresh endpoint itself fails (500, network error, etc.)
              if (axios.isAxiosError(refreshAxiosError)) {
                const status = refreshAxiosError.response?.status
                if (status === 500) {
                  console.error('Refresh token endpoint returned 500 error:', refreshAxiosError.response?.data)
                  return Promise.reject(new Error('Session refresh failed. Please log in again.'))
                }
                if (status === 401 || status === 400) {
                  // Invalid refresh token
                  return Promise.reject(new Error('Your session has expired. Please log in again.'))
                }
              }
              // Network or other errors
              return Promise.reject(new Error('Unable to refresh session. Please check your connection and try again.'))
            }

            const newAccessToken = refreshResponse.data?.data?.accessToken || refreshResponse.data?.accessToken
            
            if (!newAccessToken) {
              console.error('Refresh succeeded but no accessToken in response:', refreshResponse.data)
              return Promise.reject(new Error('Failed to refresh session. Please log in again.'))
            }

            // Save to ALL locations
            localStorage.setItem('accessToken', newAccessToken)
            
            // Update Redux store IMMEDIATELY using dispatch
            store.dispatch(updateTokens({ accessToken: newAccessToken }))
            
            // Update persist store
            try {
              const authData = localStorage.getItem('persist:root')
              if (authData) {
                const parsed = JSON.parse(authData)
                const auth = parsed.auth ? JSON.parse(parsed.auth) : null
                if (auth) {
                  auth.accessToken = newAccessToken
                  parsed.auth = JSON.stringify(auth)
                  localStorage.setItem('persist:root', JSON.stringify(parsed))
                }
              }
            } catch (e) {
              // Ignore persist errors
            }
            
            // CRITICAL: Update the request header with new token and retry
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
            return instance(originalRequest)
            
          } catch (refreshError) {
            // Refresh failed
            const originalErrorMsg = error.response?.data?.message || error.message || 'Request failed'
            return Promise.reject(new Error(originalErrorMsg))
          }
        }

        return Promise.reject(error)
      }
    )

    this.axiosInstance = instance
    return instance
  }

  /**
   * Generate video for a sentence
   */
  async generateVideo(request: VideoGenerationRequest): Promise<VideoGenerationResponse> {
    try {
      const response = await this.getAxiosInstance().post('/generate', request)
      return response.data.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Extract detailed error message from backend
        const backendMessage = error.response?.data?.message || error.response?.data?.error?.message
        const backendError = error.response?.data?.error
        
        let errorMsg = backendMessage || error.message || 'Failed to generate video'
        
        // Add more context for 500 errors
        if (error.response?.status === 500) {
          errorMsg = backendMessage || 'Server error during video generation. Check backend logs for details.'
          
          // Log the full error for debugging
          console.error('Backend video generation error:', {
            status: error.response.status,
            message: backendMessage,
            error: backendError,
            data: error.response.data
          })
        }
        
        throw new Error(errorMsg)
      }
      throw error
    }
  }

  /**
   * Get video generation status
   */
  async getVideoStatus(videoId: string): Promise<VideoStatusResponse> {
    try {
      const response = await this.getAxiosInstance().get(`/status/${videoId}`)
      return response.data.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          error.response?.data?.message || error.message || 'Failed to get video status'
        )
      }
      throw error
    }
  }

  /**
   * Regenerate video
   */
  async regenerateVideo(
    request: VideoGenerationRequest,
    feedback?: string
  ): Promise<VideoGenerationResponse> {
    try {
      const response = await this.getAxiosInstance().post('/regenerate', {
        ...request,
        feedback,
      })
      return response.data.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          error.response?.data?.message || error.message || 'Failed to regenerate video'
        )
      }
      throw error
    }
  }

  /**
   * Upload custom video for a sentence
   */
  async uploadVideo(sentenceId: string, videoFile: File): Promise<VideoGenerationResponse> {
    try {
      const formData = new FormData()
      formData.append('video', videoFile)
      formData.append('sentenceId', sentenceId)

      // Use the authenticated instance which handles token refresh automatically
      const instance = this.getAxiosInstance()
      const response = await instance.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      return response.data.data
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          error.response?.data?.message || error.message || 'Failed to upload video'
        )
      }
      throw error
    }
  }

  /**
   * Poll video status until completion or failure
   */
  async pollVideoStatus(
    videoId: string,
    onProgress?: (status: VideoStatusResponse) => void,
    maxAttempts: number = 60,
    intervalMs: number = 5000
  ): Promise<VideoStatusResponse> {
    let attempts = 0

    while (attempts < maxAttempts) {
      const status = await this.getVideoStatus(videoId)

      if (onProgress) {
        onProgress(status)
      }

      if (status.status === 'completed' || status.status === 'failed') {
        return status
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs))
      attempts++
    }

    throw new Error('Video generation timeout')
  }
}

export const veoService = new VeoService()

