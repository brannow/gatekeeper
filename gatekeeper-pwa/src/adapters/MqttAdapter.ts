import type { MqttAdapter as IMqttAdapter } from '../types/network';
import type { MQTTConfig, RelayState } from '../types';
import { MqttService } from '../services/MqttService';
import { NetworkErrorHandler } from '../network/NetworkErrorHandler';
import { NETWORK_TIMEOUTS, MQTT_TOPICS } from '../network/NetworkConfig';
import { validationService } from '../services/ValidationService';
import { configManager } from '../services/ConfigManager';

/**
 * MQTT network adapter implementation
 * Handles gate triggering through MQTT over WebSocket (WSS) with relay state feedback
 * Uses centralized error handling and timeout management
 */
export class MqttAdapter implements IMqttAdapter {
  readonly method = 'mqtt' as const;
  readonly timeout = NETWORK_TIMEOUTS.MQTT;
  readonly name = 'MQTT WebSocket Adapter';
  
  private service: MqttService;
  private readonly triggerTopic = MQTT_TOPICS.TRIGGER;
  private readonly statusTopic = MQTT_TOPICS.STATUS;
  private triggerPromise: Promise<boolean> | null = null;
  private triggerResolver: ((value: boolean) => void) | null = null;
  private triggerTimeout: number | null = null;
  private isTriggering = false;
  private currentAbortController: AbortController | null = null;
  
  // Enhanced Phase 3 features for relay state monitoring
  private relayStateCallback?: (state: RelayState) => void;
  private currentRelayState: RelayState = 'released';

  constructor(public config: MQTTConfig) {
    this.service = new MqttService(config);
  }

  /**
   * Check if adapter is currently disabled by asking ConfigManager directly
   */
  private async isDisabled(): Promise<boolean> {
    try {
      const currentConfig = await configManager.loadConfig();
      return currentConfig.mqtt.disabled === true;
    } catch (error) {
      console.error('[MqttAdapter] Failed to check disabled state:', error);
      return false; // Default to enabled if we can't check
    }
  }

  /**
   * Initialize the MQTT adapter
   * Only validates configuration - connection happens on-demand
   */
  async initialize(): Promise<void> {
    console.log(`[MqttAdapter] Initializing MQTT adapter for ${this.config.host}:${this.config.port}`);
    
    try {
      // Validate configuration using centralized validation
      validationService.validateMQTTConfigStrict(this.config);
      console.log('[MqttAdapter] Initialized successfully - connection will be established on-demand');
    } catch (error) {
      const context = NetworkErrorHandler.createContext('mqtt', 'initialization', Date.now(), this.config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Initialization failed', networkError, context);
      throw error;
    }
  }

  /**
   * Ensure MQTT connection and subscription (lazy initialization)
   * @returns Promise<boolean> - true if connected and subscribed
   */
  private async ensureConnected(): Promise<boolean> {
    if (this.service.connected) {
      return true;
    }

    console.log('[MqttAdapter] Establishing connection on-demand...');
    const startTime = Date.now();
    
    try {
      // Connect to MQTT broker
      const connected = await this.service.connect();
      if (!connected) {
        console.error('[MqttAdapter] Failed to connect to MQTT broker');
        return false;
      }

      // Subscribe to status topic for relay state feedback
      const subscribed = await this.service.subscribe(this.statusTopic, (payload) => {
        this.handleStatusMessage(payload);
      });

      if (!subscribed) {
        console.error('[MqttAdapter] Failed to subscribe to status topic');
        return false;
      }

      const duration = Date.now() - startTime;
      console.log(`[MqttAdapter] Connected and subscribed to ${this.statusTopic} in ${duration}ms`);
      return true;
    } catch (error) {
      const context = NetworkErrorHandler.createContext('mqtt', 'connection', startTime, this.config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Connection failed', networkError, context);
      return false;
    }
  }

  /**
   * Clean up adapter resources and cancel any ongoing operations
   * Unsubscribes from topics and disconnects from broker
   */
  async cleanup(): Promise<void> {
    console.log('[MqttAdapter] Cleaning up...');
    
    this.cancelCurrentOperation();
    
    try {
      // Unsubscribe from status topic
      await this.service.unsubscribe(this.statusTopic);
      
      // Disconnect from broker
      await this.service.disconnect();
      
      console.log('[MqttAdapter] Cleanup completed');
    } catch (error) {
      console.error('[MqttAdapter] Error during cleanup:', error);
    }
  }

  /**
   * Cancel any ongoing MQTT operation
   */
  cancelCurrentOperation(): void {
    if (this.currentAbortController) {
      console.log('[MqttAdapter] Cancelling ongoing MQTT operation');
      this.currentAbortController.abort('Operation cancelled by adapter cleanup');
      this.currentAbortController = null;
    }
    this.clearTriggerTimeout();
    
    // Disconnect from MQTT broker to stop ping messages
    if (this.service.connected) {
      console.log('[MqttAdapter] Disconnecting MQTT service to stop ping messages');
      this.service.disconnect().catch(error => {
        console.error('[MqttAdapter] Error disconnecting during cancellation:', error);
      });
    }
  }

  /**
   * Trigger the gate using MQTT publish
   * Enhanced with relay state tracking for Phase 3
   * @param timestamp - Single timestamp for command deduplication
   * @returns Promise<boolean> - true if gate was triggered successfully
   */
  async triggerGate(timestamp: string): Promise<boolean> {
    // Check if adapter is disabled at runtime
    if (await this.isDisabled()) {
      console.log('[MqttAdapter] Adapter is disabled, skipping trigger');
      return false;
    }

    const startTime = Date.now();
    
    // Prevent multiple simultaneous triggers
    if (this.isTriggering) {
      console.warn('[MqttAdapter] Gate trigger already in progress, ignoring duplicate request');
      return false;
    }
    
    // Cancel any previous operation
    this.cancelCurrentOperation();
    
    // Create new AbortController for this operation
    this.currentAbortController = new AbortController();
    
    try {
      console.log(`[MqttAdapter] Triggering gate via MQTT with timestamp: ${timestamp}`);
      this.isTriggering = true;
      
      // Ensure we're connected and subscribed (lazy initialization)
      const connected = await this.ensureConnected();
      if (!connected) {
        console.error('[MqttAdapter] Failed to establish MQTT connection');
        this.isTriggering = false;
        return false;
      }

      // Create promise for trigger completion
      this.triggerPromise = new Promise((resolve) => {
        this.triggerResolver = resolve;
      });

      // Set timeout for trigger operation
      this.triggerTimeout = setTimeout(() => {
        console.warn('[MqttAdapter] Trigger operation timed out');
        this.triggerResolver?.(false);
        this.isTriggering = false;
        this.clearTriggerTimeout();
        
        // Disconnect from MQTT broker after timeout to stop ping messages
        if (this.service.connected) {
          console.log('[MqttAdapter] Disconnecting MQTT service after timeout');
          this.service.disconnect().catch(error => {
            console.error('[MqttAdapter] Error disconnecting after timeout:', error);
          });
        }
      }, this.timeout);

      // Publish trigger message with provided timestamp
      const published = await this.service.publish(this.triggerTopic, timestamp);
      
      if (!published) {
        this.clearTriggerTimeout();
        this.triggerResolver?.(false);
        this.isTriggering = false;
        return false;
      }

      console.log(`[MqttAdapter] Trigger message published to ${this.triggerTopic}: ${timestamp}`);
      
      // Wait for relay state confirmation or timeout
      const success = await this.triggerPromise;
      const duration = Date.now() - startTime;
      
      this.currentAbortController = null; // Clear on completion
      
      if (success) {
        console.log(`[MqttAdapter] Gate triggered successfully in ${duration}ms`);
      } else {
        console.warn(`[MqttAdapter] Gate trigger failed after ${duration}ms`);
      }
      
      this.isTriggering = false;
      return success;
      
    } catch (error) {
      this.currentAbortController = null; // Clear on error
      
      // Handle abort specifically
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`[MqttAdapter] MQTT operation was cancelled`);
        this.clearTriggerTimeout();
        return false;
      }
      
      const context = NetworkErrorHandler.createContext('mqtt', 'gate trigger', startTime, this.config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Gate trigger failed', networkError, context);
      
      this.clearTriggerTimeout();
      this.triggerResolver?.(false);
      this.isTriggering = false;
      return false;
    }
  }

  /**
   * Test connection to MQTT broker
   * @returns Promise<boolean> - true if broker is reachable
   */
  async testConnection(): Promise<boolean> {
    // Check if adapter is disabled at runtime
    if (await this.isDisabled()) {
      console.log('[MqttAdapter] Adapter is disabled, skipping connection test');
      return false;
    }

    const startTime = Date.now();
    
    try {
      console.log(`[MqttAdapter] Testing connection to ${this.config.host}:${this.config.port}`);
      
      // Use lazy connection for testing
      const connected = await this.ensureConnected();
      const duration = Date.now() - startTime;
      
      console.log(
        `[MqttAdapter] Connection test ${connected ? 'passed' : 'failed'} in ${duration}ms`
      );
      
      return connected;
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('mqtt', 'connection test', startTime, this.config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Connection test failed', networkError, context);
      return false;
    }
  }

  /**
   * Publish message to MQTT topic
   * @param topic MQTT topic to publish to
   * @param payload Message payload
   * @returns Promise<boolean> - true if published successfully
   */
  async publish(topic: string, payload: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      return await this.service.publish(topic, payload);
    } catch (error) {
      const context = NetworkErrorHandler.createContext('mqtt', 'publish', startTime, { topic, payload });
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError(`Publish to ${topic} failed`, networkError, context);
      return false;
    }
  }

  /**
   * Subscribe to MQTT topic
   * @param topic MQTT topic to subscribe to
   * @param callback Callback function for received messages
   * @returns Promise<boolean> - true if subscribed successfully
   */
  async subscribe(topic: string, callback: (payload: string) => void): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      return await this.service.subscribe(topic, callback);
    } catch (error) {
      const context = NetworkErrorHandler.createContext('mqtt', 'subscribe', startTime, { topic });
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError(`Subscribe to ${topic} failed`, networkError, context);
      return false;
    }
  }

  /**
   * Unsubscribe from MQTT topic
   * @param topic MQTT topic to unsubscribe from
   * @returns Promise<boolean> - true if unsubscribed successfully
   */
  async unsubscribe(topic: string): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      return await this.service.unsubscribe(topic);
    } catch (error) {
      const context = NetworkErrorHandler.createContext('mqtt', 'unsubscribe', startTime, { topic });
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError(`Unsubscribe from ${topic} failed`, networkError, context);
      return false;
    }
  }

  /**
   * Set relay state change callback for external monitoring
   * Enhanced for Phase 3 state machine integration
   * @param callback Function to call when relay state changes
   */
  setRelayStateCallback(callback: (state: RelayState) => void): void {
    this.relayStateCallback = callback;
    console.log('[MqttAdapter] Relay state callback registered');
  }

  /**
   * Get current relay state
   * @returns Current relay state
   */
  getCurrentRelayState(): RelayState {
    return this.currentRelayState;
  }

  /**
   * Handle status messages from ESP32
   * Enhanced with relay state tracking and external callbacks for Phase 3
   * @param payload Status message payload
   */
  private handleStatusMessage(payload: string): void {
    console.log(`[MqttAdapter] Received status: ${payload}`);
    
    try {
      // Parse relay state from payload
      let newRelayState: RelayState | null = null;
      
      switch (payload.trim()) {
        case '1':
          newRelayState = 'activated';
          console.log('[MqttAdapter] Relay activated');
          // Gate is opening/activated - continue waiting for release
          break;
          
        case '0':
          newRelayState = 'released';
          console.log('[MqttAdapter] Relay released - gate operation complete');
          // Gate operation completed successfully
          this.triggerResolver?.(true);
          this.clearTriggerTimeout();
          
          // Disconnect from MQTT broker after successful trigger to stop ping messages
          if (this.service.connected) {
            console.log('[MqttAdapter] Disconnecting MQTT service after successful trigger');
            this.service.disconnect().catch(error => {
              console.error('[MqttAdapter] Error disconnecting after success:', error);
            });
          }
          break;
          
        default:
          console.log(`[MqttAdapter] Unknown status payload: ${payload}`);
          return;
      }
      
      // Update relay state and notify callback if state changed
      if (newRelayState && this.currentRelayState !== newRelayState) {
        const previousState = this.currentRelayState;
        this.currentRelayState = newRelayState;
        
        console.log(`[MqttAdapter] Relay state changed: ${previousState} → ${newRelayState}`);
        
        // Notify external callback (e.g., NetworkService)
        this.relayStateCallback?.(newRelayState);
      }
      
    } catch (error) {
      console.error('[MqttAdapter] Error handling status message:', error);
    }
  }

  /**
   * Clear trigger timeout and reset state
   */
  private clearTriggerTimeout(): void {
    if (this.triggerTimeout) {
      clearTimeout(this.triggerTimeout);
      this.triggerTimeout = null;
    }
    
    this.triggerPromise = null;
    this.triggerResolver = null;
    this.isTriggering = false;
  }

}

/**
 * Factory function to create MQTT adapter instance
 * @param config MQTT configuration
 * @returns Configured MqttAdapter instance
 */
export function createMqttAdapter(config: MQTTConfig): MqttAdapter {
  return new MqttAdapter(config);  
}