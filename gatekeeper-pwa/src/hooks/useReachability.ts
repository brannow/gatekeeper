import { useState, useEffect } from 'react';
import { createReachabilityService, ReachabilityService, ReachabilityServiceDelegate, ReachabilityTarget } from '../services/ReachabilityService';
import { AppConfig } from '../types';

export function useReachability(config: AppConfig | null) {
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

    const service = createReachabilityService(config.stateMachine, delegate);
    setReachabilityService(service);

    return () => {
      service.cleanup();
    };
  }, [config]);

  return { reachabilityService, isOnline };
}
