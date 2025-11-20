import axios, { AxiosInstance, AxiosError } from 'axios';
import { store } from '../store';
import { setCredentials } from '../store/authSlice';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const normalizedBaseURL = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;

export interface SubtitleSettings {
  yPosition: number;
  fontSize: number;
  zoom: number;
}

export interface VideoSegment {
  sentenceId: string;
  videoUrl: string;
  videoBase64?: string;
  audioUrl?: string;
  audioBase64?: string;
  duration: number;
  startTime?: number; // Crop start time in seconds
  endTime?: number; // Crop end time in seconds
  transitionType?: 'fade' | 'slide' | 'dissolve' | 'none';
  subtitleSettings?: SubtitleSettings; // For Canvas text/subtitles overlay
}

export interface AssemblyRequest {
  segments: VideoSegment[];
  backgroundMusicUrl?: string;
  backgroundMusicBase64?: string;
  musicVolume?: number;
  aspectRatio?: '16:9' | '9:16';
  transitions?: Array<'fade' | 'slide' | 'dissolve' | 'none'>;
}

export interface AssemblyResponse {
  videoUrl: string;
  videoBase64: string;
  duration: number;
  aspectRatio: '16:9' | '9:16';
  segmentCount: number;
}

interface AssemblyApiResponse {
  success: boolean;
  message: string;
  data: AssemblyResponse;
}

class VideoAssemblyService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/video`,
      timeout: 600000, // 10 minutes for video assembly
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
   * Assemble final video from approved segments
   */
  async assembleVideo(request: AssemblyRequest): Promise<AssemblyResponse> {
    try {
      console.log('🎬 Assembling video...', { 
        segmentCount: request.segments.length,
        aspectRatio: request.aspectRatio 
      });

      const response = await this.axiosInstance.post<AssemblyApiResponse>(
        '/assemble',
        request
      );

      console.log('✅ Video assembled:', response.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Video assembly error:', error);
      console.error('Error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
      });

      // Extract detailed error message
      let errorMessage = 'Failed to assemble video';
      
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      // Add status code if available
      if (error.response?.status) {
        errorMessage = `[${error.response.status}] ${errorMessage}`;
      }

      throw new Error(errorMessage);
    }
  }

  /**
   * Preview assembled video (faster, lower quality)
   */
  async previewVideo(request: AssemblyRequest): Promise<AssemblyResponse> {
    try {
      console.log('👁️ Generating video preview...', { 
        segmentCount: request.segments.length 
      });

      const response = await this.axiosInstance.post<AssemblyApiResponse>(
        '/preview',
        request
      );

      console.log('✅ Video preview generated:', response.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Video preview error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to generate video preview');
    }
  }
}

export const videoAssemblyService = new VideoAssemblyService();

