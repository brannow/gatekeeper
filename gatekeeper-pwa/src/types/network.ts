/**
 * Network adapter interfaces for Phase 2 adapter chain pattern
 * Foundation for HTTP and MQTT adapter implementations
 */

import type { ESP32Config, MQTTConfig, RelayState } from './index';

export type NetworkMethod = 'http' | 'mqtt';

export interface NetworkError {
  type: 'timeout' | 'network' | 'server' | 'config';
  message: string;
  adapter?: NetworkMethod;
  timestamp: number;
  recovery?: {
    suggestion: string;
    canRetry: boolean;
    retryDelay?: number;
  };
}

/**
 * Callback for adapter status changes
 * Triggered when adapter connectivity status changes
 */
export type StatusChangeCallback = (
  adapterType: 'esp32' | 'mqtt', 
  status: 'reachable' | 'unreachable' | 'unknown'
) => void;

/**
 * Base interface for all network adapters
 * Implements adapter chain pattern for reliable network communication
 */
export interface NetworkAdapter {
  readonly method: NetworkMethod;
  readonly timeout: number;
  readonly name: string;
  
  /**
   * Triggers the gate using this adapter
   * @returns Promise<boolean> - true if successful, false otherwise
   */
  triggerGate(): Promise<boolean>;
  
  /**
   * Tests connection using this adapter
   * @returns Promise<boolean> - true if reachable, false otherwise
   */
  testConnection(): Promise<boolean>;
  
  /**
   * Initializes the adapter
   * Called once when adapter is added to chain
   */
  initialize(): Promise<void>;
  
  /**
   * Cleans up adapter resources
   * Called when adapter is removed or app shuts down
   */
  cleanup(): Promise<void>;
  
  /**
   * Set callback for real-time status changes
   * @param callback Function to call when adapter status changes
   */
  setStatusChangeCallback?(callback: StatusChangeCallback): void;
}

/**
 * HTTP adapter configuration interface
 * Extends NetworkAdapter for ESP32 HTTP API communication
 */
export interface HttpAdapter extends NetworkAdapter {
  readonly method: 'http';
  config: ESP32Config;
}

/**
 * MQTT adapter configuration interface
 * Extends NetworkAdapter for MQTT over WSS communication
 */
export interface MqttAdapter extends NetworkAdapter {
  readonly method: 'mqtt';
  config: MQTTConfig;
  
  /**
   * MQTT-specific methods for pub/sub pattern
   */
  publish(topic: string, payload: string): Promise<boolean>;
  subscribe(topic: string, callback: (payload: string) => void): Promise<boolean>;
  unsubscribe(topic: string): Promise<boolean>;
}

/**
 * Network service delegate for adapter callbacks
 * Enhanced for state machine integration with relay state support
 */
export interface NetworkServiceDelegate {
  /**
   * Called when an adapter successfully triggers the gate
   * @param adapter The adapter that succeeded
   * @param duration Request duration in milliseconds
   */
  onTriggerSuccess(adapter: NetworkAdapter, duration: number): void;
  
  /**
   * Called when an adapter fails to trigger the gate
   * @param adapter The adapter that failed (null if no adapters available)
   * @param error The error that occurred
   */
  onTriggerFailure(adapter: NetworkAdapter | null, error: NetworkError): void;
  
  /**
   * Called when connection test completes
   * @param adapter The adapter that was tested
   * @param success Whether the test succeeded
   * @param duration Test duration in milliseconds
   */
  onConnectionTest(adapter: NetworkAdapter, success: boolean, duration: number): void;
  
  /**
   * Called when relay state changes (if supported by adapter)
   * @param adapter The adapter reporting the relay change
   * @param state New relay state
   */
  onRelayStateChanged?(adapter: NetworkAdapter, state: RelayState): void;
  
  /**
   * Called when network reachability changes
   * @param adapter The adapter reporting reachability
   * @param reachable Whether the network is reachable
   */
  onReachabilityChanged?(adapter: NetworkAdapter, reachable: boolean): void;
}

/**
 * Network service configuration
 * Manages adapter chain and fallback behavior
 */
export interface NetworkServiceConfig {
  /**
   * Array of adapters to try in order
   * First successful response wins
   */
  adapters: NetworkAdapter[];
  
  /**
   * Maximum number of retry attempts per adapter
   * Default: 1 (no retries)
   */
  maxRetries?: number;
  
  /**
   * Delay between retry attempts in milliseconds
   * Default: 0 (immediate retry)
   */
  retryDelay?: number;
  
  /**
   * Whether to use exponential backoff for retries
   * Default: false
   */
  useExponentialBackoff?: boolean;
  
  /**
   * Delegate for adapter callbacks
   */
  delegate?: NetworkServiceDelegate;
}

/**
 * Adapter factory function type
 * Used to create adapters with specific configurations
 */
export type AdapterFactory<T extends NetworkAdapter> = (config: any) => T;

/**
 * Network service result
 * Returned by network operations with success/failure details
 */
export interface NetworkResult {
  success: boolean;
  adapter?: NetworkAdapter;
  error?: NetworkError;
  duration: number;
  timestamp: number;
}

/**
 * Main network service interface
 * Manages adapter chain pattern for reliable network communication
 */
export interface NetworkService {
  /**
   * Current adapters in the chain
   */
  readonly adapters: NetworkAdapter[];
  
  /**
   * Current active adapter (if any)
   */
  readonly currentAdapter: NetworkAdapter | null;
  
  /**
   * Whether the service is currently processing a request
   */
  readonly isRunning: boolean;
  
  /**
   * Service delegate for callbacks
   */
  delegate?: NetworkServiceDelegate;
  
  /**
   * Trigger the gate using adapter chain
   * Tries adapters in sequence until one succeeds or all fail
   * @returns Promise<boolean> - true if any adapter succeeded
   */
  triggerGate(): Promise<boolean>;
  
  /**
   * Test connection for all adapters
   * @returns Promise<NetworkResult[]> - Results for each adapter
   */
  testAllConnections(): Promise<NetworkResult[]>;
  
  /**
   * Add adapter to the chain
   * @param adapter NetworkAdapter to add
   */
  addAdapter(adapter: NetworkAdapter): Promise<void>;
  
  /**
   * Remove adapter from the chain
   * @param adapter NetworkAdapter to remove
   */
  removeAdapter(adapter: NetworkAdapter): Promise<void>;
  
  /**
   * Clear all adapters and stop any running operations
   */
  clearAdapters(): Promise<void>;
  
  /**
   * Initialize all adapters
   */
  initialize(): Promise<void>;
  
  /**
   * Clean up all adapters and service resources
   */
  cleanup(): Promise<void>;
}