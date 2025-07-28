import { useState, useEffect, useRef } from 'react';
import { createNetworkService, NetworkService } from '../services/NetworkService';
import { createHttpAdapter } from '../adapters/HttpAdapter';
import { createMqttAdapter } from '../adapters/MqttAdapter';
import { AppConfig } from '../types';
import { NetworkServiceDelegate } from '../types/network';

export function useNetworkService(config: AppConfig | null, delegate: NetworkServiceDelegate) {
  const [networkService, setNetworkService] = useState<NetworkService | null>(null);
  const delegateRef = useRef<NetworkServiceDelegate>(delegate);
  
  // Keep delegate ref updated without triggering effect
  delegateRef.current = delegate;

  useEffect(() => {
    if (!config) {
      setNetworkService(null);
      return;
    }

    const service = createNetworkService();
    // Use ref to avoid dependency on delegate
    service.delegate = delegateRef.current;

    const initialize = async () => {
      if (config.esp32.host && config.esp32.port) {
        const httpAdapter = createHttpAdapter(config.esp32);
        await service.addAdapter(httpAdapter);
      }

      if (config.mqtt.host && config.mqtt.port) {
        const mqttAdapter = createMqttAdapter(config.mqtt);
        await service.addAdapter(mqttAdapter);
      }

      // Adapters are already initialized when added - no need for redundant initialize()
      setNetworkService(service);
    };

    initialize();

    return () => {
      setNetworkService(null);
      service.cleanup();
    };
  }, [config]); // Only depend on config, not delegate

  // Update delegate when service exists
  useEffect(() => {
    if (networkService) {
      networkService.delegate = delegate;
    }
  }, [networkService, delegate]);

  return {
    networkService,
    cancelCurrentOperation: () => networkService?.cancelCurrentOperation(),
  };
}
