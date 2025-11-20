import axios, { AxiosInstance, AxiosError } from 'axios';
import { store } from '../store';
import { setCredentials } from '../store/authSlice';
import { ScriptData } from './geminiService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const normalizedBaseURL = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;

interface ScriptStorageResponse {
  success: boolean;
  message: string;
  data: {
    id: string;
    title?: string;
    data?: any;
    createdAt?: string;
    updatedAt?: string;
  };
}

interface ScriptListResponse {
  success: boolean;
  message: string;
  data: Array<{
    id: string;
    title?: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

class ScriptStorageService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/scripts`,
      timeout: 60000, // 1 minute (base64 stripped, so should be fast)
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
    let token = state.auth.accessToken;

    if (!token) {
      token = localStorage.getItem('accessToken');
      if (token) {
        store.dispatch(setCredentials({
          accessToken: token,
          user: state.auth.user || JSON.parse(localStorage.getItem('user') || 'null')
        }));
      }
    }

    return token;
  }

  private async refreshAccessToken(): Promise<string> {
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

        const state = store.getState();
        if (state.auth.user) {
          store.dispatch(setCredentials({
            accessToken,
            user: state.auth.user
          }));
        }

        localStorage.setItem('accessToken', accessToken);

        return accessToken;
      } catch (error) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        throw error;
      } finally {
        this.tokenRefreshPromise = null;
      }
    })();

    return this.tokenRefreshPromise;
  }

  /**
   * Save script data to database
   */
  async saveScript(data: {
    jsonData: any;
    selectedScript: ScriptData | null;
    threeScripts: ScriptData[];
    currentStep: string;
  }, title?: string): Promise<string> {
    try {
      const payload = {
        title: title || `Script ${new Date().toLocaleString()}`,
        data,
      };
      
      // Log payload size for debugging
      const payloadSize = new Blob([JSON.stringify(payload)]).size;
      const sizeInMB = payloadSize / (1024 * 1024);
      console.log('💾 Saving script to database:', {
        size: sizeInMB.toFixed(2) + ' MB',
        hasSelectedScript: !!data.selectedScript,
      });
      
      const response = await this.axiosInstance.post<ScriptStorageResponse>('/', payload);

      console.log('✅ Script saved to database:', response.data.data.id);
      return response.data.data.id;
    } catch (error: any) {
      console.error('❌ Failed to save script to database:', error);
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout - script data is too large. Please try again.');
      }
      throw new Error(error.response?.data?.message || error.message || 'Failed to save script');
    }
  }

  /**
   * Update existing script data
   */
  async updateScript(scriptId: string, data: {
    jsonData: any;
    selectedScript: ScriptData | null;
    threeScripts: ScriptData[];
    currentStep: string;
  }, title?: string): Promise<void> {
    try {
      const payload = {
        title,
        data,
      };
      
      // Log payload size for debugging
      const payloadSize = new Blob([JSON.stringify(payload)]).size;
      const sizeInMB = payloadSize / (1024 * 1024);
      console.log('💾 Updating script in database:', {
        scriptId,
        size: sizeInMB.toFixed(2) + ' MB',
      });
      
      await this.axiosInstance.put<ScriptStorageResponse>(`/${scriptId}`, payload);

      console.log('✅ Script updated in database:', scriptId);
    } catch (error: any) {
      console.error('❌ Failed to update script in database:', error);
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout - script data is too large. Please try again.');
      }
      throw new Error(error.response?.data?.message || error.message || 'Failed to update script');
    }
  }

  /**
   * Load script data from database
   */
  async loadScript(scriptId: string): Promise<{
    jsonData: any;
    selectedScript: ScriptData | null;
    threeScripts: ScriptData[];
    currentStep: string;
  }> {
    try {
      const response = await this.axiosInstance.get<ScriptStorageResponse>(`/${scriptId}`);
      return response.data.data.data;
    } catch (error: any) {
      console.error('❌ Failed to load script from database:', error);
      throw new Error(error.response?.data?.message || error.message || 'Failed to load script');
    }
  }

  /**
   * List user's scripts
   */
  async listScripts(): Promise<Array<{
    id: string;
    title?: string;
    createdAt: string;
    updatedAt: string;
  }>> {
    try {
      const response = await this.axiosInstance.get<ScriptListResponse>('/');
      return response.data.data;
    } catch (error: any) {
      console.error('❌ Failed to list scripts:', error);
      throw new Error(error.response?.data?.message || error.message || 'Failed to list scripts');
    }
  }

  /**
   * Delete script
   */
  async deleteScript(scriptId: string): Promise<void> {
    try {
      await this.axiosInstance.delete(`/${scriptId}`);
      console.log('✅ Script deleted from database:', scriptId);
    } catch (error: any) {
      console.error('❌ Failed to delete script:', error);
      throw new Error(error.response?.data?.message || error.message || 'Failed to delete script');
    }
  }
}

export const scriptStorageService = new ScriptStorageService();

