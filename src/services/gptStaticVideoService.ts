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
  // VERSION MARKER: v2.0 - Fixed subtitleSettings parameter issue
  // TIMESTAMP: 2024-12-19-REBUILD-FORCE
  private readonly VERSION = 'v2.0-2024-12-19-FORCE-REBUILD';

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
   * VERSION: v2.0 - All parameters properly defined with defaults
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
    subtitleSettings: { yPosition?: number; fontSize?: number; zoom?: number } | undefined = undefined,
    subtitleText: string | undefined = undefined,
    customPrompt: string | undefined = undefined,
    tables: Array<{ title: string; data: string }> | undefined = undefined,
    images: Array<{ title: string; description: string }> | undefined = undefined,
    imageSource: 'ai' | 'unsplash' | undefined = undefined,
    unsplashImageUrl: string | undefined = undefined,
    presentationText: string[] | undefined = undefined
  ): Promise<{
    imageUrl: string;
    videoUrl: string;
    prompt: string;
    duration: number;
  }> {
    // VERSION CHECK - Log version to confirm new code is loaded
    console.log(`🚀 GPTStaticVideoService ${this.VERSION} - generateStaticVideo called`);
    
    try {
      // All parameters are now explicitly defined with defaults - no undefined references possible
      console.log('🔍 Parameters received:', {
        hasSentence: !!sentence,
        duration,
        hasContext: !!context,
        zoomEffect,
        transitionType,
        hasSubtitleSettings: subtitleSettings !== undefined,
        hasSubtitleText: subtitleText !== undefined,
        hasCustomPrompt: customPrompt !== undefined,
        hasTables: tables !== undefined,
        hasImages: images !== undefined,
        imageSource,
        hasUnsplashImageUrl: unsplashImageUrl !== undefined,
        hasPresentationText: presentationText !== undefined,
      });
      
      // Log based on image source
      if (imageSource === 'unsplash') {
        console.log('📷 UNSPLASH MODE: Generating video with Unsplash image (NOT DALL-E)', { 
          imageSource, 
          hasUnsplashUrl: !!unsplashImageUrl,
          unsplashImageUrl: unsplashImageUrl?.substring(0, 100),
          sentence: sentence.substring(0, 50)
        });
      } else {
        console.log('🎨 DALL-E MODE: Generating video with GPT/DALL-E', { 
          imageSource, 
          hasCustomPrompt: !!customPrompt, 
        });
      }

      // Build request body - ALL parameters are guaranteed to exist due to defaults
      const requestBody: Record<string, any> = {
        sentence,
        duration,
        context,
        zoomEffect,
        transitionType,
      };
      
      // Safely add optional parameters only if they are provided
      if (subtitleSettings !== undefined && subtitleSettings !== null) {
        requestBody.subtitleSettings = subtitleSettings;
      }
      if (subtitleText !== undefined && subtitleText !== null) {
        requestBody.subtitleText = subtitleText;
      }
      if (presentationText !== undefined && presentationText !== null) {
        requestBody.presentationText = presentationText;
      }
      if (customPrompt !== undefined && customPrompt !== null) {
        requestBody.customPrompt = customPrompt;
      }
      if (tables !== undefined && tables !== null) {
        requestBody.tables = tables;
      }
      if (images !== undefined && images !== null) {
        requestBody.images = images;
      }
      if (imageSource !== undefined && imageSource !== null) {
        requestBody.imageSource = imageSource;
      }
      if (unsplashImageUrl !== undefined && unsplashImageUrl !== null) {
        requestBody.unsplashImageUrl = unsplashImageUrl;
      }
      
      console.log('📤 SENDING REQUEST TO BACKEND:', {
        version: this.VERSION,
        imageSource,
        hasUnsplashImageUrl: !!unsplashImageUrl,
        unsplashImageUrl: unsplashImageUrl?.substring(0, 100),
        requestBodyKeys: Object.keys(requestBody),
      });

      const response = await this.axiosInstance.post<StaticVideoResponse>(
        '/generate-static',
        requestBody
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

      // Check if image URL is from Unsplash or DALL-E
      const isUnsplashImage = result.imageUrl && (
        result.imageUrl.includes('unsplash.com') || 
        result.imageUrl.includes('images.unsplash.com') ||
        result.imageUrl.startsWith('https://')
      );
      const isDALLEImage = result.imageUrl && result.imageUrl.startsWith('data:image');
      
      if (imageSource === 'unsplash') {
        if (isUnsplashImage) {
          console.log('✅✅✅ UNSPLASH VIDEO SUCCESS: Generated with Unsplash image', {
            imageUrl: result.imageUrl.substring(0, 100),
            isUnsplashImage,
            isDALLEImage,
            duration: result.duration,
          });
        } else {
          console.error('❌❌❌ ERROR: Unsplash mode requested but DALL-E image was returned!', {
            imageUrl: result.imageUrl?.substring(0, 100),
            isUnsplashImage,
            isDALLEImage,
            expected: 'Unsplash URL',
            got: isDALLEImage ? 'DALL-E base64 image' : 'Unknown format'
          });
        }
      } else {
        console.log('✅ DALL-E video generated:', {
          imageUrl: result.imageUrl?.substring(0, 100),
          isDALLEImage,
          duration: result.duration,
        });
      }

      return {
        imageUrl: result.imageUrl,
        videoUrl,
        prompt: result.prompt,
        duration: result.duration,
      };
    } catch (error: any) {
      console.error(`❌ GPT static video error (${this.VERSION}):`, error);

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
   * Rebake video text overlays without regenerating the entire video
   */
  async rebakeVideoText(
    videoBase64: string,
    subtitleText?: string,
    presentationText?: string[],
    subtitleSettings?: { fontSize?: number; yPosition?: number; zoom?: number }
  ): Promise<{
    videoBase64: string;
  }> {
    try {
      const requestBody = {
        videoBase64,
        subtitleText,
        presentationText,
        subtitleSettings,
      };

      const response = await this.axiosInstance.post<{
        data: {
          videoBase64: string;
        };
      }>('/rebake-text', requestBody);

      return {
        videoBase64: response.data.data.videoBase64,
      };
    } catch (error: any) {
      console.error('Video rebake error:', error);
      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error(error.message || 'Failed to rebake video text');
    }
  }
}

export const gptStaticVideoService = new GPTStaticVideoService();
