/**
 * Network configuration and constants
 * Centralized network settings to eliminate duplication across adapters
 */

import type { NetworkMethod } from '../types/network';

/**
 * Timeout configuration for different network operations
 */
export const NETWORK_TIMEOUTS = {
  HTTP: 5000,      // 5 seconds for HTTP requests
  MQTT: 10000,     // 10 seconds for MQTT operations
  CONNECTION_TEST: 5000,  // 5 seconds for connection tests
  WEBSOCKET: 10000 // 10 seconds for WebSocket connections
} as const;

/**
 * Retry configuration for network operations
 */
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY: 1000,     // 1 second base delay
  MAX_DELAY: 10000,     // 10 seconds max delay
  EXPONENTIAL_BASE: 2   // Exponential backoff multiplier
} as const;

/**
 * Network adapter configuration
 */
export interface AdapterConfig {
  method: NetworkMethod;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  useExponentialBackoff: boolean;
}

/**
 * HTTP adapter specific configuration
 */
export const HTTP_CONFIG: AdapterConfig = {
  method: 'http',
  timeout: NETWORK_TIMEOUTS.HTTP,
  maxRetries: RETRY_CONFIG.MAX_ATTEMPTS,
  retryDelay: RETRY_CONFIG.BASE_DELAY,
  useExponentialBackoff: true
};

/**
 * MQTT adapter specific configuration  
 */
export const MQTT_CONFIG: AdapterConfig = {
  method: 'mqtt',
  timeout: NETWORK_TIMEOUTS.MQTT,
  maxRetries: RETRY_CONFIG.MAX_ATTEMPTS,
  retryDelay: RETRY_CONFIG.BASE_DELAY,
  useExponentialBackoff: true
};

/**
 * MQTT topic configuration
 */
export const MQTT_TOPICS = {
  TRIGGER: 'iot/house/gate/esp32/trigger',
  STATUS: 'iot/house/gate/esp32/status'
} as const;

/**
 * MQTT connection settings
 */
export const MQTT_CONNECTION = {
  KEEP_ALIVE: 60,         // 60 seconds keep-alive
  PING_INTERVAL: 30000,   // 30 seconds ping interval
  MAX_RECONNECT_ATTEMPTS: 3,
  WEBSOCKET_PROTOCOL: 'mqtt',
  CLIENT_ID_PREFIX: 'gate-pwa'
} as const;

/**
 * HTTP endpoints
 */
export const HTTP_ENDPOINTS = {
  TRIGGER: '/trigger',
  STATUS: '/status'
} as const;

/**
 * HTTP request configuration
 */
export const HTTP_REQUEST = {
  HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain'
  }
} as const;

/**
 * Get timeout for specific network method
 */
export function getTimeoutForMethod(method: NetworkMethod): number {
  switch (method) {
    case 'http':
      return NETWORK_TIMEOUTS.HTTP;
    case 'mqtt':
      return NETWORK_TIMEOUTS.MQTT;
    default:
      return NETWORK_TIMEOUTS.HTTP;
  }
}

/**
 * Get adapter configuration for specific method
 */
export function getAdapterConfig(method: NetworkMethod): AdapterConfig {
  switch (method) {
    case 'http':
      return HTTP_CONFIG;
    case 'mqtt':
      return MQTT_CONFIG;
    default:
      return HTTP_CONFIG;
  }
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(attempt: number, baseDelay: number = RETRY_CONFIG.BASE_DELAY): number {
  const delay = baseDelay * Math.pow(RETRY_CONFIG.EXPONENTIAL_BASE, attempt - 1);
  return Math.min(delay, RETRY_CONFIG.MAX_DELAY);
}

/**
 * Generate unique MQTT client ID
 */
export function generateMqttClientId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${MQTT_CONNECTION.CLIENT_ID_PREFIX}-${timestamp}-${random}`;
}