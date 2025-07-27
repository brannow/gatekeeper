/**
 * NetworkEventBus - Phase 3 Implementation
 * 
 * Type-safe event system for network status and gate operations
 * Replaces callback chains with clean event-driven architecture
 * 
 * Key Features:
 * - Type-safe event system with NetworkEvent interface
 * - Support for multiple event types: statusChange, connectionStateChange, gateTrigger
 * - Efficient subscription/unsubscription with automatic cleanup
 * - Comprehensive logging for debugging and monitoring
 * - Error handling for event listeners with graceful degradation
 */

import type { NetworkAdapter, NetworkError } from '../types/network';

/**
 * Network event types supported by the event bus
 */
export type NetworkEventType = 'statusChange' | 'connectionStateChange' | 'gateTrigger';

/**
 * Base interface for all network events
 * Provides common event structure and type safety
 */
export interface NetworkEvent {
  type: NetworkEventType;
  timestamp: number;
  source: string; // Service or adapter that emitted the event
}

/**
 * Status change event - emitted when adapter reachability changes
 */
export interface StatusChangeEvent extends NetworkEvent {
  type: 'statusChange';
  adapterType: 'esp32' | 'mqtt';
  status: 'reachable' | 'unreachable' | 'unknown';
  adapter?: NetworkAdapter;
}

/**
 * Connection state change event - emitted when adapter connection state changes
 */
export interface ConnectionStateChangeEvent extends NetworkEvent {
  type: 'connectionStateChange';
  adapter: NetworkAdapter;
  connected: boolean;
  reason?: string;
}

/**
 * Gate trigger event - emitted during gate operations
 */
export interface GateTriggerEvent extends NetworkEvent {
  type: 'gateTrigger';
  operation: 'started' | 'success' | 'failure' | 'timeout';
  adapter?: NetworkAdapter;
  duration?: number;
  error?: NetworkError;
}

/**
 * Union type for all supported network events
 */
export type NetworkEventPayload = StatusChangeEvent | ConnectionStateChangeEvent | GateTriggerEvent;

/**
 * Event listener function type
 */
export type NetworkEventListener<T extends NetworkEventPayload = NetworkEventPayload> = (event: T) => void;

/**
 * Event subscription interface
 */
export interface EventSubscription {
  id: string;
  type: NetworkEventType;
  listener: NetworkEventListener;
  unsubscribe: () => void;
}

/**
 * Event bus statistics for debugging
 */
export interface EventBusStats {
  totalEventsEmitted: number;
  totalListeners: number;
  eventCounts: Record<NetworkEventType, number>;
  errorCount: number;
  lastError?: Error;
}

/**
 * NetworkEventBus - Central event management for network operations
 * 
 * Provides type-safe event system with subscription management,
 * error handling, and comprehensive logging for network events.
 */
export class NetworkEventBus {
  private listeners = new Map<NetworkEventType, Map<string, NetworkEventListener>>();
  private stats: EventBusStats = {
    totalEventsEmitted: 0,
    totalListeners: 0,
    eventCounts: {
      statusChange: 0,
      connectionStateChange: 0,
      gateTrigger: 0
    },
    errorCount: 0
  };
  
  // Generate unique subscription IDs
  private subscriptionCounter = 0;

  constructor() {
    console.log('[NetworkEventBus] Event bus initialized');
    
    // Initialize listener maps for each event type
    const eventTypes: NetworkEventType[] = ['statusChange', 'connectionStateChange', 'gateTrigger'];
    eventTypes.forEach(type => {
      this.listeners.set(type, new Map());
    });
  }

  /**
   * Subscribe to network events with type safety
   * 
   * @param type Event type to subscribe to
   * @param listener Event listener function
   * @returns EventSubscription with unsubscribe method
   */
  subscribe<T extends NetworkEventPayload>(
    type: T['type'],
    listener: NetworkEventListener<T>
  ): EventSubscription {
    const id = `${type}_${++this.subscriptionCounter}_${Date.now()}`;
    
    // Get or create listener map for this event type
    let typeListeners = this.listeners.get(type);
    if (!typeListeners) {
      typeListeners = new Map();
      this.listeners.set(type, typeListeners);
    }
    
    // Add listener with type-safe casting
    typeListeners.set(id, listener as NetworkEventListener);
    this.updateStats();
    
    console.log(`[NetworkEventBus] Subscribed to ${type} events (ID: ${id})`);
    
    return {
      id,
      type,
      listener: listener as NetworkEventListener,
      unsubscribe: () => this.unsubscribe(id, type)
    };
  }

  /**
   * Unsubscribe from events using subscription ID
   * 
   * @param subscriptionId Subscription ID returned from subscribe()
   * @param eventType Event type (for efficiency)
   */
  unsubscribe(subscriptionId: string, eventType: NetworkEventType): void {
    const typeListeners = this.listeners.get(eventType);
    if (typeListeners && typeListeners.has(subscriptionId)) {
      typeListeners.delete(subscriptionId);
      this.updateStats();
      console.log(`[NetworkEventBus] Unsubscribed from ${eventType} events (ID: ${subscriptionId})`);
    } else {
      console.warn(`[NetworkEventBus] Subscription not found: ${subscriptionId} for type ${eventType}`);
    }
  }

  /**
   * Emit network event to all subscribers
   * 
   * @param event Network event to emit
   */
  emit<T extends NetworkEventPayload>(event: T): void {
    const typeListeners = this.listeners.get(event.type);
    if (!typeListeners || typeListeners.size === 0) {
      console.debug(`[NetworkEventBus] No listeners for ${event.type} event`);
      return;
    }

    // Update statistics
    this.stats.totalEventsEmitted++;
    this.stats.eventCounts[event.type]++;
    
    console.log(`[NetworkEventBus] Emitting ${event.type} event to ${typeListeners.size} listeners:`, {
      type: event.type,
      source: event.source,
      timestamp: new Date(event.timestamp).toISOString()
    });

    // Emit to all listeners with error handling
    let successCount = 0;
    typeListeners.forEach((listener, id) => {
      try {
        listener(event);
        successCount++;
      } catch (error) {
        this.stats.errorCount++;
        this.stats.lastError = error as Error;
        console.error(`[NetworkEventBus] Error in event listener ${id} for ${event.type}:`, error);
        
        // Continue emitting to other listeners despite errors
      }
    });

    console.debug(`[NetworkEventBus] Event ${event.type} delivered to ${successCount}/${typeListeners.size} listeners`);
  }

  /**
   * Create and emit status change event
   * 
   * @param adapterType Type of adapter (esp32 or mqtt)
   * @param status New reachability status
   * @param source Source service/adapter name
   * @param adapter Optional adapter instance
   */
  emitStatusChange(
    adapterType: 'esp32' | 'mqtt',
    status: 'reachable' | 'unreachable' | 'unknown',
    source: string,
    adapter?: NetworkAdapter
  ): void {
    const event: StatusChangeEvent = {
      type: 'statusChange',
      timestamp: Date.now(),
      source,
      adapterType,
      status,
      adapter
    };
    
    this.emit(event);
  }

  /**
   * Create and emit connection state change event
   * 
   * @param adapter Network adapter instance
   * @param connected Whether adapter is connected
   * @param source Source service/adapter name
   * @param reason Optional reason for state change
   */
  emitConnectionStateChange(
    adapter: NetworkAdapter,
    connected: boolean,
    source: string,
    reason?: string
  ): void {
    const event: ConnectionStateChangeEvent = {
      type: 'connectionStateChange',
      timestamp: Date.now(),
      source,
      adapter,
      connected,
      reason
    };
    
    this.emit(event);
  }

  /**
   * Create and emit gate trigger event
   * 
   * @param operation Gate operation type
   * @param source Source service/adapter name
   * @param adapter Optional adapter instance
   * @param duration Optional operation duration
   * @param error Optional error details
   */
  emitGateTrigger(
    operation: 'started' | 'success' | 'failure' | 'timeout',
    source: string,
    adapter?: NetworkAdapter,
    duration?: number,
    error?: NetworkError
  ): void {
    const event: GateTriggerEvent = {
      type: 'gateTrigger',
      timestamp: Date.now(),
      source,
      operation,
      adapter,
      duration,
      error
    };
    
    this.emit(event);
  }

  /**
   * Get all listeners for a specific event type
   * 
   * @param type Event type
   * @returns Number of listeners for the event type
   */
  getListenerCount(type: NetworkEventType): number {
    const typeListeners = this.listeners.get(type);
    return typeListeners ? typeListeners.size : 0;
  }

  /**
   * Check if there are any listeners for an event type
   * 
   * @param type Event type
   * @returns True if there are listeners
   */
  hasListeners(type: NetworkEventType): boolean {
    return this.getListenerCount(type) > 0;
  }

  /**
   * Get event bus statistics for debugging
   * 
   * @returns Current event bus statistics
   */
  getStats(): EventBusStats {
    return { ...this.stats };
  }

  /**
   * Reset event bus statistics
   */
  resetStats(): void {
    this.stats = {
      totalEventsEmitted: 0,
      totalListeners: this.stats.totalListeners,
      eventCounts: {
        statusChange: 0,
        connectionStateChange: 0,
        gateTrigger: 0
      },
      errorCount: 0
    };
    
    console.log('[NetworkEventBus] Statistics reset');
  }

  /**
   * Clear all event listeners and cleanup
   */
  cleanup(): void {
    const totalListeners = this.stats.totalListeners;
    
    this.listeners.forEach((typeListeners) => {
      typeListeners.clear();
    });
    
    this.updateStats();
    
    console.log(`[NetworkEventBus] Cleanup completed, removed ${totalListeners} listeners`);
  }

  /**
   * Update internal statistics
   */
  private updateStats(): void {
    let totalListeners = 0;
    this.listeners.forEach((typeListeners) => {
      totalListeners += typeListeners.size;
    });
    
    this.stats.totalListeners = totalListeners;
  }

  /**
   * Log current event bus state for debugging
   */
  debugLog(): void {
    console.group('[NetworkEventBus] Debug Information');
    console.log('Statistics:', this.getStats());
    
    console.log('Listeners by type:');
    this.listeners.forEach((typeListeners, type) => {
      console.log(`  ${type}: ${typeListeners.size} listeners`);
      typeListeners.forEach((_, id) => {
        console.log(`    - ${id}`);
      });
    });
    
    console.groupEnd();
  }
}

/**
 * Global event bus instance
 * Singleton pattern for centralized event management
 */
let globalEventBus: NetworkEventBus | null = null;

/**
 * Get or create the global network event bus instance
 * 
 * @returns Global NetworkEventBus instance
 */
export function getNetworkEventBus(): NetworkEventBus {
  if (!globalEventBus) {
    globalEventBus = new NetworkEventBus();
    console.log('[NetworkEventBus] Global event bus created');
  }
  
  return globalEventBus;
}

/**
 * Reset the global event bus instance
 * Useful for testing or complete reinitialization
 */
export function resetNetworkEventBus(): void {
  if (globalEventBus) {
    globalEventBus.cleanup();
  }
  globalEventBus = null;
  console.log('[NetworkEventBus] Global event bus reset');
}