/**
 * useNetworkStatus Hook - Phase 3 Implementation
 * 
 * React hook that subscribes to NetworkEventBus for real-time network status
 * Provides granular adapter status and global connectivity state
 * 
 * Key Features:
 * - Real-time subscription to network events via NetworkEventBus
 * - Tracks individual adapter status (esp32, mqtt)
 * - Computes global isOnline status from adapter states
 * - Proper React lifecycle management with cleanup on unmount
 * - Performance optimized with selective re-renders
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { getNetworkEventBus, type EventSubscription, type StatusChangeEvent } from '../services/NetworkEventBus';

/**
 * Individual adapter status type
 */
export type AdapterStatus = 'reachable' | 'unreachable' | 'unknown';

/**
 * Network status state interface
 */
export interface NetworkStatusState {
  esp32Status: AdapterStatus;
  mqttStatus: AdapterStatus;
  isOnline: boolean;
  lastUpdate: number;
}

/**
 * Hook configuration options
 */
export interface UseNetworkStatusOptions {
  /**
   * Whether to log status changes for debugging
   * Default: false
   */
  enableLogging?: boolean;
  
  /**
   * Custom logic for determining online status
   * Default: true if any adapter is reachable
   */
  isOnlineLogic?: (esp32Status: AdapterStatus, mqttStatus: AdapterStatus) => boolean;
}

/**
 * Hook return interface
 */
export interface UseNetworkStatusReturn extends NetworkStatusState {
  /**
   * Force refresh of network status
   * Useful for manual status checks
   */
  refresh: () => void;
  
  /**
   * Get status for specific adapter type
   */
  getAdapterStatus: (type: 'esp32' | 'mqtt') => AdapterStatus;
  
  /**
   * Check if any adapters are configured and reachable
   */
  hasReachableAdapters: () => boolean;
  
  /**
   * Get status summary for debugging
   */
  getStatusSummary: () => string;
}

/**
 * Default online status logic - true if any adapter is reachable
 */
const defaultIsOnlineLogic = (esp32Status: AdapterStatus, mqttStatus: AdapterStatus): boolean => {
  return esp32Status === 'reachable' || mqttStatus === 'reachable';
};

/**
 * useNetworkStatus - React hook for real-time network status monitoring
 * 
 * Subscribes to NetworkEventBus and maintains current network status state.
 * Provides both granular adapter status and computed global connectivity state.
 * 
 * @param options Hook configuration options
 * @returns Network status state and utility functions
 */
export function useNetworkStatus(options: UseNetworkStatusOptions = {}): UseNetworkStatusReturn {
  const {
    enableLogging = false,
    isOnlineLogic = defaultIsOnlineLogic
  } = options;

  // Network status state
  const [networkStatus, setNetworkStatus] = useState<NetworkStatusState>({
    esp32Status: 'unknown',
    mqttStatus: 'unknown',
    isOnline: false,
    lastUpdate: Date.now()
  });

  // Event bus and subscription management
  const eventBus = useMemo(() => getNetworkEventBus(), []);
  const subscriptionRef = useRef<EventSubscription | null>(null);

  // Status change handler
  const handleStatusChange = useMemo(() => (event: StatusChangeEvent) => {
    if (enableLogging) {
      console.log(`[useNetworkStatus] Status change: ${event.adapterType} -> ${event.status}`);
    }

    setNetworkStatus(prevStatus => {
      // Update the specific adapter status
      const newStatus = {
        ...prevStatus,
        [event.adapterType === 'esp32' ? 'esp32Status' : 'mqttStatus']: event.status,
        lastUpdate: event.timestamp
      };

      // Compute new online status
      newStatus.isOnline = isOnlineLogic(newStatus.esp32Status, newStatus.mqttStatus);

      if (enableLogging) {
        console.log('[useNetworkStatus] Updated status:', {
          esp32: newStatus.esp32Status,
          mqtt: newStatus.mqttStatus,
          isOnline: newStatus.isOnline
        });
      }

      return newStatus;
    });
  }, [enableLogging, isOnlineLogic]);

  // Subscribe to status change events
  useEffect(() => {
    if (enableLogging) {
      console.log('[useNetworkStatus] Subscribing to network status events');
    }

    // Subscribe to status change events
    subscriptionRef.current = eventBus.subscribe('statusChange', handleStatusChange);

    // Cleanup subscription on unmount
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe();
        subscriptionRef.current = null;
        
        if (enableLogging) {
          console.log('[useNetworkStatus] Unsubscribed from network status events');
        }
      }
    };
  }, [eventBus, handleStatusChange, enableLogging]);

  // Utility functions
  const refresh = useMemo(() => () => {
    // Force refresh by updating lastUpdate timestamp
    setNetworkStatus(prevStatus => ({
      ...prevStatus,
      lastUpdate: Date.now()
    }));
    
    if (enableLogging) {
      console.log('[useNetworkStatus] Manual refresh triggered');
    }
  }, [enableLogging]);

  const getAdapterStatus = useMemo(() => (type: 'esp32' | 'mqtt'): AdapterStatus => {
    return type === 'esp32' ? networkStatus.esp32Status : networkStatus.mqttStatus;
  }, [networkStatus]);

  const hasReachableAdapters = useMemo(() => (): boolean => {
    return networkStatus.esp32Status === 'reachable' || networkStatus.mqttStatus === 'reachable';
  }, [networkStatus]);

  const getStatusSummary = useMemo(() => (): string => {
    const { esp32Status, mqttStatus, isOnline, lastUpdate } = networkStatus;
    const updateTime = new Date(lastUpdate).toLocaleTimeString();
    
    return `Network Status (${updateTime}): ESP32=${esp32Status}, MQTT=${mqttStatus}, Online=${isOnline}`;
  }, [networkStatus]);

  // Return hook interface
  return {
    // Current status state
    esp32Status: networkStatus.esp32Status,
    mqttStatus: networkStatus.mqttStatus,
    isOnline: networkStatus.isOnline,
    lastUpdate: networkStatus.lastUpdate,
    
    // Utility functions
    refresh,
    getAdapterStatus,
    hasReachableAdapters,
    getStatusSummary
  };
}

/**
 * useNetworkStatusWithConfig - Enhanced hook that accepts configuration
 * 
 * Provides network status monitoring with configuration-based filtering.
 * Only tracks status for adapters that are actually configured.
 * 
 * @param config Network configuration object
 * @param options Hook configuration options
 * @returns Network status filtered by configuration
 */
export function useNetworkStatusWithConfig(
  config: { esp32?: { host?: string; port?: number }; mqtt?: { host?: string; port?: number } } | null,
  options: UseNetworkStatusOptions = {}
): UseNetworkStatusReturn & { 
  configuredAdapters: ('esp32' | 'mqtt')[];
  isAdapterConfigured: (type: 'esp32' | 'mqtt') => boolean;
} {
  const networkStatus = useNetworkStatus(options);
  
  // Determine which adapters are configured
  const configuredAdapters = useMemo(() => {
    const adapters: ('esp32' | 'mqtt')[] = [];
    
    if (config?.esp32?.host && config?.esp32?.port) {
      adapters.push('esp32');
    }
    
    if (config?.mqtt?.host && config?.mqtt?.port) {
      adapters.push('mqtt');
    }
    
    return adapters;
  }, [config]);

  const isAdapterConfigured = useMemo(() => (type: 'esp32' | 'mqtt'): boolean => {
    return configuredAdapters.includes(type);
  }, [configuredAdapters]);

  // Override isOnline logic to only consider configured adapters
  const configBasedIsOnline = useMemo(() => {
    if (configuredAdapters.length === 0) return false;
    
    return configuredAdapters.some(type => {
      const status = networkStatus.getAdapterStatus(type);
      return status === 'reachable';
    });
  }, [configuredAdapters, networkStatus]);

  return {
    ...networkStatus,
    isOnline: configBasedIsOnline,
    configuredAdapters,
    isAdapterConfigured
  };
}

/**
 * useNetworkStatusDebug - Debug version of the hook with enhanced logging
 * 
 * Provides detailed logging and debugging information for network status.
 * Useful during development and troubleshooting.
 */
export function useNetworkStatusDebug(): UseNetworkStatusReturn & {
  eventBusStats: any;
  subscriptionInfo: string | null;
} {
  const networkStatus = useNetworkStatus({ enableLogging: true });
  const eventBus = getNetworkEventBus();
  
  // Get event bus statistics
  const eventBusStats = useMemo(() => eventBus.getStats(), [eventBus]);
  
  // Get subscription information
  const subscriptionInfo = useMemo(() => {
    const stats = eventBus.getStats();
    return `Total listeners: ${stats.totalListeners}, Status listeners: ${eventBus.getListenerCount('statusChange')}`;
  }, [eventBus]);

  // Log status changes
  useEffect(() => {
    console.log('[useNetworkStatusDebug] Status update:', networkStatus.getStatusSummary());
  }, [networkStatus]);

  return {
    ...networkStatus,
    eventBusStats,
    subscriptionInfo
  };
}