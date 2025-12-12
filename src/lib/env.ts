/// <reference types="vite/client" />
// Get base URL from env, default to localhost:3001
const rawBaseURL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";
// Normalize: remove trailing slashes and ensure /api/v1 is included
const normalized = rawBaseURL.trim().replace(/\/+$/, '');
export const API_BASE_URL: string = normalized.endsWith('/api/v1') 
  ? normalized 
  : `${normalized}/api/v1`;


