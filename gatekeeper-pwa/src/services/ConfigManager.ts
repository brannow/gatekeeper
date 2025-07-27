import type {
  AppConfig, 
  ExtendedConfigManagerInterface,
  ESP32Config, 
  MQTTConfig, 
  ValidationResult,
  GateState,
  NetworkOperationContext,
  ThemeMode
} from '../types';
import { 
  DEFAULT_STATE_MACHINE_CONFIG,
  type StateMachineConfig 
} from '../types/state-machine';
import {validationService} from './ValidationService';

/**
 * Configuration Manager Service
 * Handles Local Storage persistence with JSON serialization and validation
 * Phase 3: Enhanced with state machine configuration and error recovery
 * Follows network adapter patterns for consistent code style
 */
export class ConfigManager implements ExtendedConfigManagerInterface {
  private readonly storageKey = 'gatekeeper-config';
  private readonly stateStorageKey = 'gatekeeper-state';
  private readonly stateMachineConfigKey = 'gatekeeper-state-machine-config';
  private readonly configVersion = '2.0.0';
  
  /**
   * Default configuration values
   * Used when no saved configuration exists or on reset
   */
  private readonly defaultConfig: AppConfig = {
    esp32: {
      host: '',
      port: 80
    },
    mqtt: {
      host: '',
      port: 1883,
      username: '',
      password: '',
      ssl: false
    },
    theme: 'system',
    version: this.configVersion,
    lastModified: Date.now()
  };

  /**
   * Default state machine configuration
   * Used when no saved state machine config exists
   */
  private readonly defaultStateMachineConfig: StateMachineConfig = {
    ...DEFAULT_STATE_MACHINE_CONFIG
  };

  /**
   * Loads configuration from Local Storage
   * @returns Promise<AppConfig> - Complete configuration object
   */
  async loadConfig(): Promise<AppConfig> {
    try {
      const savedConfig = localStorage.getItem(this.storageKey);
      
      if (!savedConfig) {
        console.log('[ConfigManager] No saved configuration found, using defaults');
        return this.createFreshConfig();
      }

      const parsedConfig = JSON.parse(savedConfig) as Partial<AppConfig>;
      const validatedConfig = this.migrateAndValidateConfig(parsedConfig);
      
      console.log('[ConfigManager] Configuration loaded successfully');
      return validatedConfig;
    } catch (error) {
      console.error('[ConfigManager] Failed to load configuration:', error);
      console.log('[ConfigManager] Falling back to default configuration');
      return this.createFreshConfig();
    }
  }

  /**
   * Saves configuration to Local Storage
   * @param config Complete configuration object to save
   * @returns Promise<void>
   */
  async saveConfig(config: AppConfig, skipValidation: boolean = false): Promise<void> {
    try {
      let validationResult = null;
      
      if (!skipValidation) {
        validationResult = this.validateFullConfig(config);
        
        if (!validationResult.isValid) {
          const errorMessages = validationResult.errors.map(e => e.message).join(', ');
          console.warn(`[ConfigManager] Configuration validation warnings/errors: ${errorMessages}`);
        }
      }

      const configToSave: AppConfig = {
        ...config,
        version: this.configVersion,
        lastModified: Date.now()
      };

      const serializedConfig = JSON.stringify(configToSave, null, 2);
      localStorage.setItem(this.storageKey, serializedConfig);
      
      console.log('[ConfigManager] Configuration saved successfully');
      
      // Log warnings if any
      if (validationResult?.warnings && validationResult.warnings.length > 0) {
        validationResult.warnings.forEach((warning: any) => {
          console.warn(`[ConfigManager] Configuration warning: ${warning}`);
        });
      }
    } catch (error) {
      console.error('[ConfigManager] Failed to save configuration:', error);
      throw new Error(`Failed to save configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validates ESP32 configuration using centralized validation utilities
   * @param config Partial ESP32 configuration to validate
   * @returns ValidationResult with errors and warnings
   */
  validateESP32Config(config: Partial<ESP32Config>): ValidationResult {
    return validationService.validateESP32Config(config);
  }

  /**
   * Validates MQTT configuration using centralized validation utilities
   * @param config Partial MQTT configuration to validate
   * @returns ValidationResult with errors and warnings
   */
  validateMQTTConfig(config: Partial<MQTTConfig>): ValidationResult {
    return validationService.validateMQTTConfig(config);
  }

  /**
   * Validates theme configuration using centralized validation utilities
   * @param theme Theme mode to validate
   * @returns ValidationResult with errors and warnings
   */
  validateThemeConfig(theme: ThemeMode): ValidationResult {
    return validationService.validateThemeConfig(theme);
  }

  /**
   * Validates complete application configuration
   * @param config Partial application configuration to validate
   * @returns ValidationResult with errors and warnings
   */
  validateFullConfig(config: Partial<AppConfig>): ValidationResult {
    return validationService.validateFullConfig(config);
  }

  /**
   * Exports configuration as JSON string
   * @returns Promise<string> - Serialized configuration
   */
  async exportConfig(): Promise<string> {
    try {
      const config = await this.loadConfig();
      const exportData = {
        ...config,
        exportedAt: new Date().toISOString(),
        exportedBy: 'Gatekeeper PWA'
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('[ConfigManager] Failed to export configuration:', error);
      throw new Error('Failed to export configuration');
    }
  }

  /**
   * Imports configuration from JSON string
   * @param configJson JSON string containing configuration
   * @returns Promise<AppConfig> - Imported and validated configuration
   */
  async importConfig(configJson: string): Promise<AppConfig> {
    try {
      const parsedConfig = JSON.parse(configJson);
      
      // Extract core configuration, ignoring export metadata
      const coreConfig: Partial<AppConfig> = {
        esp32: parsedConfig.esp32,
        mqtt: parsedConfig.mqtt,
        theme: parsedConfig.theme,
        version: parsedConfig.version,
        lastModified: parsedConfig.lastModified
      };

      const validationResult = this.validateFullConfig(coreConfig);
      
      if (!validationResult.isValid) {
        const errorMessages = validationResult.errors.map(e => e.message).join(', ');
        console.warn(`[ConfigManager] Imported configuration has validation warnings/errors: ${errorMessages}`);
      }

      const importedConfig = this.migrateAndValidateConfig(coreConfig);
      await this.saveConfig(importedConfig);
      
      console.log('[ConfigManager] Configuration imported successfully');
      return importedConfig;
    } catch (error) {
      console.error('[ConfigManager] Failed to import configuration:', error);
      if (error instanceof SyntaxError) {
        console.error('[ConfigManager] Invalid JSON format:', error);
        throw new Error('Invalid JSON format');
      }
      console.error(`[ConfigManager] Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
      throw new Error(`Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Resets configuration to defaults
   * @returns Promise<AppConfig> - Default configuration
   */
  async resetToDefaults(): Promise<AppConfig> {
    try {
      const freshConfig = this.createFreshConfig();
      await this.saveConfig(freshConfig);
      
      // Also reset state machine configuration
      await this.saveStateMachineConfig(this.defaultStateMachineConfig);
      
      // Clear any saved state
      await this.clearState();
      
      console.log('[ConfigManager] Configuration reset to defaults');
      return freshConfig;
    } catch (error) {
      console.error('[ConfigManager] Failed to reset configuration:', error);
      throw new Error('Failed to reset configuration');
    }
  }

  /**
   * Load state machine configuration from Local Storage
   * @returns Promise<StateMachineConfig> - State machine configuration
   */
  async loadStateMachineConfig(): Promise<StateMachineConfig> {
    try {
      const savedConfig = localStorage.getItem(this.stateMachineConfigKey);
      
      if (!savedConfig) {
        console.log('[ConfigManager] No saved state machine configuration, using defaults');
        return { ...this.defaultStateMachineConfig };
      }

      const parsedConfig = JSON.parse(savedConfig) as Partial<StateMachineConfig>;
      const validatedConfig = this.validateStateMachineConfig(parsedConfig);
      
      console.log('[ConfigManager] State machine configuration loaded successfully');
      return validatedConfig;
    } catch (error) {
      console.error('[ConfigManager] Failed to load state machine configuration:', error);
      console.log('[ConfigManager] Falling back to default state machine configuration');
      return { ...this.defaultStateMachineConfig };
    }
  }

  /**
   * Save state machine configuration to Local Storage
   * @param config State machine configuration to save
   * @returns Promise<void>
   */
  async saveStateMachineConfig(config: StateMachineConfig): Promise<void> {
    try {
      const validatedConfig = this.validateStateMachineConfig(config);
      const serializedConfig = JSON.stringify(validatedConfig, null, 2);
      localStorage.setItem(this.stateMachineConfigKey, serializedConfig);
      
      console.log('[ConfigManager] State machine configuration saved successfully');
      
      // Log validation errors as warnings if any
      const validationResult = validationService.validateStateMachineConfig(config);
      if (!validationResult.isValid) {
        const errorMessages = validationResult.errors.map((e: any) => e.message).join(', ');
        console.warn(`[ConfigManager] State machine configuration validation warnings/errors: ${errorMessages}`);
      }
    } catch (error) {
      console.error('[ConfigManager] Failed to save state machine configuration:', error);
      throw new Error(`Failed to save state machine configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Save current gate state for recovery
   * @param state Current gate state
   * @param context Optional operation context
   */
  async saveState(state: GateState, context?: NetworkOperationContext): Promise<void> {
    try {
      const stateData = {
        state,
        context,
        timestamp: Date.now(),
        version: this.configVersion
      };
      
      const serializedState = JSON.stringify(stateData, null, 2);
      localStorage.setItem(this.stateStorageKey, serializedState);
      
      console.log(`[ConfigManager] State saved: ${state}`);
    } catch (error) {
      console.error('[ConfigManager] Failed to save state:', error);
      // Don't throw error for state saving to avoid disrupting operation
    }
  }

  /**
   * Load last saved state for recovery
   * @returns Promise<{state: GateState, context?: NetworkOperationContext} | null>
   */
  async loadState(): Promise<{state: GateState, context?: NetworkOperationContext} | null> {
    try {
      const savedState = localStorage.getItem(this.stateStorageKey);
      
      if (!savedState) {
        return null;
      }

      const parsedState = JSON.parse(savedState);
      
      // Validate state data structure
      if (!parsedState.state || !parsedState.timestamp) {
        console.warn('[ConfigManager] Invalid saved state structure, ignoring');
        return null;
      }

      // Check if state is too old (older than 5 minutes)
      const stateAge = Date.now() - parsedState.timestamp;
      if (stateAge > 5 * 60 * 1000) {
        console.log('[ConfigManager] Saved state is too old, ignoring');
        await this.clearState();
        return null;
      }
      
      console.log(`[ConfigManager] State loaded: ${parsedState.state}`);
      return {
        state: parsedState.state,
        context: parsedState.context
      };
    } catch (error) {
      console.error('[ConfigManager] Failed to load state:', error);
      return null;
    }
  }

  /**
   * Clear saved state
   */
  async clearState(): Promise<void> {
    try {
      localStorage.removeItem(this.stateStorageKey);
      console.log('[ConfigManager] Saved state cleared');
    } catch (error) {
      console.error('[ConfigManager] Failed to clear saved state:', error);
      // Don't throw error for state clearing
    }
  }


  /**
   * Export complete configuration including state machine settings
   * @returns Promise<string> - Serialized configuration with all settings
   */
  async exportFullConfig(): Promise<string> {
    try {
      const config = await this.loadConfig();
      const stateMachineConfig = await this.loadStateMachineConfig();
      
      const exportData = {
        ...config,
        stateMachine: stateMachineConfig,
        exportedAt: new Date().toISOString(),
        exportedBy: 'Gatekeeper PWA'
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('[ConfigManager] Failed to export full configuration:', error);
      throw new Error('Failed to export full configuration');
    }
  }

  /**
   * Import complete configuration including state machine settings
   * @param configJson JSON string containing complete configuration
   * @returns Promise<AppConfig> - Imported and validated configuration
   */
  async importFullConfig(configJson: string): Promise<AppConfig> {
    try {
      const parsedConfig = JSON.parse(configJson);
      
      // Import main configuration
      const coreConfig: Partial<AppConfig> = {
        esp32: parsedConfig.esp32,
        mqtt: parsedConfig.mqtt,
        theme: parsedConfig.theme,
        version: parsedConfig.version,
        lastModified: parsedConfig.lastModified
      };

      const validationResult = this.validateFullConfig(coreConfig);
      
      if (!validationResult.isValid) {
        const errorMessages = validationResult.errors.map(e => e.message).join(', ');
        console.warn(`[ConfigManager] Imported full configuration has validation warnings/errors: ${errorMessages}`);
      }

      const importedConfig = this.migrateAndValidateConfig(coreConfig);
      await this.saveConfig(importedConfig);
      
      // Import state machine configuration if present
      if (parsedConfig.stateMachine) {
        try {
          const stateMachineConfig = this.validateStateMachineConfig(parsedConfig.stateMachine);
          await this.saveStateMachineConfig(stateMachineConfig);
          console.log('[ConfigManager] State machine configuration imported successfully');
        } catch (smError) {
          console.warn('[ConfigManager] Failed to import state machine configuration, using defaults:', smError);
        }
      }
      
      console.log('[ConfigManager] Full configuration imported successfully');
      return importedConfig;
    } catch (error) {
      console.error('[ConfigManager] Failed to import full configuration:', error);
      if (error instanceof SyntaxError) {
        console.error('[ConfigManager] Invalid JSON format:', error);
        throw new Error('Invalid JSON format');
      }
      console.error(`[ConfigManager] Failed to import full configuration: ${error instanceof Error ? error.message : 'Unknown error'}`, error);
      throw new Error(`Failed to import full configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Creates a fresh configuration with current timestamp
   * @returns AppConfig - Fresh default configuration
   */
  private createFreshConfig(): AppConfig {
    return {
      ...this.defaultConfig,
      lastModified: Date.now()
    };
  }

  /**
   * Migrates and validates configuration from storage
   * @param config Partial configuration from storage
   * @returns AppConfig - Complete validated configuration
   */
  private migrateAndValidateConfig(config: Partial<AppConfig>): AppConfig {
    // Migrate configuration if needed (future versions)
    const migratedConfig = this.migrateConfig(config);
    
    // Merge with defaults to ensure all fields are present
    return {
      esp32: {
        ...this.defaultConfig.esp32,
        ...migratedConfig.esp32
      },
      mqtt: {
        ...this.defaultConfig.mqtt,
        ...migratedConfig.mqtt
      },
      theme: migratedConfig.theme || this.defaultConfig.theme,
      version: this.configVersion,
      lastModified: migratedConfig.lastModified || Date.now()
    };
  }

  /**
   * Migrates configuration between versions
   * @param config Configuration to migrate
   * @returns Partial<AppConfig> - Migrated configuration
   */
  private migrateConfig(config: Partial<AppConfig>): Partial<AppConfig> {
    // Version 1.0.0 -> 2.0.0: No structural changes to main config
    // State machine configuration is handled separately
    
    // Future migrations can be added here
    if (config.version === '1.0.0') {
      console.log('[ConfigManager] Migrating configuration from v1.0.0 to v2.0.0');
      // No changes needed for this migration
    }
    
    return config;
  }

  /**
   * Validates and normalizes state machine configuration
   * @param config State machine configuration to validate
   * @returns StateMachineConfig - Validated configuration
   */
  private validateStateMachineConfig(config: Partial<StateMachineConfig>): StateMachineConfig {
    const result: StateMachineConfig = { ...this.defaultStateMachineConfig };
    
    // Validate timeouts
    if (config.timeouts) {
      if (typeof config.timeouts.checkingNetwork === 'number' && config.timeouts.checkingNetwork > 0) {
        result.timeouts.checkingNetwork = Math.min(config.timeouts.checkingNetwork, 60000); // Max 60s
      }
      if (typeof config.timeouts.triggering === 'number' && config.timeouts.triggering > 0) {
        result.timeouts.triggering = Math.min(config.timeouts.triggering, 30000); // Max 30s
      }
      if (typeof config.timeouts.waitingForRelayClose === 'number' && config.timeouts.waitingForRelayClose > 0) {
        result.timeouts.waitingForRelayClose = Math.min(config.timeouts.waitingForRelayClose, 120000); // Max 2 minutes
      }
      if (typeof config.timeouts.errorRecovery === 'number' && config.timeouts.errorRecovery >= 0) {
        result.timeouts.errorRecovery = Math.min(config.timeouts.errorRecovery, 30000); // Max 30s
      }
    }
    
    // Validate retry configuration
    if (config.retry) {
      if (typeof config.retry.maxAttempts === 'number' && config.retry.maxAttempts >= 1) {
        result.retry.maxAttempts = Math.min(config.retry.maxAttempts, 10); // Max 10 attempts
      }
      if (typeof config.retry.backoffMultiplier === 'number' && config.retry.backoffMultiplier >= 1) {
        result.retry.backoffMultiplier = Math.min(config.retry.backoffMultiplier, 5); // Max 5x multiplier
      }
      if (typeof config.retry.baseDelay === 'number' && config.retry.baseDelay >= 100) {
        result.retry.baseDelay = Math.min(config.retry.baseDelay, 10000); // Max 10s base delay
      }
    }
    
    // Validate reachability configuration
    if (config.reachability) {
      if (typeof config.reachability.initialDelay === 'number' && config.reachability.initialDelay >= 0) {
        result.reachability.initialDelay = Math.min(config.reachability.initialDelay, 10000); // Max 10s
      }
      if (typeof config.reachability.checkInterval === 'number' && config.reachability.checkInterval >= 5000) {
        result.reachability.checkInterval = Math.min(config.reachability.checkInterval, 300000); // Max 5 minutes
      }
      if (typeof config.reachability.timeoutPerCheck === 'number' && config.reachability.timeoutPerCheck >= 1000) {
        result.reachability.timeoutPerCheck = Math.min(config.reachability.timeoutPerCheck, 15000); // Max 15s
      }
    }
    
    return result;
  }

  /**
   * Get current theme configuration
   * @returns Promise<ThemeMode> - Current theme setting
   */
  async getTheme(): Promise<ThemeMode> {
    try {
      const config = await this.loadConfig();
      return config.theme;
    } catch (error) {
      console.error('[ConfigManager] Failed to get theme:', error);
      return this.defaultConfig.theme;
    }
  }

  /**
   * Set theme configuration
   * @param theme Theme mode to set
   * @returns Promise<void>
   */
  async setTheme(theme: ThemeMode): Promise<void> {
    try {
      const validationResult = this.validateThemeConfig(theme);
      
      if (!validationResult.isValid) {
        const errorMessages = validationResult.errors.map(e => e.message).join(', ');
        console.warn(`[ConfigManager] Theme validation warnings/errors: ${errorMessages}`);
      }

      const config = await this.loadConfig();
      const updatedConfig = {
        ...config,
        theme,
        lastModified: Date.now()
      };
      
      await this.saveConfig(updatedConfig);
      console.log(`[ConfigManager] Theme updated to: ${theme}`);
      
      // Log warnings if any
      if (validationResult.warnings && validationResult.warnings.length > 0) {
        validationResult.warnings.forEach(warning => {
          console.warn(`[ConfigManager] Theme warning: ${warning}`);
        });
      }
    } catch (error) {
      console.error('[ConfigManager] Failed to set theme:', error);
      throw new Error(`Failed to set theme: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

}

// Export singleton instance
export const configManager = new ConfigManager();
