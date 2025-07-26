/**
 * Centralized network error handling utility
 * Single source of truth for all network error categorization and handling
 * Eliminates duplicated error categorization logic across adapters and services
 */

import type { NetworkError, NetworkMethod } from '../types/network';
import { getTimeoutForMethod } from './NetworkConfig';
import { isValidHost, isValidPort, getHostValidationError, getPortValidationError } from '../utils/validation';

/**
 * Error patterns for categorization
 */
const ERROR_PATTERNS = {
  TIMEOUT: [
    'timeout',
    'AbortError',
    'Request timeout',
    'Connection timeout',
    'timed out'
  ],
  NETWORK: [
    'network',
    'connection',
    'fetch',
    'TypeError',
    'WebSocket',
    'connection failed',
    'Network request failed'
  ],
  CONFIG: [
    'required',
    'must be',
    'invalid',
    'configuration',
    'ESP32',
    'MQTT'
  ],
  SERVER: [
    'server',
    'status',
    'responded',
    'broker',
    'rejected',
    'Server responded'
  ]
} as const;

/**
 * Enhanced error information for debugging
 */
export interface ErrorContext {
  adapter: NetworkMethod;
  operation: string;
  duration?: number;
  config?: {
    host?: string;
    port?: number;
    [key: string]: any;
  };
}

/**
 * Centralized error categorization and handling
 */
export class NetworkErrorHandler {
  /**
   * Categorize error based on error type, message patterns, and timing
   * @param error The caught error
   * @param context Error context with adapter, operation, and timing info
   * @returns Categorized NetworkError
   */
  static categorizeError(error: Error, context: ErrorContext): NetworkError {
    const timestamp = Date.now();
    const errorMessage = error.message || 'Unknown error';
    
    // Check for timeout errors first (most specific)
    if (this.isTimeoutError(error, context)) {
      return {
        type: 'timeout',
        message: this.formatTimeoutMessage(context),
        adapter: context.adapter,
        timestamp
      };
    }
    
    // Check for network connectivity errors
    if (this.isNetworkError(error)) {
      return {
        type: 'network',
        message: this.formatNetworkMessage(errorMessage, context),
        adapter: context.adapter,
        timestamp
      };
    }
    
    // Check for configuration errors
    if (this.isConfigError(error)) {
      return {
        type: 'config',
        message: this.formatConfigMessage(errorMessage, context),
        adapter: context.adapter,
        timestamp
      };
    }
    
    // Check for server errors
    if (this.isServerError(error)) {
      return {
        type: 'server',
        message: this.formatServerMessage(errorMessage, context),
        adapter: context.adapter,
        timestamp
      };
    }
    
    // Default to network error
    return {
      type: 'network',
      message: this.formatGenericMessage(errorMessage, context),
      adapter: context.adapter,
      timestamp
    };
  }
  
  /**
   * Check if error is a timeout error
   */
  private static isTimeoutError(error: Error, context: ErrorContext): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name;
    
    // Check error name for AbortError (fetch timeout)
    if (errorName === 'AbortError') {
      return true;
    }
    
    // Check if duration exceeded timeout
    if (context.duration) {
      const timeout = getTimeoutForMethod(context.adapter);
      if (context.duration >= timeout) {
        return true;
      }
    }
    
    // Check error message patterns
    return ERROR_PATTERNS.TIMEOUT.some(pattern => 
      errorMessage.includes(pattern.toLowerCase())
    );
  }
  
  /**
   * Check if error is a network connectivity error
   */
  private static isNetworkError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name;
    
    return ERROR_PATTERNS.NETWORK.some(pattern => 
      errorMessage.includes(pattern.toLowerCase()) || 
      errorName === pattern
    );
  }
  
  /**
   * Check if error is a configuration error
   */
  private static isConfigError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    return ERROR_PATTERNS.CONFIG.some(pattern => 
      errorMessage.includes(pattern.toLowerCase())
    );
  }
  
  /**
   * Check if error is a server error
   */
  private static isServerError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    
    return ERROR_PATTERNS.SERVER.some(pattern => 
      errorMessage.includes(pattern.toLowerCase())
    );
  }
  
  /**
   * Format timeout error message
   */
  private static formatTimeoutMessage(context: ErrorContext): string {
    const timeout = getTimeoutForMethod(context.adapter);
    const adapterName = context.adapter.toUpperCase();
    return `${adapterName} ${context.operation} timed out after ${timeout}ms`;
  }
  
  /**
   * Format network error message
   */
  private static formatNetworkMessage(originalMessage: string, context: ErrorContext): string {
    const adapterName = context.adapter.toUpperCase();
    const suggestion = context.adapter === 'http' 
      ? 'check ESP32 connectivity' 
      : 'check MQTT broker connectivity';
    
    return `${adapterName} ${context.operation} failed - ${suggestion}. Details: ${originalMessage}`;
  }
  
  /**
   * Format configuration error message
   */
  private static formatConfigMessage(originalMessage: string, context: ErrorContext): string {
    const adapterName = context.adapter.toUpperCase();
    return `${adapterName} configuration error: ${originalMessage}`;
  }
  
  /**
   * Format server error message
   */
  private static formatServerMessage(originalMessage: string, context: ErrorContext): string {
    const adapterName = context.adapter.toUpperCase();
    return `${adapterName} server error: ${originalMessage}`;
  }
  
  /**
   * Format generic error message
   */
  private static formatGenericMessage(originalMessage: string, context: ErrorContext): string {
    const adapterName = context.adapter.toUpperCase();
    return `${adapterName} ${context.operation} error: ${originalMessage}`;
  }
  
  /**
   * Log error with comprehensive context
   * @param message Error message prefix
   * @param networkError Categorized network error
   * @param context Additional error context
   */
  static logError(message: string, networkError: NetworkError, context?: ErrorContext): void {
    const adapterName = networkError.adapter?.toUpperCase() || 'UNKNOWN';
    
    const logContext = {
      type: networkError.type,
      message: networkError.message,
      adapter: networkError.adapter,
      timestamp: new Date(networkError.timestamp).toISOString(),
      ...(context?.duration && { duration: `${context.duration}ms` }),
      ...(context?.operation && { operation: context.operation }),
      ...(context?.config && { config: context.config })
    };
    
    console.error(`[${adapterName}] ${message}:`, logContext);
  }
  
  /**
   * Create error context for adapter operations
   * @param adapter Network method
   * @param operation Operation being performed
   * @param startTime Operation start time
   * @param config Optional configuration context
   * @returns ErrorContext object
   */
  static createContext(
    adapter: NetworkMethod, 
    operation: string, 
    startTime?: number,
    config?: any
  ): ErrorContext {
    return {
      adapter,
      operation,
      ...(startTime && { duration: Date.now() - startTime }),
      ...(config && { config })
    };
  }
  
  /**
   * Validate network configuration using centralized validation utilities
   * @param config Configuration object to validate
   * @param adapter Network method for context
   * @throws Error with detailed validation message
   */
  static validateConfig(config: any, adapter: NetworkMethod): void {
    const adapterName = adapter.toUpperCase();
    
    if (!config) {
      throw new Error(`${adapterName} configuration is required`);
    }
    
    if (!config.host || typeof config.host !== 'string' || config.host.trim() === '') {
      throw new Error(`${adapterName} host is required and must be a non-empty string`);
    }
    
    if (!config.port || typeof config.port !== 'number') {
      throw new Error(`${adapterName} port is required and must be a number`);
    }
    
    // Use centralized validation for host format
    if (!isValidHost(config.host)) {
      throw new Error(`${adapterName} ${getHostValidationError(config.host)}`);
    }
    
    // Use centralized validation for port range
    if (!isValidPort(config.port)) {
      throw new Error(`${adapterName} ${getPortValidationError(config.port)}`);
    }
  }
}

/**
 * Legacy compatibility functions for networkErrors.ts interface
 * Provides backward compatibility for existing code while centralizing logic
 */

/**
 * Categorizes network error - compatible with networkErrors.ts interface
 * @param error The caught error
 * @param adapter Adapter name or method identifier
 * @param duration Request duration in milliseconds (optional)
 * @param timeout Timeout threshold in milliseconds (optional)
 * @returns Categorized NetworkError
 */
export function categorizeNetworkError(
  error: Error, 
  adapter: NetworkMethod | string, 
  duration?: number, 
  _timeout?: number
): NetworkError {
  const context = NetworkErrorHandler.createContext(
    typeof adapter === 'string' ? adapter as NetworkMethod : adapter,
    'network operation',
    duration ? Date.now() - duration : undefined
  );
  
  return NetworkErrorHandler.categorizeError(error, context);
}

/**
 * Logs network error with consistent formatting
 * @param message Context message
 * @param error NetworkError details
 * @param logger Optional logger function (defaults to console.error)
 */
export function logNetworkError(
  message: string, 
  error: NetworkError, 
  _logger: (message: string, details: any) => void = console.error
): void {
  NetworkErrorHandler.logError(message, error);
}

/**
 * Creates a standardized network error
 * @param type Error type
 * @param message Error message
 * @param adapter Adapter identifier
 * @returns NetworkError object
 */
export function createNetworkError(
  type: NetworkError['type'], 
  message: string, 
  adapter: NetworkMethod | string
): NetworkError {
  return {
    type,
    message,
    adapter: typeof adapter === 'string' ? adapter as NetworkMethod : adapter,
    timestamp: Date.now()
  };
}