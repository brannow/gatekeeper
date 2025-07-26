/**
 * Centralized error classification system for Gatekeeper PWA
 * Provides consistent error categorization, messaging, and recovery patterns
 */

import type { NetworkMethod } from './network';

/**
 * Error severity levels for consistent handling and UI presentation
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error recoverability classification for error handling strategies
 */
export type ErrorRecoverability = 'recoverable' | 'user-recoverable' | 'permanent';

/**
 * Standardized error categories with clear definitions
 */
export type ErrorCategory = 
  | 'network'      // Network connectivity issues (DNS, connection refused, etc.)
  | 'timeout'      // Request/operation timeouts
  | 'server'       // Server-side errors (4xx, 5xx HTTP responses)
  | 'config'       // Configuration validation errors
  | 'auth'         // Authentication/authorization errors
  | 'validation'   // Input validation errors
  | 'state'        // Invalid application state errors
  | 'unknown';     // Unclassified errors

/**
 * Comprehensive error codes for specific error identification
 */
export enum ErrorCode {
  // Network errors (NET_xxx)
  NET_CONNECTION_REFUSED = 'NET_CONNECTION_REFUSED',
  NET_CONNECTION_TIMEOUT = 'NET_CONNECTION_TIMEOUT',
  NET_DNS_RESOLUTION = 'NET_DNS_RESOLUTION',
  NET_UNREACHABLE = 'NET_UNREACHABLE',
  
  // Timeout errors (TIMEOUT_xxx)
  TIMEOUT_REQUEST = 'TIMEOUT_REQUEST',
  TIMEOUT_OPERATION = 'TIMEOUT_OPERATION',
  
  // Server errors (SERVER_xxx)
  SERVER_BAD_REQUEST = 'SERVER_BAD_REQUEST',
  SERVER_UNAUTHORIZED = 'SERVER_UNAUTHORIZED',
  SERVER_FORBIDDEN = 'SERVER_FORBIDDEN',
  SERVER_NOT_FOUND = 'SERVER_NOT_FOUND',
  SERVER_INTERNAL_ERROR = 'SERVER_INTERNAL_ERROR',
  SERVER_SERVICE_UNAVAILABLE = 'SERVER_SERVICE_UNAVAILABLE',
  
  // Configuration errors (CONFIG_xxx)
  CONFIG_INVALID_HOST = 'CONFIG_INVALID_HOST',
  CONFIG_INVALID_PORT = 'CONFIG_INVALID_PORT',
  CONFIG_MISSING_REQUIRED = 'CONFIG_MISSING_REQUIRED',
  CONFIG_INVALID_FORMAT = 'CONFIG_INVALID_FORMAT',
  
  // Authentication errors (AUTH_xxx)
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  
  // Validation errors (VALIDATION_xxx)
  VALIDATION_REQUIRED_FIELD = 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',
  VALIDATION_OUT_OF_RANGE = 'VALIDATION_OUT_OF_RANGE',
  
  // State errors (STATE_xxx)
  STATE_INVALID_TRANSITION = 'STATE_INVALID_TRANSITION',
  STATE_ADAPTER_NOT_INITIALIZED = 'STATE_ADAPTER_NOT_INITIALIZED',
  
  // Unknown errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Standardized error interface with comprehensive metadata
 */
export interface GatekeeperError {
  /** Unique error code for identification */
  code: ErrorCode;
  
  /** Error category for handling strategy */
  category: ErrorCategory;
  
  /** Error severity level */
  severity: ErrorSeverity;
  
  /** Whether the error can be recovered from */
  recoverability: ErrorRecoverability;
  
  /** Human-readable error message */
  message: string;
  
  /** Technical details for debugging */
  details?: string;
  
  /** User-friendly message for UI display */
  userMessage: string;
  
  /** Suggested recovery actions */
  recoveryActions?: string[];
  
  /** Source adapter or service that generated the error */
  source?: NetworkMethod | 'config' | 'validation' | 'state';
  
  /** Timestamp when error occurred */
  timestamp: number;
  
  /** Optional context data */
  context?: Record<string, any>;
  
  /** Optional underlying cause */
  cause?: Error;
}

/**
 * Error classification metadata for consistent categorization
 */
interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoverability: ErrorRecoverability;
  userMessage: string;
  recoveryActions?: string[];
}

/**
 * Error code to classification mapping
 */
const ERROR_CLASSIFICATIONS: Record<ErrorCode, ErrorClassification> = {
  // Network errors
  [ErrorCode.NET_CONNECTION_REFUSED]: {
    category: 'network',
    severity: 'high',
    recoverability: 'user-recoverable',
    userMessage: 'Cannot connect to device. Please check the device is powered on and network settings.',
    recoveryActions: ['Check device power', 'Verify network connection', 'Check IP address and port']
  },
  
  [ErrorCode.NET_CONNECTION_TIMEOUT]: {
    category: 'network',
    severity: 'medium',
    recoverability: 'recoverable',
    userMessage: 'Connection timed out. The device may be busy or network is slow.',
    recoveryActions: ['Try again', 'Check network speed', 'Verify device is responding']
  },
  
  [ErrorCode.NET_DNS_RESOLUTION]: {
    category: 'network',
    severity: 'medium',
    recoverability: 'user-recoverable',
    userMessage: 'Cannot find device hostname. Please check the hostname is correct.',
    recoveryActions: ['Verify hostname spelling', 'Try using IP address instead', 'Check DNS settings']
  },
  
  [ErrorCode.NET_UNREACHABLE]: {
    category: 'network',
    severity: 'high',
    recoverability: 'user-recoverable',
    userMessage: 'Device is not reachable. Please check network connectivity.',
    recoveryActions: ['Check device is on same network', 'Verify IP address', 'Check firewall settings']
  },
  
  // Timeout errors
  [ErrorCode.TIMEOUT_REQUEST]: {
    category: 'timeout',
    severity: 'medium',
    recoverability: 'recoverable',
    userMessage: 'Request timed out. The device may be processing or network is slow.',
    recoveryActions: ['Try again', 'Check device status', 'Verify network connection']
  },
  
  [ErrorCode.TIMEOUT_OPERATION]: {
    category: 'timeout',
    severity: 'medium',
    recoverability: 'recoverable',
    userMessage: 'Operation timed out. Please try again.',
    recoveryActions: ['Try again', 'Check device response time']
  },
  
  // Server errors
  [ErrorCode.SERVER_BAD_REQUEST]: {
    category: 'server',
    severity: 'medium',
    recoverability: 'permanent',
    userMessage: 'Invalid request sent to device. Please check configuration.',
    recoveryActions: ['Check device API documentation', 'Verify request format']
  },
  
  [ErrorCode.SERVER_UNAUTHORIZED]: {
    category: 'auth',
    severity: 'high',
    recoverability: 'user-recoverable',
    userMessage: 'Authentication required. Please check credentials.',
    recoveryActions: ['Verify username and password', 'Check authentication settings']
  },
  
  [ErrorCode.SERVER_FORBIDDEN]: {
    category: 'auth',
    severity: 'high',
    recoverability: 'user-recoverable',
    userMessage: 'Access denied. Please check permissions.',
    recoveryActions: ['Verify user permissions', 'Check device access controls']
  },
  
  [ErrorCode.SERVER_NOT_FOUND]: {
    category: 'server',
    severity: 'medium',
    recoverability: 'user-recoverable',
    userMessage: 'API endpoint not found. Please check device configuration.',
    recoveryActions: ['Verify device firmware version', 'Check API endpoints', 'Update device configuration']
  },
  
  [ErrorCode.SERVER_INTERNAL_ERROR]: {
    category: 'server',
    severity: 'high',
    recoverability: 'recoverable',
    userMessage: 'Device error occurred. Please try again or restart device.',
    recoveryActions: ['Try again', 'Restart device', 'Check device logs']
  },
  
  [ErrorCode.SERVER_SERVICE_UNAVAILABLE]: {
    category: 'server',
    severity: 'high',
    recoverability: 'recoverable',
    userMessage: 'Device service unavailable. Please try again later.',
    recoveryActions: ['Try again later', 'Check device status', 'Restart device if needed']
  },
  
  // Configuration errors
  [ErrorCode.CONFIG_INVALID_HOST]: {
    category: 'config',
    severity: 'medium',
    recoverability: 'user-recoverable',
    userMessage: 'Invalid hostname or IP address format.',
    recoveryActions: ['Use valid IP address (e.g., 192.168.1.100)', 'Use valid hostname (e.g., gateway.local)']
  },
  
  [ErrorCode.CONFIG_INVALID_PORT]: {
    category: 'config',
    severity: 'medium',
    recoverability: 'user-recoverable',
    userMessage: 'Invalid port number. Must be between 1 and 65535.',
    recoveryActions: ['Use port between 1-65535', 'Common ports: 80 (HTTP), 443 (HTTPS), 1883 (MQTT)']
  },
  
  [ErrorCode.CONFIG_MISSING_REQUIRED]: {
    category: 'config',
    severity: 'medium',
    recoverability: 'user-recoverable',
    userMessage: 'Required configuration field is missing.',
    recoveryActions: ['Fill in all required fields', 'Check configuration completeness']
  },
  
  [ErrorCode.CONFIG_INVALID_FORMAT]: {
    category: 'config',
    severity: 'medium',
    recoverability: 'user-recoverable',
    userMessage: 'Configuration format is invalid.',
    recoveryActions: ['Check field format requirements', 'Use valid values']
  },
  
  // Authentication errors
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: {
    category: 'auth',
    severity: 'medium',
    recoverability: 'user-recoverable',
    userMessage: 'Invalid username or password.',
    recoveryActions: ['Check username and password', 'Verify credentials are correct']
  },
  
  [ErrorCode.AUTH_TOKEN_EXPIRED]: {
    category: 'auth',
    severity: 'medium',
    recoverability: 'recoverable',
    userMessage: 'Authentication session expired. Please reconnect.',
    recoveryActions: ['Reconnect to service', 'Check authentication settings']
  },
  
  // Validation errors
  [ErrorCode.VALIDATION_REQUIRED_FIELD]: {
    category: 'validation',
    severity: 'low',
    recoverability: 'user-recoverable',
    userMessage: 'Required field is empty.',
    recoveryActions: ['Fill in the required field']
  },
  
  [ErrorCode.VALIDATION_INVALID_FORMAT]: {
    category: 'validation',
    severity: 'low',
    recoverability: 'user-recoverable',
    userMessage: 'Field format is invalid.',
    recoveryActions: ['Check field format requirements']
  },
  
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: {
    category: 'validation',
    severity: 'low',
    recoverability: 'user-recoverable',
    userMessage: 'Value is outside allowed range.',
    recoveryActions: ['Use value within allowed range']
  },
  
  // State errors
  [ErrorCode.STATE_INVALID_TRANSITION]: {
    category: 'state',
    severity: 'medium',
    recoverability: 'recoverable',
    userMessage: 'Invalid operation for current state.',
    recoveryActions: ['Wait for current operation to complete', 'Reset application state']
  },
  
  [ErrorCode.STATE_ADAPTER_NOT_INITIALIZED]: {
    category: 'state',
    severity: 'high',
    recoverability: 'recoverable',
    userMessage: 'Network adapter not properly initialized.',
    recoveryActions: ['Restart application', 'Check configuration', 'Reinitialize adapters']
  },
  
  // Unknown errors
  [ErrorCode.UNKNOWN_ERROR]: {
    category: 'unknown',
    severity: 'medium',
    recoverability: 'recoverable',
    userMessage: 'An unexpected error occurred.',
    recoveryActions: ['Try again', 'Restart application if problem persists']
  }
};

/**
 * Error factory for creating standardized GatekeeperError instances
 */
export class GatekeeperErrorFactory {
  /**
   * Creates a GatekeeperError with proper classification
   * @param code Error code
   * @param message Technical error message
   * @param details Optional technical details
   * @param source Optional error source
   * @param context Optional context data
   * @param cause Optional underlying cause
   * @returns Properly classified GatekeeperError
   */
  static create(
    code: ErrorCode,
    message: string,
    details?: string,
    source?: NetworkMethod | 'config' | 'validation' | 'state',
    context?: Record<string, any>,
    cause?: Error
  ): GatekeeperError {
    const classification = ERROR_CLASSIFICATIONS[code];
    
    return {
      code,
      category: classification.category,
      severity: classification.severity,
      recoverability: classification.recoverability,
      message,
      details,
      userMessage: classification.userMessage,
      recoveryActions: classification.recoveryActions,
      source,
      timestamp: Date.now(),
      context,
      cause
    };
  }
  
  /**
   * Creates error from HTTP response
   * @param status HTTP status code
   * @param statusText HTTP status text
   * @param source Network adapter source
   * @param context Optional context
   * @returns Classified GatekeeperError
   */
  static fromHttpResponse(
    status: number,
    statusText: string,
    source: NetworkMethod,
    context?: Record<string, any>
  ): GatekeeperError {
    let code: ErrorCode;
    
    switch (status) {
      case 400:
        code = ErrorCode.SERVER_BAD_REQUEST;
        break;
      case 401:
        code = ErrorCode.SERVER_UNAUTHORIZED;
        break;
      case 403:
        code = ErrorCode.SERVER_FORBIDDEN;
        break;
      case 404:
        code = ErrorCode.SERVER_NOT_FOUND;
        break;
      case 500:
        code = ErrorCode.SERVER_INTERNAL_ERROR;
        break;
      case 503:
        code = ErrorCode.SERVER_SERVICE_UNAVAILABLE;
        break;
      default:
        code = ErrorCode.UNKNOWN_ERROR;
    }
    
    return this.create(
      code,
      `HTTP ${status}: ${statusText}`,
      `Server responded with status ${status}`,
      source,
      { httpStatus: status, statusText, ...context }
    );
  }
  
  /**
   * Creates error from network exception
   * @param error Original error
   * @param source Network adapter source
   * @param duration Optional operation duration
   * @param context Optional context
   * @returns Classified GatekeeperError
   */
  static fromNetworkError(
    error: Error,
    source: NetworkMethod,
    duration?: number,
    context?: Record<string, any>
  ): GatekeeperError {
    let code: ErrorCode;
    
    // Timeout detection
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      code = ErrorCode.TIMEOUT_REQUEST;
    }
    // Connection refused
    else if (error.message.includes('connection refused') || error.message.includes('ECONNREFUSED')) {
      code = ErrorCode.NET_CONNECTION_REFUSED;
    }
    // DNS resolution
    else if (error.message.includes('ENOTFOUND') || error.message.includes('DNS')) {
      code = ErrorCode.NET_DNS_RESOLUTION;
    }
    // Network unreachable
    else if (error.message.includes('ENETUNREACH') || error.message.includes('unreachable')) {
      code = ErrorCode.NET_UNREACHABLE;
    }
    // Generic network error
    else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      code = ErrorCode.NET_CONNECTION_REFUSED;
    }
    else {
      code = ErrorCode.UNKNOWN_ERROR;
    }
    
    return this.create(
      code,
      error.message,
      error.stack,
      source,
      { duration, originalErrorName: error.name, ...context },
      error
    );
  }
  
  /**
   * Creates validation error
   * @param field Field that failed validation
   * @param message Validation error message  
   * @param value Invalid value
   * @returns Classified GatekeeperError
   */
  static fromValidationError(
    field: string,
    message: string,
    value?: any
  ): GatekeeperError {
    let code: ErrorCode;
    
    if (message.includes('required')) {
      code = ErrorCode.VALIDATION_REQUIRED_FIELD;
    } else if (message.includes('format')) {
      code = ErrorCode.VALIDATION_INVALID_FORMAT;
    } else if (message.includes('range') || message.includes('between')) {
      code = ErrorCode.VALIDATION_OUT_OF_RANGE;
    } else {
      code = ErrorCode.VALIDATION_INVALID_FORMAT;
    }
    
    return this.create(
      code,
      message,
      `Validation failed for field: ${field}`,
      'validation',
      { field, value }
    );
  }
  
  /**
   * Creates configuration error
   * @param field Configuration field
   * @param message Error message
   * @param value Invalid value
   * @returns Classified GatekeeperError
   */
  static fromConfigError(
    field: string,
    message: string,
    value?: any
  ): GatekeeperError {
    let code: ErrorCode;
    
    if (field.includes('host')) {
      code = ErrorCode.CONFIG_INVALID_HOST;
    } else if (field.includes('port')) {
      code = ErrorCode.CONFIG_INVALID_PORT;
    } else if (message.includes('required')) {
      code = ErrorCode.CONFIG_MISSING_REQUIRED;
    } else {
      code = ErrorCode.CONFIG_INVALID_FORMAT;
    }
    
    return this.create(
      code,
      message,
      `Configuration error in field: ${field}`,
      'config',
      { field, value }
    );
  }
}

/**
 * Error severity checker utilities
 */
export class ErrorSeverityChecker {
  static isCritical(error: GatekeeperError): boolean {
    return error.severity === 'critical';
  }
  
  static isHigh(error: GatekeeperError): boolean {
    return error.severity === 'high';
  }
  
  static requiresUserAction(error: GatekeeperError): boolean {
    return error.recoverability === 'user-recoverable';
  }
  
  static isRecoverable(error: GatekeeperError): boolean {
    return error.recoverability !== 'permanent';
  }
  
  static shouldRetry(error: GatekeeperError): boolean {
    return error.recoverability === 'recoverable' && 
           (error.category === 'timeout' || error.category === 'network');
  }
}

/**
 * Backward compatibility - maps old NetworkError to new GatekeeperError
 * TODO: Remove after migration is complete
 */
export interface NetworkError {
  type: 'timeout' | 'network' | 'server' | 'config';
  message: string;
  adapter?: NetworkMethod;
  timestamp: number;
}

/**
 * Utility to convert old NetworkError to new GatekeeperError
 * @param networkError Old NetworkError
 * @returns New GatekeeperError
 */
export function migrateNetworkError(networkError: NetworkError): GatekeeperError {
  let code: ErrorCode;
  
  switch (networkError.type) {
    case 'timeout':
      code = ErrorCode.TIMEOUT_REQUEST;
      break;
    case 'network':
      code = ErrorCode.NET_CONNECTION_REFUSED;
      break;
    case 'server':
      code = ErrorCode.SERVER_INTERNAL_ERROR;
      break;
    case 'config':
      code = ErrorCode.CONFIG_INVALID_FORMAT;
      break;
    default:
      code = ErrorCode.UNKNOWN_ERROR;
  }
  
  return GatekeeperErrorFactory.create(
    code,
    networkError.message,
    undefined,
    networkError.adapter,
    { 
      migratedFrom: 'NetworkError',
      originalType: networkError.type,
      originalTimestamp: networkError.timestamp
    }
  );
}