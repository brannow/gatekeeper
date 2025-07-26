/**
 * Centralized Validation Utilities
 * Single source of truth for all validation logic across the application
 * Used by ConfigManager, HttpAdapter, MqttAdapter, NetworkService, and UI components
 */

// VALIDATION CONSTANTS - Single source of truth for all regex patterns

/**
 * IPv4 address validation regex
 * Validates proper IPv4 format (0.0.0.0 to 255.255.255.255)
 */
export const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

/**
 * Hostname validation regex
 * Supports standard DNS hostname format with labels up to 63 characters
 */
export const HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/**
 * Combined IP or hostname validation regex
 * Used by HttpAdapter and MqttAdapter for backward compatibility
 */
export const IP_OR_HOSTNAME_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$|^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;

// VALIDATION FUNCTIONS

/**
 * Validates IPv4 address format
 * @param ip IP address string to validate
 * @returns boolean - True if valid IPv4 address
 */
export function isValidIPv4(ip: string): boolean {
  return IPV4_REGEX.test(ip.trim());
}

/**
 * Validates hostname format
 * @param hostname Hostname string to validate
 * @returns boolean - True if valid hostname
 */
export function isValidHostname(hostname: string): boolean {
  return HOSTNAME_REGEX.test(hostname.trim());
}

/**
 * Validates IP address or hostname using centralized regex
 * Used by ConfigManager, HttpAdapter, and MqttAdapter
 * @param host Host string to validate
 * @returns boolean - True if valid IP or hostname
 */
export function isValidHost(host: string): boolean {
  if (!host || host.trim() === '') {
    return false;
  }
  
  return IP_OR_HOSTNAME_REGEX.test(host.trim());
}

/**
 * Alternative validation using separate functions (for backward compatibility)
 * @param host Host string to validate
 * @returns boolean - True if valid IP or hostname
 */
export function isValidIPOrHostname(host: string): boolean {
  if (!host || host.trim() === '') {
    return false;
  }
  
  const trimmedHost = host.trim();
  return isValidIPv4(trimmedHost) || isValidHostname(trimmedHost);
}

/**
 * Port validation constants
 */
export const PORT_MIN = 1;
export const PORT_MAX = 65535;

/**
 * Validates port number range
 * @param port Port number to validate
 * @returns boolean - True if valid port (1-65535)
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX;
}

/**
 * Validates port string and converts to number
 * @param portString Port as string to validate and convert
 * @returns { isValid: boolean, port?: number } - Validation result with parsed port
 */
export function validatePortString(portString: string): { isValid: boolean; port?: number } {
  const port = parseInt(portString.trim(), 10);
  
  if (isNaN(port)) {
    return { isValid: false };
  }
  
  if (!isValidPort(port)) {
    return { isValid: false };
  }
  
  return { isValid: true, port };
}

/**
 * Gets user-friendly validation error message for host
 * @param host Host string that failed validation
 * @returns string - User-friendly error message
 */
export function getHostValidationError(host: string): string {
  if (!host || host.trim() === '') {
    return 'Host is required';
  }
  
  const trimmedHost = host.trim();
  
  if (trimmedHost.includes(' ')) {
    return 'Host cannot contain spaces';
  }
  
  if (trimmedHost.length > 253) {
    return 'Host is too long (maximum 253 characters)';
  }
  
  if (trimmedHost.startsWith('.') || trimmedHost.endsWith('.')) {
    return 'Host cannot start or end with a dot';
  }
  
  if (trimmedHost.includes('..')) {
    return 'Host cannot contain consecutive dots';
  }
  
  return 'Host must be a valid IP address or hostname';
}

/**
 * Gets user-friendly validation error message for port
 * @param port Port number that failed validation
 * @returns string - User-friendly error message
 */
export function getPortValidationError(port: number | string): string {
  if (typeof port === 'string') {
    const trimmed = port.trim();
    
    if (trimmed === '') {
      return 'Port is required';
    }
    
    if (isNaN(parseInt(trimmed, 10))) {
      return 'Port must be a number';
    }
    
    port = parseInt(trimmed, 10);
  }
  
  if (!Number.isInteger(port)) {
    return 'Port must be a whole number';
  }
  
  if (port < 1) {
    return 'Port must be at least 1';
  }
  
  if (port > 65535) {
    return 'Port cannot exceed 65535';
  }
  
  return 'Invalid port number';
}

/**
 * Suggests common ports based on service type
 * @returns Array of common port suggestions with descriptions
 */
export function getCommonPorts(): Array<{ port: number; description: string; type: 'esp32' | 'mqtt' }> {
  return [
    { port: 80, description: 'HTTP (Default)', type: 'esp32' },
    { port: 8080, description: 'HTTP Alternative', type: 'esp32' },
    { port: 3000, description: 'Development Server', type: 'esp32' },
    { port: 443, description: 'HTTPS', type: 'esp32' },
    { port: 1883, description: 'MQTT (Default)', type: 'mqtt' },
    { port: 8883, description: 'MQTT over SSL', type: 'mqtt' },
    { port: 443, description: 'MQTT over WSS', type: 'mqtt' },
    { port: 9001, description: 'MQTT WebSocket', type: 'mqtt' }
  ];
}

/**
 * Checks if a port is commonly used for a specific service
 * @param port Port number to check
 * @param serviceType Service type ('esp32' or 'mqtt')
 * @returns boolean - True if port is commonly used for the service
 */
export function isCommonPort(port: number, serviceType: 'esp32' | 'mqtt'): boolean {
  const commonPorts = getCommonPorts()
    .filter(p => p.type === serviceType)
    .map(p => p.port);
  
  return commonPorts.includes(port);
}

// LEGACY COMPATIBILITY FUNCTIONS
// These functions maintain backward compatibility with existing code

/**
 * Legacy alias for isValidHost() function
 * @deprecated Use isValidHost() for new code
 */
export const isValidHostLegacy = isValidHost;

/**
 * Legacy function name used by network adapter validation
 * @deprecated Use isValidPort() instead
 */
export function validatePortRange(port: number): boolean {
  return isValidPort(port);
}