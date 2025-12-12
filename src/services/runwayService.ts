import axios, { AxiosInstance, AxiosError } from 'axios';
import { store } from '../store';
import { setCredentials, logout } from '../store/authSlice';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// Ensure API_BASE_URL ends with /api/v1
const normalizedBaseURL = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;

interface VideoGenerationRequest {
  prompt: string;
  model?: 'veo3' | 'veo3.1' | 'veo3.1_fast' | 'gen4_turbo';
  context?: {
    fullScript?: string;
    paperTitle?: string;
  };
}

interface VideoGenerationResponse {
  success: boolean;
  data: {
    taskId: string;
    status: string;
    message: string;
  };
  message: string;
}

interface TaskStatusResponse {
  success: boolean;
  data: {
    taskId: string;
    status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    output?: string[];
    error?: string;
  };
  message: string;
}

class RunwayService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/video`,
      timeout: 600000, // 10 minutes to avoid generation timeouts
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor: Attach token to every request
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor: Handle 401 errors and token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // If 401 and we haven't already retried
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // Try to refresh the token
            const newAccessToken = await this.refreshAccessToken();
            
            // Update the failed request with new token
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            }
            
            // Retry the original request
            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            // Refresh failed, reject with error message
            return Promise.reject(
              new Error('Session expired. Please log in again.')
            );
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Get authentication token from Redux store or localStorage
   */
  private async getAuthToken(): Promise<string | null> {
    // Try Redux store first
    const state = store.getState();
    let token = state.auth.accessToken;

    // If not in Redux, try localStorage
    if (!token) {
      token = localStorage.getItem('accessToken');
      
      // Sync to Redux if found
      if (token) {
        store.dispatch(setCredentials({ 
          accessToken: token,
          user: state.auth.user || JSON.parse(localStorage.getItem('user') || 'null')
        }));
      }
    }

    return token;
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<string> {
    // If already refreshing, return the existing promise
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = (async () => {
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await axios.post(
          `${normalizedBaseURL}/auth/refresh`,
          { refreshToken },
          { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000 
          }
        );

        const { accessToken } = response.data.data;

        // Update Redux store
        const state = store.getState();
        if (state.auth.user) {
          store.dispatch(setCredentials({
            accessToken,
            user: state.auth.user
          }));
        }

        // Update localStorage
        localStorage.setItem('accessToken', accessToken);

        return accessToken;
      } catch (error) {
        // Clear tokens and logout
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        store.dispatch(logout());
        throw error;
      } finally {
        this.tokenRefreshPromise = null;
      }
    })();

    return this.tokenRefreshPromise;
  }

  /**
   * Generate video from text prompt
   */
  async generateVideo(
    prompt: string,
    model: 'veo3' | 'veo3.1' | 'veo3.1_fast' | 'gen4_turbo' = 'veo3',
    context?: {
      fullScript?: string;
      paperTitle?: string;
    }
  ): Promise<{ taskId: string; status: string }> {
    try {
      const requestData: VideoGenerationRequest = {
        prompt,
        model,
        context,
      };

      const response = await this.axiosInstance.post<VideoGenerationResponse>(
        '/generate',
        requestData
      );

      console.log('✅ Full response received:', response.data);
      console.log('✅ Response data:', response.data.data);

      // Check if response has the expected structure
      if (!response.data || !response.data.data || !response.data.data.taskId) {
        console.error('❌ Invalid response structure:', response.data);
        throw new Error('Invalid response from server');
      }

      console.log('✅ Task ID:', response.data.data.taskId);
      console.log('✅ Status:', response.data.data.status);

      return {
        taskId: response.data.data.taskId,
        status: response.data.data.status,
        output: (response.data.data as any).output, // Include output if present
      } as any;
    } catch (error: any) {
      console.error('Video generation error:', error);
      console.error('Error response:', error.response?.data);
      
      // Extract detailed error message from backend
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      
      if (error.response?.data?.error) {
        throw new Error(error.response.data.error);
      }

      if (error.response?.status === 500) {
        throw new Error('Backend server error. Check backend terminal for details.');
      }
      
      throw new Error(error.message || 'Failed to generate video');
    }
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId: string): Promise<TaskStatusResponse['data']> {
    try {
      const response = await this.axiosInstance.get<TaskStatusResponse>(
        `/status/${taskId}`
      );

      if (!response.data.success) {
        throw new Error(response.data.message || 'Failed to get task status');
      }

      return response.data.data;
    } catch (error: any) {
      console.error('Get task status error:', error);
      
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      
      throw new Error(error.message || 'Failed to get task status');
    }
  }

  /**
   * Poll task status until completion
   */
  async pollTaskUntilComplete(
    taskId: string,
    onProgress?: (status: string) => void,
    maxAttempts: number = 60,
    intervalMs: number = 5000
  ): Promise<string[]> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.getTaskStatus(taskId);

      if (onProgress) {
        onProgress(status.status);
      }

      if (status.status === 'COMPLETED') {
        if (!status.output || status.output.length === 0) {
          throw new Error('Video generated but no output URL received');
        }
        return status.output;
      }

      if (status.status === 'FAILED') {
        throw new Error(
          status.error || 'Video generation failed'
        );
      }

      // Status is IN_QUEUE or IN_PROGRESS, wait and retry
      await this.delay(intervalMs);
      attempts++;
    }

    throw new Error(`Video generation timed out after ${maxAttempts} attempts`);
  }

  /**
   * Utility function to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const runwayService = new RunwayService();

