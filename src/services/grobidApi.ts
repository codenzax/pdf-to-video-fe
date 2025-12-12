import axios from 'axios';
import { API_BASE_URL } from '@/lib/env';

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

  constructor() {
    // Normalize baseURL to ensure it ends with /api/v1
    // Remove trailing slashes first, then add /api/v1
    let base = API_BASE_URL.trim().replace(/\/+$/, ''); // Remove trailing slashes
    if (!base.endsWith('/api/v1')) {
      base = `${base}/api/v1`;
    }
    this.baseURL = base;
    
    // Debug logging (remove in production if needed)
    console.log('🔧 GrobidApiService initialized with baseURL:', this.baseURL);
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
    console.log('📤 Calling extract-complete endpoint:', url);
    
    const response = await axios.post(url, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5 minutes timeout
    });

    return response.data;
  }

  /**
   * Get session data
   */
  async getSessionData(sessionId: string): Promise<SessionDataResponse> {
    const response = await axios.get(`${this.baseURL}/pdf/session/${sessionId}`);
    return response.data;
  }

  /**
   * Clean up session data
   */
  async cleanupSession(sessionId: string) {
    const response = await axios.delete(`${this.baseURL}/pdf/session/${sessionId}`);
    return response.data;
  }
}

export const grobidApi = new GrobidApiService();