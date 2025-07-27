import { useState, useEffect, useCallback, useMemo } from 'react';
import type { 
  AppConfig, 
  ESP32Config, 
  MQTTConfig, 
  ConfigHookInterface, 
  ValidationResult,
  OfflineStatus,
  PWAInstallStatus,
  ThemeMode
} from '../types';
import { configManager } from '../services/ConfigManager';

/**
 * Simplified configuration hook interface (Phase 1)
 * Focuses on config persistence, validation, and PWA features
 * Removed network service integration for clean separation
 */
export interface SimplifiedConfigHookInterface extends ConfigHookInterface {
  // PWA support
  offlineStatus: OfflineStatus;
  installStatus: PWAInstallStatus;
  queueSize: number;
  canInstall: boolean;
  showInstallPrompt: () => Promise<boolean>;
  queueGateTrigger: (config: ESP32Config | MQTTConfig) => Promise<string>;
  processOfflineQueue: () => Promise<void>;
  clearOfflineQueue: () => Promise<void>;
  
  // Simple online status for gate control
  isOnline: boolean;
}

/**
 * Simplified configuration hook for state management (Phase 1)
 * Focuses on config persistence, validation, and PWA features
 * Removed network service integration for clean separation
 * Provides reactive configuration state with validation and persistence
 */
export function useConfig(): SimplifiedConfigHookInterface {
  const [config, setConfig] = useState<AppConfig>({
    esp32: {
      host: '',
      port: 80,
      reachabilityStatus: 'unknown'
    },
    mqtt: {
      host: '',
      port: 1883,
      username: '',
      password: '',
      ssl: false,
      reachabilityStatus: 'unknown'
    },
    theme: 'system',
    version: '2.0.0',
    lastModified: Date.now()
  });
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  
  // PWA state (Phase 4)
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>('checking');
  const [installStatus, setInstallStatus] = useState<PWAInstallStatus>('unknown');
  const [queueSize, setQueueSize] = useState<number>(0);
  const [canInstall, setCanInstall] = useState<boolean>(false);

  /**
   * Apply theme to DOM when config theme changes
   * Simplified theme application with system preference detection
   */
  useEffect(() => {
    // Skip during initial loading
    if (loading) return;
    
    const applyThemeToDOM = (theme: ThemeMode) => {
      if (typeof document === 'undefined') return;

      const root = document.documentElement;
      
      // Determine resolved theme
      let resolvedTheme: 'bright' | 'dark' = 'bright';
      
      if (theme === 'system') {
        // Detect system preference
        if (typeof window !== 'undefined' && window.matchMedia) {
          const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          resolvedTheme = isDark ? 'dark' : 'bright';
        }
      } else {
        resolvedTheme = theme;
      }
      
      // Remove existing theme classes
      root.classList.remove('theme-bright', 'theme-dark');
      
      // Add new theme class
      root.classList.add(`theme-${resolvedTheme}`);
      
      // Set data attribute for CSS custom properties
      root.setAttribute('data-theme', resolvedTheme);
      
      console.log(`[useConfig] Applied theme to DOM: ${theme} (resolved: ${resolvedTheme})`);
    };
    
    const handleSystemPreferenceChange = () => {
      // Only re-apply if using system theme
      if (config.theme === 'system') {
        applyThemeToDOM(config.theme);
      }
    };
    
    // Apply current theme
    applyThemeToDOM(config.theme);
    
    // Listen for system preference changes
    if (typeof window !== 'undefined' && window.matchMedia && config.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleSystemPreferenceChange);
      } else {
        // Fallback for older browsers
        mediaQuery.addListener(handleSystemPreferenceChange);
      }
      
      return () => {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleSystemPreferenceChange);
        } else {
          mediaQuery.removeListener(handleSystemPreferenceChange);
        }
      };
    }
  }, [config.theme, loading]);

  /**
   * Initialize PWA services
   * Phase 4: Initialize offline and install services
   */
  useEffect(() => {
    let mounted = true;
    
    const initializePWAServices = async () => {
      try {
        // Import PWA services dynamically
        const [{ offlineService }, { installService }] = await Promise.all([
          import('../services/OfflineService'),
          import('../services/InstallService')
        ]);
        
        if (!mounted) return;
        
        // Set up offline service delegate
        offlineService.delegate = {
          onOfflineStatusChanged: (isOffline: boolean) => {
            if (mounted) {
              setOfflineStatus(isOffline ? 'offline' : 'online');
            }
          },
          onQueueSizeChanged: (size: number) => {
            if (mounted) {
              setQueueSize(size);
            }
          },
          onQueueItemProcessed: () => {
            // Optional: Could add notifications here
          }
        };
        
        // Set up install service delegate  
        installService.delegate = {
          onInstallPromptAvailable: () => {
            if (mounted) {
              setCanInstall(true);
              setInstallStatus('installable');
            }
          },
          onInstallPromptDismissed: () => {
            if (mounted) {
              setCanInstall(false);
            }
          },
          onInstallCompleted: () => {
            if (mounted) {
              setInstallStatus('installed');
              setCanInstall(false);
            }
          },
          onInstallDeclined: () => {
            if (mounted) {
              setCanInstall(false);
            }
          },
          onInstallError: (error: Error) => {
            console.error('[useConfig] Install error:', error);
            if (mounted) {
              setCanInstall(false);
            }
          }
        };
        
        // Initialize status
        setOfflineStatus(offlineService.offline ? 'offline' : 'online');
        setInstallStatus(installService.installStatus);
        setCanInstall(installService.canShowInstallPrompt());
        setQueueSize(offlineService.currentQueueSize);
        
        console.log('[useConfig] PWA services initialized');
      } catch (error) {
        console.error('[useConfig] Failed to initialize PWA services:', error);
        if (mounted) {
          setOfflineStatus('online'); // Default to online if initialization fails
          setInstallStatus('not_supported');
        }
      }
    };
    
    initializePWAServices();
    
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Loads configuration from storage on mount
   * Phase 3: Enhanced to load both main config and state machine config
   * Automatically retries if initial load fails
   */
  useEffect(() => {
    let mounted = true;
    
    const loadInitialConfig = async () => {
      try {
        setLoading(true);
        setError(null);
        
        console.log('[useConfig] Loading initial configuration');
        
        // Load main configuration
        const loadedConfig = await configManager.loadConfig();
        
        if (mounted) {
          setConfig(loadedConfig);
          console.log('[useConfig] Configuration loaded successfully');
        }
      } catch (err) {
        console.error('[useConfig] Failed to load initial configuration:', err);
        
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load configuration');
          
          // Use defaults if loading fails
          try {
            const defaultConfig = await configManager.resetToDefaults();
            setConfig(defaultConfig);
            console.log('[useConfig] Fallback to default configuration');
          } catch (resetErr) {
            console.error('[useConfig] Failed to reset to defaults:', resetErr);
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadInitialConfig();
    
    // Cleanup function to prevent state updates after unmount
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Validates and saves complete configuration
   * @param updatedConfig Partial application configuration to merge and save
   * @returns ValidationResult with detailed validation information
   */
  const validateAndSave = useCallback(async (updatedConfig: Partial<AppConfig>): Promise<ValidationResult> => {
    try {
      setError(null);
      
      // Load fresh config to avoid stale closure issues
      const currentConfig = await configManager.loadConfig();
      
      // Create complete updated configuration using fresh config
      const newConfig: AppConfig = {
        ...currentConfig,
        ...updatedConfig,
        esp32: {
          ...currentConfig.esp32,
          ...updatedConfig.esp32
        },
        mqtt: {
          ...currentConfig.mqtt,
          ...updatedConfig.mqtt
        },
        lastModified: Date.now()
      };
      
      // Validate complete configuration
      const validationResult = configManager.validateFullConfig(newConfig);
      
      if (validationResult.isValid) {
        // Save and update state if valid
        await configManager.saveConfig(newConfig);
        setConfig(newConfig);
        
        console.log('[useConfig] Configuration validated and saved successfully');
        
        // Log warnings if any
        if (validationResult.warnings && validationResult.warnings.length > 0) {
          validationResult.warnings.forEach(warning => {
            console.warn(`[useConfig] Configuration warning: ${warning}`);
          });
        }
      } else {
        // Log validation errors
        validationResult.errors.forEach(error => {
          console.error(`[useConfig] Validation error in ${error.field}: ${error.message}`);
        });
        
        setError('Configuration validation failed. Check individual field errors.');
      }
      
      return validationResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to validate and save configuration';
      console.error('[useConfig] Failed to validate and save configuration:', err);
      setError(errorMessage);
      
      // Return error validation result
      return {
        isValid: false,
        errors: [{
          field: 'host' as keyof ESP32Config,
          message: errorMessage,
          code: 'required'
        }]
      };
    }
  }, []); // No dependencies since we load fresh config

  /**
   * Resets configuration to defaults
   * Clears any existing errors and loads fresh default configuration
   */
  const reset = useCallback(async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[useConfig] Resetting configuration to defaults');
      const defaultConfig = await configManager.resetToDefaults();
      
      setConfig(defaultConfig);
      console.log('[useConfig] Configuration reset successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset configuration';
      console.error('[useConfig] Failed to reset configuration:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Exports current configuration as JSON string
   * @returns Promise<string> - Serialized configuration with export metadata
   */
  const exportConfig = useCallback(async (): Promise<string> => {
    try {
      setError(null);
      
      console.log('[useConfig] Exporting configuration');
      const exportedConfig = await configManager.exportConfig();
      
      console.log('[useConfig] Configuration exported successfully');
      return exportedConfig;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to export configuration';
      console.error('[useConfig] Failed to export configuration:', err);
      setError(errorMessage);
      throw err;
    }
  }, []);

  /**
   * Imports configuration from JSON string
   * @param configJson JSON string containing configuration data
   */
  const importConfig = useCallback(async (configJson: string): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[useConfig] Importing configuration');
      const importedConfig = await configManager.importConfig(configJson);
      
      setConfig(importedConfig);
      console.log('[useConfig] Configuration imported successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to import configuration';
      console.error('[useConfig] Failed to import configuration:', err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Updates reachability status for ESP32 or MQTT configuration
   * Used after connection tests to reflect current network status
   * @param type Configuration type to update
   * @param status New reachability status
   */
  const updateReachabilityStatus = useCallback(async (
    type: 'esp32' | 'mqtt', 
    status: 'reachable' | 'unreachable' | 'unknown'
  ): Promise<void> => {
    try {
      // Load fresh config to avoid stale closure issues
      const currentConfig = await configManager.loadConfig();
      
      const newConfig: AppConfig = {
        ...currentConfig,
        [type]: {
          ...currentConfig[type],
          reachabilityStatus: status
        },
        lastModified: Date.now()
      };
      
      // Save updated configuration (skip validation for reachability-only updates)
      await configManager.saveConfig(newConfig, true);
      setConfig(newConfig);
      
      console.log(`[useConfig] ${type.toUpperCase()} reachability status updated to: ${status}`);
    } catch (err) {
      console.error(`[useConfig] Failed to update ${type} reachability status:`, err);
      // Don't throw error for reachability status updates to avoid disrupting the UI
    }
  }, []); // No dependencies since we load fresh config




  /**
   * PWA Methods (Phase 4)
   */

  /**
   * Show PWA installation prompt
   * @returns Promise<boolean> - true if installation was accepted
   */
  const showInstallPrompt = useCallback(async (): Promise<boolean> => {
    try {
      const { installService } = await import('../services/InstallService');
      return await installService.showInstallPrompt();
    } catch (error) {
      console.error('[useConfig] Failed to show install prompt:', error);
      return false;
    }
  }, []);

  /**
   * Queue gate trigger for offline execution
   * @param config ESP32 or MQTT configuration
   * @returns Promise<string> - Queue item ID
   */
  const queueGateTrigger = useCallback(async (config: ESP32Config | MQTTConfig): Promise<string> => {
    try {
      const { offlineService } = await import('../services/OfflineService');
      return await offlineService.queueGateTrigger(config);
    } catch (error) {
      console.error('[useConfig] Failed to queue gate trigger:', error);
      throw error;
    }
  }, []);

  /**
   * Process offline queue
   */
  const processOfflineQueue = useCallback(async (): Promise<void> => {
    try {
      const { offlineService } = await import('../services/OfflineService');
      await offlineService.processQueue();
    } catch (error) {
      console.error('[useConfig] Failed to process offline queue:', error);
      throw error;
    }
  }, []);

  /**
   * Clear offline queue
   */
  const clearOfflineQueue = useCallback(async (): Promise<void> => {
    try {
      const { offlineService } = await import('../services/OfflineService');
      await offlineService.clearQueue();
    } catch (error) {
      console.error('[useConfig] Failed to clear offline queue:', error);
      throw error;
    }
  }, []);

  /**
   * Compute simple online/offline status based on adapter reachability
   * Returns true if at least one adapter is reachable
   */
  const isOnline = useMemo(() => {
    if (!config) return false;
    
    const esp32Reachable = config.esp32.reachabilityStatus === 'reachable';
    const mqttReachable = Boolean(config.mqtt.host && config.mqtt.reachabilityStatus === 'reachable');
    
    const online = esp32Reachable || mqttReachable;
    
    return online;
  }, [config?.esp32.reachabilityStatus, config?.mqtt.reachabilityStatus, config?.mqtt.host]);

  // Return simplified hook interface with config, validation, and PWA features
  return {
    // Base configuration interface
    config,
    loading,
    error,
    validateAndSave,
    updateReachabilityStatus,
    reset,
    export: exportConfig,
    import: importConfig,
    
    // PWA interface
    offlineStatus,
    installStatus,
    queueSize,
    canInstall,
    showInstallPrompt,
    queueGateTrigger,
    processOfflineQueue,
    clearOfflineQueue,
    
    // Simple online status
    isOnline
  };
}
