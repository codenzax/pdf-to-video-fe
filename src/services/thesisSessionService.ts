import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_BASE_URL } from '@/lib/env';
import { store } from '@/store';

// Normalize base URL
let normalizedBaseURL = API_BASE_URL.trim().replace(/\/+$/, '');
if (!normalizedBaseURL.endsWith('/api/v1')) {
  normalizedBaseURL = `${normalizedBaseURL}/api/v1`;
}

export interface ThesisSession {
  id: string;
  title: string;
  currentStage: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  checkpointCount?: number;
  extractedData?: any;
  scriptData?: any;
  videoLogs?: any;
  checkpoints?: ThesisCheckpoint[];
}

export interface ThesisCheckpoint {
  id: string;
  sessionId: string;
  stageName: string;
  stageData: any;
  createdAt: string;
}

export interface CreateSessionPayload {
  title: string;
  extractedData?: any;
  currentStage?: string;
  scriptData?: any;
  videoLogs?: any;
}

export interface UpdateSessionPayload {
  title?: string;
  extractedData?: any;
  currentStage?: string;
  status?: string;
  scriptData?: any;
  videoLogs?: any;
}

class ThesisSessionService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/thesis/sessions`,
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
    return state.auth.accessToken || null;
  }

  private async refreshAccessToken(): Promise<string> {
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = (async () => {
      try {
        const state = store.getState();
        const refreshToken = state.auth.refreshToken;

        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await axios.post(
          `${normalizedBaseURL}/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const newAccessToken = response.data?.data?.accessToken;
        if (!newAccessToken) {
          throw new Error('Failed to refresh token');
        }

        // Update store with new token
        store.dispatch({ type: 'auth/updateTokens', payload: { accessToken: newAccessToken } });

        return newAccessToken;
      } finally {
        this.tokenRefreshPromise = null;
      }
    })();

    return this.tokenRefreshPromise;
  }

  /**
   * List all thesis sessions for the current user
   * Returns minimal metadata only for fast loading - use getSession(id) for full data
   */
  async listSessions(): Promise<ThesisSession[]> {
    try {
      const response = await this.axiosInstance.get('/', {
        timeout: 30000, // Reduced timeout since we're only loading metadata now
      });
      return response.data.data || [];
    } catch (error: any) {
      console.error('❌ ListSessions error:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
      });
      throw error;
    }
  }

  /**
   * Get session by ID with full details
   * @param lightweight - If true, excludes large JSON fields for faster loading. Use false when you need all data.
   */
  async getSession(sessionId: string, lightweight: boolean = false): Promise<ThesisSession> {
    const params = lightweight ? { lightweight: 'true' } : {};
    const response = await this.axiosInstance.get(`/${sessionId}`, {
      params,
      timeout: lightweight ? 30000 : 120000, // Shorter timeout for lightweight mode, longer for full data
    });
    return response.data.data;
  }

  /**
   * Create a new thesis session
   */
  async createSession(payload: CreateSessionPayload): Promise<ThesisSession> {
    const response = await this.axiosInstance.post('/', payload);
    return response.data.data;
  }

  /**
   * Update session (partial update)
   */
  async updateSession(sessionId: string, payload: UpdateSessionPayload): Promise<ThesisSession> {
    const response = await this.axiosInstance.put(`/${sessionId}`, payload);
    return response.data.data;
  }

  /**
   * Delete session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.axiosInstance.delete(`/${sessionId}`);
  }

  /**
   * Create checkpoint for a session
   */
  async createCheckpoint(sessionId: string, payload: { stageName: string; stageData: any }): Promise<ThesisCheckpoint> {
    const response = await this.axiosInstance.post(`/${sessionId}/checkpoints`, payload);
    return response.data.data;
  }

  /**
   * List checkpoints for a session
   */
  async listCheckpoints(sessionId: string): Promise<ThesisCheckpoint[]> {
    const response = await this.axiosInstance.get(`/${sessionId}/checkpoints`);
    return response.data.data || [];
  }

  /**
   * Get checkpoint by ID
   */
  async getCheckpoint(sessionId: string, checkpointId: string): Promise<ThesisCheckpoint> {
    const response = await this.axiosInstance.get(`/${sessionId}/checkpoints/${checkpointId}`);
    return response.data.data;
  }

  /**
   * Resume from checkpoint
   */
  async resumeFromCheckpoint(sessionId: string, checkpointId: string): Promise<{ session: ThesisSession; checkpoint: ThesisCheckpoint }> {
    const response = await this.axiosInstance.post(`/${sessionId}/resume/${checkpointId}`);
    return response.data.data;
  }
}

export const thesisSessionService = new ThesisSessionService();
