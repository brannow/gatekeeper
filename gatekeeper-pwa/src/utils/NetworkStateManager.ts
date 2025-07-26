/**
 * Network State Management Utilities for Gatekeeper PWA
 * Provides connectivity detection, retry logic, and network state persistence
 * 
 * ARCHITECTURE PRINCIPLE: Timeout everything, fail fast, fail clearly
 * Implements exponential backoff and proper state recovery patterns
 */

import type { 
  NetworkError
} from '../types/network';
import { DEFAULT_STATE_MACHINE_CONFIG } from '../types/state-machine';
import { createNetworkError } from '../network/NetworkErrorHandler';

/**
 * Network connectivity state
 */
export interface NetworkConnectivityState {
  browserOnline: boolean;
  esp32Reachable: boolean;
  mqttReachable: boolean;
  lastCheck: number;
  checkInProgress: boolean;
}

/**
 * Retry configuration for network operations
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  backoffMultiplier: number;
  maxDelay: number;
  timeoutPerAttempt: number;
}

/**
 * Network operation retry context
 */
export interface RetryContext {
  attempt: number;
  totalAttempts: number;
  lastError?: NetworkError;
  nextDelay: number;
  startTime: number;
  operation: string;
}

/**
 * Default retry configuration based on state machine timeouts
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: DEFAULT_STATE_MACHINE_CONFIG.retry.maxAttempts,
  baseDelay: DEFAULT_STATE_MACHINE_CONFIG.retry.baseDelay,
  backoffMultiplier: DEFAULT_STATE_MACHINE_CONFIG.retry.backoffMultiplier,
  maxDelay: 30000, // 30 seconds max delay
  timeoutPerAttempt: 5000 // 5 seconds per attempt
};

/**
 * Network state manager for connectivity detection and retry logic
 * Handles network state persistence and recovery scenarios
 */
export class NetworkStateManager {
  private connectivityState: NetworkConnectivityState;
  private retryConfig: RetryConfig;
  private activeRetries = new Map<string, RetryContext>();
  private connectivityListeners = new Set<(state: NetworkConnectivityState) => void>();

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.connectivityState = {
      browserOnline: navigator.onLine,
      esp32Reachable: false,
      mqttReachable: false,
      lastCheck: 0,
      checkInProgress: false
    };

    this.setupBrowserConnectivityMonitoring();
  }

  /**
   * Get current network connectivity state
   * @returns Current connectivity state
   */
  getConnectivityState(): NetworkConnectivityState {
    return { ...this.connectivityState };
  }

  /**
   * Update reachability status for a specific service
   * @param type Service type
   * @param reachable Whether service is reachable
   */
  updateReachabilityStatus(type: 'esp32' | 'mqtt', reachable: boolean): void {
    const wasReachable = type === 'esp32' ? this.connectivityState.esp32Reachable : this.connectivityState.mqttReachable;
    
    if (type === 'esp32') {
      this.connectivityState.esp32Reachable = reachable;
    } else {
      this.connectivityState.mqttReachable = reachable;
    }

    this.connectivityState.lastCheck = Date.now();

    // Notify listeners if state changed
    if (wasReachable !== reachable) {
      console.log(`[NetworkStateManager] ${type.toUpperCase()} reachability changed: ${wasReachable} → ${reachable}`);
      this.notifyConnectivityListeners();
    }
  }

  /**
   * Check if any network service is reachable
   * @returns True if at least one service is reachable
   */
  isAnyServiceReachable(): boolean {
    return this.connectivityState.esp32Reachable || this.connectivityState.mqttReachable;
  }

  /**
   * Check if all configured services are unreachable
   * Used for noNetwork state logic
   * @returns True if all services are unreachable
   */
  areAllServicesUnreachable(): boolean {
    return !this.connectivityState.esp32Reachable && !this.connectivityState.mqttReachable;
  }

  /**
   * Add connectivity state change listener
   * @param listener Function to call when connectivity state changes
   */
  addConnectivityListener(listener: (state: NetworkConnectivityState) => void): void {
    this.connectivityListeners.add(listener);
  }

  /**
   * Remove connectivity state change listener
   * @param listener Function to remove from listeners
   */
  removeConnectivityListener(listener: (state: NetworkConnectivityState) => void): void {
    this.connectivityListeners.delete(listener);
  }

  /**
   * Execute operation with exponential backoff retry logic
   * @param operation Function to execute
   * @param operationId Unique identifier for the operation
   * @param config Optional retry configuration override
   * @returns Promise with operation result
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const retryConfig = { ...this.retryConfig, ...config };
    const context: RetryContext = {
      attempt: 1,
      totalAttempts: retryConfig.maxAttempts,
      nextDelay: retryConfig.baseDelay,
      startTime: Date.now(),
      operation: operationId
    };

    this.activeRetries.set(operationId, context);

    try {
      return await this.attemptOperation(operation, context, retryConfig);
    } finally {
      this.activeRetries.delete(operationId);
    }
  }

  /**
   * Calculate next delay for exponential backoff
   * @param attempt Current attempt number
   * @param config Retry configuration
   * @returns Delay in milliseconds
   */
  calculateBackoffDelay(attempt: number, config: RetryConfig = this.retryConfig): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(delay, config.maxDelay);
  }

  /**
   * Check if operation should be retried based on error type
   * @param error Network error
   * @param attempt Current attempt number
   * @param maxAttempts Maximum allowed attempts
   * @returns True if operation should be retried
   */
  shouldRetry(error: NetworkError, attempt: number, maxAttempts: number): boolean {
    // Don't retry if max attempts reached
    if (attempt >= maxAttempts) {
      return false;
    }

    // Don't retry configuration errors
    if (error.type === 'config') {
      return false;
    }

    // Retry network, timeout, and server errors
    return ['network', 'timeout', 'server'].includes(error.type);
  }

  /**
   * Get active retry contexts
   * @returns Map of active retry operations
   */
  getActiveRetries(): Map<string, RetryContext> {
    return new Map(this.activeRetries);
  }

  /**
   * Cancel all active retry operations
   */
  cancelAllRetries(): void {
    console.log(`[NetworkStateManager] Cancelling ${this.activeRetries.size} active retry operations`);
    this.activeRetries.clear();
  }

  /**
   * Persist network state to local storage
   * For recovery after page refresh or app restart
   */
  persistState(): void {
    try {
      const stateData = {
        connectivityState: this.connectivityState,
        timestamp: Date.now()
      };
      localStorage.setItem('gatekeeper-network-state', JSON.stringify(stateData));
    } catch (error) {
      console.warn('[NetworkStateManager] Failed to persist network state:', error);
    }
  }

  /**
   * Restore network state from local storage
   * @param maxAge Maximum age of persisted state in milliseconds
   * @returns True if state was restored
   */
  restoreState(maxAge: number = 5 * 60 * 1000): boolean {
    try {
      const stateJson = localStorage.getItem('gatekeeper-network-state');
      if (!stateJson) return false;

      const stateData = JSON.parse(stateJson);
      if (!stateData.timestamp || Date.now() - stateData.timestamp > maxAge) {
        console.log('[NetworkStateManager] Persisted state too old, ignoring');
        return false;
      }

      this.connectivityState = { ...this.connectivityState, ...stateData.connectivityState };
      console.log('[NetworkStateManager] Network state restored from storage');
      return true;
    } catch (error) {
      console.warn('[NetworkStateManager] Failed to restore network state:', error);
      return false;
    }
  }

  /**
   * Clear persisted network state
   */
  clearPersistedState(): void {
    try {
      localStorage.removeItem('gatekeeper-network-state');
    } catch (error) {
      console.warn('[NetworkStateManager] Failed to clear persisted state:', error);
    }
  }

  /**
   * Get network state summary for debugging
   * @returns Object with connectivity summary
   */
  getStateSummary(): object {
    return {
      connectivity: this.connectivityState,
      activeRetries: Array.from(this.activeRetries.entries()),
      config: this.retryConfig,
      listeners: this.connectivityListeners.size
    };
  }

  /**
   * Cleanup resources and event listeners
   */
  cleanup(): void {
    console.log('[NetworkStateManager] Cleaning up...');
    
    this.cancelAllRetries();
    this.connectivityListeners.clear();
    
    // Remove browser event listeners
    window.removeEventListener('online', this.handleConnectivityChange);
    window.removeEventListener('offline', this.handleConnectivityChange);

    console.log('[NetworkStateManager] Cleanup completed');
  }

  /**
   * Attempt operation with timeout and error handling
   */
  private async attemptOperation<T>(
    operation: () => Promise<T>,
    context: RetryContext,
    config: RetryConfig
  ): Promise<T> {
    while (context.attempt <= context.totalAttempts) {
      try {
        console.log(`[NetworkStateManager] Attempting ${context.operation} (${context.attempt}/${context.totalAttempts})`);
        
        // Execute operation with timeout
        const result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Operation timeout')), config.timeoutPerAttempt)
          )
        ]);

        console.log(`[NetworkStateManager] ${context.operation} succeeded on attempt ${context.attempt}`);
        return result;

      } catch (error) {
        const networkError = this.categorizeError(error as Error);
        context.lastError = networkError;

        console.warn(`[NetworkStateManager] ${context.operation} failed on attempt ${context.attempt}:`, networkError.message);

        // Check if we should retry
        if (!this.shouldRetry(networkError, context.attempt, context.totalAttempts)) {
          throw networkError;
        }

        // Calculate delay and wait before next attempt
        context.nextDelay = this.calculateBackoffDelay(context.attempt, config);
        
        if (context.attempt < context.totalAttempts) {
          console.log(`[NetworkStateManager] Retrying ${context.operation} in ${context.nextDelay}ms...`);
          await this.delay(context.nextDelay);
        }

        context.attempt++;
      }
    }

    // All attempts failed
    throw context.lastError || createNetworkError('network', 'All retry attempts failed', 'http');
  }

  /**
   * Setup browser connectivity monitoring
   */
  private setupBrowserConnectivityMonitoring(): void {
    this.handleConnectivityChange = this.handleConnectivityChange.bind(this);
    window.addEventListener('online', this.handleConnectivityChange);
    window.addEventListener('offline', this.handleConnectivityChange);
  }

  /**
   * Handle browser connectivity change events
   */
  private handleConnectivityChange = (): void => {
    const wasOnline = this.connectivityState.browserOnline;
    this.connectivityState.browserOnline = navigator.onLine;

    if (wasOnline !== this.connectivityState.browserOnline) {
      console.log(`[NetworkStateManager] Browser connectivity changed: ${wasOnline} → ${this.connectivityState.browserOnline}`);
      this.notifyConnectivityListeners();
    }
  };

  /**
   * Notify all connectivity listeners
   */
  private notifyConnectivityListeners(): void {
    const state = this.getConnectivityState();
    this.connectivityListeners.forEach(listener => {
      try {
        listener(state);
      } catch (error) {
        console.error('[NetworkStateManager] Error in connectivity listener:', error);
      }
    });
  }

  /**
   * Categorize error for retry logic
   */
  private categorizeError(error: Error): NetworkError {
    if (error.message.includes('timeout')) {
      return createNetworkError('timeout', error.message, 'http');
    }
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return createNetworkError('network', error.message, 'http');
    }
    return createNetworkError('network', error.message, 'http');
  }

  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create network state manager instance
 * @param config Optional retry configuration
 * @returns Configured NetworkStateManager instance
 */
export function createNetworkStateManager(config?: Partial<RetryConfig>): NetworkStateManager {
  return new NetworkStateManager(config);
}

/**
 * Singleton network state manager for global use
 */
export const networkStateManager = createNetworkStateManager();