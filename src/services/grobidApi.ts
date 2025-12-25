import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_BASE_URL } from '@/lib/env';
import { store } from '@/store';

// Types for LLM-based extraction
export interface AcademicMetadata {
  title: string;
  authors: Array<{
    firstName: string;
    lastName: string;
    email?: string;
    affiliation?: string;
  }>;
  doi?: string;
  journal?: string;
  year?: string;
  keywords: string[];
}

export interface AcademicSections {
  abstract: string;
  introduction: string;
  background: string;
  methodology: string;
  results: string;
  discussion: string;
  conclusion: string;
}

export interface TableData {
  title: string;
  data: string;
}

export interface ImageData {
  id?: string;
  title?: string;
  caption?: string;
  description: string;
  path?: string;
  filename?: string;
  category?: 'methodology' | 'results';
  type?: string;
  page?: number;
  data_points?: string[];
  key_insights?: string[];
}

export interface CompleteExtractedData {
  metadata: AcademicMetadata;
  sections: AcademicSections;
  tables: TableData[];
  images: ImageData[];
}

export interface LLMExtractionResponse {
  status: "success" | "error" | "fail";
  message: string;
  data: {
    sessionId: string;
    thesisSessionId?: string; // Persistent thesis session ID
    filename: string;
    extractedData: CompleteExtractedData;
    processingInfo: {
      method: string;
      timestamp: string;
      version: string;
    };
  };
}

export interface SessionDataResponse {
  status: "success" | "error" | "fail";
  message: string;
  data: {
    sessionId: string;
    data: CompleteExtractedData;
  };
}

class GrobidApiService {
  private baseURL: string;
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    // Normalize baseURL to ensure it ends with /api/v1
    // Remove trailing slashes first, then add /api/v1
    let base = API_BASE_URL.trim().replace(/\/+$/, ''); // Remove trailing slashes
    if (!base.endsWith('/api/v1')) {
      base = `${base}/api/v1`;
    }
    this.baseURL = base;
    
    // Create axios instance with interceptors
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 300000, // 5 minutes timeout
      headers: {
        'Content-Type': 'multipart/form-data',
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
    
    // Debug logging (remove in production if needed)
    console.log('🔧 GrobidApiService initialized with baseURL:', this.baseURL);
  }

  private async getAuthToken(): Promise<string | null> {
    const state = store.getState();
    let token = state.auth.accessToken;

    if (!token) {
      token = localStorage.getItem('accessToken');
      if (token) {
        // Update store if found in localStorage
        const user = localStorage.getItem('user');
        store.dispatch({
          type: 'auth/setCredentials',
          payload: {
            accessToken: token,
            user: user ? JSON.parse(user) : null,
          },
        });
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
        const state = store.getState();
        const refreshToken = state.auth.refreshToken;

        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        const response = await axios.post(
          `${this.baseURL}/auth/refresh`,
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
   * Health check
   */
  async healthCheck() {
    const response = await axios.get(`${this.baseURL}/pdf/health`);
    return response.data;
  }

  /**
   * Extract complete data using LLM
   */
  async extractCompleteData(file: File): Promise<LLMExtractionResponse> {
    const formData = new FormData();
    formData.append('pdf', file);

    const url = `${this.baseURL}/pdf/extract-complete`;
    const token = await this.getAuthToken();
    console.log('📤 Calling extract-complete endpoint:', url);
    console.log('🔑 Auth token present:', !!token);
    
    // Use axiosInstance which has auth token interceptor
    const response = await this.axiosInstance.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    console.log('✅ Extract response:', {
      status: response.data.status,
      hasThesisSessionId: !!response.data.data?.thesisSessionId,
      thesisSessionId: response.data.data?.thesisSessionId,
    });

    return response.data;
  }

  /**
   * Get session data
   */
  async getSessionData(sessionId: string): Promise<SessionDataResponse> {
    const response = await this.axiosInstance.get(`/pdf/session/${sessionId}`);
    return response.data;
  }

  /**
   * Clean up session data
   */
  async cleanupSession(sessionId: string) {
    const response = await this.axiosInstance.delete(`/pdf/session/${sessionId}`);
    return response.data;
  }
}

export const grobidApi = new GrobidApiService();