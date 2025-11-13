import axios, { AxiosInstance, AxiosError } from 'axios';
import { store } from '../store';
import { setCredentials } from '../store/authSlice';
import { BackgroundMusic } from './geminiService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const normalizedBaseURL = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;

export interface GenerateBackgroundMusicRequest {
  prompt: string;
  duration?: number; // Duration in seconds (default: 30, max: 95)
  seed?: number;
  outputFormat?: 'mp3' | 'wav' | 'flac';
}

export interface TrimBackgroundMusicRequest {
  audioBase64: string;
  startTime: number;
  endTime: number;
}

export interface AdjustVolumeRequest {
  audioBase64: string;
  volume: number; // 0.0 - 1.0
}

interface BackgroundMusicResponse {
  success: boolean;
  message: string;
  data: BackgroundMusic;
}

interface TrimResponse {
  success: boolean;
  message: string;
  data: {
    audioBase64: string;
    duration: number;
  };
}

interface VolumeResponse {
  success: boolean;
  message: string;
  data: {
    audioBase64: string;
    duration: number;
    volume: number;
  };
}

class StableAudioService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/audio/background`,
      timeout: 300000, // 5 minutes for audio generation
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
   * Generate background music using Stable Audio
   */
  async generateBackgroundMusic(request: GenerateBackgroundMusicRequest): Promise<BackgroundMusic> {
    try {
      console.log('🎵 Generating background music with Stable Audio...', { 
        prompt: request.prompt.substring(0, 50) + '...',
        duration: request.duration 
      });

      const response = await this.axiosInstance.post<BackgroundMusicResponse>(
        '/generate',
        request
      );

      console.log('✅ Background music generated:', response.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Background music generation error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to generate background music');
    }
  }

  /**
   * Upload custom background music file
   */
  async uploadBackgroundMusic(audioFile: File): Promise<BackgroundMusic> {
    try {
      console.log('📤 Uploading custom background music...', { 
        filename: audioFile.name,
        size: audioFile.size 
      });

      const formData = new FormData();
      formData.append('audio', audioFile);

      const response = await this.axiosInstance.post<BackgroundMusicResponse>(
        '/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      console.log('✅ Background music uploaded:', response.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Background music upload error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to upload background music');
    }
  }

  /**
   * Trim background music
   */
  async trimBackgroundMusic(request: TrimBackgroundMusicRequest): Promise<{
    audioBase64: string;
    duration: number;
  }> {
    try {
      console.log('✂️ Trimming background music...', { 
        startTime: request.startTime,
        endTime: request.endTime 
      });

      const response = await this.axiosInstance.post<TrimResponse>(
        '/trim',
        request
      );

      console.log('✅ Background music trimmed:', response.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Background music trim error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to trim background music');
    }
  }

  /**
   * Adjust background music volume
   */
  async adjustVolume(request: AdjustVolumeRequest): Promise<{
    audioBase64: string;
    duration: number;
    volume: number;
  }> {
    try {
      console.log('🔊 Adjusting background music volume...', { 
        volume: request.volume 
      });

      const response = await this.axiosInstance.post<VolumeResponse>(
        '/volume',
        request
      );

      console.log('✅ Background music volume adjusted:', response.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Background music volume adjustment error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to adjust background music volume');
    }
  }
}

export const stableAudioService = new StableAudioService();

