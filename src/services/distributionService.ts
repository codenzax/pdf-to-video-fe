import axios, { AxiosInstance, AxiosError } from 'axios';
import { API_BASE_URL } from '@/lib/env';
import { store } from '@/store';

// Normalize base URL
let normalizedBaseURL = API_BASE_URL.trim().replace(/\/+$/, '');
if (!normalizedBaseURL.endsWith('/api/v1')) {
  normalizedBaseURL = `${normalizedBaseURL}/api/v1`;
}

export interface DistributionRequest {
  id: string;
  thesisSessionId: string;
  videoUrl: string;
  title: string;
  description?: string | null;
  tags?: string[] | null;
  thumbnailUrl?: string | null;
  platforms: ('youtube' | 'x')[];
  status: 'pending' | 'approved' | 'rejected' | 'uploading' | 'completed' | 'failed';
  requestedBy: number;
  approvedBy?: number | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  youtubeSettings?: any;
  xSettings?: any;
  uploadResults?: any;
  uploadLogs?: any;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  session?: {
    id: string;
    title: string;
  };
  requester?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  };
  approver?: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface CreateDistributionRequestPayload {
  thesisSessionId: string;
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  thumbnailUrl?: string;
  platforms: ('youtube' | 'x')[];
  youtubeSettings?: {
    privacy?: 'public' | 'private' | 'unlisted';
    categoryId?: string;
  };
  xSettings?: {
    scheduledAt?: string;
    replySettings?: string;
    requestReason?: string; // Reason for distribution request (user-entered)
  };
}

class DistributionService {
  private axiosInstance: AxiosInstance;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: `${normalizedBaseURL}/distribution`,
      timeout: 60000,
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

    const storedToken = localStorage.getItem('accessToken');
    return storedToken;
  }

  private async refreshAccessToken(): Promise<string> {
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
   * Create distribution request
   */
  async createRequest(payload: CreateDistributionRequestPayload): Promise<DistributionRequest> {
    try {
      const response = await this.axiosInstance.post('/requests', payload);
      return (response.data as any).data;
    } catch (error: any) {
      console.error('❌ Failed to create distribution request:', error);
      throw new Error(error.response?.data?.message || 'Failed to create distribution request');
    }
  }

  /**
   * Get distribution request by ID
   */
  async getRequest(requestId: string): Promise<DistributionRequest> {
    try {
      const response = await this.axiosInstance.get(`/requests/${requestId}`);
      return (response.data as any).data;
    } catch (error: any) {
      console.error('❌ Failed to get distribution request:', error);
      throw new Error(error.response?.data?.message || 'Failed to get distribution request');
    }
  }

  /**
   * List distribution requests
   */
  async listRequests(filters?: { status?: string; platform?: string }): Promise<DistributionRequest[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.platform) params.append('platform', filters.platform);

      const response = await this.axiosInstance.get(`/requests?${params.toString()}`);
      return (response.data as any).data;
    } catch (error: any) {
      console.error('❌ Failed to list distribution requests:', error);
      throw new Error(error.response?.data?.message || 'Failed to list distribution requests');
    }
  }

  /**
   * Delete distribution request
   */
  async deleteRequest(requestId: string): Promise<void> {
    try {
      await this.axiosInstance.delete(`/requests/${requestId}`);
    } catch (error: any) {
      console.error('❌ Failed to delete distribution request:', error);
      throw new Error(error.response?.data?.message || 'Failed to delete distribution request');
    }
  }

  /**
   * Get pending requests (admin only)
   */
  async getPendingRequests(): Promise<DistributionRequest[]> {
    try {
      const response = await this.axiosInstance.get('/requests/pending');
      return (response.data as any).data;
    } catch (error: any) {
      console.error('❌ Failed to get pending requests:', error);
      throw new Error(error.response?.data?.message || 'Failed to get pending requests');
    }
  }

  /**
   * Approve distribution request (admin only)
   * Can optionally update platforms, title, description, tags during approval
   */
  async approveRequest(
    requestId: string,
    options?: {
      platforms?: ('youtube' | 'x')[];
      title?: string;
      description?: string;
      tags?: string[];
      youtubeSettings?: {
        privacy?: 'public' | 'private' | 'unlisted';
        categoryId?: string;
      };
      xSettings?: {
        scheduledAt?: Date;
        replySettings?: string;
      };
    }
  ): Promise<DistributionRequest> {
    try {
      const response = await this.axiosInstance.post(`/requests/${requestId}/approve`, options || {});
      return (response.data as any).data;
    } catch (error: any) {
      console.error('❌ Failed to approve request:', error);
      throw new Error(error.response?.data?.message || 'Failed to approve request');
    }
  }

  /**
   * Reject distribution request (admin only)
   */
  async rejectRequest(requestId: string, reason?: string): Promise<DistributionRequest> {
    try {
      const response = await this.axiosInstance.post(`/requests/${requestId}/reject`, { reason });
      return (response.data as any).data;
    } catch (error: any) {
      console.error('❌ Failed to reject request:', error);
      throw new Error(error.response?.data?.message || 'Failed to reject request');
    }
  }

  /**
   * Retry failed distribution request
   */
  async retryRequest(
    requestId: string,
    options?: {
      platforms?: ('youtube' | 'x')[];
      title?: string;
      description?: string;
      tags?: string[];
      youtubeSettings?: {
        privacy?: 'public' | 'private' | 'unlisted';
      };
      xSettings?: {
        scheduledAt?: Date;
        replySettings?: string;
      };
    }
  ): Promise<DistributionRequest> {
    try {
      const response = await this.axiosInstance.post(`/requests/${requestId}/retry`, options || {});
      return (response.data as any).data;
    } catch (error: any) {
      console.error('❌ Failed to retry request:', error);
      throw new Error(error.response?.data?.message || 'Failed to retry request');
    }
  }
}

export const distributionService = new DistributionService();
