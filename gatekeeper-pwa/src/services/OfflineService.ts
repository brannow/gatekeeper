/**
 * Offline Service for Gatekeeper PWA
 * Phase 4: Manages offline functionality and queue operations
 * 
 * Features:
 * - Queue management for failed operations
 * - Integration with service worker
 * - Network state monitoring
 * - Background sync coordination
 */

import type { ESP32Config, MQTTConfig } from '../types';

/**
 * Offline queue item interface
 */
export interface OfflineQueueItem {
  id: string;
  type: 'gate_trigger' | 'config_update';
  data: any;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

/**
 * Offline service delegate interface
 */
export interface OfflineServiceDelegate {
  onOfflineStatusChanged(isOffline: boolean): void;
  onQueueSizeChanged(size: number): void;
  onQueueItemProcessed(item: OfflineQueueItem, success: boolean): void;
}

/**
 * Offline service implementation
 * Coordinates with service worker for offline functionality
 */
export class OfflineService {
  private isOffline = false;
  private queueSize = 0;
  private serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  public delegate?: OfflineServiceDelegate;

  constructor() {
    this.initializeNetworkMonitoring();
    this.initializeServiceWorkerCommunication();
  }

  /**
   * Get current offline status
   */
  get offline(): boolean {
    return this.isOffline;
  }

  /**
   * Get current queue size
   */
  get currentQueueSize(): number {
    return this.queueSize;
  }

  /**
   * Initialize the offline service
   */
  async initialize(serviceWorkerRegistration?: ServiceWorkerRegistration): Promise<void> {
    try {
      this.serviceWorkerRegistration = serviceWorkerRegistration || null;
      
      // Check initial offline status
      await this.updateOfflineStatus();
      
      // Request queue status from service worker
      await this.requestQueueStatus();
      
      console.log('[OfflineService] Initialized successfully');
    } catch (error) {
      console.error('[OfflineService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Queue a gate trigger operation for offline execution
   */
  async queueGateTrigger(config: ESP32Config | MQTTConfig, additionalData?: any): Promise<string> {
    try {
      const queueItem: Partial<OfflineQueueItem> = {
        id: this.generateQueueId(),
        type: 'gate_trigger',
        data: {
          config,
          additionalData,
          timestamp: Date.now()
        },
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3
      };

      // Send to service worker
      if (this.serviceWorkerRegistration?.active) {
        this.serviceWorkerRegistration.active.postMessage({
          type: 'QUEUE_GATE_TRIGGER',
          data: {
            host: config.host,
            port: config.port,
            body: additionalData || {}
          }
        });
      }

      console.log('[OfflineService] Gate trigger queued:', queueItem.id);
      return queueItem.id as string;
    } catch (error) {
      console.error('[OfflineService] Failed to queue gate trigger:', error);
      throw error;
    }
  }

  /**
   * Queue a configuration update for offline execution
   */
  async queueConfigUpdate(config: any): Promise<string> {
    try {
      const queueItem: Partial<OfflineQueueItem> = {
        id: this.generateQueueId(),
        type: 'config_update',
        data: config,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3
      };

      // Store in local storage as fallback
      this.addToLocalQueue(queueItem as OfflineQueueItem);

      console.log('[OfflineService] Config update queued:', queueItem.id);
      return queueItem.id as string;
    } catch (error) {
      console.error('[OfflineService] Failed to queue config update:', error);
      throw error;
    }
  }

  /**
   * Clear the offline queue
   */
  async clearQueue(): Promise<void> {
    try {
      // Clear service worker queue
      if (this.serviceWorkerRegistration?.active) {
        this.serviceWorkerRegistration.active.postMessage({
          type: 'CLEAR_OFFLINE_QUEUE'
        });
      }

      // Clear local queue
      this.clearLocalQueue();

      this.queueSize = 0;
      this.delegate?.onQueueSizeChanged(0);

      console.log('[OfflineService] Queue cleared');
    } catch (error) {
      console.error('[OfflineService] Failed to clear queue:', error);
      throw error;
    }
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<{ size: number; items: OfflineQueueItem[] }> {
    try {
      // Get from local storage as primary source
      const localQueue = this.getLocalQueue();

      // Request from service worker as well
      await this.requestQueueStatus();

      return {
        size: localQueue.length,
        items: localQueue
      };
    } catch (error) {
      console.error('[OfflineService] Failed to get queue status:', error);
      return { size: 0, items: [] };
    }
  }

  /**
   * Process the offline queue manually
   */
  async processQueue(): Promise<void> {
    try {
      if (!navigator.onLine) {
        console.warn('[OfflineService] Cannot process queue - offline');
        return;
      }

      // Trigger service worker background sync
      if (this.serviceWorkerRegistration && 'sync' in this.serviceWorkerRegistration) {
        try {
          await (this.serviceWorkerRegistration as any).sync.register('gate-trigger-sync');
          console.log('[OfflineService] Background sync triggered');
        } catch (syncError) {
          console.warn('[OfflineService] Background sync not supported:', syncError);
        }
      }

      // Process local queue items
      const localQueue = this.getLocalQueue();
      for (const item of localQueue) {
        await this.processQueueItem(item);
      }
    } catch (error) {
      console.error('[OfflineService] Failed to process queue:', error);
      throw error;
    }
  }

  /**
   * Check if gate trigger can be executed online
   */
  async canExecuteGateTrigger(): Promise<boolean> {
    return navigator.onLine && !this.isOffline;
  }

  /**
   * Initialize network monitoring
   */
  private initializeNetworkMonitoring(): void {
    // Monitor online/offline events
    window.addEventListener('online', () => {
      console.log('[OfflineService] Network came online');
      this.updateOfflineStatus();
      this.processQueue().catch(error => {
        console.error('[OfflineService] Failed to process queue after coming online:', error);
      });
    });

    window.addEventListener('offline', () => {
      console.log('[OfflineService] Network went offline');
      this.updateOfflineStatus();
    });

    // Initial status check
    this.updateOfflineStatus();
  }

  /**
   * Initialize service worker communication
   */
  private initializeServiceWorkerCommunication(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event.data);
      });
    }
  }

  /**
   * Handle messages from service worker
   */
  private handleServiceWorkerMessage(message: any): void {
    const { type, ...data } = message;

    switch (type) {
      case 'GATE_TRIGGER_QUEUED':
        this.queueSize = data.queueSize || 0;
        this.delegate?.onQueueSizeChanged(this.queueSize);
        break;

      case 'OFFLINE_QUEUE_PROCESSED':
        console.log(`[OfflineService] Queue processed: ${data.processed} successful, ${data.failed} failed`);
        this.queueSize = data.remaining || 0;
        this.delegate?.onQueueSizeChanged(this.queueSize);
        break;

      case 'OFFLINE_QUEUE_CLEARED':
        this.queueSize = 0;
        this.delegate?.onQueueSizeChanged(0);
        break;

      default:
        console.warn('[OfflineService] Unknown service worker message:', type);
    }
  }

  /**
   * Update offline status
   */
  private async updateOfflineStatus(): Promise<void> {
    const wasOffline = this.isOffline;
    this.isOffline = !navigator.onLine;

    if (wasOffline !== this.isOffline) {
      this.delegate?.onOfflineStatusChanged(this.isOffline);
      console.log(`[OfflineService] Offline status changed: ${this.isOffline ? 'offline' : 'online'}`);
    }
  }

  /**
   * Request queue status from service worker
   */
  private async requestQueueStatus(): Promise<void> {
    try {
      if (this.serviceWorkerRegistration?.active) {
        // Create a message channel for response
        const messageChannel = new MessageChannel();
        
        return new Promise((resolve) => {
          messageChannel.port1.onmessage = (event) => {
            const { queueSize } = event.data;
            this.queueSize = queueSize || 0;
            this.delegate?.onQueueSizeChanged(this.queueSize);
            resolve();
          };

          this.serviceWorkerRegistration!.active!.postMessage(
            { type: 'GET_OFFLINE_STATUS' },
            [messageChannel.port2]
          );
        });
      }
    } catch (error) {
      console.error('[OfflineService] Failed to request queue status:', error);
    }
  }

  /**
   * Generate unique queue item ID
   */
  private generateQueueId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Process individual queue item
   */
  private async processQueueItem(item: OfflineQueueItem): Promise<void> {
    try {
      let success = false;

      if (item.type === 'gate_trigger') {
        success = await this.processGateTriggerItem(item);
      } else if (item.type === 'config_update') {
        success = await this.processConfigUpdateItem(item);
      }

      if (success) {
        this.removeFromLocalQueue(item.id);
        console.log(`[OfflineService] Queue item processed successfully: ${item.id}`);
      } else {
        item.retryCount++;
        if (item.retryCount >= item.maxRetries) {
          this.removeFromLocalQueue(item.id);
          console.error(`[OfflineService] Queue item failed permanently: ${item.id}`);
        } else {
          this.updateLocalQueueItem(item);
          console.warn(`[OfflineService] Queue item retry ${item.retryCount}/${item.maxRetries}: ${item.id}`);
        }
      }

      this.delegate?.onQueueItemProcessed(item, success);
    } catch (error) {
      console.error(`[OfflineService] Error processing queue item ${item.id}:`, error);
      this.delegate?.onQueueItemProcessed(item, false);
    }
  }

  /**
   * Process gate trigger queue item
   */
  private async processGateTriggerItem(item: OfflineQueueItem): Promise<boolean> {
    try {
      const { config } = item.data;
      
      if ('host' in config) {
        // ESP32 HTTP request
        const response = await fetch(`http://${config.host}:${config.port}/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data.additionalData || {})
        });
        
        return response.ok;
      } else {
        // MQTT request - would need MQTT service integration
        console.warn('[OfflineService] MQTT offline processing not yet implemented');
        return false;
      }
    } catch (error) {
      console.error('[OfflineService] Gate trigger processing failed:', error);
      return false;
    }
  }

  /**
   * Process config update queue item
   */
  private async processConfigUpdateItem(item: OfflineQueueItem): Promise<boolean> {
    try {
      // Placeholder for configuration sync
      console.log('[OfflineService] Processing config update:', item.data);
      return true;
    } catch (error) {
      console.error('[OfflineService] Config update processing failed:', error);
      return false;
    }
  }

  /**
   * Local storage queue management
   */
  private getLocalQueue(): OfflineQueueItem[] {
    try {
      const queueData = localStorage.getItem('gatekeeper_offline_queue');
      return queueData ? JSON.parse(queueData) : [];
    } catch (error) {
      console.error('[OfflineService] Failed to get local queue:', error);
      return [];
    }
  }

  private addToLocalQueue(item: OfflineQueueItem): void {
    try {
      const queue = this.getLocalQueue();
      queue.push(item);
      localStorage.setItem('gatekeeper_offline_queue', JSON.stringify(queue));
    } catch (error) {
      console.error('[OfflineService] Failed to add to local queue:', error);
    }
  }

  private removeFromLocalQueue(itemId: string): void {
    try {
      const queue = this.getLocalQueue();
      const filteredQueue = queue.filter(item => item.id !== itemId);
      localStorage.setItem('gatekeeper_offline_queue', JSON.stringify(filteredQueue));
    } catch (error) {
      console.error('[OfflineService] Failed to remove from local queue:', error);
    }
  }

  private updateLocalQueueItem(item: OfflineQueueItem): void {
    try {
      const queue = this.getLocalQueue();
      const index = queue.findIndex(queueItem => queueItem.id === item.id);
      if (index !== -1) {
        queue[index] = item;
        localStorage.setItem('gatekeeper_offline_queue', JSON.stringify(queue));
      }
    } catch (error) {
      console.error('[OfflineService] Failed to update local queue item:', error);
    }
  }

  private clearLocalQueue(): void {
    try {
      localStorage.removeItem('gatekeeper_offline_queue');
    } catch (error) {
      console.error('[OfflineService] Failed to clear local queue:', error);
    }
  }
}

/**
 * Create offline service instance
 */
export function createOfflineService(): OfflineService {
  return new OfflineService();
}

// Global offline service instance
export const offlineService = createOfflineService();