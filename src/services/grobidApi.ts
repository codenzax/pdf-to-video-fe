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
  title: string;
  description: string;
  path: string;
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
    this.baseURL = API_BASE_URL;
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

    const response = await axios.post(`${this.baseURL}/pdf/extract-complete`, formData, {
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