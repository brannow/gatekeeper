import type { MQTTConfig, NetworkError } from '../types';
import { validationService } from './ValidationService';

/**
 * MQTT over WebSocket (WSS) service
 * Handles connection, publish/subscribe operations with proper connection management
 */
export class MqttService {
  private readonly timeout = 10000; // 10 second timeout for MQTT operations
  private readonly adapter = 'mqtt' as const;
  private ws: WebSocket | null = null;
  private clientId: string;
  private config: MQTTConfig;
  private isConnected = false;
  private isConnecting = false;
  private subscriptions = new Map<string, (payload: string) => void>();
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private connectPromise: Promise<boolean> | null = null;
  private connectResolver: ((value: boolean) => void) | null = null;

  constructor(config: MQTTConfig) {
    this.config = config;
    this.clientId = `gate-pwa-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * Connect to MQTT broker over WebSocket SSL
   * @returns Promise<boolean> - true if connected successfully
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
      this.validateConfig(this.config);
      
      const wsUrl = this.buildWebSocketUrl(this.config);
      console.log(`[MqttService] Connecting to: ${wsUrl}`);

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
        console.log(`[MqttService] Connected successfully`);
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
   * Disconnect from MQTT broker
   */
  async disconnect(): Promise<void> {
    console.log('[MqttService] Disconnecting...');
    
    this.clearTimers();
    this.isConnected = false;
    this.isConnecting = false;
    this.subscriptions.clear();

    if (this.ws) {
      // Send MQTT DISCONNECT packet
      const disconnectPacket = this.createDisconnectPacket();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(disconnectPacket);
      }
      
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Publish message to MQTT topic
   * @param topic MQTT topic to publish to
   * @param payload Message payload
   * @returns Promise<boolean> - true if published successfully
   */
  async publish(topic: string, payload: string): Promise<boolean> {
    if (!this.isConnected || !this.ws) {
      console.warn('[MqttService] Not connected, attempting to connect...');
      const connected = await this.connect();
      if (!connected) {
        return false;
      }
    }

    try {
      const publishPacket = this.createPublishPacket(topic, payload);
      this.ws!.send(publishPacket);
      
      console.log(`[MqttService] Published to ${topic}: ${payload}`);
      return true;
    } catch (error) {
      const networkError = this.categorizeError(error as Error);
      this.logError(`Publish failed for topic ${topic}`, networkError);
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
    if (!this.isConnected || !this.ws) {
      console.warn('[MqttService] Not connected, attempting to connect...');
      const connected = await this.connect();
      if (!connected) {
        return false;
      }
    }

    try {
      this.subscriptions.set(topic, callback);
      
      const subscribePacket = this.createSubscribePacket(topic);
      this.ws!.send(subscribePacket);
      
      console.log(`[MqttService] Subscribed to ${topic}`);
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
   * @param topic MQTT topic to unsubscribe from
   * @returns Promise<boolean> - true if unsubscribed successfully
   */
  async unsubscribe(topic: string): Promise<boolean> {
    if (!this.isConnected || !this.ws) {
      return false;
    }

    try {
      this.subscriptions.delete(topic);
      
      const unsubscribePacket = this.createUnsubscribePacket(topic);
      this.ws!.send(unsubscribePacket);
      
      console.log(`[MqttService] Unsubscribed from ${topic}`);
      return true;
    } catch (error) {
      const networkError = this.categorizeError(error as Error);
      this.logError(`Unsubscribe failed for topic ${topic}`, networkError);
      return false;
    }
  }

  /**
   * Test connection to MQTT broker
   * @returns Promise<boolean> - true if connection test passes
   */
  async testConnection(): Promise<boolean> {
    const wasConnected = this.isConnected;
    
    try {
      const connected = await this.connect();
      
      // If we weren't connected before, disconnect after test
      if (!wasConnected && connected) {
        await this.disconnect();
      }
      
      return connected;
    } catch (error) {
      const networkError = this.categorizeError(error as Error);
      this.logError('Connection test failed', networkError);
      return false;
    }
  }

  /**
   * Get current connection status
   */
  get connected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Establish WebSocket connection with MQTT handshake
   */
  private establishWebSocketConnection(wsUrl: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl, ['mqtt']);
        
        this.ws.onopen = () => {
          console.log('[MqttService] WebSocket connected, sending CONNECT packet...');
          const connectPacket = this.createConnectPacket();
          console.log('[MqttService] CONNECT packet bytes:', Array.from(connectPacket).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '));
          this.ws!.send(connectPacket);
        };

        this.ws.onmessage = async (event) => {
          try {
            console.log('[MqttService] Raw message received:', event.data);
            
            let arrayBuffer: ArrayBuffer;
            if (event.data instanceof ArrayBuffer) {
              arrayBuffer = event.data;
            } else if (event.data instanceof Blob) {
              arrayBuffer = await event.data.arrayBuffer();
            } else {
              console.error('[MqttService] Unexpected message type:', typeof event.data);
              return;
            }
            
            const buffer = new Uint8Array(arrayBuffer);
            console.log('[MqttService] Message bytes:', Array.from(buffer).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '));
            
            this.handleMqttMessage(arrayBuffer, resolve);
          } catch (error) {
            console.error('[MqttService] Error processing MQTT message:', error);
            reject(new Error('MQTT message processing failed'));
          }
        };

        this.ws.onerror = (error) => {
          console.error('[MqttService] WebSocket error:', error);
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = (event) => {
          console.log(`[MqttService] WebSocket closed: ${event.code} ${event.reason}`);
          console.log(`[MqttService] Connection state when closed - isConnected: ${this.isConnected}, isConnecting: ${this.isConnecting}`);
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
   * Handle incoming MQTT messages
   */
  private handleMqttMessage(data: ArrayBuffer | string, connectResolve?: (value: boolean) => void): void {
    try {
      const buffer = typeof data === 'string' ? 
        new Uint8Array(new TextEncoder().encode(data)) : 
        new Uint8Array(data);

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
          console.log('[MqttService] Subscription acknowledged');
          break;
        case 11: // UNSUBACK
          console.log('[MqttService] Unsubscription acknowledged');
          break;
        case 13: // PINGRESP
          console.log('[MqttService] Ping response received');
          break;
        case 14: // DISCONNECT
          console.log('[MqttService] DISCONNECT received from broker');
          this.handleDisconnect(buffer);
          break;
        default:
          console.log(`[MqttService] Unknown message type: ${messageType}`);
      }
    } catch (error) {
      console.error('[MqttService] Error handling MQTT message:', error);
    }
  }

  /**
   * Handle CONNACK message (MQTT 5.0)
   */
  private handleConnAck(buffer: Uint8Array, connectResolve?: (value: boolean) => void): void {
    // MQTT 5.0 CONNACK: [fixed header][connect ack flags][reason code][properties]
    if (buffer.length < 5) { // Minimum: type + length + ack flags + reason code + properties length
      console.error('[MqttService] Invalid CONNACK packet length');
      connectResolve?.(false);
      return;
    }

    const connectAckFlags = buffer[2]; // Session present flag
    const reasonCode = buffer[3]; // MQTT 5.0 reason code
    const propertiesLength = buffer[4]; // Properties length
    
    console.log(`[MqttService] CONNACK received - flags: ${connectAckFlags}, reason: ${reasonCode}, props: ${propertiesLength}`);
    
    if (reasonCode === 0) {
      console.log('[MqttService] MQTT connection acknowledged');
      connectResolve?.(true);
    } else {
      console.error(`[MqttService] MQTT connection rejected, reason code: ${reasonCode}`);
      connectResolve?.(false);
    }
  }

  /**
   * Handle DISCONNECT message (MQTT 5.0)
   */
  private handleDisconnect(buffer: Uint8Array): void {
    if (buffer.length >= 3) {
      const reasonCode = buffer[2];
      console.log(`[MqttService] Broker disconnected with reason code: ${reasonCode}`);
      
      // Reason codes: 0x00 = Normal disconnect, 0x81 = Malformed packet, etc.
      if (reasonCode === 0x81) {
        console.error('[MqttService] Broker rejected packet as malformed');
      }
    }
    
    // Broker initiated disconnect - don't reconnect immediately
    this.isConnected = false;
    this.clearTimers();
  }

  /**
   * Handle PUBLISH message
   */
  private handlePublish(buffer: Uint8Array): void {
    try {
      // Parse topic length (bytes 2-3)
      const topicLength = (buffer[2] << 8) | buffer[3];
      
      // Extract topic (bytes 4 to 4+topicLength)
      const topicBytes = buffer.slice(4, 4 + topicLength);
      const topic = new TextDecoder().decode(topicBytes);
      
      // Extract payload (remaining bytes)
      const payloadBytes = buffer.slice(4 + topicLength);
      const payload = new TextDecoder().decode(payloadBytes);
      
      console.log(`[MqttService] Received message on ${topic}: ${payload}`);
      
      // Call subscription callback
      const callback = this.subscriptions.get(topic);
      if (callback) {
        callback(payload);
      }
    } catch (error) {
      console.error('[MqttService] Error parsing PUBLISH message:', error);
    }
  }

  /**
   * Handle connection loss and attempt reconnection
   */
  private handleDisconnection(): void {
    this.isConnected = false;
    this.clearTimers();

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
      console.log(`[MqttService] Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
      
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect().catch(error => {
          console.error('[MqttService] Reconnection failed:', error);
        });
      }, delay);
    } else {
      console.error('[MqttService] Max reconnection attempts reached');
    }
  }

  /**
   * Create MQTT CONNECT packet
   */
  private createConnectPacket(): Uint8Array {
    const clientIdBytes = new TextEncoder().encode(this.clientId);
    const usernameBytes = this.config.username ? new TextEncoder().encode(this.config.username) : new Uint8Array(0);
    const passwordBytes = this.config.password ? new TextEncoder().encode(this.config.password) : new Uint8Array(0);
    
    const hasUsername = this.config.username && this.config.username.length > 0;
    const hasPassword = this.config.password && this.config.password.length > 0;
    
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
   * Create MQTT PUBLISH packet
   */
  private createPublishPacket(topic: string, payload: string): Uint8Array {
    const topicBytes = new TextEncoder().encode(topic);
    const payloadBytes = new TextEncoder().encode(payload);
    
    const variableHeaderLength = 2 + topicBytes.length;
    const totalLength = variableHeaderLength + payloadBytes.length;
    const packet = new Uint8Array(2 + totalLength);
    
    let offset = 0;
    
    // Fixed header
    packet[offset++] = 0x30; // PUBLISH packet type, QoS 0
    packet[offset++] = totalLength;
    
    // Variable header - Topic
    packet[offset++] = (topicBytes.length >> 8) & 0xFF;
    packet[offset++] = topicBytes.length & 0xFF;
    packet.set(topicBytes, offset);
    offset += topicBytes.length;
    
    // Payload
    packet.set(payloadBytes, offset);
    
    return packet;
  }

  /**
   * Create MQTT SUBSCRIBE packet (MQTT 5.0)
   */
  private createSubscribePacket(topic: string): Uint8Array {
    const topicBytes = new TextEncoder().encode(topic);
    const packetId = Math.floor(Math.random() * 65535) + 1;
    
    // MQTT 5.0 requires properties field
    const propertiesLength = 1; // Empty properties = 1 byte (length = 0)
    const variableHeaderLength = 2 + propertiesLength; // Packet identifier + properties
    const payloadLength = 2 + topicBytes.length + 1; // Topic + QoS
    const totalLength = variableHeaderLength + payloadLength;
    const packet = new Uint8Array(2 + totalLength);
    
    let offset = 0;
    
    // Fixed header
    packet[offset++] = 0x82; // SUBSCRIBE packet type
    packet[offset++] = totalLength;
    
    // Variable header - Packet identifier
    packet[offset++] = (packetId >> 8) & 0xFF;
    packet[offset++] = packetId & 0xFF;
    
    // MQTT 5.0 Properties (empty)
    packet[offset++] = 0x00; // Properties length = 0
    
    // Payload - Topic filter
    packet[offset++] = (topicBytes.length >> 8) & 0xFF;
    packet[offset++] = topicBytes.length & 0xFF;
    packet.set(topicBytes, offset);
    offset += topicBytes.length;
    packet[offset++] = 0x00; // QoS 0
    
    console.log(`[MqttService] SUBSCRIBE packet bytes:`, Array.from(packet).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' '));
    
    return packet;
  }

  /**
   * Create MQTT UNSUBSCRIBE packet
   */
  private createUnsubscribePacket(topic: string): Uint8Array {
    const topicBytes = new TextEncoder().encode(topic);
    const packetId = Math.floor(Math.random() * 65535) + 1;
    
    const variableHeaderLength = 2; // Packet identifier
    const payloadLength = 2 + topicBytes.length;
    const totalLength = variableHeaderLength + payloadLength;
    const packet = new Uint8Array(2 + totalLength);
    
    let offset = 0;
    
    // Fixed header
    packet[offset++] = 0xA2; // UNSUBSCRIBE packet type
    packet[offset++] = totalLength;
    
    // Variable header - Packet identifier
    packet[offset++] = (packetId >> 8) & 0xFF;
    packet[offset++] = packetId & 0xFF;
    
    // Payload - Topic filter
    packet[offset++] = (topicBytes.length >> 8) & 0xFF;
    packet[offset++] = topicBytes.length & 0xFF;
    packet.set(topicBytes, offset);
    
    return packet;
  }

  /**
   * Create MQTT DISCONNECT packet
   */
  private createDisconnectPacket(): Uint8Array {
    return new Uint8Array([0xE0, 0x00]); // DISCONNECT packet
  }

  /**
   * Create MQTT PINGREQ packet
   */
  private createPingPacket(): Uint8Array {
    return new Uint8Array([0xC0, 0x00]); // PINGREQ packet
  }

  /**
   * Start ping timer for keep-alive
   */
  private startPingTimer(): void {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingPacket = this.createPingPacket();
        this.ws.send(pingPacket);
      }
    }, 30000); // Ping every 30 seconds
  }

  /**
   * Clear all timers
   */
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

  /**
   * Build WebSocket URL from MQTT configuration
   */
  private buildWebSocketUrl(config: MQTTConfig): string {
    const protocol = config.ssl ? 'wss' : 'ws';
    const port = config.port === (config.ssl ? 443 : 80) ? '' : `:${config.port}`;
    return `${protocol}://${config.host}${port}/`;
  }

  /**
   * Validate MQTT configuration using centralized ValidationService
   */
  private validateConfig(config: MQTTConfig): void {
    // Use ValidationService strict mode for immediate error feedback
    validationService.validateMQTTConfigStrict(config);
  }

  /**
   * Categorize error based on error type and context
   */
  private categorizeError(error: Error): NetworkError {
    const timestamp = Date.now();
    
    // Timeout errors
    if (error.message.includes('timeout') || error.message.includes('Connection timeout')) {
      return {
        type: 'timeout',
        message: `MQTT connection timed out after ${this.timeout}ms`,
        adapter: this.adapter,
        timestamp
      };
    }
    
    // Network connectivity errors
    if (error.message.includes('WebSocket') || error.message.includes('connection failed')) {
      return {
        type: 'network',
        message: 'MQTT WebSocket connection failed - check broker connectivity',
        adapter: this.adapter,
        timestamp
      };
    }
    
    // Configuration validation errors
    if (error.message.includes('MQTT')) {
      return {
        type: 'config',
        message: error.message,
        adapter: this.adapter,
        timestamp
      };
    }
    
    // Generic network error
    return {
      type: 'network',
      message: error.message || 'Unknown MQTT error',
      adapter: this.adapter,
      timestamp
    };
  }

  /**
   * Log error with context
   */
  private logError(message: string, error: NetworkError): void {
    console.error(`[MqttService] ${message}:`, {
      type: error.type,
      message: error.message,
      adapter: error.adapter,
      timestamp: new Date(error.timestamp).toISOString()
    });
  }
}
