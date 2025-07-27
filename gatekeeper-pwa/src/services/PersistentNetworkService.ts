import type { ESP32Config, MQTTConfig } from '../types';
import type { NetworkServiceDelegate, NetworkResult, NetworkAdapter } from '../types/network';
import type { PersistentNetworkServiceInterface } from '../hooks/useGateControl';
import { PersistentHttpAdapter } from '../adapters/PersistentHttpAdapter';
import { PersistentMqttAdapter } from '../adapters/PersistentMqttAdapter';
import { categorizeNetworkError, createNetworkError } from '../network/NetworkErrorHandler';
import { NETWORK_TIMEOUTS } from '../network/NetworkConfig';
import { getNetworkEventBus } from './NetworkEventBus';

/**
 * Persistent Network Service - Phase 3 Implementation
 * 
 * Key Features:
 * - Manages adapters with Map<string, NetworkAdapter> to avoid recreation
 * - Provides updateConfig() method for reconfiguring existing adapters
 * - Handles adapter lifecycle with stable client IDs and connections
 * - Eliminates connection recreation anti-pattern
 * - Event-driven status system via NetworkEventBus (Phase 3)
 * 
 * Performance Goals:
 * - <100ms config update time
 * - Stable memory usage
 * - Same client ID across reconfigurations
 * - Reuse connections where possible
 * 
 * Phase 3 Enhancements:
 * - Integrates NetworkEventBus for event-driven status updates
 * - Emits statusChange, connectionStateChange, and gateTrigger events
 * - Maintains backward compatibility with existing status callbacks
 */
export class PersistentNetworkService implements PersistentNetworkServiceInterface {
  private _adapters = new Map<string, NetworkAdapter>();
  private _delegate?: NetworkServiceDelegate;
  private _statusChangeCallback?: (type: 'esp32' | 'mqtt', status: 'reachable' | 'unreachable' | 'unknown') => void;
  private _isInitialized = false;
  private _lastError: Error | null = null;
  private _isRunning = false;
  
  // Adapter chain state
  private currentIndex = 0;
  private triggerTimeout: number | null = null;
  private readonly timeoutMs = NETWORK_TIMEOUTS.HTTP; // Default timeout for adapter operations
  
  // Phase 3: Event bus integration
  private readonly eventBus = getNetworkEventBus();
  private readonly serviceName = 'PersistentNetworkService';

  constructor() {
    console.log('[PersistentNetworkService] Creating persistent network service with event bus integration');
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get adapters(): NetworkAdapter[] {
    return Array.from(this._adapters.values());
  }

  get lastError(): Error | null {
    return this._lastError;
  }

  /**
   * Set the delegate for network operation callbacks
   */
  setDelegate(delegate: NetworkServiceDelegate): void {
    this._delegate = delegate;
    console.log('[PersistentNetworkService] Delegate set');
  }

  /**
   * Set callback for real-time status changes
   */
  setStatusChangeCallback(callback: (type: 'esp32' | 'mqtt', status: 'reachable' | 'unreachable' | 'unknown') => void): void {
    this._statusChangeCallback = callback;
    
    // Update existing adapters with the callback
    for (const adapter of this._adapters.values()) {
      if (adapter.setStatusChangeCallback) {
        adapter.setStatusChangeCallback(callback);
      }
    }
    
    console.log('[PersistentNetworkService] Status change callback set');
  }

  /**
   * Update connection status for an adapter type
   * Phase 3: Emits events via NetworkEventBus while maintaining backward compatibility
   */
  updateConnectionStatus(type: 'esp32' | 'mqtt', status: 'reachable' | 'unreachable' | 'unknown'): void {
    console.log(`[PersistentNetworkService] Connection status update: ${type} -> ${status}`);
    
    // Phase 3: Emit status change event
    const adapter = this.getAdapterByType(type);
    this.eventBus.emitStatusChange(type, status, this.serviceName, adapter);
    
    // Backward compatibility: Still call the legacy callback
    if (this._statusChangeCallback) {
      this._statusChangeCallback(type, status);
    }
  }

  /**
   * Get adapter instance by adapter type
   */
  private getAdapterByType(type: 'esp32' | 'mqtt'): NetworkAdapter | undefined {
    const adapterKey = type === 'esp32' ? 'http' : 'mqtt';
    return this._adapters.get(adapterKey);
  }

  /**
   * Initialize the service
   * Sets up basic state but doesn't create adapters until updateConfig is called
   */
  async initialize(): Promise<void> {
    console.log('[PersistentNetworkService] Initializing persistent network service');
    
    try {
      this._isInitialized = true;
      this._lastError = null;
      console.log('[PersistentNetworkService] Initialization completed');
    } catch (error) {
      this._lastError = error as Error;
      this._isInitialized = false;
      console.error('[PersistentNetworkService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Update adapter configurations without recreating connections
   * This is the key performance improvement - no connection recreation on config changes
   * 
   * @param esp32Config ESP32 configuration (optional)
   * @param mqttConfig MQTT configuration (optional)
   */
  async updateConfig(esp32Config?: ESP32Config, mqttConfig?: MQTTConfig): Promise<void> {
    const startTime = Date.now();
    console.log('[PersistentNetworkService] Updating adapter configurations');

    try {
      // Handle ESP32 HTTP adapter
      if (esp32Config && esp32Config.host && esp32Config.port) {
        await this.updateHttpAdapter(esp32Config);
      } else {
        await this.removeHttpAdapter();
      }

      // Handle MQTT adapter
      if (mqttConfig && mqttConfig.host && mqttConfig.port) {
        await this.updateMqttAdapter(mqttConfig);
      } else {
        await this.removeMqttAdapter();
      }

      const duration = Date.now() - startTime;
      console.log(`[PersistentNetworkService] Configuration update completed in ${duration}ms`);
      
      if (duration > 100) {
        console.warn(`[PersistentNetworkService] Configuration update took ${duration}ms (target: <100ms)`);
      }

    } catch (error) {
      this._lastError = error as Error;
      console.error('[PersistentNetworkService] Configuration update failed:', error);
      throw error;
    }
  }

  /**
   * Update or create HTTP adapter with ESP32 configuration
   */
  private async updateHttpAdapter(config: ESP32Config): Promise<void> {
    const adapterKey = 'http';
    const existingAdapter = this._adapters.get(adapterKey) as PersistentHttpAdapter | undefined;

    if (existingAdapter) {
      // Update existing adapter configuration without recreation
      console.log('[PersistentNetworkService] Updating existing HTTP adapter configuration');
      await existingAdapter.updateConfig(config);
    } else {
      // Create new HTTP adapter
      console.log('[PersistentNetworkService] Creating new HTTP adapter');
      const httpAdapter = new PersistentHttpAdapter(config);
      
      // Set status change callback if available
      if (this._statusChangeCallback) {
        httpAdapter.setStatusChangeCallback(this._statusChangeCallback);
      }
      
      await httpAdapter.initialize();
      this._adapters.set(adapterKey, httpAdapter);
    }
  }

  /**
   * Update or create MQTT adapter with MQTT configuration
   */
  private async updateMqttAdapter(config: MQTTConfig): Promise<void> {
    const adapterKey = 'mqtt';
    const existingAdapter = this._adapters.get(adapterKey) as PersistentMqttAdapter | undefined;

    if (existingAdapter) {
      // Update existing adapter configuration
      // Only reconnect if significant config changes (host/port/ssl)
      console.log('[PersistentNetworkService] Updating existing MQTT adapter configuration');
      await existingAdapter.updateConfig(config);
    } else {
      // Create new MQTT adapter with stable client ID
      console.log('[PersistentNetworkService] Creating new MQTT adapter');
      const mqttAdapter = new PersistentMqttAdapter(config);
      
      // Set status change callback if available
      if (this._statusChangeCallback) {
        mqttAdapter.setStatusChangeCallback(this._statusChangeCallback);
      }
      
      await mqttAdapter.initialize();
      this._adapters.set(adapterKey, mqttAdapter);
    }
  }

  /**
   * Remove HTTP adapter if it exists
   */
  private async removeHttpAdapter(): Promise<void> {
    const adapterKey = 'http';
    const adapter = this._adapters.get(adapterKey);
    
    if (adapter) {
      console.log('[PersistentNetworkService] Removing HTTP adapter');
      await adapter.cleanup();
      this._adapters.delete(adapterKey);
    }
  }

  /**
   * Remove MQTT adapter if it exists
   */
  private async removeMqttAdapter(): Promise<void> {
    const adapterKey = 'mqtt';
    const adapter = this._adapters.get(adapterKey);
    
    if (adapter) {
      console.log('[PersistentNetworkService] Removing MQTT adapter');
      await adapter.cleanup();
      this._adapters.delete(adapterKey);
    }
  }

  /**
   * Trigger the gate using adapter chain pattern
   * Phase 3: Emits gate trigger events throughout the operation
   * @returns Promise<boolean> - true if any adapter succeeded
   */
  async triggerGate(): Promise<boolean> {
    if (this._isRunning) {
      console.warn('[PersistentNetworkService] triggerGate ignored - already running');
      return false;
    }

    const adapters = Array.from(this._adapters.values());
    if (adapters.length === 0) {
      console.error('[PersistentNetworkService] No adapters available');
      const error = createNetworkError('config', 'No network adapters configured', 'http');
      
      // Phase 3: Emit failure event
      this.eventBus.emitGateTrigger('failure', this.serviceName, undefined, undefined, error);
      
      this._delegate?.onTriggerFailure(null, error);
      return false;
    }

    console.log(`[PersistentNetworkService] Starting gate trigger with ${adapters.length} adapters`);
    
    // Phase 3: Emit started event
    this.eventBus.emitGateTrigger('started', this.serviceName);
    
    this._isRunning = true;
    this.currentIndex = 0;

    return this.tryNextAdapter(adapters);
  }

  /**
   * Try the next adapter in the chain
   */
  private async tryNextAdapter(adapters: NetworkAdapter[]): Promise<boolean> {
    // Clean up previous adapter state
    this.clearTimeout();
    
    // Check if we've exhausted all adapters
    if (this.currentIndex >= adapters.length) {
      console.warn('[PersistentNetworkService] No more adapters available, operation failed');
      this._isRunning = false;
      
      const error = createNetworkError('network', 'All network adapters failed', 'http');
      const lastAdapter = adapters.length > 0 ? adapters[adapters.length - 1] : null;
      this._delegate?.onTriggerFailure(lastAdapter, error);
      return false;
    }

    // Get the next adapter
    const adapter = adapters[this.currentIndex];
    
    console.log(`[PersistentNetworkService] Trying adapter ${this.currentIndex + 1}/${adapters.length}: ${adapter.name}`);

    // Set timeout for this adapter
    this.triggerTimeout = setTimeout(() => {
      console.warn(`[PersistentNetworkService] Adapter ${adapter.name} timed out after ${this.timeoutMs}ms`);
      this.handleAdapterTimeout(adapters);
    }, this.timeoutMs);

    const startTime = Date.now();

    try {
      const success = await adapter.triggerGate();
      const duration = Date.now() - startTime;
      
      this.clearTimeout();
      this._isRunning = false;

      if (success) {
        console.log(`[PersistentNetworkService] Adapter ${adapter.name} succeeded in ${duration}ms`);
        
        // Phase 3: Emit success event
        this.eventBus.emitGateTrigger('success', this.serviceName, adapter, duration);
        
        this._delegate?.onTriggerSuccess(adapter, duration);
        return true;
      } else {
        console.warn(`[PersistentNetworkService] Adapter ${adapter.name} failed in ${duration}ms`);
        
        const error = createNetworkError('network', `Adapter ${adapter.name} returned false`, adapter.method);
        
        // Phase 3: Emit failure event
        this.eventBus.emitGateTrigger('failure', this.serviceName, adapter, duration, error);
        
        this._delegate?.onTriggerFailure(adapter, error);
        
        // Try next adapter
        this.currentIndex++;
        return this.tryNextAdapter(adapters);
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const networkError = categorizeNetworkError(error as Error, adapter.method);
      
      console.error(`[PersistentNetworkService] Adapter ${adapter.name} threw error in ${duration}ms:`, error);
      
      // Phase 3: Emit failure event for exception
      this.eventBus.emitGateTrigger('failure', this.serviceName, adapter, duration, networkError);
      
      this.clearTimeout();
      this._delegate?.onTriggerFailure(adapter, networkError);
      
      // Try next adapter
      this.currentIndex++;
      return this.tryNextAdapter(adapters);
    }
  }

  /**
   * Handle adapter timeout
   * Phase 3: Emits timeout events
   */
  private handleAdapterTimeout(adapters: NetworkAdapter[]): void {
    const adapter = adapters[this.currentIndex];
    if (adapter) {
      const error = createNetworkError(
        'timeout', 
        `Adapter ${adapter.name} timed out after ${this.timeoutMs}ms`, 
        adapter.method
      );
      
      // Phase 3: Emit timeout event
      this.eventBus.emitGateTrigger('timeout', this.serviceName, adapter, this.timeoutMs, error);
      
      this._delegate?.onTriggerFailure(adapter, error);
    }
    
    // Try next adapter
    this.currentIndex++;
    this.tryNextAdapter(adapters);
  }

  /**
   * Test all adapter connections
   */
  async testAllConnections(): Promise<NetworkResult[]> {
    const adapters = Array.from(this._adapters.values());
    console.log(`[PersistentNetworkService] Testing connections for ${adapters.length} adapters`);
    
    const results: NetworkResult[] = [];
    
    for (const adapter of adapters) {
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
        this._delegate?.onConnectionTest(adapter, success, duration);
        
      } catch (error) {
        const duration = Date.now() - startTime;
        const networkError = categorizeNetworkError(error as Error, adapter.method);
        
        const result: NetworkResult = {
          success: false,
          adapter,
          error: networkError,
          duration,
          timestamp: Date.now()
        };
        
        results.push(result);
        this._delegate?.onConnectionTest(adapter, false, duration);
      }
    }
    
    console.log(`[PersistentNetworkService] Connection tests completed: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  /**
   * Clean up all adapters and service resources
   */
  async cleanup(): Promise<void> {
    console.log('[PersistentNetworkService] Cleaning up...');
    
    this.stopCurrentOperation();
    
    const cleanupPromises = Array.from(this._adapters.values()).map(async (adapter) => {
      try {
        await adapter.cleanup();
      } catch (error) {
        console.error(`[PersistentNetworkService] Error cleaning up adapter ${adapter.name}:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    this._adapters.clear();
    this._isInitialized = false;
    
    console.log('[PersistentNetworkService] Cleanup completed');
  }

  /**
   * Stop current operation and clean up state
   */
  private stopCurrentOperation(): void {
    this.clearTimeout();
    this._isRunning = false;
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

}

/**
 * Create a new PersistentNetworkService instance
 */
export function createPersistentNetworkService(): PersistentNetworkService {
  return new PersistentNetworkService();
}