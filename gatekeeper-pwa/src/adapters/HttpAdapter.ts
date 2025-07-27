import type { HttpAdapter as IHttpAdapter, StatusChangeCallback } from '../types/network';
import type { ESP32Config } from '../types';
import { validationService } from '../services/ValidationService';
import { NetworkErrorHandler } from '../network/NetworkErrorHandler';
import { NETWORK_TIMEOUTS, HTTP_ENDPOINTS, HTTP_REQUEST } from '../network/NetworkConfig';

/**
 * HTTP network adapter implementation
 * Direct implementation of NetworkAdapter interface for ESP32 HTTP communication
 * Eliminates unnecessary HttpService wrapper layer
 */
export class HttpAdapter implements IHttpAdapter {
  readonly method = 'http' as const;
  readonly timeout = NETWORK_TIMEOUTS.HTTP;
  readonly name = 'ESP32 HTTP Adapter';
  
  private statusChangeCallback?: StatusChangeCallback;

  constructor(public config: ESP32Config) {}

  /**
   * Build URL from configuration and path
   * @param path API endpoint path
   * @returns Complete URL string
   */
  private buildUrl(path: string): string {
    const host = this.config.host.trim();
    const port = this.config.port === 80 ? '' : `:${this.config.port}`;
    return `http://${host}${port}${path}`;
  }

  /**
   * Initialize the HTTP adapter
   * HTTP adapter is stateless, so initialization is minimal
   * Validation occurs during operations
   */
  async initialize(): Promise<void> {
    console.log(`[HttpAdapter] Initializing HTTP adapter for ${this.config.host}:${this.config.port}`);
    console.log('[HttpAdapter] Initialized successfully - validation will occur during operations');
  }

  /**
   * Set callback for real-time status changes
   * @param callback Function to call when adapter status changes
   */
  setStatusChangeCallback(callback: StatusChangeCallback): void {
    this.statusChangeCallback = callback;
  }

  /**
   * Notify status change if callback is set
   */
  private notifyStatusChange(status: 'reachable' | 'unreachable' | 'unknown'): void {
    if (this.statusChangeCallback) {
      this.statusChangeCallback('esp32', status);
    }
  }

  /**
   * Clean up adapter resources
   * HTTP adapter is stateless, so cleanup is minimal
   */
  async cleanup(): Promise<void> {
    console.log('[HttpAdapter] Cleaning up...');
    // HTTP adapter has no persistent connections to clean up
    this.statusChangeCallback = undefined;
    console.log('[HttpAdapter] Cleanup completed');
  }

  /**
   * Trigger the gate using HTTP POST
   * Direct implementation without HttpService wrapper
   * @returns Promise<boolean> - true if gate was triggered successfully
   */
  async triggerGate(): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      // Validate configuration using centralized validation
      validationService.validateESP32ConfigStrict(this.config);
      
      const url = this.buildUrl(HTTP_ENDPOINTS.TRIGGER);
      console.log(`[HttpAdapter] Triggering gate: ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: HTTP_REQUEST.HEADERS,
        signal: AbortSignal.timeout(this.timeout)
      });
      
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        console.log(`[HttpAdapter] Gate triggered successfully in ${duration}ms`);
        this.notifyStatusChange('reachable');
        return true;
      } else {
        console.warn(`[HttpAdapter] Server responded with ${response.status}: ${response.statusText} in ${duration}ms`);
        this.notifyStatusChange('unreachable');
        return false;
      }
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('http', 'gate trigger', startTime, this.config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Gate trigger failed', networkError, context);
      this.notifyStatusChange('unreachable');
      return false;
    }
  }

  /**
   * Test connection to ESP32 device using HEAD request for reachability
   * Enhanced for Phase 3 with web-compatible ping alternative
   * @returns Promise<boolean> - true if ESP32 is reachable
   */
  async testConnection(): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      // Validate configuration using centralized validation
      validationService.validateESP32ConfigStrict(this.config);
      
      // Use HEAD request as web-compatible ping alternative
      const url = this.buildUrl('/');
      console.log(`[HttpAdapter] Testing connection (HEAD): ${url}`);
      
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'Accept': '*/*' },
        signal: AbortSignal.timeout(this.timeout),
        mode: 'cors', // Handle CORS for local network requests
        cache: 'no-cache'
      });
      
      const duration = Date.now() - startTime;
      // Consider 404 as reachable since device responded
      const success = response.ok || response.status === 404;
      
      console.log(
        `[HttpAdapter] Connection test ${success ? 'passed' : 'failed'} in ${duration}ms (status: ${response.status})`
      );
      
      this.notifyStatusChange(success ? 'reachable' : 'unreachable');
      return success;
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('http', 'connection test', startTime, this.config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Connection test failed', networkError, context);
      this.notifyStatusChange('unreachable');
      return false;
    }
  }

  /**
   * Test HTTP endpoint availability using GET request
   * Alternative testing method for specific endpoint verification
   * @param endpoint Optional endpoint to test (defaults to status endpoint)
   * @returns Promise<boolean> - true if endpoint is available
   */
  async testEndpoint(endpoint: string = HTTP_ENDPOINTS.STATUS): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      validationService.validateESP32ConfigStrict(this.config);
      
      const url = this.buildUrl(endpoint);
      console.log(`[HttpAdapter] Testing endpoint: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': HTTP_REQUEST.HEADERS.Accept },
        signal: AbortSignal.timeout(this.timeout)
      });
      
      const duration = Date.now() - startTime;
      const success = response.ok;
      
      console.log(
        `[HttpAdapter] Endpoint test ${success ? 'passed' : 'failed'} in ${duration}ms`
      );
      
      return success;
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('http', 'endpoint test', startTime, this.config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError(`Endpoint test failed for ${endpoint}`, networkError, context);
      return false;
    }
  }

}

/**
 * Factory function to create HTTP adapter instance
 * @param config ESP32 configuration
 * @returns Configured HttpAdapter instance
 */
export function createHttpAdapter(config: ESP32Config): HttpAdapter {
  return new HttpAdapter(config);
}