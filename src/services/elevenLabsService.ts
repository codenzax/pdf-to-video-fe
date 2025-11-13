import axios, { AxiosInstance, AxiosError } from 'axios';
import { store } from '../store';
import { setCredentials } from '../store/authSlice';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

const normalizedBaseURL = API_BASE_URL.endsWith('/api/v1')
  ? API_BASE_URL
  : `${API_BASE_URL}/api/v1`;

export interface AudioGenerationRequest {
  text: string;
  sentenceId: string;
  voiceId?: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
}

export interface AudioClip {
  sentenceId: string;
  audioUrl: string;
  audioBase64?: string;
  duration?: number;
  approved: boolean;
  isCustom: boolean;
}

export interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
  preview_url?: string;
}

interface AudioResponse {
  success: boolean;
  message: string;
  data: AudioClip;
}

interface VoicesResponse {
  success: boolean;
  message: string;
  data: {
    voices: Voice[];
  };
}

interface PodcastResponse {
  success: boolean;
  message: string;
  data: {
    podcastUrl: string;
    podcastBase64: string;
    duration: number;
    clipCount: number;
  };
}

class ElevenLabsService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/audio`,
      timeout: 120000, // 2 minutes
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
   * Generate audio from text using ElevenLabs TTS
   */
  async generateAudio(request: AudioGenerationRequest): Promise<AudioClip> {
    try {
      console.log('🎤 Generating audio with ElevenLabs...', { 
        sentenceId: request.sentenceId,
        textLength: request.text.length 
      });

      const response = await this.axiosInstance.post<AudioResponse>(
        '/generate',
        request
      );

      console.log('✅ Audio generated:', response.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Audio generation error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to generate audio');
    }
  }

  /**
   * Upload custom audio file
   */
  async uploadAudio(sentenceId: string, audioFile: File): Promise<AudioClip> {
    try {
      console.log('📤 Uploading custom audio...', { 
        sentenceId,
        filename: audioFile.name,
        size: audioFile.size 
      });

      const formData = new FormData();
      formData.append('audio', audioFile);
      formData.append('sentenceId', sentenceId);

      const response = await this.axiosInstance.post<AudioResponse>(
        '/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      console.log('✅ Audio uploaded:', response.data);

      return response.data.data;
    } catch (error: any) {
      console.error('❌ Audio upload error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to upload audio');
    }
  }

  /**
   * Generate podcast MP3 from approved audio clips
   */
  async generatePodcast(audioClips: Array<{ sentenceId: string; audioBase64: string; duration?: number }>): Promise<{
    podcastUrl: string;
    duration: number;
    clipCount: number;
  }> {
    try {
      console.log('🎙️ Generating podcast...', { clipCount: audioClips.length });

      const response = await this.axiosInstance.post<PodcastResponse>(
        '/podcast',
        { audioClips }
      );

      const { podcastBase64, duration, clipCount } = response.data.data;

      // Convert base64 to blob URL for playback
      const podcastBlob = this.base64ToBlob(podcastBase64, 'audio/mpeg');
      const podcastUrl = URL.createObjectURL(podcastBlob);

      console.log('✅ Podcast generated:', { duration, clipCount });

      return {
        podcastUrl,
        duration,
        clipCount,
      };
    } catch (error: any) {
      console.error('❌ Podcast generation error:', error);

      if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      }

      throw new Error(error.message || 'Failed to generate podcast');
    }
  }

  /**
   * Get available voices from ElevenLabs
   */
  async getVoices(): Promise<Voice[]> {
    try {
      console.log('🎤 Fetching voices from backend...');
      const response = await this.axiosInstance.get<VoicesResponse>('/voices');
      console.log('✅ Voices fetched:', response.data.data.voices?.length || 0);
      return response.data.data.voices || [];
    } catch (error: any) {
      console.error('❌ Get voices error:', error);
      
      // Better error handling
      if (error.response?.status === 401) {
        throw new Error('Authentication failed. Please log in again.');
      } else if (error.response?.data?.message) {
        throw new Error(error.response.data.message);
      } else if (error.message) {
        throw new Error(error.message);
      } else {
        throw new Error('Failed to fetch voices. Please check your connection and try again.');
      }
    }
  }

  /**
   * Convert base64 string to Blob
   */
  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }
}

export const elevenLabsService = new ElevenLabsService();

