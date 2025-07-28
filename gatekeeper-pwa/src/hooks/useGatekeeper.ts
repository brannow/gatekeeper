import { useState, useEffect, useCallback, useMemo } from 'react';
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

  const networkService = useNetworkService(config, networkDelegate);

  const stateMachine = useStateMachine({
    initialState: 'ready',
    onStateChange: (from, to, action) => {
      console.log(`[useGatekeeper] State transition: ${from} -> ${to} (${action})`);
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


  const performGateTrigger = useCallback(async () => {
    if (!networkService) {
      stateMachine.transition('requestComplete', { error: 'No network service available' });
      return;
    }

    try {
      const success = await networkService.triggerGate();
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
      console.error('[useGatekeeper] Gate trigger failed:', err);
      stateMachine.transition('requestComplete', { error: err instanceof Error ? err.message : 'Gate trigger failed' });
    }
  }, [networkService, stateMachine]);

  useEffect(() => {
    if (stateMachine.currentState === 'triggering') {
      performGateTrigger();
    }
  }, [stateMachine.currentState, performGateTrigger]);

  const handleTrigger = useCallback(() => {
    if (stateMachine.currentState === 'ready') {
      stateMachine.transition('userPressed');
    } else if (['timeout', 'error'].includes(stateMachine.currentState)) {
      stateMachine.retry();
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
