import axios, { AxiosInstance, AxiosError } from 'axios';
import { store } from '../store';
import { setCredentials } from '../store/authSlice';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const normalizedBaseURL = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;

export interface UnsplashImageData {
  id: string;
  url: string; // Full resolution URL
  photographer: string;
  photographerUsername: string;
  photographerUrl: string;
  unsplashUrl: string;
  description: string | null;
  width: number;
  height: number;
}

export interface UnsplashSearchResponse {
  total: number;
  totalPages: number;
  results: UnsplashImageData[];
}

class UnsplashService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/video`,
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
   * Search Unsplash for images
   * @param query - Search query/keywords
   * @param page - Page number (default: 1)
   * @param perPage - Results per page (default: 12)
   * @param orientation - Image orientation: landscape, portrait, squarish (default: landscape)
   * @returns Search results with image metadata
   */
  async searchImages(
    query: string,
    page: number = 1,
    perPage: number = 12,
    orientation: 'landscape' | 'portrait' | 'squarish' = 'landscape'
  ): Promise<UnsplashSearchResponse> {
    try {
      const response = await this.axiosInstance.get<{ status: string; message: string; data: UnsplashSearchResponse }>(
        '/search-unsplash',
        {
          params: {
            query: query.trim(),
            page,
            perPage,
            orientation,
          },
        }
      );

      if (response.data.status === 'success' && response.data.data) {
        return response.data.data;
      }

      throw new Error('Invalid response from Unsplash search API');
    } catch (error: any) {
      console.error('❌ Unsplash search error:', error);
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error(error.message || 'Failed to search Unsplash');
    }
  }

  /**
   * Extract search keywords from sentence using LLM
   * @param sentence - Sentence to extract keywords from
   * @param context - Optional context (fullScript, paperTitle, researchDomain)
   * @returns Array of 2-5 search keywords
   */
  async extractKeywords(
    sentence: string,
    context?: {
      fullScript?: string;
      paperTitle?: string;
      researchDomain?: string;
    }
  ): Promise<string[]> {
    try {
      const response = await this.axiosInstance.post<{ status: string; message: string; data: { keywords: string[] } }>(
        '/extract-keywords',
        {
          sentence,
          context,
        }
      );

      if (response.data.status === 'success' && response.data.data?.keywords) {
        return response.data.data.keywords;
      }

      throw new Error('Invalid response from keyword extraction API');
    } catch (error: any) {
      console.error('❌ Keyword extraction error:', error);
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error(error.message || 'Failed to extract keywords');
    }
  }
}

export const unsplashService = new UnsplashService();
