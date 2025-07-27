import type { HttpAdapter as IHttpAdapter, StatusChangeCallback } from '../types/network';
import type { ESP32Config } from '../types';
import { validationService } from '../services/ValidationService';
import { NetworkErrorHandler } from '../network/NetworkErrorHandler';
import { NETWORK_TIMEOUTS, HTTP_ENDPOINTS, HTTP_REQUEST } from '../network/NetworkConfig';
import { getNetworkEventBus } from '../services/NetworkEventBus';

/**
 * Persistent HTTP Adapter - Phase 3 Implementation
 * 
 * Key Improvements over HttpAdapter:
 * - updateConfig() method for reconfiguring without recreation
 * - No connection recreation on config changes
 * - Maintains connection testing and ESP32 communication patterns
 * - Performance optimized for <100ms config updates
 * - Event-driven status system via NetworkEventBus (Phase 3)
 * 
 * Features:
 * - Configuration validation with warnings for invalid changes
 * - Connection state preservation across reconfigurations
 * - Enhanced logging for debugging configuration issues
 * - Emits statusChange events for real-time status updates
 */
export class PersistentHttpAdapter implements IHttpAdapter {
  readonly method = 'http' as const;
  readonly timeout = NETWORK_TIMEOUTS.HTTP;
  readonly name = 'Persistent ESP32 HTTP Adapter';
  
  private statusChangeCallback?: StatusChangeCallback;
  private _config: ESP32Config;
  private _isInitialized = false;
  
  // Phase 3: Event bus integration
  private readonly eventBus = getNetworkEventBus();

  constructor(config: ESP32Config) {
    this._config = { ...config };
    console.log(`[PersistentHttpAdapter] Created with config: ${config.host}:${config.port}`);
  }

  get config(): ESP32Config {
    return { ...this._config };
  }

  /**
   * Build URL from configuration and path
   */
  private buildUrl(path: string): string {
    const host = this._config.host.trim();
    const port = this._config.port === 80 ? '' : `:${this._config.port}`;
    return `http://${host}${port}${path}`;
  }

  /**
   * Initialize the HTTP adapter
   * HTTP adapter is stateless, so initialization is minimal
   */
  async initialize(): Promise<void> {
    console.log(`[PersistentHttpAdapter] Initializing adapter for ${this._config.host}:${this._config.port}`);
    
    try {
      // Validate initial configuration
      validationService.validateESP32ConfigStrict(this._config);
      this._isInitialized = true;
      console.log('[PersistentHttpAdapter] Initialized successfully');
    } catch (error) {
      this._isInitialized = false;
      console.error('[PersistentHttpAdapter] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Update adapter configuration without recreation
   * This is the key performance improvement - no adapter recreation
   * 
   * @param newConfig New ESP32 configuration
   */
  async updateConfig(newConfig: ESP32Config): Promise<void> {
    const startTime = Date.now();
    console.log(`[PersistentHttpAdapter] Updating configuration: ${this._config.host}:${this._config.port} -> ${newConfig.host}:${newConfig.port}`);

    try {
      // Validate new configuration
      validationService.validateESP32ConfigStrict(newConfig);

      // Check for significant changes that might affect connectivity
      const hostChanged = this._config.host !== newConfig.host;
      const portChanged = this._config.port !== newConfig.port;
      
      if (hostChanged || portChanged) {
        console.log(`[PersistentHttpAdapter] Significant config change detected (host: ${hostChanged}, port: ${portChanged})`);
        // For HTTP adapter, config changes are immediate since it's stateless
        // No need to recreate connections as HTTP uses stateless requests
      }

      // Update configuration
      this._config = { ...newConfig };
      
      const duration = Date.now() - startTime;
      console.log(`[PersistentHttpAdapter] Configuration updated in ${duration}ms`);
      
      if (duration > 50) {
        console.warn(`[PersistentHttpAdapter] Configuration update took ${duration}ms (target: <50ms for HTTP)`);
      }

      // Notify status change callback of potential reachability change
      this.notifyStatusChange('unknown');

    } catch (error) {
      console.error('[PersistentHttpAdapter] Configuration update failed:', error);
      throw error;
    }
  }

  /**
   * Set callback for real-time status changes
   */
  setStatusChangeCallback(callback: StatusChangeCallback): void {
    this.statusChangeCallback = callback;
  }

  /**
   * Notify status change if callback is set
   * Phase 3: Also emits events via NetworkEventBus
   */
  private notifyStatusChange(status: 'reachable' | 'unreachable' | 'unknown'): void {
    // Phase 3: Emit status change event
    this.eventBus.emitStatusChange('esp32', status, this.name, this);
    
    // Backward compatibility: Still call the legacy callback
    if (this.statusChangeCallback) {
      this.statusChangeCallback('esp32', status);
    }
  }

  /**
   * Clean up adapter resources
   * HTTP adapter is stateless, so cleanup is minimal
   */
  async cleanup(): Promise<void> {
    console.log('[PersistentHttpAdapter] Cleaning up...');
    this.statusChangeCallback = undefined;
    this._isInitialized = false;
    console.log('[PersistentHttpAdapter] Cleanup completed');
  }

  /**
   * Trigger the gate using HTTP POST
   * Direct implementation without HttpService wrapper
   */
  async triggerGate(): Promise<boolean> {
    if (!this._isInitialized) {
      console.error('[PersistentHttpAdapter] Adapter not initialized');
      return false;
    }

    const startTime = Date.now();
    
    try {
      // Validate configuration before each request
      validationService.validateESP32ConfigStrict(this._config);
      
      const url = this.buildUrl(HTTP_ENDPOINTS.TRIGGER);
      console.log(`[PersistentHttpAdapter] Triggering gate: ${url}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: HTTP_REQUEST.HEADERS,
        signal: AbortSignal.timeout(this.timeout)
      });
      
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        console.log(`[PersistentHttpAdapter] Gate triggered successfully in ${duration}ms`);
        this.notifyStatusChange('reachable');
        return true;
      } else {
        console.warn(`[PersistentHttpAdapter] Server responded with ${response.status}: ${response.statusText} in ${duration}ms`);
        this.notifyStatusChange('unreachable');
        return false;
      }
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('http', 'gate trigger', startTime, this._config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Gate trigger failed', networkError, context);
      this.notifyStatusChange('unreachable');
      return false;
    }
  }

  /**
   * Test connection to ESP32 device using HEAD request
   * Enhanced for Phase 3 with web-compatible ping alternative
   */
  async testConnection(): Promise<boolean> {
    if (!this._isInitialized) {
      console.error('[PersistentHttpAdapter] Adapter not initialized');
      return false;
    }

    const startTime = Date.now();
    
    try {
      // Validate configuration before connection test
      validationService.validateESP32ConfigStrict(this._config);
      
      // Use HEAD request as web-compatible ping alternative
      const url = this.buildUrl('/');
      console.log(`[PersistentHttpAdapter] Testing connection (HEAD): ${url}`);
      
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
        `[PersistentHttpAdapter] Connection test ${success ? 'passed' : 'failed'} in ${duration}ms (status: ${response.status})`
      );
      
      this.notifyStatusChange(success ? 'reachable' : 'unreachable');
      return success;
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('http', 'connection test', startTime, this._config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Connection test failed', networkError, context);
      this.notifyStatusChange('unreachable');
      return false;
    }
  }

  /**
   * Test HTTP endpoint availability using GET request
   * Alternative testing method for specific endpoint verification
   */
  async testEndpoint(endpoint: string = HTTP_ENDPOINTS.STATUS): Promise<boolean> {
    if (!this._isInitialized) {
      console.error('[PersistentHttpAdapter] Adapter not initialized');
      return false;
    }

    const startTime = Date.now();
    
    try {
      validationService.validateESP32ConfigStrict(this._config);
      
      const url = this.buildUrl(endpoint);
      console.log(`[PersistentHttpAdapter] Testing endpoint: ${url}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': HTTP_REQUEST.HEADERS.Accept },
        signal: AbortSignal.timeout(this.timeout)
      });
      
      const duration = Date.now() - startTime;
      const success = response.ok;
      
      console.log(
        `[PersistentHttpAdapter] Endpoint test ${success ? 'passed' : 'failed'} in ${duration}ms`
      );
      
      return success;
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('http', 'endpoint test', startTime, this._config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError(`Endpoint test failed for ${endpoint}`, networkError, context);
      return false;
    }
  }

  /**
   * Get current configuration status for debugging
   */
  getConfigurationStatus(): {
    isInitialized: boolean;
    host: string;
    port: number;
    url: string;
  } {
    return {
      isInitialized: this._isInitialized,
      host: this._config.host,
      port: this._config.port,
      url: this.buildUrl('/')
    };
  }
}

/**
 * Factory function to create PersistentHttpAdapter instance
 */
export function createPersistentHttpAdapter(config: ESP32Config): PersistentHttpAdapter {
  return new PersistentHttpAdapter(config);
}