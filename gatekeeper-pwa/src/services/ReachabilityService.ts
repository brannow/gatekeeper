/**
 * Reachability Service for Gatekeeper PWA
 * Web-compatible implementation matching Swift app's ReachabilityService
 * 
 * Since web browsers don't support ICMP ping, we use:
 * - HTTP HEAD requests for ESP32 reachability testing
 * - MQTT connection attempts for MQTT broker reachability
 * - Navigator.onLine for basic connectivity
 * 
 * ARCHITECTURE PRINCIPLE: Timeout everything, fail fast, fail clearly
 */

import type { 
  ESP32Config, 
  MQTTConfig
} from '../types';
import { DEFAULT_STATE_MACHINE_CONFIG } from '../types/state-machine';
import { NetworkErrorHandler } from '../network/NetworkErrorHandler';
import { validationService } from './ValidationService';
import { MqttService } from './MqttService';

/**
 * Reachability target for testing
 * Similar to Swift app's PingTarget but adapted for web constraints
 */
export interface ReachabilityTarget {
  type: 'esp32' | 'mqtt';
  config: ESP32Config | MQTTConfig;
  timeout?: number;
}

/**
 * Reachability test result
 * Provides detailed feedback about connectivity tests
 */
export interface ReachabilityResult {
  target: ReachabilityTarget;
  isReachable: boolean;
  duration: number;
  timestamp: number;
  error?: string;
  method: 'http-head' | 'mqtt-connect' | 'browser-online';
}

/**
 * Reachability service delegate interface
 * Matches Swift app's delegate pattern for loose coupling
 */
export interface ReachabilityServiceDelegate {
  /**
   * Called when reachability test completes
   * @param service The reachability service instance
   * @param target The target that was tested
   * @param isReachable Whether the target is reachable
   * @param duration Test duration in milliseconds
   */
  onReachabilityResult(
    service: ReachabilityService,
    target: ReachabilityTarget,
    isReachable: boolean,
    duration: number
  ): void;

  /**
   * Called when browser connectivity changes
   * @param service The reachability service instance
   * @param isOnline Whether browser reports being online
   */
  onConnectivityChanged?(service: ReachabilityService, isOnline: boolean): void;
}

/**
 * Reachability service configuration
 */
export interface ReachabilityServiceConfig {
  /** Default timeout for reachability tests */
  defaultTimeout: number;
  /** Whether to monitor browser online/offline events */
  monitorConnectivity: boolean;
  /** Interval for periodic reachability checks (0 = disabled) */
  periodicCheckInterval: number;
  /** Maximum concurrent reachability tests */
  maxConcurrentTests: number;
}

/**
 * Default reachability service configuration
 * Based on Swift app's timing patterns
 */
const DEFAULT_REACHABILITY_CONFIG: ReachabilityServiceConfig = {
  defaultTimeout: DEFAULT_STATE_MACHINE_CONFIG.reachability.timeoutPerCheck,
  monitorConnectivity: true,
  periodicCheckInterval: DEFAULT_STATE_MACHINE_CONFIG.reachability.checkInterval,
  maxConcurrentTests: 3
};

/**
 * Web-compatible reachability service
 * Implements network connectivity testing without requiring ICMP ping
 */
export class ReachabilityService {
  public delegate?: ReachabilityServiceDelegate;
  
  private readonly config: ReachabilityServiceConfig;
  private activeTests = new Set<Promise<ReachabilityResult>>();
  private connectivityListener?: () => void;
  private periodicCheckTimer?: number;

  constructor(
    config: Partial<ReachabilityServiceConfig> = {},
    delegate?: ReachabilityServiceDelegate
  ) {
    this.config = { ...DEFAULT_REACHABILITY_CONFIG, ...config };
    this.delegate = delegate;
    
    if (this.config.monitorConnectivity) {
      this.setupConnectivityMonitoring();
    }
  }

  /**
   * Test reachability for a single target
   * @param target Reachability target to test
   * @returns Promise<ReachabilityResult> Test result with timing and status
   */
  async testTarget(target: ReachabilityTarget): Promise<ReachabilityResult> {
    console.log(`[ReachabilityService] Testing ${target.type} target...`);
    
    // Respect concurrent test limit
    if (this.activeTests.size >= this.config.maxConcurrentTests) {
      throw new Error(`Maximum concurrent tests (${this.config.maxConcurrentTests}) exceeded`);
    }

    const startTime = Date.now();
    const timeout = target.timeout || this.config.defaultTimeout;

    let testPromise: Promise<ReachabilityResult>;

    switch (target.type) {
      case 'esp32':
        testPromise = this.testESP32Reachability(target.config as ESP32Config, timeout, startTime);
        break;
      case 'mqtt':
        testPromise = this.testMQTTReachability(target.config as MQTTConfig, timeout, startTime);
        break;
      default:
        throw new Error(`Unsupported target type: ${(target as any).type}`);
    }

    // Track active test
    this.activeTests.add(testPromise);

    try {
      const result = await testPromise;
      
      // Notify delegate
      this.delegate?.onReachabilityResult(
        this,
        target,
        result.isReachable,
        result.duration
      );

      return result;
    } finally {
      this.activeTests.delete(testPromise);
    }
  }

  /**
   * Test reachability for multiple targets concurrently
   * @param targets Array of reachability targets
   * @returns Promise<ReachabilityResult[]> Array of test results
   */
  async testTargets(targets: ReachabilityTarget[]): Promise<ReachabilityResult[]> {
    console.log(`[ReachabilityService] Testing ${targets.length} targets...`);
    
    // Test all targets concurrently but respect concurrent limit
    const results: ReachabilityResult[] = [];
    
    for (let i = 0; i < targets.length; i += this.config.maxConcurrentTests) {
      const batch = targets.slice(i, i + this.config.maxConcurrentTests);
      const batchPromises = batch.map(target => this.testTarget(target));
      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          console.error('[ReachabilityService] Target test failed:', result.reason);
          // Create failed result for consistency
          results.push({
            target: batch[results.length % batch.length],
            isReachable: false,
            duration: 0,
            timestamp: Date.now(),
            error: result.reason?.message || 'Test failed',
            method: 'http-head' // Default method
          });
        }
      }
    }

    const reachableCount = results.filter(r => r.isReachable).length;
    console.log(`[ReachabilityService] Tests completed: ${reachableCount}/${results.length} reachable`);

    return results;
  }

  /**
   * Check if browser reports being online
   * @returns boolean Browser online status
   */
  isOnline(): boolean {
    return navigator.onLine;
  }

  /**
   * Start periodic reachability checks
   * @param targets Targets to check periodically
   */
  startPeriodicChecks(targets: ReachabilityTarget[]): void {
    if (this.config.periodicCheckInterval <= 0 || targets.length === 0) {
      return;
    }

    console.log(`[ReachabilityService] Starting periodic checks every ${this.config.periodicCheckInterval}ms`);
    
    this.stopPeriodicChecks();
    
    this.periodicCheckTimer = setInterval(async () => {
      try {
        await this.testTargets(targets);
      } catch (error) {
        console.error('[ReachabilityService] Periodic check failed:', error);
      }
    }, this.config.periodicCheckInterval);
  }

  /**
   * Stop periodic reachability checks
   */
  stopPeriodicChecks(): void {
    if (this.periodicCheckTimer) {
      console.log('[ReachabilityService] Stopping periodic checks');
      clearInterval(this.periodicCheckTimer);
      this.periodicCheckTimer = undefined;
    }
  }

  /**
   * Cancel all active reachability tests
   */
  cancelAllTests(): void {
    console.log(`[ReachabilityService] Cancelling ${this.activeTests.size} active tests`);
    this.activeTests.clear();
  }

  /**
   * Clean up service resources
   */
  cleanup(): void {
    console.log('[ReachabilityService] Cleaning up...');
    
    this.stopPeriodicChecks();
    this.cancelAllTests();
    
    if (this.connectivityListener) {
      window.removeEventListener('online', this.connectivityListener);
      window.removeEventListener('offline', this.connectivityListener);
      this.connectivityListener = undefined;
    }

    console.log('[ReachabilityService] Cleanup completed');
  }

  /**
   * Test ESP32 reachability using HTTP HEAD request
   * Web-compatible alternative to ICMP ping
   */
  private async testESP32Reachability(
    config: ESP32Config,
    timeout: number,
    startTime: number
  ): Promise<ReachabilityResult> {
    try {
      // Validate configuration
      validationService.validateESP32ConfigStrict(config);

      const host = config.host.trim();
      const port = config.port === 80 ? '' : `:${config.port}`;
      const url = `http://${host}${port}/`;

      console.log(`[ReachabilityService] Testing ESP32 reachability: ${url}`);

      // Use HTTP HEAD request as ping alternative
      const response = await fetch(url, {
        method: 'HEAD',
        headers: { 'Accept': '*/*' },
        signal: AbortSignal.timeout(timeout),
        mode: 'cors', // Handle CORS for local network requests
        cache: 'no-cache'
      });

      const duration = Date.now() - startTime;
      const isReachable = response.ok || response.status === 404; // 404 is still "reachable"

      return {
        target: { type: 'esp32', config },
        isReachable,
        duration,
        timestamp: Date.now(),
        method: 'http-head'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const context = NetworkErrorHandler.createContext('http', 'reachability test', startTime, config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      
      console.log(`[ReachabilityService] ESP32 reachability test failed in ${duration}ms:`, networkError.message);

      return {
        target: { type: 'esp32', config },
        isReachable: false,
        duration,
        timestamp: Date.now(),
        error: networkError.message,
        method: 'http-head'
      };
    }
  }

  /**
   * Test MQTT broker reachability using connection attempt
   * Web-compatible alternative to TCP ping
   */
  private async testMQTTReachability(
    config: MQTTConfig,
    timeout: number,
    startTime: number
  ): Promise<ReachabilityResult> {
    let testService: MqttService | null = null;
    
    try {
      // Validate configuration
      validationService.validateMQTTConfigStrict(config);

      console.log(`[ReachabilityService] Testing MQTT reachability: ${config.host}:${config.port}`);

      // Create temporary MQTT service for testing
      testService = new MqttService(config);
      
      // Test connection with timeout
      const connected = await Promise.race([
        testService.testConnection(),
        new Promise<boolean>((_, reject) => 
          setTimeout(() => reject(new Error('Connection test timeout')), timeout)
        )
      ]);

      const duration = Date.now() - startTime;

      return {
        target: { type: 'mqtt', config },
        isReachable: connected,
        duration,
        timestamp: Date.now(),
        method: 'mqtt-connect'
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const context = NetworkErrorHandler.createContext('mqtt', 'reachability test', startTime, config);
      const networkError = NetworkErrorHandler.categorizeError(error as Error, context);
      
      console.log(`[ReachabilityService] MQTT reachability test failed in ${duration}ms:`, networkError.message);

      return {
        target: { type: 'mqtt', config },
        isReachable: false,
        duration,
        timestamp: Date.now(),
        error: networkError.message,
        method: 'mqtt-connect'
      };
    } finally {
      // Clean up test service
      if (testService) {
        try {
          await testService.disconnect();
        } catch (error) {
          console.warn('[ReachabilityService] Error cleaning up test MQTT service:', error);
        }
      }
    }
  }

  /**
   * Setup browser connectivity monitoring
   * Listens for online/offline events
   */
  private setupConnectivityMonitoring(): void {
    this.connectivityListener = () => {
      const isOnline = navigator.onLine;
      console.log(`[ReachabilityService] Connectivity changed: ${isOnline ? 'online' : 'offline'}`);
      this.delegate?.onConnectivityChanged?.(this, isOnline);
    };

    window.addEventListener('online', this.connectivityListener);
    window.addEventListener('offline', this.connectivityListener);

    console.log('[ReachabilityService] Connectivity monitoring enabled');
  }
}

/**
 * Create reachability service instance
 * @param config Optional service configuration
 * @param delegate Optional delegate for callbacks
 * @returns Configured ReachabilityService instance
 */
export function createReachabilityService(
  config?: Partial<ReachabilityServiceConfig>,
  delegate?: ReachabilityServiceDelegate
): ReachabilityService {
  return new ReachabilityService(config, delegate);
}

/**
 * Helper function to create reachability targets from app configuration
 * @param esp32Config ESP32 configuration
 * @param mqttConfig MQTT configuration
 * @returns Array of reachability targets
 */
export function createReachabilityTargets(
  esp32Config?: ESP32Config,
  mqttConfig?: MQTTConfig
): ReachabilityTarget[] {
  const targets: ReachabilityTarget[] = [];

  if (esp32Config) {
    targets.push({ type: 'esp32', config: esp32Config });
  }

  if (mqttConfig) {
    targets.push({ type: 'mqtt', config: mqttConfig });
  }

  return targets;
}
