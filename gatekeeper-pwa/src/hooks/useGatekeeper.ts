import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConfig } from './useConfig';
import { useNetworkService } from './useNetworkService';
import { useStateMachine, useButtonState } from './useStateMachine';
import { RelayState } from '../types';
import { NetworkServiceDelegate } from '../types/network';

export function useGatekeeper() {
  const { config, loading: configLoading, error: configError } = useConfig();

  const [networkError, setNetworkError] = useState<string | null>(null);
  const [relayState, setRelayState] = useState<RelayState>('released');
  const [currentMethod, setCurrentMethod] = useState<'http' | 'mqtt' | null>(null);
  const triggerInProgress = useRef(false);

  const isConfigured = useMemo(() => 
    Boolean(
      (config?.esp32.host && config?.esp32.port) ||
      (config?.mqtt.host && config?.mqtt.port)
    ), 
    [config]
  );

  const networkDelegate: NetworkServiceDelegate = useMemo(() => ({
    onTriggerSuccess: (adapter, duration) => {
      console.log(`[useGatekeeper] Gate triggered successfully via ${adapter.name} in ${duration}ms`);
      setNetworkError(null);
      setCurrentMethod(adapter.method);
    },
    onTriggerFailure: (adapter, error) => {
      const adapterName = adapter ? adapter.name : 'Unknown adapter';
      console.error(`[useGatekeeper] Gate trigger failed via ${adapterName}:`, error.message);
      setNetworkError(error.message);
      setCurrentMethod(null);
    },
    onConnectionTest: (adapter, success, duration) => {
      console.log(`[useGatekeeper] Connection test for ${adapter.name}: ${success ? 'passed' : 'failed'} in ${duration}ms`);
    }
  }), []);

  const { networkService, cancelCurrentOperation } = useNetworkService(config, networkDelegate);

  const stateMachine = useStateMachine({
    initialState: 'ready',
    onStateChange: (from, to, action) => {
      console.log(`[useGatekeeper] State transition: ${from} -> ${to} (${action})`);
      
      // Reset timestamp when returning to ready state
      if (to === 'ready' && from !== 'ready') {
        console.log(`[useGatekeeper] Resetting on transition to ready`);
        triggerInProgress.current = false;
      }
    },
    onTimeout: (state) => {
      console.warn(`[useGatekeeper] State ${state} timed out`);
      setNetworkError(`Operation timed out in ${state} state`);
    },
    onError: (errorMsg, context) => {
      console.error(`[useGatekeeper] State machine error:`, errorMsg, context);
      setNetworkError(errorMsg);
    },
    enableLogging: true,
  });


  const performGateTrigger = useCallback(async (timestamp: string) => {
    if (!networkService) {
      void stateMachine.transition('requestComplete', { error: 'No network service available' });
      return;
    }

    try {
      console.log(`[useGatekeeper] Starting gate trigger with timestamp: ${timestamp}`);
      const success = await networkService.triggerGate(timestamp);
      if (success) {
        setRelayState('activated');
        void stateMachine.transition('relayChanged');
        setTimeout(() => {
          setRelayState('released');
          void stateMachine.transition('relayChanged');
        }, 2000);
      } else if (stateMachine.currentState === 'triggering') {
        void stateMachine.transition('requestComplete', { error: 'Gate trigger failed' });
      }
    } catch (err) {
      console.error('[useGatekeeper] Gate trigger failed:', err);
      if (stateMachine.currentState === 'triggering') {
        void stateMachine.transition('requestComplete', { error: err instanceof Error ? err.message : 'Gate trigger failed' });
      }
    }
  }, [networkService, stateMachine]);

  useEffect(() => {
    if (stateMachine.currentState === 'triggering' && !triggerInProgress.current) {
      triggerInProgress.current = true;
      const timestamp = Date.now().toString();
      console.log(`[useGatekeeper] Generated timestamp for gate trigger: ${timestamp}`);
      void performGateTrigger(timestamp);
    }

    return () => {
      if (cancelCurrentOperation) {
        cancelCurrentOperation();
      }
    };
  }, [stateMachine.currentState, performGateTrigger, networkService, cancelCurrentOperation]);

  const handleTrigger = useCallback(() => {
    // Prevent clicks during transitional states
    if (stateMachine.isTransitional) {
      console.log(`[useGatekeeper] Ignoring click during transitional state: ${stateMachine.currentState}`);
      return;
    }
    
    if (stateMachine.currentState === 'ready') {
      void stateMachine.transition('userPressed');
    } else if (['timeout', 'error'].includes(stateMachine.currentState)) {
      void stateMachine.retry();
    }
  }, [stateMachine]);

  const buttonState = useButtonState(stateMachine, isConfigured);


  return {
    config,
    loading: configLoading,
    error: configError,
    networkError,
    relayState,
    stateMachine,
    buttonState,
    handleTrigger,
    currentMethod,
    networkService
  };
}
