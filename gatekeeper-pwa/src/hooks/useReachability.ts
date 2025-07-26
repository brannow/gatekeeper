import { useState, useEffect } from 'react';
import { createReachabilityService, ReachabilityService, ReachabilityServiceDelegate, ReachabilityTarget } from '../services/ReachabilityService';
import { AppConfig } from '../types';
import { StateMachineConfig } from '../types/state-machine';

export function useReachability(config: AppConfig | null, stateMachineConfig?: StateMachineConfig) {
  const [reachabilityService, setReachabilityService] = useState<ReachabilityService | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (!config) return;

    const delegate: ReachabilityServiceDelegate = {
      onConnectivityChanged: (_service, online) => {
        console.log(`[useReachability] Connectivity changed: ${online ? 'online' : 'offline'}`);
        setIsOnline(online);
      },
      onReachabilityResult: (_service, target: ReachabilityTarget, isReachable: boolean, duration: number) => {
        console.log(`[useReachability] Reachability result for ${target.type}: ${isReachable ? 'reachable' : 'unreachable'} in ${duration}ms`);
      }
    };

    // Convert state machine reachability config to ReachabilityServiceConfig format
    const reachabilityServiceConfig = stateMachineConfig?.reachability ? {
      defaultTimeout: stateMachineConfig.reachability.timeoutPerCheck,
      monitorConnectivity: true,
      periodicCheckInterval: stateMachineConfig.reachability.checkInterval,
      maxConcurrentTests: 2 // ESP32 and MQTT
    } : undefined;
    
    const service = createReachabilityService(reachabilityServiceConfig, delegate);
    setReachabilityService(service);

    return () => {
      service.cleanup();
    };
  }, [config, stateMachineConfig]);

  return { reachabilityService, isOnline };
}
