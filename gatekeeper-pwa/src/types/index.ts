/**
 * Core type definitions for Gatekeeper PWA
 * Phase 3: Full state machine matching Swift app's 7-state system
 */

/**
 * Gate state machine matching Swift app's GateState enum
 * State transitions follow clean state machine patterns:
 * 
 * ready → triggering → waitingForRelayClose → ready
 *              ↓              ↓
 *          [timeout | error] ←─── [timeout | error]
 * 
 * Error recovery: error/timeout → ready (after delay)
 * Network retry: noNetwork → checkingNetwork (user interaction)
 */
export type GateState = 
  | 'ready'                // Gate is ready for trigger, all systems operational
  | 'triggering'          // Gate trigger command in progress
  | 'waitingForRelayClose' // Waiting for relay to complete gate operation
  | 'timeout'             // Operation timed out, recoverable error state
  | 'error';              // General error state, recoverable

/**
 * Relay state machine matching Swift app's RelayState enum
 * Represents physical relay state for gate mechanism
 */
export type RelayState = 'activated' | 'released';

/**
 * Gate action types that can trigger state transitions
 * Based on Swift app's Action enum pattern
 */
export type GateAction = 
  | 'userPressed'           // User triggered gate action
  | 'relayChanged'          // Relay state changed
  | 'requestComplete'       // Network request completed (success/failure)
  | 'timeout'               // Operation timeout occurred
  | 'retry';                // Retry operation triggered


/**
 * PWA-specific types for Phase 4 offline functionality
 */

/**
 * PWA installation status
 */
export type PWAInstallStatus = 'unknown' | 'installable' | 'installed' | 'not_supported';

/**
 * Offline operation status
 */
export type OfflineStatus = 'online' | 'offline' | 'checking';

/**
 * Theme mode options for UI styling
 * Supports manual bright/dark modes and system preference
 */
export type ThemeMode = 'bright' | 'dark' | 'system';

/**
 * Offline queue item types
 */
export type OfflineQueueItemType = 'gate_trigger' | 'config_update';

/**
 * Extended gate state information with metadata
 * Provides context about current state for UI and logic
 */
export interface GateStateInfo {
  state: GateState;
  title: string;           // User-facing state description
  isDisabled: boolean;     // Whether trigger button should be disabled
  canRetry: boolean;       // Whether retry action is available
  progress?: number;       // Optional progress indicator (0-1)
  timestamp: number;       // When state was entered
  metadata?: Record<string, any>; // Additional state-specific data
}

/**
 * State transition definition for state machine validation
 * Ensures only valid state transitions occur
 */
export interface StateTransition {
  from: GateState;
  to: GateState;
  action: GateAction;
  condition?: (context: any) => boolean; // Optional transition guard
}

/**
 * Network operation context for state transitions
 * Provides context about network operations affecting state
 */
export interface NetworkOperationContext {
  adapter?: string;         // Which adapter is being used
  method?: 'http' | 'mqtt'; // Protocol being used
  duration?: number;        // Operation duration in ms
  retryCount?: number;      // Current retry attempt
  error?: string;           // Error message if applicable
}

export interface ESP32Config {
  host: string;
  port: number;
}

export interface MQTTConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  ssl: boolean;
}

/**
 * Complete application configuration interface
 * Combines all configuration sections with metadata
 */
export interface AppConfig {
  esp32: ESP32Config;
  mqtt: MQTTConfig;
  theme: ThemeMode;
  version: string;
  lastModified: number;
}

/**
 * Configuration validation result
 * Used by validation utilities to report errors
 */
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: string[];
}

/**
 * Configuration validation error
 * Describes specific validation failures
 */
export interface ValidationError {
  field: keyof ESP32Config | keyof MQTTConfig | 'theme';
  message: string;
  code: 'required' | 'format' | 'range' | 'length';
}

/**
 * Gate operation error categories
 * Matches Swift app's GateKeeperError patterns
 */
export type GateErrorType = 
  | 'configuration'         // Invalid or missing configuration
  | 'network'              // Network connectivity issues
  | 'timeout'              // Operation timeout
  | 'adapter'              // Network adapter failure
  | 'relay'                // Relay operation failure
  | 'validation'           // Input validation failure
  | 'unknown';             // Unexpected error

/**
 * Comprehensive gate operation error
 * Provides detailed error context for debugging and user feedback
 */
export interface GateError {
  type: GateErrorType;
  message: string;
  code?: string;           // Optional error code for programmatic handling
  details?: string;        // Additional technical details
  timestamp: number;
  context?: NetworkOperationContext; // Network operation context if applicable
  recovery?: {
    suggestion: string;    // User-friendly recovery suggestion
    canRetry: boolean;     // Whether operation can be retried
    retryDelay?: number;   // Suggested retry delay in ms
  };
}

/**
 * Configuration manager interface
 * Defines contract for configuration persistence and validation
 */
export interface ConfigManagerInterface {
  loadConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<void>;
  validateESP32Config(config: Partial<ESP32Config>): ValidationResult;
  validateMQTTConfig(config: Partial<MQTTConfig>): ValidationResult;
  validateThemeConfig(theme: ThemeMode): ValidationResult;
  validateFullConfig(config: Partial<AppConfig>): ValidationResult;
  exportConfig(): Promise<string>;
  importConfig(configJson: string): Promise<AppConfig>;
  resetToDefaults(): Promise<AppConfig>;
}

/**
 * Configuration state management hook interface
 * Defines contract for React configuration hook
 */
export interface ConfigHookInterface {
  config: AppConfig;
  loading: boolean;
  error: string | null;
  validateAndSave: (config: Partial<AppConfig>) => Promise<ValidationResult>;
  reset: () => Promise<void>;
  export: () => Promise<string>;
  import: (configJson: string) => Promise<void>;
  
  // State machine support (optional for backward compatibility)
  currentState?: GateState;
  stateInfo?: GateStateInfo;
  transition?: (action: GateAction, context?: NetworkOperationContext) => Promise<boolean>;
  canRetry?: boolean;
  
  // PWA support (Phase 4)
  offlineStatus?: OfflineStatus;
  isInstallable?: boolean;
  queueSize?: number;
}

/**
 * State machine manager interface
 * Handles state transitions and validation for gate operations
 */
export interface StateManagerInterface {
  currentState: GateState;
  
  /**
   * Attempt state transition with action
   * @param action The action triggering the transition
   * @param context Optional context for transition logic
   * @returns Promise<boolean> - true if transition succeeded
   */
  transition(action: GateAction, context?: NetworkOperationContext): Promise<boolean>;
  
  /**
   * Check if transition is valid
   * @param to Target state
   * @param action Action triggering transition
   * @param context Optional context for validation
   * @returns boolean - true if transition is valid
   */
  canTransition(to: GateState, action: GateAction, context?: NetworkOperationContext): boolean;
  
  /**
   * Get current state information with metadata
   * @returns GateStateInfo - Current state with UI context
   */
  getStateInfo(): GateStateInfo;
  
  /**
   * Get valid actions for current state
   * @returns GateAction[] - Array of valid actions
   */
  getValidActions(): GateAction[];
  
  /**
   * Reset state to ready with cleanup
   * @returns Promise<void>
   */
  reset(): Promise<void>;
}

/**
 * Extended configuration manager for state machine support
 * Adds state persistence and recovery capabilities
 */
export interface ExtendedConfigManagerInterface extends ConfigManagerInterface {
  /**
   * Save current gate state for recovery
   * @param state Current gate state
   * @param context Optional operation context
   */
  saveState(state: GateState, context?: NetworkOperationContext): Promise<void>;
  
  /**
   * Load last saved state for recovery
   * @returns Promise<{state: GateState, context?: NetworkOperationContext} | null>
   */
  loadState(): Promise<{state: GateState, context?: NetworkOperationContext} | null>;
  
  /**
   * Clear saved state
   */
  clearState(): Promise<void>;
  
}

/**
 * PWA offline queue item interface
 * Phase 4: Defines structure for offline operation queueing
 */
export interface PWAOfflineQueueItem {
  id: string;
  type: OfflineQueueItemType;
  data: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  priority?: 'low' | 'medium' | 'high';
}

/**
 * PWA service worker message interface
 * Phase 4: Defines communication between main thread and service worker
 */
export interface PWAServiceWorkerMessage {
  type: 'QUEUE_GATE_TRIGGER' | 'GET_OFFLINE_STATUS' | 'CLEAR_OFFLINE_QUEUE' | 'PROCESS_QUEUE';
  data?: any;
}

/**
 * PWA installation interface
 * Phase 4: Manages PWA installation state and events
 */
export interface PWAInstallInterface {
  status: PWAInstallStatus;
  canInstall: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  showInstallPrompt(): Promise<boolean>;
  getInstallInstructions(): string[];
}

/**
 * PWA offline interface
 * Phase 4: Manages offline functionality and queue operations
 */
export interface PWAOfflineInterface {
  status: OfflineStatus;
  queueSize: number;
  canExecuteOnline: boolean;
  queueOperation(type: OfflineQueueItemType, data: any): Promise<string>;
  processQueue(): Promise<void>;
  clearQueue(): Promise<void>;
  getQueueStatus(): Promise<{ size: number; items: PWAOfflineQueueItem[] }>;
}

// Re-export network types for convenience
export type { NetworkError, NetworkMethod } from './network';

// Re-export state machine types for convenience
export type { 
  StateMachineConfig, 
  StateTransitionEvent,
  DEFAULT_STATE_MACHINE_CONFIG 
} from './state-machine';

export {
  STATE_TRANSITIONS,
  STATE_METADATA,
  isValidTransition,
  getNextState,
  getValidActions,
  isTransitionalState,
  canRetryFromState,
  getStateTimeout
} from './state-machine';