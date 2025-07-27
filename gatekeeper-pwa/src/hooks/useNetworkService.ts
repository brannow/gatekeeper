import { useState, useEffect } from 'react';
import { createNetworkService, NetworkService } from '../services/NetworkService';
import { createHttpAdapter } from '../adapters/HttpAdapter';
import { createMqttAdapter } from '../adapters/MqttAdapter';
import { AppConfig } from '../types';
import { NetworkServiceDelegate } from '../types/network';

export function useNetworkService(config: AppConfig | null, delegate: NetworkServiceDelegate) {
  const [networkService, setNetworkService] = useState<NetworkService | null>(null);

  useEffect(() => {
    if (!config) return;

    const service = createNetworkService();
    service.delegate = delegate;

    const initialize = async () => {
      if (config.esp32.host && config.esp32.port) {
        const httpAdapter = createHttpAdapter(config.esp32);
        await service.addAdapter(httpAdapter);
      }

      if (config.mqtt.host && config.mqtt.port) {
        const mqttAdapter = createMqttAdapter(config.mqtt);
        await service.addAdapter(mqttAdapter);
      }

      await service.initialize();
      setNetworkService(service);
    };

    initialize();

    return () => {
      service.cleanup();
    };
  }, [config, delegate]);

  return networkService;
}
