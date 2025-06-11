import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { logger } from './logger';

export interface HttpClientConfig {
  baseURL?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export class HttpClient {
  private client: AxiosInstance;

  constructor(config: HttpClientConfig = {}) {
    this.client = axios.create({
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      baseURL: config.baseURL,
    });

    // Add request interceptor for debugging
    this.client.interceptors.request.use(
      (config) => {
        const fullUrl = config.baseURL ? `${config.baseURL}${config.url}` : config.url;
        logger.debug(`HTTP ${config.method?.toUpperCase()} ${fullUrl}`);
        return config;
      },
      (error) => {
        logger.debug(`HTTP Request Error: ${error.message}`);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for debugging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`HTTP Response ${response.status} from ${response.config.url}`);
        return response;
      },
      (error) => {
        if (error.response) {
          logger.debug(`HTTP Error ${error.response.status} from ${error.config.url}`);
        } else {
          logger.debug(`HTTP Error: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  setHeader(key: string, value: string): void {
    this.client.defaults.headers.common[key] = value;
  }

  setAuthToken(token: string): void {
    this.setHeader('Authorization', `Bearer ${token}`);
  }

  setBasicAuth(username: string, password: string): void {
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    this.setHeader('Authorization', `Basic ${token}`);
  }
}

// Factory function for creating Jira client
export function createJiraClient(baseURL: string, email: string, apiToken: string): HttpClient {
  // Normalize the base URL - remove trailing slash
  const normalizedBaseURL = baseURL.replace(/\/$/, '');
  
  // Create auth token
  const authToken = Buffer.from(`${email}:${apiToken}`).toString('base64');
  
  const client = new HttpClient({
    baseURL: normalizedBaseURL,
    headers: {
      'Accept': 'application/json',
      'Authorization': `Basic ${authToken}`,
    },
  });
  
  // Also set it using the method (belt and suspenders)
  client.setBasicAuth(email, apiToken);
  return client;
}