import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_BASE_URL } from '@/lib/env';
import { store } from '@/store';

// Normalize base URL
let normalizedBaseURL = API_BASE_URL.trim().replace(/\/+$/, '');
if (!normalizedBaseURL.endsWith('/api/v1')) {
  normalizedBaseURL = `${normalizedBaseURL}/api/v1`;
}

export interface SnsConnection {
  id: string;
  userId: number;
  platform: 'youtube' | 'x';
  accountId: string | null;
  accountName: string | null;
  accountEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  tokenExpiresAt?: string | null;
}

export interface SnsConnectionStatus {
  connected: boolean;
  connection?: Omit<SnsConnection, 'accessToken' | 'refreshToken'>;
}

class SnsService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/sns`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor: Attach token
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await this.getAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor: Handle 401
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const newAccessToken = await this.refreshAccessToken();
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            }
            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            return Promise.reject(new Error('Session expired. Please refresh and log in.'));
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private async getAuthToken(): Promise<string | null> {
    const state = store.getState();
    const token = state.auth.accessToken;
    if (token) return token;

    // Fallback to localStorage if Redux doesn't have it
    const storedToken = localStorage.getItem('accessToken');
    return storedToken;
  }

  private async refreshAccessToken(): Promise<string> {
    // Prevent multiple simultaneous refresh attempts
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = (async () => {
      try {
        const state = store.getState();
        const refreshToken = state.auth.refreshToken || localStorage.getItem('refreshToken');

        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await axios.post(
          `${normalizedBaseURL}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const newAccessToken = (response.data as any).data?.accessToken;
        if (!newAccessToken) {
          throw new Error('No access token in refresh response');
        }

        // Update Redux store
        store.dispatch({ type: 'auth/setCredentials', payload: { accessToken: newAccessToken } });
        localStorage.setItem('accessToken', newAccessToken);

        return newAccessToken;
      } finally {
        this.tokenRefreshPromise = null;
      }
    })();

    return this.tokenRefreshPromise;
  }

  /**
   * Get YouTube authorization URL
   */
  async getYouTubeAuthUrl(): Promise<string> {
    try {
      const response = await this.axiosInstance.get('/youtube/authorize');
      return (response.data as any).data.authUrl;
    } catch (error: any) {
      console.error('❌ Failed to get YouTube auth URL:', error);
      throw new Error(error.response?.data?.message || 'Failed to get YouTube authorization URL');
    }
  }

  /**
   * Get X authorization URL (codeVerifier is stored server-side)
   */
  async getXAuthUrl(): Promise<string> {
    try {
      const response = await this.axiosInstance.get('/x/authorize');
      return (response.data as any).data.authUrl;
    } catch (error: any) {
      console.error('❌ Failed to get X auth URL:', error);
      throw new Error(error.response?.data?.message || 'Failed to get X authorization URL');
    }
  }

  /**
   * Get connection status for a platform
   */
  async getConnectionStatus(platform: 'youtube' | 'x'): Promise<SnsConnectionStatus> {
    try {
      const response = await this.axiosInstance.get(`/${platform}/status`);
      return (response.data as any).data;
    } catch (error: any) {
      console.error(`❌ Failed to get ${platform} connection status:`, error);
      throw new Error(error.response?.data?.message || `Failed to get ${platform} connection status`);
    }
  }

  /**
   * List all connections
   */
  async listConnections(): Promise<SnsConnection[]> {
    try {
      const response = await this.axiosInstance.get('/connections');
      return (response.data as any).data;
    } catch (error: any) {
      console.error('❌ Failed to list connections:', error);
      throw new Error(error.response?.data?.message || 'Failed to list connections');
    }
  }

  /**
   * Disconnect a platform
   */
  async disconnect(platform: 'youtube' | 'x'): Promise<void> {
    try {
      await this.axiosInstance.delete(`/${platform}/disconnect`);
    } catch (error: any) {
      console.error(`❌ Failed to disconnect ${platform}:`, error);
      throw new Error(error.response?.data?.message || `Failed to disconnect ${platform}`);
    }
  }
}

export const snsService = new SnsService();
