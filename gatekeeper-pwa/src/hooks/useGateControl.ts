import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConfig } from './useConfig';
import { useReachability } from './useReachability';
import { useStateMachine, useButtonState } from './useStateMachine';
import { useNetworkStatusWithConfig } from './useNetworkStatus';
import { createReachabilityTargets } from '../services/ReachabilityService';
import { RelayState } from '../types';
import { NetworkServiceDelegate } from '../types/network';
import { createPersistentNetworkService } from '../services/PersistentNetworkService';

/**
 * Interface that defines the contract for persistent network services
 * This contract will be implemented by PersistentNetworkService in Phase 2
 */
export interface PersistentNetworkServiceInterface {
  // Core trigger operation
  triggerGate(): Promise<boolean>;
  
  // Connection management
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  testAllConnections(): Promise<any[]>;
  
  // Configuration management - Phase 2 key feature
  updateConfig(esp32Config?: any, mqttConfig?: any): Promise<void>;
  
  // Status callbacks
  setDelegate(delegate: NetworkServiceDelegate): void;
  setStatusChangeCallback(callback: (type: 'esp32' | 'mqtt', status: 'reachable' | 'unreachable' | 'unknown') => void): void;
  
  // Service state
  readonly isInitialized: boolean;
  readonly adapters: any[];
  readonly lastError: Error | null;
  
  // Connection state management
  updateConnectionStatus(type: 'esp32' | 'mqtt', status: 'reachable' | 'unreachable' | 'unknown'): void;
}

/**
 * Interface for gate control operations and state
 * This defines what components need from the gate control system
 */
export interface GateControlInterface {
  // Configuration state
  config: any;
  loading: boolean;
  error: string | null;
  
  // Network and display state
  displayStatus: 'online' | 'offline' | 'unconfigured';
  networkError: string | null;
  relayState: RelayState;
  currentMethod: 'http' | 'mqtt' | null;
  
  // State machine interface
  stateMachine: any;
  buttonState: any;
  
  // Primary actions
  handleTrigger: () => void;
  
  // Network service access (read-only for components)
  networkService: PersistentNetworkServiceInterface | null;
}

/**
 * Simplified gate control hook that consolidates config, network, and state management
 * Replaces the complex useGatekeeper hook chain with a single, persistent service approach
 * 
 * Phase 1: Creates interface contracts for persistent network services
 * Phase 2: Implements PersistentNetworkService that implements PersistentNetworkServiceInterface
 * Phase 3: Integrates event-driven status system via NetworkEventBus and useNetworkStatus
 */
export function useGateControl(): GateControlInterface {
  // Use simplified config hook (Phase 1 removes network service integration)
  const { config, loading: configLoading, error: configError, updateReachabilityStatus, isOnline } = useConfig();
  
  // Phase 3: Use event-driven network status monitoring
  const networkStatus = useNetworkStatusWithConfig(config, { enableLogging: true });
  const { reachabilityService } = useReachability(config, config ? {
    timeouts: {
      checkingNetwork: 10000,
      triggering: 5000,
      waitingForRelayClose: 15000,
      errorRecovery: 3000
    },
    retry: {
      maxAttempts: 3,
      backoffMultiplier: 2,
      baseDelay: 1000
    },
    reachability: {
      initialDelay: 1000,
      checkInterval: 30000,
      timeoutPerCheck: 3000
    }
  } : undefined);

  // Local state for gate control
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [relayState, setRelayState] = useState<RelayState>('released');
  const [currentMethod, setCurrentMethod] = useState<'http' | 'mqtt' | null>(null);

  // Use ref for persistent network service instance (Phase 1: placeholder, Phase 2: real implementation)
  const networkServiceRef = useRef<PersistentNetworkServiceInterface | null>(null);

  // Configuration status
  const isConfigured = useMemo(() => 
    Boolean(
      (config?.esp32.host && config?.esp32.port) ||
      (config?.mqtt.host && config?.mqtt.port)
    ), 
    [config]
  );

  // Network delegate for status updates
  const networkDelegate: NetworkServiceDelegate = useMemo(() => ({
    onTriggerSuccess: (adapter, duration) => {
      console.log(`[useGateControl] Gate triggered successfully via ${adapter.name} in ${duration}ms`);
      setNetworkError(null);
      setCurrentMethod(adapter.method);
      const adapterType = adapter.method === 'http' ? 'esp32' : 'mqtt';
      updateReachabilityStatus(adapterType, 'reachable');
    },
    onTriggerFailure: (adapter, error) => {
      const adapterName = adapter ? adapter.name : 'Unknown adapter';
      console.error(`[useGateControl] Gate trigger failed via ${adapterName}:`, error.message);
      setNetworkError(error.message);
      setCurrentMethod(null);
      if (adapter) {
        const adapterType = adapter.method === 'http' ? 'esp32' : 'mqtt';
        updateReachabilityStatus(adapterType, 'unreachable');
      }
    },
    onConnectionTest: (adapter, success, duration) => {
      console.log(`[useGateControl] Connection test for ${adapter.name}: ${success ? 'passed' : 'failed'} in ${duration}ms`);
    }
  }), [updateReachabilityStatus]);

  // Status change callback for real-time updates
  const handleStatusChange = useCallback((
    adapterType: 'esp32' | 'mqtt',
    status: 'reachable' | 'unreachable' | 'unknown'
  ) => {
    console.log(`[useGateControl] Real-time status change: ${adapterType} -> ${status}`);
    updateReachabilityStatus(adapterType, status);
    
    // Update network service if available
    if (networkServiceRef.current) {
      networkServiceRef.current.updateConnectionStatus(adapterType, status);
    }
  }, [updateReachabilityStatus]);

  // State machine for gate operations
  const stateMachine = useStateMachine({
    initialState: 'ready',
    onStateChange: (from, to, action) => {
      console.log(`[useGateControl] State transition: ${from} -> ${to} (${action})`);
    },
    onTimeout: (state) => {
      console.warn(`[useGateControl] State ${state} timed out`);
      setNetworkError(`Operation timed out in ${state} state`);
    },
    onError: (errorMsg, context) => {
      console.error(`[useGateControl] State machine error:`, errorMsg, context);
      setNetworkError(errorMsg);
    },
    enableLogging: true,
  });

  // Initialize persistent network service when config changes
  useEffect(() => {
    if (!config) return;

    const initializeNetworkService = async () => {
      try {
        console.log('[useGateControl] Initializing persistent network service');
        
        // Phase 2: Use actual PersistentNetworkService implementation
        const persistentService = createPersistentNetworkService();

        // Set up the service
        persistentService.setDelegate(networkDelegate);
        persistentService.setStatusChangeCallback(handleStatusChange);
        await persistentService.initialize();

        // Update adapter configurations
        await persistentService.updateConfig(config.esp32, config.mqtt);

        networkServiceRef.current = persistentService;
        console.log('[useGateControl] Persistent network service initialized');
      } catch (error) {
        console.error('[useGateControl] Failed to initialize network service:', error);
        setNetworkError('Failed to initialize network service');
      }
    };

    initializeNetworkService();

    // Cleanup on unmount or config change
    return () => {
      if (networkServiceRef.current) {
        networkServiceRef.current.cleanup();
        networkServiceRef.current = null;
      }
    };
  }, [networkDelegate, handleStatusChange]);

  // Separate effect for configuration updates to avoid recreating the service
  useEffect(() => {
    const updateNetworkConfig = async () => {
      if (!config || !networkServiceRef.current) return;

      try {
        console.log('[useGateControl] Updating network service configuration');
        await networkServiceRef.current.updateConfig(config.esp32, config.mqtt);
        console.log('[useGateControl] Network service configuration updated');
      } catch (error) {
        console.error('[useGateControl] Failed to update network service configuration:', error);
        setNetworkError('Failed to update network configuration');
      }
    };

    updateNetworkConfig();
  }, [config]);

  // Reachability check operation
  const performReachabilityCheck = useCallback(async () => {
    if (!reachabilityService || !config) {
      stateMachine.transition('reachabilityResult', { error: 'No reachability service or not configured' });
      return;
    }

    try {
      const targets = createReachabilityTargets(config.esp32, config.mqtt);
      const results = await reachabilityService.testTargets(targets);
      const hasReachable = results.some(r => r.isReachable);

      if (hasReachable) {
        stateMachine.transition('reachabilityResult');
      } else {
        stateMachine.transition('reachabilityResult', { error: 'No reachable targets' });
      }
    } catch (err) {
      console.error('[useGateControl] Reachability check failed:', err);
      stateMachine.transition('reachabilityResult', { error: err instanceof Error ? err.message : 'Reachability check failed' });
    }
  }, [reachabilityService, config, stateMachine]);

  // Gate trigger operation
  const performGateTrigger = useCallback(async () => {
    if (!networkServiceRef.current) {
      stateMachine.transition('requestComplete', { error: 'No network service available' });
      return;
    }

    try {
      const success = await networkServiceRef.current.triggerGate();
      if (success) {
        setRelayState('activated');
        stateMachine.transition('relayChanged');
        setTimeout(() => {
          setRelayState('released');
          stateMachine.transition('relayChanged');
        }, 2000);
      } else {
        stateMachine.transition('requestComplete', { error: 'Gate trigger failed' });
      }
    } catch (err) {
      console.error('[useGateControl] Gate trigger failed:', err);
      stateMachine.transition('requestComplete', { error: err instanceof Error ? err.message : 'Gate trigger failed' });
    }
  }, [stateMachine]);

  // State machine effect handler
  useEffect(() => {
    if (stateMachine.currentState === 'checkingNetwork') {
      performReachabilityCheck();
    } else if (stateMachine.currentState === 'triggering') {
      performGateTrigger();
    }
  }, [stateMachine.currentState, performReachabilityCheck, performGateTrigger]);

  // Main trigger handler
  const handleTrigger = useCallback(() => {
    if (stateMachine.currentState === 'ready') {
      stateMachine.transition('configChanged');
    } else if (['noNetwork', 'timeout', 'error'].includes(stateMachine.currentState)) {
      stateMachine.retry();
    }
  }, [stateMachine]);

  // Button state
  const buttonState = useButtonState(stateMachine, isConfigured);

  // Display status computation using event-driven network status
  const displayStatus = useMemo(() => {
    if (!isConfigured) return 'unconfigured';
    
    // Phase 3: Use event-driven network status from NetworkEventBus
    const { isOnline: eventDrivenOnline } = networkStatus;
    
    // If no adapters are configured, fall back to legacy logic
    if (networkStatus.configuredAdapters.length === 0) {
      return !isOnline ? 'offline' : 'online';
    }
    
    // Use event-driven online status which only considers configured adapters
    return eventDrivenOnline ? 'online' : 'offline';
  }, [isConfigured, isOnline, networkStatus]);

  // Return the gate control interface
  return {
    config,
    loading: configLoading,
    error: configError,
    displayStatus,
    networkError,
    relayState,
    currentMethod,
    stateMachine,
    buttonState,
    handleTrigger,
    networkService: networkServiceRef.current
  };
}