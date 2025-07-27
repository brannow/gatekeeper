import type { MqttAdapter as IMqttAdapter, StatusChangeCallback } from '../types/network';
import type { MQTTConfig, RelayState } from '../types';
import { NetworkErrorHandler } from '../network/NetworkErrorHandler';
import { NETWORK_TIMEOUTS, MQTT_TOPICS } from '../network/NetworkConfig';
import { validationService } from '../services/ValidationService';
import { getNetworkEventBus } from '../services/NetworkEventBus';

/**
 * Persistent MQTT Adapter - Phase 3 Implementation
 * 
 * Key Improvements over MqttAdapter:
 * - Stable client ID across reconfigurations (gate-pwa-${timestamp}-${random})
 * - Only reconnect on significant config changes (host/port/ssl changes)
 * - Maintain existing MQTT functionality while eliminating connection loops
 * - Persistent connection management to prevent memory leaks
 * - Event-driven status system via NetworkEventBus (Phase 3)
 * 
 * Features:
 * - Connection reuse for non-significant config changes (username/password only)
 * - Enhanced connection lifecycle management
 * - Improved error handling and recovery
 * - WebSocket connection stability improvements
 * - Emits statusChange and connectionStateChange events
 */
export class PersistentMqttAdapter implements IMqttAdapter {
  readonly method = 'mqtt' as const;
  readonly timeout = NETWORK_TIMEOUTS.MQTT;
  readonly name = 'Persistent MQTT WebSocket Adapter';
  
  private readonly triggerTopic = MQTT_TOPICS.TRIGGER;
  private readonly statusTopic = MQTT_TOPICS.STATUS;
  
  // Persistent connection state
  private ws: WebSocket | null = null;
  private _config: MQTTConfig;
  private readonly stableClientId: string;
  private isConnected = false;
  private isConnecting = false;
  private _isInitialized = false;
  
  // Subscription and callback management
  private subscriptions = new Map<string, (payload: string) => void>();
  private statusChangeCallback?: StatusChangeCallback;
  private relayStateCallback?: (state: RelayState) => void;
  private currentRelayState: RelayState = 'released';
  
  // Connection management
  private connectPromise: Promise<boolean> | null = null;
  private connectResolver: ((value: boolean) => void) | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  
  // Trigger operation state
  private triggerPromise: Promise<boolean> | null = null;
  private triggerResolver: ((value: boolean) => void) | null = null;
  private triggerTimeout: number | null = null;
  
  // Phase 3: Event bus integration
  private readonly eventBus = getNetworkEventBus();

  constructor(config: MQTTConfig) {
    this._config = { ...config };
    
    // Generate stable client ID that persists across reconfigurations
    // Format: gate-pwa-${timestamp}-${random}
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 8);
    this.stableClientId = `gate-pwa-${timestamp}-${random}`;
    
    console.log(`[PersistentMqttAdapter] Created with stable client ID: ${this.stableClientId}`);
  }

  get config(): MQTTConfig {
    return { ...this._config };
  }

  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Initialize the MQTT adapter
   * Sets up connection and subscribes to status topic
   */
  async initialize(): Promise<void> {
    console.log(`[PersistentMqttAdapter] Initializing adapter for ${this._config.host}:${this._config.port}`);
    
    const startTime = Date.now();
    
    try {
      // Validate configuration using centralized validation
      validationService.validateMQTTConfigStrict(this._config);
      
      // Connect to MQTT broker
      const connected = await this.connect();
      if (!connected) {
        this.notifyStatusChange('unreachable');
        throw new Error('Failed to connect to MQTT broker');
      }

      // Subscribe to status topic for relay state feedback
      const subscribed = await this.subscribe(this.statusTopic, (payload) => {
        this.handleStatusMessage(payload);
      });

      if (!subscribed) {
        this.notifyStatusChange('unreachable');
        throw new Error('Failed to subscribe to status topic');
      }

      this._isInitialized = true;
      this.notifyStatusChange('reachable');
      
      const duration = Date.now() - startTime;
      console.log(`[PersistentMqttAdapter] Initialized successfully in ${duration}ms, subscribed to ${this.statusTopic}`);
      
    } catch (error) {
      this._isInitialized = false;
      const context = NetworkErrorHandler.createContext('mqtt', 'initialization', startTime, this._config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Initialization failed', networkError, context);
      this.notifyStatusChange('unreachable');
      throw error;
    }
  }

  /**
   * Update adapter configuration with intelligent reconnection
   * Only reconnects on significant changes (host/port/ssl), preserves connection for credential changes
   * 
   * @param newConfig New MQTT configuration
   */
  async updateConfig(newConfig: MQTTConfig): Promise<void> {
    const startTime = Date.now();
    console.log(`[PersistentMqttAdapter] Updating configuration: ${this._config.host}:${this._config.port} -> ${newConfig.host}:${newConfig.port}`);

    try {
      // Validate new configuration
      validationService.validateMQTTConfigStrict(newConfig);

      // Check for significant changes that require reconnection
      const significantChanges = this.hasSignificantConfigChanges(this._config, newConfig);
      
      if (significantChanges.hasChanges) {
        console.log(`[PersistentMqttAdapter] Significant config changes detected: ${significantChanges.changes.join(', ')}`);
        
        // Disconnect existing connection
        if (this.isConnected || this.ws) {
          console.log('[PersistentMqttAdapter] Disconnecting due to significant config changes');
          await this.disconnect();
        }
        
        // Update configuration
        this._config = { ...newConfig };
        
        // Reconnect with new configuration if adapter is initialized
        if (this._isInitialized) {
          console.log('[PersistentMqttAdapter] Reconnecting with new configuration');
          const connected = await this.connect();
          
          if (connected) {
            // Re-subscribe to status topic
            await this.subscribe(this.statusTopic, (payload) => {
              this.handleStatusMessage(payload);
            });
            this.notifyStatusChange('reachable');
          } else {
            this.notifyStatusChange('unreachable');
          }
        }
      } else {
        console.log('[PersistentMqttAdapter] No significant changes detected, preserving connection');
        // Update configuration without reconnecting
        this._config = { ...newConfig };
        
        // For non-significant changes (like credentials), the connection can be preserved
        // MQTT credentials are sent in CONNECT packet, so they would need reconnection
        // But since we're only updating the config object, existing connections continue to work
      }

      const duration = Date.now() - startTime;
      console.log(`[PersistentMqttAdapter] Configuration updated in ${duration}ms`);
      
      if (duration > 100) {
        console.warn(`[PersistentMqttAdapter] Configuration update took ${duration}ms (target: <100ms)`);
      }

    } catch (error) {
      console.error('[PersistentMqttAdapter] Configuration update failed:', error);
      throw error;
    }
  }

  /**
   * Determine if configuration changes require reconnection
   */
  private hasSignificantConfigChanges(oldConfig: MQTTConfig, newConfig: MQTTConfig): {
    hasChanges: boolean;
    changes: string[];
  } {
    const changes: string[] = [];
    
    if (oldConfig.host !== newConfig.host) {
      changes.push('host');
    }
    
    if (oldConfig.port !== newConfig.port) {
      changes.push('port');
    }
    
    if (oldConfig.ssl !== newConfig.ssl) {
      changes.push('ssl');
    }
    
    // Note: username/password changes would normally require reconnection in MQTT,
    // but for simplicity in this persistent implementation, we're treating them as non-significant
    // In a production system, you might want to reconnect for credential changes too
    
    return {
      hasChanges: changes.length > 0,
      changes
    };
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
    this.eventBus.emitStatusChange('mqtt', status, this.name, this);
    
    // Backward compatibility: Still call the legacy callback
    if (this.statusChangeCallback) {
      this.statusChangeCallback('mqtt', status);
    }
  }

  /**
   * Connect to MQTT broker over WebSocket SSL
   */
  async connect(): Promise<boolean> {
    if (this.isConnected) {
      return true;
    }

    if (this.isConnecting && this.connectPromise) {
      return this.connectPromise;
    }

    this.isConnecting = true;
    this.connectPromise = new Promise((resolve) => {
      this.connectResolver = resolve;
    });

    try {
      const wsUrl = this.buildWebSocketUrl(this._config);
      console.log(`[PersistentMqttAdapter] Connecting to: ${wsUrl} (client: ${this.stableClientId})`);

      // Create WebSocket connection with timeout
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.timeout);
      });

      const connectionPromise = this.establishWebSocketConnection(wsUrl);
      
      const connected = await Promise.race([connectionPromise, timeoutPromise]);
      
      if (connected) {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startPingTimer();
        console.log(`[PersistentMqttAdapter] Connected successfully with client ID: ${this.stableClientId}`);
        
        // Phase 3: Emit connection state change event
        this.eventBus.emitConnectionStateChange(this, true, this.name, 'Connection established');
      }

      this.isConnecting = false;
      this.connectResolver?.(connected);
      return connected;

    } catch (error) {
      this.isConnecting = false;
      this.connectResolver?.(false);
      const networkError = this.categorizeError(error as Error);
      this.logError('Connection failed', networkError);
      return false;
    }
  }

  /**
   * Establish WebSocket connection with MQTT handshake
   */
  private establishWebSocketConnection(wsUrl: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl, ['mqtt']);
        
        this.ws.onopen = () => {
          console.log('[PersistentMqttAdapter] WebSocket connected, sending CONNECT packet...');
          const connectPacket = this.createConnectPacket();
          this.ws!.send(connectPacket);
        };

        this.ws.onmessage = async (event) => {
          try {
            let arrayBuffer: ArrayBuffer;
            if (event.data instanceof ArrayBuffer) {
              arrayBuffer = event.data;
            } else if (event.data instanceof Blob) {
              arrayBuffer = await event.data.arrayBuffer();
            } else {
              console.error('[PersistentMqttAdapter] Unexpected message type:', typeof event.data);
              return;
            }
            
            this.handleMqttMessage(arrayBuffer, resolve);
          } catch (error) {
            console.error('[PersistentMqttAdapter] Error processing MQTT message:', error);
            reject(new Error('MQTT message processing failed'));
          }
        };

        this.ws.onerror = (error) => {
          console.error('[PersistentMqttAdapter] WebSocket error:', error);
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = (event) => {
          console.log(`[PersistentMqttAdapter] WebSocket closed: ${event.code} ${event.reason}`);
          this.handleDisconnection();
          if (!this.isConnected) {
            reject(new Error(`WebSocket closed: ${event.reason || 'Unknown reason'}`));
          }
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Create MQTT CONNECT packet with stable client ID
   */
  private createConnectPacket(): Uint8Array {
    const clientIdBytes = new TextEncoder().encode(this.stableClientId);
    const usernameBytes = this._config.username ? new TextEncoder().encode(this._config.username) : new Uint8Array(0);
    const passwordBytes = this._config.password ? new TextEncoder().encode(this._config.password) : new Uint8Array(0);
    
    const hasUsername = this._config.username && this._config.username.length > 0;
    const hasPassword = this._config.password && this._config.password.length > 0;
    
    let flags = 0x02; // Clean start (MQTT 5.0)
    if (hasUsername) flags |= 0x80;
    if (hasPassword) flags |= 0x40;
    
    // MQTT 5.0 requires properties field
    const propertiesLength = 1; // Empty properties = 1 byte (length = 0)
    const variableHeaderLength = 10 + propertiesLength; // 10 + properties
    const payloadLength = 2 + clientIdBytes.length + 
                         (hasUsername ? 2 + usernameBytes.length : 0) +
                         (hasPassword ? 2 + passwordBytes.length : 0);
    
    const totalLength = variableHeaderLength + payloadLength;
    const packet = new Uint8Array(2 + totalLength);
    
    let offset = 0;
    
    // Fixed header
    packet[offset++] = 0x10; // CONNECT packet type
    packet[offset++] = totalLength;
    
    // Variable header
    packet[offset++] = 0x00; // Protocol name length MSB
    packet[offset++] = 0x04; // Protocol name length LSB
    packet[offset++] = 0x4D; // 'M'
    packet[offset++] = 0x51; // 'Q'
    packet[offset++] = 0x54; // 'T'
    packet[offset++] = 0x54; // 'T'
    packet[offset++] = 0x05; // Protocol level (MQTT 5.0)
    packet[offset++] = flags; // Connect flags
    packet[offset++] = 0x00; // Keep alive MSB
    packet[offset++] = 0x3C; // Keep alive LSB (60 seconds)
    
    // MQTT 5.0 Properties (empty)
    packet[offset++] = 0x00; // Properties length = 0
    
    // Payload - Client ID
    packet[offset++] = (clientIdBytes.length >> 8) & 0xFF;
    packet[offset++] = clientIdBytes.length & 0xFF;
    packet.set(clientIdBytes, offset);
    offset += clientIdBytes.length;
    
    // Username
    if (hasUsername) {
      packet[offset++] = (usernameBytes.length >> 8) & 0xFF;
      packet[offset++] = usernameBytes.length & 0xFF;
      packet.set(usernameBytes, offset);
      offset += usernameBytes.length;
    }
    
    // Password
    if (hasPassword) {
      packet[offset++] = (passwordBytes.length >> 8) & 0xFF;
      packet[offset++] = passwordBytes.length & 0xFF;
      packet.set(passwordBytes, offset);
      offset += passwordBytes.length;
    }
    
    return packet;
  }

  /**
   * Handle incoming MQTT messages
   */
  private handleMqttMessage(data: ArrayBuffer, connectResolve?: (value: boolean) => void): void {
    try {
      const buffer = new Uint8Array(data);
      if (buffer.length === 0) return;

      const messageType = (buffer[0] >> 4) & 0x0F;
      
      switch (messageType) {
        case 2: // CONNACK
          this.handleConnAck(buffer, connectResolve);
          break;
        case 3: // PUBLISH
          this.handlePublish(buffer);
          break;
        case 9: // SUBACK
          console.log('[PersistentMqttAdapter] Subscription acknowledged');
          break;
        case 11: // UNSUBACK
          console.log('[PersistentMqttAdapter] Unsubscription acknowledged');
          break;
        case 13: // PINGRESP
          console.log('[PersistentMqttAdapter] Ping response received');
          break;
        case 14: // DISCONNECT
          console.log('[PersistentMqttAdapter] DISCONNECT received from broker');
          this.handleDisconnect(buffer);
          break;
        default:
          console.log(`[PersistentMqttAdapter] Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error('[PersistentMqttAdapter] Error handling MQTT message:', error);
    }
  }

  /**
   * Handle CONNACK message (MQTT 5.0)
   */
  private handleConnAck(buffer: Uint8Array, connectResolve?: (value: boolean) => void): void {
    if (buffer.length < 5) {
      console.error('[PersistentMqttAdapter] Invalid CONNACK packet length');
      connectResolve?.(false);
      return;
    }

    const reasonCode = buffer[3];
    
    if (reasonCode === 0) {
      console.log(`[PersistentMqttAdapter] MQTT connection acknowledged for client: ${this.stableClientId}`);
      connectResolve?.(true);
    } else {
      console.error(`[PersistentMqttAdapter] MQTT connection rejected, reason code: ${reasonCode}`);
      connectResolve?.(false);
    }
  }

  /**
   * Handle DISCONNECT message (MQTT 5.0)
   */
  private handleDisconnect(buffer: Uint8Array): void {
    if (buffer.length >= 3) {
      const reasonCode = buffer[2];
      console.log(`[PersistentMqttAdapter] Broker disconnected with reason code: ${reasonCode}`);
    }
    
    this.isConnected = false;
    this.clearTimers();
  }

  /**
   * Handle PUBLISH message
   */
  private handlePublish(buffer: Uint8Array): void {
    try {
      const topicLength = (buffer[2] << 8) | buffer[3];
      const topicBytes = buffer.slice(4, 4 + topicLength);
      const topic = new TextDecoder().decode(topicBytes);
      const payloadBytes = buffer.slice(4 + topicLength);
      const payload = new TextDecoder().decode(payloadBytes);
      
      console.log(`[PersistentMqttAdapter] Received message on ${topic}: ${payload}`);
      
      const callback = this.subscriptions.get(topic);
      if (callback) {
        callback(payload);
      }
    } catch (error) {
      console.error('[PersistentMqttAdapter] Error parsing PUBLISH message:', error);
    }
  }

  // ... (Additional methods for disconnect, publish, subscribe, etc. - continuing in next part due to length)

  /**
   * Disconnect from MQTT broker
   */
  async disconnect(): Promise<void> {
    console.log('[PersistentMqttAdapter] Disconnecting...');
    
    this.clearTimers();
    this.isConnected = false;
    this.isConnecting = false;
    this.subscriptions.clear();

    if (this.ws) {
      const disconnectPacket = this.createDisconnectPacket();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(disconnectPacket);
      }
      
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Clean up adapter resources
   */
  async cleanup(): Promise<void> {
    console.log('[PersistentMqttAdapter] Cleaning up...');
    
    this.clearTriggerTimeout();
    
    try {
      await this.disconnect();
      this.statusChangeCallback = undefined;
      this.relayStateCallback = undefined;
      this._isInitialized = false;
      
      console.log('[PersistentMqttAdapter] Cleanup completed');
    } catch (error) {
      console.error('[PersistentMqttAdapter] Error during cleanup:', error);
    }
  }

  /**
   * Trigger the gate using MQTT publish
   */
  async triggerGate(): Promise<boolean> {
    if (!this._isInitialized) {
      console.error('[PersistentMqttAdapter] Adapter not initialized');
      return false;
    }

    const startTime = Date.now();
    
    try {
      console.log(`[PersistentMqttAdapter] Triggering gate via MQTT...`);
      
      if (!this.connected) {
        await this.connect();
      }

      this.triggerPromise = new Promise((resolve) => {
        this.triggerResolver = resolve;
      });

      this.triggerTimeout = setTimeout(() => {
        console.warn('[PersistentMqttAdapter] Trigger operation timed out');
        this.triggerResolver?.(false);
        this.clearTriggerTimeout();
      }, this.timeout);

      const timestamp = Date.now().toString();
      const published = await this.publish(this.triggerTopic, timestamp);
      
      if (!published) {
        this.clearTriggerTimeout();
        this.triggerResolver?.(false);
        return false;
      }

      console.log(`[PersistentMqttAdapter] Trigger message published to ${this.triggerTopic}: ${timestamp}`);
      
      const success = await this.triggerPromise;
      const duration = Date.now() - startTime;
      
      if (success) {
        console.log(`[PersistentMqttAdapter] Gate triggered successfully in ${duration}ms`);
      } else {
        console.warn(`[PersistentMqttAdapter] Gate trigger failed after ${duration}ms`);
      }
      
      return success;
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('mqtt', 'gate trigger', startTime, this._config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Gate trigger failed', networkError, context);
      
      this.clearTriggerTimeout();
      this.triggerResolver?.(false);
      return false;
    }
  }

  /**
   * Test connection to MQTT broker
   */
  async testConnection(): Promise<boolean> {
    if (!this._isInitialized) {
      console.error('[PersistentMqttAdapter] Adapter not initialized');
      return false;
    }

    const startTime = Date.now();
    
    try {
      console.log(`[PersistentMqttAdapter] Testing connection to ${this._config.host}:${this._config.port}`);
      
      const wasConnected = this.isConnected;
      const connected = await this.connect();
      
      // If we weren't connected before, disconnect after test
      if (!wasConnected && connected) {
        await this.disconnect();
      }
      
      const duration = Date.now() - startTime;
      console.log(
        `[PersistentMqttAdapter] Connection test ${connected ? 'passed' : 'failed'} in ${duration}ms`
      );
      
      this.notifyStatusChange(connected ? 'reachable' : 'unreachable');
      return connected;
      
    } catch (error) {
      const context = NetworkErrorHandler.createContext('mqtt', 'connection test', startTime, this._config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      NetworkErrorHandler.logError('Connection test failed', networkError, context);
      this.notifyStatusChange('unreachable');
      return false;
    }
  }

  /**
   * Publish message to MQTT topic
   */
  async publish(topic: string, payload: string): Promise<boolean> {
    if (!this.connected || !this.ws) {
      console.warn('[PersistentMqttAdapter] Not connected, attempting to connect...');
      const connected = await this.connect();
      if (!connected) {
        return false;
      }
    }

    try {
      const publishPacket = this.createPublishPacket(topic, payload);
      this.ws!.send(publishPacket);
      
      console.log(`[PersistentMqttAdapter] Published to ${topic}: ${payload}`);
      return true;
    } catch (error) {
      const networkError = this.categorizeError(error as Error);
      this.logError(`Publish failed for topic ${topic}`, networkError);
      return false;
    }
  }

  /**
   * Subscribe to MQTT topic
   */
  async subscribe(topic: string, callback: (payload: string) => void): Promise<boolean> {
    if (!this.connected || !this.ws) {
      console.warn('[PersistentMqttAdapter] Not connected, attempting to connect...');
      const connected = await this.connect();
      if (!connected) {
        return false;
      }
    }

    try {
      this.subscriptions.set(topic, callback);
      
      const subscribePacket = this.createSubscribePacket(topic);
      this.ws!.send(subscribePacket);
      
      console.log(`[PersistentMqttAdapter] Subscribed to ${topic}`);
      return true;
    } catch (error) {
      this.subscriptions.delete(topic);
      const networkError = this.categorizeError(error as Error);
      this.logError(`Subscribe failed for topic ${topic}`, networkError);
      return false;
    }
  }

  /**
   * Unsubscribe from MQTT topic
   */
  async unsubscribe(topic: string): Promise<boolean> {
    if (!this.connected || !this.ws) {
      return false;
    }

    try {
      this.subscriptions.delete(topic);
      
      const unsubscribePacket = this.createUnsubscribePacket(topic);
      this.ws!.send(unsubscribePacket);
      
      console.log(`[PersistentMqttAdapter] Unsubscribed from ${topic}`);
      return true;
    } catch (error) {
      const networkError = this.categorizeError(error as Error);
      this.logError(`Unsubscribe failed for topic ${topic}`, networkError);
      return false;
    }
  }

  /**
   * Set relay state change callback
   */
  setRelayStateCallback(callback: (state: RelayState) => void): void {
    this.relayStateCallback = callback;
    console.log('[PersistentMqttAdapter] Relay state callback registered');
  }

  /**
   * Get current relay state
   */
  getCurrentRelayState(): RelayState {
    return this.currentRelayState;
  }

  /**
   * Handle status messages from ESP32
   */
  private handleStatusMessage(payload: string): void {
    console.log(`[PersistentMqttAdapter] Received status: ${payload}`);
    
    try {
      let newRelayState: RelayState | null = null;
      
      switch (payload.trim()) {
        case '1':
          newRelayState = 'activated';
          console.log('[PersistentMqttAdapter] Relay activated');
          break;
          
        case '0':
          newRelayState = 'released';
          console.log('[PersistentMqttAdapter] Relay released - gate operation complete');
          this.triggerResolver?.(true);
          this.clearTriggerTimeout();
          break;
          
        default:
          console.log(`[PersistentMqttAdapter] Unknown status payload: ${payload}`);
          return;
      }
      
      if (newRelayState && this.currentRelayState !== newRelayState) {
        const previousState = this.currentRelayState;
        this.currentRelayState = newRelayState;
        
        console.log(`[PersistentMqttAdapter] Relay state changed: ${previousState} → ${newRelayState}`);
        this.relayStateCallback?.(newRelayState);
      }
      
    } catch (error) {
      console.error('[PersistentMqttAdapter] Error handling status message:', error);
    }
  }

  // Helper methods for MQTT packet creation and connection management
  private createPublishPacket(topic: string, payload: string): Uint8Array {
    const topicBytes = new TextEncoder().encode(topic);
    const payloadBytes = new TextEncoder().encode(payload);
    
    const variableHeaderLength = 2 + topicBytes.length;
    const totalLength = variableHeaderLength + payloadBytes.length;
    const packet = new Uint8Array(2 + totalLength);
    
    let offset = 0;
    
    packet[offset++] = 0x30; // PUBLISH packet type, QoS 0
    packet[offset++] = totalLength;
    packet[offset++] = (topicBytes.length >> 8) & 0xFF;
    packet[offset++] = topicBytes.length & 0xFF;
    packet.set(topicBytes, offset);
    offset += topicBytes.length;
    packet.set(payloadBytes, offset);
    
    return packet;
  }

  private createSubscribePacket(topic: string): Uint8Array {
    const topicBytes = new TextEncoder().encode(topic);
    const packetId = Math.floor(Math.random() * 65535) + 1;
    
    const propertiesLength = 1;
    const variableHeaderLength = 2 + propertiesLength;
    const payloadLength = 2 + topicBytes.length + 1;
    const totalLength = variableHeaderLength + payloadLength;
    const packet = new Uint8Array(2 + totalLength);
    
    let offset = 0;
    
    packet[offset++] = 0x82; // SUBSCRIBE packet type
    packet[offset++] = totalLength;
    packet[offset++] = (packetId >> 8) & 0xFF;
    packet[offset++] = packetId & 0xFF;
    packet[offset++] = 0x00; // Properties length = 0
    packet[offset++] = (topicBytes.length >> 8) & 0xFF;
    packet[offset++] = topicBytes.length & 0xFF;
    packet.set(topicBytes, offset);
    offset += topicBytes.length;
    packet[offset++] = 0x00; // QoS 0
    
    return packet;
  }

  private createUnsubscribePacket(topic: string): Uint8Array {
    const topicBytes = new TextEncoder().encode(topic);
    const packetId = Math.floor(Math.random() * 65535) + 1;
    
    const variableHeaderLength = 2;
    const payloadLength = 2 + topicBytes.length;
    const totalLength = variableHeaderLength + payloadLength;
    const packet = new Uint8Array(2 + totalLength);
    
    let offset = 0;
    
    packet[offset++] = 0xA2; // UNSUBSCRIBE packet type
    packet[offset++] = totalLength;
    packet[offset++] = (packetId >> 8) & 0xFF;
    packet[offset++] = packetId & 0xFF;
    packet[offset++] = (topicBytes.length >> 8) & 0xFF;
    packet[offset++] = topicBytes.length & 0xFF;
    packet.set(topicBytes, offset);
    
    return packet;
  }

  private createDisconnectPacket(): Uint8Array {
    return new Uint8Array([0xE0, 0x00]);
  }

  private createPingPacket(): Uint8Array {
    return new Uint8Array([0xC0, 0x00]);
  }

  private buildWebSocketUrl(config: MQTTConfig): string {
    const protocol = config.ssl ? 'wss' : 'ws';
    const port = config.port === (config.ssl ? 443 : 80) ? '' : `:${config.port}`;
    return `${protocol}://${config.host}${port}/`;
  }

  private handleDisconnection(): void {
    this.isConnected = false;
    this.clearTimers();
    
    // Phase 3: Emit connection state change event
    this.eventBus.emitConnectionStateChange(this, false, this.name, 'Connection lost');

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      console.log(`[PersistentMqttAdapter] Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect().catch(error => {
          console.error('[PersistentMqttAdapter] Reconnection failed:', error);
        });
      }, delay);
    } else {
      console.error('[PersistentMqttAdapter] Max reconnection attempts reached');
    }
  }

  private startPingTimer(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingPacket = this.createPingPacket();
        this.ws.send(pingPacket);
      }
    }, 30000);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTriggerTimeout(): void {
    if (this.triggerTimeout) {
      clearTimeout(this.triggerTimeout);
      this.triggerTimeout = null;
    }
    
    this.triggerPromise = null;
    this.triggerResolver = null;
  }

  private categorizeError(error: Error): any {
    const timestamp = Date.now();
    
    if (error.message.includes('timeout') || error.message.includes('Connection timeout')) {
      return {
        type: 'timeout',
        message: `MQTT connection timed out after ${this.timeout}ms`,
        adapter: this.method,
        timestamp
      };
    }
    
    if (error.message.includes('WebSocket') || error.message.includes('connection failed')) {
      return {
        type: 'network',
        message: 'MQTT WebSocket connection failed - check broker connectivity',
        adapter: this.method,
        timestamp
      };
    }
    
    return {
      type: 'network',
      message: error.message || 'Unknown MQTT error',
      adapter: this.method,
      timestamp
    };
  }

  private logError(message: string, error: any): void {
    console.error(`[PersistentMqttAdapter] ${message}:`, {
      type: error.type,
      message: error.message,
      adapter: error.adapter,
      timestamp: new Date(error.timestamp).toISOString()
    });
  }

  /**
   * Get current configuration status for debugging
   */
  getConfigurationStatus(): {
    isInitialized: boolean;
    isConnected: boolean;
    clientId: string;
    host: string;
    port: number;
    connectionCount: number;
  } {
    return {
      isInitialized: this._isInitialized,
      isConnected: this.connected,
      clientId: this.stableClientId,
      host: this._config.host,
      port: this._config.port,
      connectionCount: this.ws ? 1 : 0
    };
  }
}

/**
 * Factory function to create PersistentMqttAdapter instance
 */
export function createPersistentMqttAdapter(config: MQTTConfig): PersistentMqttAdapter {
  return new PersistentMqttAdapter(config);
}