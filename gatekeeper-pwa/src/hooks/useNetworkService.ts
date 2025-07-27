import { useState, useEffect, useRef } from 'react';
import { createNetworkService, NetworkService } from '../services/NetworkService';
import { createHttpAdapter } from '../adapters/HttpAdapter';
import { createMqttAdapter } from '../adapters/MqttAdapter';
import { AppConfig } from '../types';
import { NetworkServiceDelegate, StatusChangeCallback } from '../types/network';

export function useNetworkService(
  config: AppConfig | null, 
  delegate: NetworkServiceDelegate,
  statusChangeCallback?: StatusChangeCallback
) {
  const [networkService, setNetworkService] = useState<NetworkService | null>(null);
  const statusCallbackRef = useRef(statusChangeCallback);
  
  // Update ref when callback changes
  statusCallbackRef.current = statusChangeCallback;

  useEffect(() => {
    if (!config) return;

    const service = createNetworkService();
    service.delegate = delegate;

    const initialize = async () => {
      if (config.esp32.host && config.esp32.port) {
        const httpAdapter = createHttpAdapter(config.esp32);
        if (statusCallbackRef.current && httpAdapter.setStatusChangeCallback) {
          httpAdapter.setStatusChangeCallback(statusCallbackRef.current);
        }
        await service.addAdapter(httpAdapter);
      }

      if (config.mqtt.host && config.mqtt.port) {
        const mqttAdapter = createMqttAdapter(config.mqtt);
        if (statusCallbackRef.current && mqttAdapter.setStatusChangeCallback) {
          mqttAdapter.setStatusChangeCallback(statusCallbackRef.current);
        }
        await service.addAdapter(mqttAdapter);
      }

      await service.initialize();
      setNetworkService(service);
    };

    initialize();

    return () => {
      service.cleanup();
    };
  }, [config, delegate]); // Removed statusChangeCallback from dependencies

  return networkService;
}
