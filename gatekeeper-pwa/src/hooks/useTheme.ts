/**
 * Theme Management Hook for Gatekeeper PWA
 * Handles system preference detection, theme persistence, and DOM class application
 * Follows established hook patterns from useConfig and useStateMachine
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { ThemeMode } from '../types';
import { configManager } from '../services/ConfigManager';

/**
 * Theme hook configuration interface
 */
export interface UseThemeConfig {
  enableLogging?: boolean;
  onThemeChange?: (theme: ThemeMode, resolvedTheme: 'bright' | 'dark') => void;
}

/**
 * Theme hook return interface
 */
export interface UseThemeReturn {
  // Current theme state
  themeMode: ThemeMode;
  resolvedTheme: 'bright' | 'dark';
  isSystemTheme: boolean;
  
  // System preference state
  systemPreference: 'bright' | 'dark';
  isSystemDarkMode: boolean;
  
  // Loading and error states
  loading: boolean;
  error: string | null;
  
  // Theme management methods
  setTheme: (theme: ThemeMode) => Promise<void>;
  toggleTheme: () => Promise<void>;
  resetToSystem: () => Promise<void>;
  
  // System detection
  detectSystemPreference: () => 'bright' | 'dark';
}

/**
 * Custom hook for theme management with system preference detection
 * Provides comprehensive theme management including system detection and persistence
 */
export function useTheme(config: UseThemeConfig = {}): UseThemeReturn {
  const {
    enableLogging = false,
    onThemeChange
  } = config;

  // State management
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [systemPreference, setSystemPreference] = useState<'bright' | 'dark'>('bright');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for stable references
  const mediaQueryRef = useRef<MediaQueryList | null>(null);
  const onThemeChangeRef = useRef(onThemeChange);
  
  // Update callback ref when prop changes
  useEffect(() => {
    onThemeChangeRef.current = onThemeChange;
  }, [onThemeChange]);

  /**
   * Detects current system color scheme preference
   */
  const detectSystemPreference = useCallback((): 'bright' | 'dark' => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      if (enableLogging) {
        console.log('[useTheme] No matchMedia support, defaulting to bright');
      }
      return 'bright';
    }

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const preference = isDark ? 'dark' : 'bright';
    
    if (enableLogging) {
      console.log(`[useTheme] System preference detected: ${preference}`);
    }
    
    return preference;
  }, [enableLogging]);

  /**
   * Resolves theme mode to actual theme (converts 'system' to 'bright'/'dark')
   */
  const resolvedTheme = useMemo((): 'bright' | 'dark' => {
    if (themeMode === 'system') {
      return systemPreference;
    }
    return themeMode;
  }, [themeMode, systemPreference]);

  /**
   * Checks if current theme is system-based
   */
  const isSystemTheme = useMemo((): boolean => {
    return themeMode === 'system';
  }, [themeMode]);

  /**
   * Checks if system is currently in dark mode
   */
  const isSystemDarkMode = useMemo((): boolean => {
    return systemPreference === 'dark';
  }, [systemPreference]);

  /**
   * Applies theme classes to document root
   */
  const applyThemeToDOM = useCallback((theme: 'bright' | 'dark') => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    
    // Remove existing theme classes
    root.classList.remove('theme-bright', 'theme-dark');
    
    // Add new theme class
    root.classList.add(`theme-${theme}`);
    
    // Set data attribute for CSS custom properties
    root.setAttribute('data-theme', theme);
    
    if (enableLogging) {
      console.log(`[useTheme] Applied theme to DOM: ${theme}`);
    }
  }, [enableLogging]);

  /**
   * Handles system preference changes
   */
  const handleSystemPreferenceChange = useCallback((event: MediaQueryListEvent) => {
    const newPreference = event.matches ? 'dark' : 'bright';
    
    if (enableLogging) {
      console.log(`[useTheme] System preference changed: ${newPreference}`);
    }
    
    setSystemPreference(newPreference);
  }, [enableLogging]);

  /**
   * Sets up system preference listener
   */
  const setupSystemPreferenceListener = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    try {
      // Create media query for dark mode
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQueryRef.current = mediaQuery;

      // Set initial preference
      const initialPreference = mediaQuery.matches ? 'dark' : 'bright';
      setSystemPreference(initialPreference);

      // Add change listener
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleSystemPreferenceChange);
      } else {
        // Fallback for older browsers
        mediaQuery.addListener(handleSystemPreferenceChange);
      }

      if (enableLogging) {
        console.log(`[useTheme] System preference listener setup, initial: ${initialPreference}`);
      }
    } catch (error) {
      console.error('[useTheme] Failed to setup system preference listener:', error);
      setError('Failed to detect system theme preference');
    }
  }, [handleSystemPreferenceChange, enableLogging]);

  /**
   * Cleans up system preference listener
   */
  const cleanupSystemPreferenceListener = useCallback(() => {
    const mediaQuery = mediaQueryRef.current;
    if (!mediaQuery) return;

    try {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleSystemPreferenceChange);
      } else {
        // Fallback for older browsers
        mediaQuery.removeListener(handleSystemPreferenceChange);
      }

      if (enableLogging) {
        console.log('[useTheme] System preference listener cleaned up');
      }
    } catch (error) {
      console.error('[useTheme] Failed to cleanup system preference listener:', error);
    }

    mediaQueryRef.current = null;
  }, [handleSystemPreferenceChange, enableLogging]);

  /**
   * Loads theme configuration from storage
   */
  const loadThemeConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const config = await configManager.loadConfig();
      const loadedTheme = config.theme || 'system';
      
      setThemeModeState(loadedTheme);
      
      if (enableLogging) {
        console.log(`[useTheme] Theme loaded from config: ${loadedTheme}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useTheme] Failed to load theme config:', err);
      setError(`Failed to load theme: ${errorMessage}`);
      
      // Fallback to system theme
      setThemeModeState('system');
    } finally {
      setLoading(false);
    }
  }, [enableLogging]);

  /**
   * Saves theme configuration to storage
   */
  const saveThemeConfig = useCallback(async (newTheme: ThemeMode) => {
    try {
      const config = await configManager.loadConfig();
      const updatedConfig = {
        ...config,
        theme: newTheme,
        lastModified: Date.now()
      };
      
      await configManager.saveConfig(updatedConfig);
      
      if (enableLogging) {
        console.log(`[useTheme] Theme saved to config: ${newTheme}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useTheme] Failed to save theme config:', err);
      throw new Error(`Failed to save theme: ${errorMessage}`);
    }
  }, [enableLogging]);

  /**
   * Sets new theme mode
   */
  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    try {
      setError(null);
      
      // Update state
      setThemeModeState(newTheme);
      
      // Save to storage
      await saveThemeConfig(newTheme);
      
      if (enableLogging) {
        console.log(`[useTheme] Theme changed to: ${newTheme}`);
      }
      
      // Trigger callback if provided
      if (onThemeChangeRef.current) {
        const resolved = newTheme === 'system' ? systemPreference : newTheme;
        onThemeChangeRef.current(newTheme, resolved);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useTheme] Failed to set theme:', err);
      setError(errorMessage);
      
      // Revert state on error
      const config = await configManager.loadConfig();
      setThemeModeState(config.theme || 'system');
    }
  }, [saveThemeConfig, systemPreference, enableLogging]);

  /**
   * Toggles between bright and dark themes (skips system)
   */
  const toggleTheme = useCallback(async () => {
    const currentResolved = resolvedTheme;
    const newTheme: ThemeMode = currentResolved === 'bright' ? 'dark' : 'bright';
    await setTheme(newTheme);
  }, [resolvedTheme, setTheme]);

  /**
   * Resets theme to system preference
   */
  const resetToSystem = useCallback(async () => {
    await setTheme('system');
  }, [setTheme]);

  // Initialize theme system on mount
  useEffect(() => {
    let mounted = true;

    const initialize = async () => {
      try {
        // Setup system preference detection first
        setupSystemPreferenceListener();
        
        // Load theme configuration
        if (mounted) {
          await loadThemeConfig();
        }
      } catch (err) {
        if (mounted) {
          console.error('[useTheme] Initialization failed:', err);
          setError('Failed to initialize theme system');
          setLoading(false);
        }
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      mounted = false;
      cleanupSystemPreferenceListener();
    };
  }, [setupSystemPreferenceListener, loadThemeConfig, cleanupSystemPreferenceListener]);

  // Apply theme to DOM when resolved theme changes
  useEffect(() => {
    if (!loading) {
      applyThemeToDOM(resolvedTheme);
    }
  }, [resolvedTheme, loading, applyThemeToDOM]);

  return {
    // Current theme state
    themeMode,
    resolvedTheme,
    isSystemTheme,
    
    // System preference state
    systemPreference,
    isSystemDarkMode,
    
    // Loading and error states
    loading,
    error,
    
    // Theme management methods
    setTheme,
    toggleTheme,
    resetToSystem,
    
    // System detection
    detectSystemPreference
  };
}