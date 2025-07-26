import type { 
  NetworkService as INetworkService,
  NetworkAdapter, 
  NetworkServiceDelegate, 
  NetworkResult, 
  NetworkError 
} from '../types/network';
import type { ESP32Config, MQTTConfig, RelayState } from '../types';
import { categorizeNetworkError, createNetworkError } from '../network/NetworkErrorHandler';
import { NETWORK_TIMEOUTS } from '../network/NetworkConfig';
import { 
  ReachabilityService, 
  createReachabilityService, 
  createReachabilityTargets,
  type ReachabilityServiceDelegate,
  type ReachabilityTarget
} from './ReachabilityService';

/**
 * Network service implementation with adapter chain pattern
 * Enhanced with reachability checking and relay state tracking for Phase 3
 * Follows Swift reference architecture for reliable network communication
 */
export class NetworkService implements INetworkService, ReachabilityServiceDelegate {
  private _adapters: NetworkAdapter[] = [];
  private _currentAdapter: NetworkAdapter | null = null;
  private _isRunning = false;
  private currentIndex = 0;
  private triggerTimeout: number | null = null;
  private readonly timeoutMs = NETWORK_TIMEOUTS.HTTP; // Default timeout for adapter operations
  
  public delegate?: NetworkServiceDelegate;
  
  // Enhanced Phase 3 features
  private reachabilityService: ReachabilityService;
  private reachabilityCheckRequired = true;
  private currentRelayState: RelayState = 'released';
  private esp32Config?: ESP32Config;
  private mqttConfig?: MQTTConfig;

  constructor() {
    // Initialize reachability service with this as delegate
    this.reachabilityService = createReachabilityService(undefined, this);
  }

  get adapters(): NetworkAdapter[] {
    return [...this._adapters]; // Return copy to prevent external mutation
  }

  get currentAdapter(): NetworkAdapter | null {
    return this._currentAdapter;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Initialize all adapters in the chain
   */
  async initialize(): Promise<void> {
    console.log(`[NetworkService] Initializing ${this._adapters.length} adapters...`);
    
    const initPromises = this._adapters.map(async (adapter, index) => {
      try {
        await adapter.initialize();
        console.log(`[NetworkService] Adapter ${index + 1}/${this._adapters.length} (${adapter.name}) initialized`);
      } catch (error) {
        console.error(`[NetworkService] Failed to initialize adapter ${adapter.name}:`, error);
        // Continue with other adapters even if one fails
      }
    });

    await Promise.allSettled(initPromises);
    console.log('[NetworkService] Initialization completed');
  }

  /**
   * Clean up all adapters and service resources
   */
  async cleanup(): Promise<void> {
    console.log('[NetworkService] Cleaning up...');
    
    this.stopCurrentOperation();
    
    const cleanupPromises = this._adapters.map(async (adapter) => {
      try {
        await adapter.cleanup();
      } catch (error) {
        console.error(`[NetworkService] Error cleaning up adapter ${adapter.name}:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    this._adapters = [];
    this._currentAdapter = null;
    
    // Clean up reachability service
    this.reachabilityService.cleanup();
    
    console.log('[NetworkService] Cleanup completed');
  }

  /**
   * Trigger the gate using adapter chain pattern
   * Enhanced with reachability checking before trigger attempts
   * Phase 4: Enhanced with offline queueing support
   * @param skipReachabilityCheck Optional flag to skip reachability check
   * @returns Promise<boolean> - true if any adapter succeeded
   */
  async triggerGate(skipReachabilityCheck = false): Promise<boolean> {
    if (this._isRunning) {
      console.warn('[NetworkService] triggerGate ignored - already running');
      return false;
    }

    if (this._adapters.length === 0) {
      console.error('[NetworkService] No adapters available');
      const error = createNetworkError('config', 'No network adapters configured', 'http');
      this.delegate?.onTriggerFailure(null, error);
      return false;
    }

    // Phase 4: Check if offline and should queue the operation
    if (!navigator.onLine) {
      console.warn('[NetworkService] Device is offline, attempting to queue operation');
      
      try {
        // Try to queue the operation for later
        const { offlineService } = await import('./OfflineService');
        
        // Determine which config to use based on available adapters
        let configToQueue = null;
        for (const adapter of this._adapters) {
          if (adapter.method === 'http' && this.esp32Config) {
            configToQueue = this.esp32Config;
            break;
          } else if (adapter.method === 'mqtt' && this.mqttConfig) {
            configToQueue = this.mqttConfig;
            break;
          }
        }
        
        if (configToQueue) {
          await offlineService.queueGateTrigger(configToQueue);
          console.log('[NetworkService] Gate trigger queued for offline execution');
          
          // Notify delegate that operation was queued
          const queuedError = createNetworkError('network', 'Operation queued for when connection is restored', 'http');
          queuedError.recovery = {
            suggestion: 'Operation will be executed automatically when connection is restored',
            canRetry: false
          };
          this.delegate?.onTriggerFailure(null, queuedError);
          return false; // Return false since operation wasn't executed immediately
        }
      } catch (queueError) {
        console.error('[NetworkService] Failed to queue offline operation:', queueError);
      }
    }

    console.log(`[NetworkService] Starting gate trigger with ${this._adapters.length} adapters`);
    this._isRunning = true;
    this.currentIndex = 0;

    // Phase 3: Check reachability before attempting trigger (if not skipped)
    if (!skipReachabilityCheck && this.reachabilityCheckRequired) {
      const reachabilityResult = await this.checkReachabilityBeforeTrigger();
      if (!reachabilityResult) {
        this._isRunning = false;
        return false;
      }
    }

    return this.tryNextAdapter();
  }

  /**
   * Test connection for all adapters
   * @returns Promise<NetworkResult[]> - Results for each adapter
   */
  async testAllConnections(): Promise<NetworkResult[]> {
    console.log(`[NetworkService] Testing connections for ${this._adapters.length} adapters`);
    
    const results: NetworkResult[] = [];
    
    for (const adapter of this._adapters) {
      const startTime = Date.now();
      
      try {
        const success = await adapter.testConnection();
        const duration = Date.now() - startTime;
        
        const result: NetworkResult = {
          success,
          adapter,
          duration,
          timestamp: Date.now()
        };
        
        results.push(result);
        this.delegate?.onConnectionTest(adapter, success, duration);
        
      } catch (error) {
        const duration = Date.now() - startTime;
        const networkError = this.categorizeError(error as Error, adapter);
        
        const result: NetworkResult = {
          success: false,
          adapter,
          error: networkError,
          duration,
          timestamp: Date.now()
        };
        
        results.push(result);
        this.delegate?.onConnectionTest(adapter, false, duration);
      }
    }
    
    console.log(`[NetworkService] Connection tests completed: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  /**
   * Add adapter to the chain
   * @param adapter NetworkAdapter to add
   */
  async addAdapter(adapter: NetworkAdapter): Promise<void> {
    console.log(`[NetworkService] Adding adapter: ${adapter.name}`);
    
    // Avoid duplicates
    if (this._adapters.find(a => a === adapter)) {
      console.warn(`[NetworkService] Adapter ${adapter.name} already exists in chain`);
      return;
    }
    
    this._adapters.push(adapter);
    
    try {
      await adapter.initialize();
      console.log(`[NetworkService] Adapter ${adapter.name} added and initialized`);
    } catch (error) {
      console.error(`[NetworkService] Failed to initialize new adapter ${adapter.name}:`, error);
      // Keep adapter in chain but log the error
    }
  }

  /**
   * Remove adapter from the chain
   * @param adapter NetworkAdapter to remove
   */
  async removeAdapter(adapter: NetworkAdapter): Promise<void> {
    console.log(`[NetworkService] Removing adapter: ${adapter.name}`);
    
    const index = this._adapters.findIndex(a => a === adapter);
    if (index === -1) {
      console.warn(`[NetworkService] Adapter ${adapter.name} not found in chain`);
      return;
    }
    
    // If this adapter is currently running, stop the operation
    if (this._currentAdapter === adapter) {
      this.stopCurrentOperation();
    }
    
    // Clean up the adapter
    try {
      await adapter.cleanup();
    } catch (error) {
      console.error(`[NetworkService] Error cleaning up removed adapter ${adapter.name}:`, error);
    }
    
    // Remove from chain
    this._adapters.splice(index, 1);
    console.log(`[NetworkService] Adapter ${adapter.name} removed`);
  }

  /**
   * Clear all adapters and stop any running operations
   */
  async clearAdapters(): Promise<void> {
    console.log('[NetworkService] Clearing all adapters');
    this.stopCurrentOperation();
    await this.cleanup();
  }

  /**
   * Update ESP32 configuration for reachability checking
   * @param config ESP32 configuration
   */
  updateESP32Config(config: ESP32Config): void {
    this.esp32Config = config;
    console.log(`[NetworkService] ESP32 config updated: ${config.host}:${config.port}`);
  }

  /**
   * Update MQTT configuration for reachability checking
   * @param config MQTT configuration
   */
  updateMQTTConfig(config: MQTTConfig): void {
    this.mqttConfig = config;
    console.log(`[NetworkService] MQTT config updated: ${config.host}:${config.port}`);
  }

  /**
   * Set whether reachability checking is required before trigger attempts
   * @param required Whether reachability checking is required
   */
  setReachabilityCheckRequired(required: boolean): void {
    this.reachabilityCheckRequired = required;
    console.log(`[NetworkService] Reachability check required: ${required}`);
  }

  /**
   * Get current relay state
   * @returns Current relay state
   */
  getCurrentRelayState(): RelayState {
    return this.currentRelayState;
  }

  /**
   * Manually trigger reachability check for all configured targets
   * @returns Promise<boolean> - true if any target is reachable
   */
  async checkReachability(): Promise<boolean> {
    const targets = this.createCurrentReachabilityTargets();
    if (targets.length === 0) {
      console.warn('[NetworkService] No reachability targets configured');
      return false;
    }

    console.log(`[NetworkService] Checking reachability for ${targets.length} targets`);
    const results = await this.reachabilityService.testTargets(targets);
    const reachableCount = results.filter(r => r.isReachable).length;

    console.log(`[NetworkService] Reachability check completed: ${reachableCount}/${results.length} reachable`);
    return reachableCount > 0;
  }

  /**
   * Start periodic reachability monitoring
   */
  startReachabilityMonitoring(): void {
    const targets = this.createCurrentReachabilityTargets();
    if (targets.length > 0) {
      this.reachabilityService.startPeriodicChecks(targets);
      console.log('[NetworkService] Reachability monitoring started');
    } else {
      console.warn('[NetworkService] Cannot start monitoring - no targets configured');
    }
  }

  /**
   * Stop periodic reachability monitoring
   */
  stopReachabilityMonitoring(): void {
    this.reachabilityService.stopPeriodicChecks();
    console.log('[NetworkService] Reachability monitoring stopped');
  }

  // ReachabilityServiceDelegate implementation
  onReachabilityResult(
    _service: ReachabilityService,
    target: ReachabilityTarget,
    isReachable: boolean,
    duration: number
  ): void {
    console.log(`[NetworkService] Reachability result: ${target.type} ${isReachable ? 'reachable' : 'unreachable'} (${duration}ms)`);
    
    // Find the corresponding adapter and notify delegate
    const adapter = this._adapters.find(a => 
      (target.type === 'esp32' && a.method === 'http') ||
      (target.type === 'mqtt' && a.method === 'mqtt')
    );
    
    if (adapter) {
      this.delegate?.onReachabilityChanged?.(adapter, isReachable);
    }
  }

  onConnectivityChanged(_service: ReachabilityService, isOnline: boolean): void {
    console.log(`[NetworkService] Browser connectivity changed: ${isOnline ? 'online' : 'offline'}`);
    
    // Notify delegate about connectivity change
    // Since we don't have a specific adapter for browser connectivity, use null
    this.delegate?.onReachabilityChanged?.(null as any, isOnline);
  }

  /**
   * Try the next adapter in the chain
   * @returns Promise<boolean> - true if adapter succeeded
   */
  private async tryNextAdapter(): Promise<boolean> {
    // Clean up previous adapter state
    this.clearTimeout();
    
    // Check if we've exhausted all adapters
    if (this.currentIndex >= this._adapters.length) {
      console.warn('[NetworkService] No more adapters available, operation failed');
      this._isRunning = false;
      
      const error = createNetworkError('network', 'All network adapters failed', 'http');
      
      // Use the last attempted adapter or null if no adapters were tried
      const lastAdapter = this._adapters.length > 0 ? this._adapters[this._adapters.length - 1] : null;
      this.delegate?.onTriggerFailure(lastAdapter, error);
      return false;
    }

    // Get the next adapter
    const adapter = this._adapters[this.currentIndex];
    this._currentAdapter = adapter;
    
    console.log(`[NetworkService] Trying adapter ${this.currentIndex + 1}/${this._adapters.length}: ${adapter.name}`);

    // Set timeout for this adapter
    this.triggerTimeout = setTimeout(() => {
      console.warn(`[NetworkService] Adapter ${adapter.name} timed out after ${this.timeoutMs}ms`);
      this.handleAdapterTimeout();
    }, this.timeoutMs);

    const startTime = Date.now();

    try {
      const success = await adapter.triggerGate();
      const duration = Date.now() - startTime;
      
      this.clearTimeout();
      this._isRunning = false;

      if (success) {
        console.log(`[NetworkService] Adapter ${adapter.name} succeeded in ${duration}ms`);
        this.delegate?.onTriggerSuccess(adapter, duration);
        return true;
      } else {
        console.warn(`[NetworkService] Adapter ${adapter.name} failed in ${duration}ms`);
        
        const error = createNetworkError('network', `Adapter ${adapter.name} returned false`, adapter.method);
        
        this.delegate?.onTriggerFailure(adapter, error);
        
        // Try next adapter
        this.currentIndex++;
        return this.tryNextAdapter();
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const networkError = this.categorizeError(error as Error, adapter);
      
      console.error(`[NetworkService] Adapter ${adapter.name} threw error in ${duration}ms:`, error);
      
      this.clearTimeout();
      this.delegate?.onTriggerFailure(adapter, networkError);
      
      // Try next adapter
      this.currentIndex++;
      return this.tryNextAdapter();
    }
  }

  /**
   * Handle adapter timeout
   */
  private handleAdapterTimeout(): void {
    if (this._currentAdapter) {
      const error = createNetworkError(
        'timeout', 
        `Adapter ${this._currentAdapter.name} timed out after ${this.timeoutMs}ms`, 
        this._currentAdapter.method
      );
      
      this.delegate?.onTriggerFailure(this._currentAdapter, error);
    }
    
    // Try next adapter
    this.currentIndex++;
    this.tryNextAdapter();
  }

  /**
   * Check reachability before trigger attempt
   * @returns Promise<boolean> - true if reachable, false if not reachable
   */
  private async checkReachabilityBeforeTrigger(): Promise<boolean> {
    console.log('[NetworkService] Checking reachability before trigger...');
    
    const targets = this.createCurrentReachabilityTargets();
    if (targets.length === 0) {
      console.warn('[NetworkService] No reachability targets configured - proceeding with trigger');
      return true; // Allow trigger if no targets configured
    }

    try {
      const results = await this.reachabilityService.testTargets(targets);
      const reachableCount = results.filter(r => r.isReachable).length;
      
      if (reachableCount > 0) {
        console.log(`[NetworkService] Reachability check passed: ${reachableCount}/${results.length} targets reachable`);
        return true;
      } else {
        console.warn('[NetworkService] Reachability check failed: no targets reachable');
        const error = createNetworkError('network', 'No configured targets are reachable', 'http');
        this.delegate?.onTriggerFailure(null, error);
        return false;
      }
    } catch (error) {
      console.error('[NetworkService] Reachability check error:', error);
      const networkError = createNetworkError('network', 'Reachability check failed', 'http');
      this.delegate?.onTriggerFailure(null, networkError);
      return false;
    }
  }

  /**
   * Create reachability targets from current configurations
   * @returns Array of reachability targets
   */
  private createCurrentReachabilityTargets(): ReachabilityTarget[] {
    return createReachabilityTargets(this.esp32Config, this.mqttConfig);
  }


  /**
   * Stop current operation and clean up state
   */
  private stopCurrentOperation(): void {
    this.clearTimeout();
    this._isRunning = false;
    this._currentAdapter = null;
    this.currentIndex = 0;
  }

  /**
   * Clear the current timeout
   */
  private clearTimeout(): void {
    if (this.triggerTimeout) {
      clearTimeout(this.triggerTimeout);
      this.triggerTimeout = null;
    }
  }

  /**
   * Categorize error using centralized error handling
   * @param error The error that occurred
   * @param adapter The adapter that threw the error
   * @returns NetworkError with proper categorization
   */
  private categorizeError(error: Error, adapter: NetworkAdapter): NetworkError {
    return categorizeNetworkError(error, adapter.method);
  }
}

/**
 * Create a new NetworkService instance
 * @returns NetworkService instance
 */
export function createNetworkService(): NetworkService {
  return new NetworkService();
}