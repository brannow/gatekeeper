import type { 
  ESP32Config, 
  MQTTConfig, 
  AppConfig, 
  ValidationResult, 
  ValidationError,
  ThemeMode 
} from '../types';
import type { StateMachineConfig } from '../types/state-machine';
import { 
  isValidHost, 
  isValidPort, 
  getHostValidationError, 
  getPortValidationError,
  isCommonPort 
} from '../utils/validation';

/**
 * Centralized Configuration Validation Service
 * Provides consistent validation logic across all layers of the application
 * Implements "collect all errors" strategy for comprehensive user feedback
 */
export class ValidationService {
  /**
   * Validates ESP32 configuration with comprehensive error collection
   * @param config Partial ESP32 configuration to validate
   * @returns ValidationResult with all errors and warnings
   */
  validateESP32Config(config: Partial<ESP32Config>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Validate host (optional for saving, but if provided must be valid)
    if (config.host && config.host.trim() !== '') {
      const trimmedHost = config.host.trim();
      if (!isValidHost(trimmedHost)) {
        errors.push({
          field: 'host',
          message: getHostValidationError(trimmedHost),
          code: 'format'
        });
      }
    } else {
      warnings.push('ESP32 host is empty. Configuration will not be active for HTTP.');
    }

    // Validate port
    if (config.host && config.host.trim() !== '') { // Only require port if host is provided
      if (config.port === undefined || config.port === null) {
        errors.push({
          field: 'port',
          message: 'ESP32 port is required when host is provided',
          code: 'required'
        });
      } else if (!isValidPort(config.port)) {
        errors.push({
          field: 'port',
          message: getPortValidationError(config.port),
          code: 'range'
        });
      } else {
        // Warn about non-standard HTTP ports
        if (!isCommonPort(config.port, 'esp32')) {
          warnings.push(`Port ${config.port} is not a common HTTP port (80, 8080, 3000, 443)`);
        }
      }
    } else if (config.port !== undefined && config.port !== null && !isValidPort(config.port)) {
      // If host is not provided, but an invalid port is, warn about it
      warnings.push(`ESP32 port is invalid: ${getPortValidationError(config.port)}. Configuration will not be active for HTTP.`);
    } else if (config.port !== undefined && config.port !== null) {
      // If host is not provided, but a valid port is, warn about it
      warnings.push(`ESP32 port is provided without a host. Configuration will not be active for HTTP.`);
    } else {
      warnings.push('ESP32 port is empty. Configuration will not be active for HTTP.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates MQTT configuration with comprehensive error collection
   * @param config Partial MQTT configuration to validate
   * @returns ValidationResult with all errors and warnings
   */
  validateMQTTConfig(config: Partial<MQTTConfig>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Host validation (optional for MQTT, but if provided must be valid)
    if (config.host && config.host.trim() !== '') {
      const trimmedHost = config.host.trim();
      if (!isValidHost(trimmedHost)) {
        errors.push({
          field: 'host',
          message: getHostValidationError(trimmedHost),
          code: 'format'
        });
      }
    }

    // Port validation (optional, but if provided must be valid)
    if (config.port !== undefined && config.port !== null) {
      if (!isValidPort(config.port)) {
        errors.push({
          field: 'port',
          message: getPortValidationError(config.port),
          code: 'range'
        });
      } else {
        // Check SSL/port combinations and warn about non-standard ports
        if (config.ssl === true) {
          if (config.port !== 8883 && config.port !== 443) {
            warnings.push(`Port ${config.port} is not typical for MQTT over SSL (8883, 443)`);
          }
        } else if (config.ssl === false) {
          if (config.port !== 1883) {
            warnings.push(`Port ${config.port} is not typical for MQTT (1883)`);
          }
        }
      }
    }

    // Username validation (optional, but if provided must not be empty)
    if (config.username !== undefined && config.username !== null) {
      if (config.username.trim() === '') {
        warnings.push('MQTT username is empty. Authentication may fail.');
      }
    }

    // Password validation (warn if username provided without password)
    if (config.username && config.username.trim() !== '' && (!config.password || config.password.trim() === '')) {
      warnings.push('MQTT username provided without password - this may cause authentication issues');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates theme configuration with comprehensive error collection
   * @param theme Theme mode to validate
   * @returns ValidationResult with all errors and warnings
   */
  validateThemeConfig(theme: ThemeMode): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Validate theme value
    if (!theme) {
      errors.push({
        field: 'theme',
        message: 'Theme mode is required',
        code: 'required'
      });
    } else {
      const validThemes: ThemeMode[] = ['bright', 'dark', 'system'];
      if (!validThemes.includes(theme)) {
        errors.push({
          field: 'theme',
          message: 'Theme mode must be one of: bright, dark, system',
          code: 'format'
        });
      }
      
      // Optional warning about system theme
      if (theme === 'system') {
        warnings.push('System theme will follow device dark mode preference - may change automatically');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates complete application configuration
   * @param config Partial application configuration to validate
   * @returns ValidationResult with all errors and warnings from all sections
   */
  validateFullConfig(config: Partial<AppConfig>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Validate ESP32 configuration
    const esp32Result = this.validateESP32Config(config.esp32 || {});
    errors.push(...esp32Result.errors);
    if (esp32Result.warnings) {
      warnings.push(...esp32Result.warnings);
    }

    // Validate MQTT configuration (optional)
    if (config.mqtt) {
      const mqttResult = this.validateMQTTConfig(config.mqtt);
      errors.push(...mqttResult.errors);
      if (mqttResult.warnings) {
        warnings.push(...mqttResult.warnings);
      }
    }

    // Validate theme configuration (optional, but if provided must be valid)
    if (config.theme !== undefined) {
      const themeResult = this.validateThemeConfig(config.theme);
      errors.push(...themeResult.errors);
      if (themeResult.warnings) {
        warnings.push(...themeResult.warnings);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates state machine configuration with comprehensive error collection
   * @param config Partial state machine configuration to validate
   * @returns ValidationResult with all errors and warnings
   */
  validateStateMachineConfig(config: Partial<StateMachineConfig>): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // Validate timeouts
    if (config.timeouts) {
      // Validate checkingNetwork timeout
      if (config.timeouts.checkingNetwork !== undefined) {
        if (typeof config.timeouts.checkingNetwork !== 'number' || config.timeouts.checkingNetwork <= 0) {
          errors.push({
            field: 'host' as keyof ESP32Config, // Using host as placeholder field
            message: 'Checking network timeout must be a positive number',
            code: 'range'
          });
        } else if (config.timeouts.checkingNetwork > 60000) {
          warnings.push('Checking network timeout is very high (>60s) - may impact user experience');
        } else if (config.timeouts.checkingNetwork < 1000) {
          warnings.push('Checking network timeout is very low (<1s) - may cause premature timeouts');
        }
      }

      // Validate triggering timeout
      if (config.timeouts.triggering !== undefined) {
        if (typeof config.timeouts.triggering !== 'number' || config.timeouts.triggering <= 0) {
          errors.push({
            field: 'host' as keyof ESP32Config,
            message: 'Triggering timeout must be a positive number',
            code: 'range'
          });
        } else if (config.timeouts.triggering > 30000) {
          warnings.push('Triggering timeout is very high (>30s) - may impact user experience');
        } else if (config.timeouts.triggering < 1000) {
          warnings.push('Triggering timeout is very low (<1s) - may cause premature timeouts');
        }
      }

      // Validate waitingForRelayClose timeout
      if (config.timeouts.waitingForRelayClose !== undefined) {
        if (typeof config.timeouts.waitingForRelayClose !== 'number' || config.timeouts.waitingForRelayClose <= 0) {
          errors.push({
            field: 'host' as keyof ESP32Config,
            message: 'Waiting for relay close timeout must be a positive number',
            code: 'range'
          });
        } else if (config.timeouts.waitingForRelayClose > 120000) {
          warnings.push('Waiting for relay close timeout is very high (>2min) - may impact user experience');
        } else if (config.timeouts.waitingForRelayClose < 2000) {
          warnings.push('Waiting for relay close timeout is very low (<2s) - may not allow relay to complete');
        }
      }

      // Validate errorRecovery timeout
      if (config.timeouts.errorRecovery !== undefined) {
        if (typeof config.timeouts.errorRecovery !== 'number' || config.timeouts.errorRecovery < 0) {
          errors.push({
            field: 'host' as keyof ESP32Config,
            message: 'Error recovery timeout must be a non-negative number',
            code: 'range'
          });
        } else if (config.timeouts.errorRecovery > 30000) {
          warnings.push('Error recovery timeout is very high (>30s) - may delay error recovery');
        }
      }
    }

    // Validate retry configuration
    if (config.retry) {
      // Validate maxAttempts
      if (config.retry.maxAttempts !== undefined) {
        if (typeof config.retry.maxAttempts !== 'number' || config.retry.maxAttempts < 1 || !Number.isInteger(config.retry.maxAttempts)) {
          errors.push({
            field: 'host' as keyof ESP32Config,
            message: 'Max retry attempts must be a positive integer',
            code: 'range'
          });
        } else if (config.retry.maxAttempts > 10) {
          warnings.push('Max retry attempts is very high (>10) - may cause excessive delays');
        }
      }

      // Validate backoffMultiplier
      if (config.retry.backoffMultiplier !== undefined) {
        if (typeof config.retry.backoffMultiplier !== 'number' || config.retry.backoffMultiplier < 1) {
          errors.push({
            field: 'host' as keyof ESP32Config,
            message: 'Backoff multiplier must be a number >= 1',
            code: 'range'
          });
        } else if (config.retry.backoffMultiplier > 5) {
          warnings.push('Backoff multiplier is very high (>5) - may cause excessive delays');
        }
      }

      // Validate baseDelay
      if (config.retry.baseDelay !== undefined) {
        if (typeof config.retry.baseDelay !== 'number' || config.retry.baseDelay < 100) {
          errors.push({
            field: 'host' as keyof ESP32Config,
            message: 'Base retry delay must be at least 100ms',
            code: 'range'
          });
        } else if (config.retry.baseDelay > 10000) {
          warnings.push('Base retry delay is very high (>10s) - may cause long delays');
        }
      }
    }

    // Validate reachability configuration
    if (config.reachability) {
      // Validate initialDelay
      if (config.reachability.initialDelay !== undefined) {
        if (typeof config.reachability.initialDelay !== 'number' || config.reachability.initialDelay < 0) {
          errors.push({
            field: 'host' as keyof ESP32Config,
            message: 'Initial reachability delay must be non-negative',
            code: 'range'
          });
        } else if (config.reachability.initialDelay > 10000) {
          warnings.push('Initial reachability delay is very high (>10s) - may delay startup');
        }
      }

      // Validate checkInterval
      if (config.reachability.checkInterval !== undefined) {
        if (typeof config.reachability.checkInterval !== 'number' || config.reachability.checkInterval < 5000) {
          errors.push({
            field: 'host' as keyof ESP32Config,
            message: 'Reachability check interval must be at least 5 seconds',
            code: 'range'
          });
        } else if (config.reachability.checkInterval > 300000) {
          warnings.push('Reachability check interval is very high (>5min) - may miss connectivity changes');
        } else if (config.reachability.checkInterval < 15000) {
          warnings.push('Reachability check interval is quite frequent (<15s) - may impact performance');
        }
      }

      // Validate timeoutPerCheck
      if (config.reachability.timeoutPerCheck !== undefined) {
        if (typeof config.reachability.timeoutPerCheck !== 'number' || config.reachability.timeoutPerCheck < 1000) {
          errors.push({
            field: 'host' as keyof ESP32Config,
            message: 'Reachability timeout per check must be at least 1 second',
            code: 'range'
          });
        } else if (config.reachability.timeoutPerCheck > 15000) {
          warnings.push('Reachability timeout per check is very high (>15s) - may delay state transitions');
        } else if (config.reachability.timeoutPerCheck < 2000) {
          warnings.push('Reachability timeout per check is quite low (<2s) - may cause false negatives');
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Validates state machine configuration and throws on first error (fail-fast mode)
   * Used by timeout managers and state machine services
   * @param config State machine configuration to validate
   * @throws Error with validation message if invalid
   */
  validateStateMachineConfigStrict(config: Partial<StateMachineConfig>): void {
    const result = this.validateStateMachineConfig(config);
    
    if (!result.isValid && result.errors.length > 0) {
      // Throw with the first error message for immediate feedback
      throw new Error(result.errors[0].message);
    }
  }

  /**
   * Validates ESP32 configuration and throws on first error (fail-fast mode)
   * Used by network services that need immediate error feedback
   * @param config ESP32 configuration to validate
   * @throws Error with validation message if invalid
   */
  validateESP32ConfigStrict(config: Partial<ESP32Config>): void {
    const result = this.validateESP32Config(config);
    
    if (!result.isValid && result.errors.length > 0) {
      // Throw with the first error message for immediate feedback
      throw new Error(result.errors[0].message);
    }
  }

  /**
   * Validates MQTT configuration and throws on first error (fail-fast mode)
   * Used by network services that need immediate error feedback
   * @param config MQTT configuration to validate
   * @throws Error with validation message if invalid
   */
  validateMQTTConfigStrict(config: Partial<MQTTConfig>): void {
    const result = this.validateMQTTConfig(config);
    
    if (!result.isValid && result.errors.length > 0) {
      // Throw with the first error message for immediate feedback
      throw new Error(result.errors[0].message);
    }
  }

  /**
   * Validates theme configuration and throws on first error (fail-fast mode)
   * Used by services that need immediate error feedback
   * @param theme Theme configuration to validate
   * @throws Error with validation message if invalid
   */
  validateThemeConfigStrict(theme: ThemeMode): void {
    const result = this.validateThemeConfig(theme);
    
    if (!result.isValid && result.errors.length > 0) {
      // Throw with the first error message for immediate feedback
      throw new Error(result.errors[0].message);
    }
  }

  /**
   * Creates a user-friendly error message from validation errors
   * Useful for displaying multiple validation errors in UI
   * @param errors Array of validation errors
   * @returns Formatted error message string
   */
  formatValidationErrors(errors: ValidationError[]): string {
    if (errors.length === 0) {
      return '';
    }
    
    if (errors.length === 1) {
      return errors[0].message;
    }
    
    return errors.map(error => error.message).join('; ');
  }

  /**
   * Creates a user-friendly warning message from validation warnings
   * Useful for displaying validation warnings in UI
   * @param warnings Array of warning messages
   * @returns Formatted warning message string
   */
  formatValidationWarnings(warnings: string[]): string {
    if (warnings.length === 0) {
      return '';
    }
    
    if (warnings.length === 1) {
      return warnings[0];
    }
    
    return warnings.join('; ');
  }

  /**
   * Checks if a configuration has any validation issues (errors or warnings)
   * @param result ValidationResult to check
   * @returns true if there are any validation issues
   */
  hasValidationIssues(result: ValidationResult): boolean {
    return !result.isValid || (result.warnings && result.warnings.length > 0) || false;
  }

  /**
   * Gets validation error for a specific field
   * @param result ValidationResult to search
   * @param field Field name to find error for
   * @returns ValidationError if found, undefined otherwise
   */
  getFieldError(result: ValidationResult, field: string): ValidationError | undefined {
    return result.errors.find(error => error.field === field);
  }

  /**
   * Gets validation error message for a specific field
   * @param result ValidationResult to search
   * @param field Field name to find error message for
   * @returns Error message if found, undefined otherwise
   */
  getFieldErrorMessage(result: ValidationResult, field: string): string | undefined {
    const error = this.getFieldError(result, field);
    return error?.message;
  }
}

// Export singleton instance for consistent usage across the application
export const validationService = new ValidationService();