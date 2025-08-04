import type { HttpAdapter as IHttpAdapter } from '../types/network';
import type { ESP32Config } from '../types';
import { validationService } from '../services/ValidationService';
import { NetworkErrorHandler } from '../network/NetworkErrorHandler';
import { NETWORK_TIMEOUTS, HTTP_ENDPOINTS, HTTP_REQUEST } from '../network/NetworkConfig';
import { configManager } from '../services/ConfigManager';

/**
 * HTTP network adapter implementation
 * Direct implementation of NetworkAdapter interface for ESP32 HTTP communication
 * Eliminates unnecessary HttpService wrapper layer
 */
export class HttpAdapter implements IHttpAdapter {
  readonly method = 'http' as const;
  readonly timeout = NETWORK_TIMEOUTS.HTTP;
  readonly name = 'ESP32 HTTP Adapter';
  
  private currentAbortController: AbortController | null = null;

  constructor(public config: ESP32Config) {}

  /**
   * Check if adapter is currently disabled by asking ConfigManager directly
   */
  private async isDisabled(): Promise<boolean> {
    try {
      const currentConfig = await configManager.loadConfig();
      return currentConfig.esp32.disabled === true;
    } catch (error) {
      console.error('[HttpAdapter] Failed to check disabled state:', error);
      return false; // Default to enabled if we can't check
    }
  }

  /**
   * Build URL from configuration and path
   * @param path API endpoint path
   * @returns Complete URL string
   */
  private buildUrl(path: string): string {
    const host = this.config.host.trim();
    const port = this.config.port === 443 ? '' : `:${this.config.port}`;
    return `https://${host}${port}${path}`;
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
   * Clean up adapter resources and cancel any ongoing operations
   */
  async cleanup(): Promise<void> {
    console.log('[HttpAdapter] Cleaning up...');
    this.cancelCurrentOperation();
    console.log('[HttpAdapter] Cleanup completed');
  }

  /**
   * Cancel any ongoing HTTP operation
   */
  cancelCurrentOperation(): void {
    if (this.currentAbortController) {
      console.log('[HttpAdapter] Cancelling ongoing HTTP operation');
      this.currentAbortController.abort('Operation cancelled by adapter cleanup');
      this.currentAbortController = null;
    }
  }

  /**
   * Trigger the gate using HTTP POST
   * @param timestamp - Single timestamp for command deduplication
   * @returns Promise<boolean> - true if gate was triggered successfully
   */
  async triggerGate(timestamp: string): Promise<boolean> {
    // Check if adapter is disabled at runtime
    if (await this.isDisabled()) {
      console.log('[HttpAdapter] Adapter is disabled, skipping trigger');
      return false;
    }

    const startTime = Date.now();
    this.cancelCurrentOperation();
    this.currentAbortController = new AbortController();

    try {
      validationService.validateESP32ConfigStrict(this.config);

      const url = this.buildUrl(HTTP_ENDPOINTS.TRIGGER);
      console.log(`[HttpAdapter] Triggering gate: ${url} with timestamp: ${timestamp}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...HTTP_REQUEST.HEADERS,
          'Content-Type': 'text/plain'
        },
        body: timestamp,
        signal: this.currentAbortController.signal
      });

      const duration = Date.now() - startTime;
      this.currentAbortController = null;

      if (response.ok) {
        console.log(`[HttpAdapter] Gate triggered successfully in ${duration}ms`);
        return true;
      } else {
        console.warn(`[HttpAdapter] Server responded with ${response.status}: ${response.statusText} in ${duration}ms`);
        return false;
      }
    } catch (error) {
      this.currentAbortController = null;

      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[HttpAdapter] HTTP operation was cancelled`);
        return false;
      }

      const context = NetworkErrorHandler.createContext('http', 'gate trigger', startTime, this.config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Gate trigger failed', networkError, context);
      return false;
    }
  }

  /**
   * Test connection to ESP32 device using HEAD request for reachability
   * Enhanced for Phase 3 with web-compatible ping alternative
   * @returns Promise<boolean> - true if ESP32 is reachable
   */
  async testConnection(): Promise<boolean> {
    // Check if adapter is disabled at runtime
    if (await this.isDisabled()) {
      console.log('[HttpAdapter] Adapter is disabled, skipping connection test');
      return false;
    }

    const startTime = Date.now();
    
    try {
      // Validate configuration using centralized validation
      validationService.validateESP32ConfigStrict(this.config);
      
      // Use HEAD request as web-compatible ping alternative
      const url = this.buildUrl('/trigger');
      console.log(`[HttpAdapter] Testing connection (HEAD): ${url}`);
      
      const response = await fetch(url, {
        method: 'OPTIONS',
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
      
      return success;
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('http', 'connection test', startTime, this.config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Connection test failed', networkError, context);
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
    // Check if adapter is disabled at runtime
    if (await this.isDisabled()) {
      console.log('[HttpAdapter] Adapter is disabled, skipping endpoint test');
      return false;
    }

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
