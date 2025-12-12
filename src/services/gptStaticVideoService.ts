import axios, { AxiosInstance, AxiosError } from 'axios';
import { store } from '../store';
import { setCredentials } from '../store/authSlice';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const normalizedBaseURL = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;

interface StaticVideoResponse {
  success: boolean;
  message: string;
  data: {
    mode: 'gpt';
    imageUrl: string;
    videoBase64: string;
    prompt: string;
    duration: number;
    status: 'completed';
  };
}

class GPTStaticVideoService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/video`,
      timeout: 600000, // 10 minutes to accommodate GPT + DALL-E + FFMPEG
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
   * Generate static video from sentence using GPT + DALL-E 3 + FFMPEG
   */
  async generateStaticVideo(
    sentence: string,
    duration: number = 6,
    context?: {
      fullScript?: string;
      paperTitle?: string;
      researchDomain?: string;
    },
    zoomEffect: 'zoom-in' | 'zoom-out' | 'none' = 'none',
    transitionType: 'fade' | 'slide' | 'dissolve' | 'none' = 'fade',
    subtitleSettings?: { yPosition?: number; fontSize?: number; zoom?: number },
    subtitleText?: string, // Custom subtitle text (editable by user)
    customPrompt?: string, // Custom image/video generation prompt (editable by user)
    tables?: Array<{ title: string; data: string }>,
    images?: Array<{ title: string; description: string }>
  ): Promise<{
    imageUrl: string;
    videoUrl: string;
    prompt: string;
    duration: number;
  }> {
    try {
      console.log('🎨 Generating static video with GPT...', { sentence, hasCustomPrompt: !!customPrompt, hasSubtitleText: !!subtitleText });

      const response = await this.axiosInstance.post<StaticVideoResponse>(
        '/generate-static',
        { sentence, duration, context, zoomEffect, transitionType, subtitleSettings, subtitleText, customPrompt, tables, images }
      );

      console.log('📦 GPT Static Response:', response.data);

      // Handle both wrapped and direct response formats
      let result;
      
      if (response.data.data) {
        // Wrapped format: { success: true, data: {...} }
        result = response.data.data;
      } else if ((response.data as any).imageUrl) {
        // Direct format: { imageUrl: ..., prompt: ... }
        result = response.data as any;
      } else {
        console.error('❌ Invalid GPT response structure:', response.data);
        throw new Error('Invalid response from GPT static video API');
      }

      // Prefer data URL so backend can consume base64 during assembly
      const videoUrl = `data:video/mp4;base64,${result.videoBase64}`;

      console.log('✅ GPT static video generated:', {
        imageUrl: result.imageUrl,
        videoUrl,
        duration: result.duration,
      });

      return {
        imageUrl: result.imageUrl,
        videoUrl,
        prompt: result.prompt,
        duration: result.duration,
      };
    } catch (error: any) {
      console.error('❌ GPT static video error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to generate static video');
    }
  }

  /**
   * Generate prompt only (preview before generation)
   * This method calls the backend to generate a prompt without generating the image/video
   */
  async generatePrompt(params: {
    sentenceText: string;
    context?: string | {
      fullScript?: string;
      paperTitle?: string;
      researchDomain?: string;
    };
    customPrompt?: string;
    tables?: Array<{ title: string; data: string }>;
    images?: Array<{ title: string; description: string }>;
  }): Promise<string> {
    try {
      const {
        sentenceText,
        context,
        customPrompt,
        tables,
        images,
      } = params;

      // Convert context string to object if needed
      let contextObj: { fullScript?: string; paperTitle?: string; researchDomain?: string } | undefined;
      if (typeof context === 'string') {
        contextObj = { fullScript: context };
      } else {
        contextObj = context;
      }

      console.log('🔍 Generating prompt preview...', { sentence: sentenceText, hasCustomPrompt: !!customPrompt });

      const response = await this.axiosInstance.post<{ success: boolean; data: { prompt: string } }>(
        '/generate-prompt',
        { 
          sentence: sentenceText, 
          context: contextObj, 
          customPrompt,
          tables, 
          images 
        }
      );

      if (response.data.data?.prompt) {
        return response.data.data.prompt;
      }

      throw new Error('Invalid response from prompt generation API');
    } catch (error: any) {
      console.error('❌ Prompt generation error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to generate prompt');
    }
  }

  /**
   * Convert base64 string to Blob
   */
  // Removed unused function base64ToBlob
}

export const gptStaticVideoService = new GPTStaticVideoService();

