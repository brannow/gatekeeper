/**
 * Timeout Management Utilities for Gatekeeper PWA
 * Handles timeout management for state machine transitions and network operations
 * 
 * ARCHITECTURE PRINCIPLE: Timeout everything - No network call without explicit timeout
 * Provides centralized timeout handling with proper cleanup and cancellation
 */

import type { GateState } from '../types';
import { 
  getStateTimeout, 
  DEFAULT_STATE_MACHINE_CONFIG,
  type StateMachineConfig 
} from '../types/state-machine';

/**
 * Timeout operation context
 */
export interface TimeoutOperation {
  id: string;
  type: 'state-transition' | 'network-operation' | 'reachability-check';
  startTime: number;
  timeoutMs: number;
  timeoutHandle: number;
  onTimeout: () => void;
  onCancel?: () => void;
  metadata?: Record<string, any>;
}

/**
 * Timeout manager for centralized timeout handling
 * Ensures all timeouts are properly tracked and cleaned up
 */
export class TimeoutManager {
  private activeTimeouts = new Map<string, TimeoutOperation>();
  private config: StateMachineConfig;
  private timeoutCounter = 0;

  constructor(config: StateMachineConfig = DEFAULT_STATE_MACHINE_CONFIG) {
    this.config = config;
  }

  /**
   * Set timeout for state machine transition
   * @param state Gate state to set timeout for
   * @param onTimeout Function to call when timeout occurs
   * @param onCancel Optional function to call when timeout is cancelled
   * @returns Timeout operation ID for cancellation
   */
  setStateTimeout(
    state: GateState,
    onTimeout: () => void,
    onCancel?: () => void
  ): string | null {
    const timeoutMs = getStateTimeout(state, this.config);
    if (timeoutMs === null) {
      return null; // No timeout for this state
    }

    const id = this.generateTimeoutId('state', state);
    return this.createTimeout({
      id,
      type: 'state-transition',
      timeoutMs,
      onTimeout,
      onCancel,
      metadata: { state }
    });
  }

  /**
   * Set timeout for network operation
   * @param operationType Type of network operation
   * @param timeoutMs Timeout duration in milliseconds
   * @param onTimeout Function to call when timeout occurs
   * @param onCancel Optional function to call when timeout is cancelled
   * @param metadata Optional metadata for the operation
   * @returns Timeout operation ID for cancellation
   */
  setNetworkTimeout(
    operationType: string,
    timeoutMs: number,
    onTimeout: () => void,
    onCancel?: () => void,
    metadata?: Record<string, any>
  ): string {
    const id = this.generateTimeoutId('network', operationType);
    return this.createTimeout({
      id,
      type: 'network-operation',
      timeoutMs,
      onTimeout,
      onCancel,
      metadata: { operationType, ...metadata }
    });
  }

  /**
   * Set timeout for reachability check
   * @param targetType Type of target being checked
   * @param timeoutMs Timeout duration in milliseconds
   * @param onTimeout Function to call when timeout occurs
   * @param onCancel Optional function to call when timeout is cancelled
   * @returns Timeout operation ID for cancellation
   */
  setReachabilityTimeout(
    targetType: string,
    timeoutMs: number,
    onTimeout: () => void,
    onCancel?: () => void
  ): string {
    const id = this.generateTimeoutId('reachability', targetType);
    return this.createTimeout({
      id,
      type: 'reachability-check',
      timeoutMs,
      onTimeout,
      onCancel,
      metadata: { targetType }
    });
  }

  /**
   * Cancel specific timeout operation
   * @param timeoutId ID of timeout to cancel
   * @returns True if timeout was cancelled, false if not found
   */
  cancelTimeout(timeoutId: string): boolean {
    const operation = this.activeTimeouts.get(timeoutId);
    if (!operation) {
      return false;
    }

    clearTimeout(operation.timeoutHandle);
    this.activeTimeouts.delete(timeoutId);
    
    console.log(`[TimeoutManager] Cancelled ${operation.type} timeout: ${timeoutId}`);
    
    // Call cancellation callback if provided
    operation.onCancel?.();
    
    return true;
  }

  /**
   * Cancel all timeouts of a specific type
   * @param type Type of timeouts to cancel
   * @returns Number of timeouts cancelled
   */
  cancelTimeoutsByType(type: TimeoutOperation['type']): number {
    let cancelledCount = 0;
    
    for (const [id, operation] of this.activeTimeouts) {
      if (operation.type === type) {
        this.cancelTimeout(id);
        cancelledCount++;
      }
    }
    
    console.log(`[TimeoutManager] Cancelled ${cancelledCount} ${type} timeouts`);
    return cancelledCount;
  }

  /**
   * Cancel all active timeouts
   * @returns Number of timeouts cancelled
   */
  cancelAllTimeouts(): number {
    const totalCount = this.activeTimeouts.size;
    
    for (const [id] of this.activeTimeouts) {
      this.cancelTimeout(id);
    }
    
    console.log(`[TimeoutManager] Cancelled all ${totalCount} active timeouts`);
    return totalCount;
  }

  /**
   * Get active timeout operations
   * @returns Array of active timeout operations
   */
  getActiveTimeouts(): TimeoutOperation[] {
    return Array.from(this.activeTimeouts.values());
  }

  /**
   * Get active timeouts by type
   * @param type Type of timeouts to retrieve
   * @returns Array of timeout operations of the specified type
   */
  getTimeoutsByType(type: TimeoutOperation['type']): TimeoutOperation[] {
    return this.getActiveTimeouts().filter(op => op.type === type);
  }

  /**
   * Check if timeout exists
   * @param timeoutId ID of timeout to check
   * @returns True if timeout exists and is active
   */
  hasTimeout(timeoutId: string): boolean {
    return this.activeTimeouts.has(timeoutId);
  }

  /**
   * Get remaining time for timeout
   * @param timeoutId ID of timeout to check
   * @returns Remaining time in milliseconds, or null if timeout not found
   */
  getRemainingTime(timeoutId: string): number | null {
    const operation = this.activeTimeouts.get(timeoutId);
    if (!operation) {
      return null;
    }

    const elapsed = Date.now() - operation.startTime;
    const remaining = operation.timeoutMs - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Update timeout configuration
   * @param config New state machine configuration
   */
  updateConfig(config: StateMachineConfig): void {
    this.config = config;
    console.log('[TimeoutManager] Configuration updated');
  }

  /**
   * Get timeout statistics
   * @returns Object with timeout statistics
   */
  getStatistics(): object {
    const timeouts = this.getActiveTimeouts();
    const byType = timeouts.reduce((acc, op) => {
      acc[op.type] = (acc[op.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalActive: timeouts.length,
      byType,
      config: this.config.timeouts
    };
  }

  /**
   * Cleanup all timeouts and resources
   */
  cleanup(): void {
    console.log('[TimeoutManager] Cleaning up...');
    const cancelledCount = this.cancelAllTimeouts();
    console.log(`[TimeoutManager] Cleanup completed - cancelled ${cancelledCount} timeouts`);
  }

  /**
   * Create timeout operation
   */
  private createTimeout(params: {
    id: string;
    type: TimeoutOperation['type'];
    timeoutMs: number;
    onTimeout: () => void;
    onCancel?: () => void;
    metadata?: Record<string, any>;
  }): string {
    const operation: TimeoutOperation = {
      ...params,
      startTime: Date.now(),
      timeoutHandle: setTimeout(() => {
        console.log(`[TimeoutManager] Timeout occurred: ${params.id} (${params.timeoutMs}ms)`);
        this.activeTimeouts.delete(params.id);
        params.onTimeout();
      }, params.timeoutMs)
    };

    this.activeTimeouts.set(params.id, operation);
    console.log(`[TimeoutManager] Set ${params.type} timeout: ${params.id} (${params.timeoutMs}ms)`);
    
    return params.id;
  }

  /**
   * Generate unique timeout ID
   */
  private generateTimeoutId(prefix: string, suffix: string): string {
    this.timeoutCounter++;
    return `${prefix}-${suffix}-${this.timeoutCounter}-${Date.now()}`;
  }
}

/**
 * Create timeout manager instance
 * @param config Optional state machine configuration
 * @returns Configured TimeoutManager instance
 */
export function createTimeoutManager(config?: StateMachineConfig): TimeoutManager {
  return new TimeoutManager(config);
}

/**
 * Utility function to create AbortSignal with timeout
 * For use with fetch requests and other abortable operations
 * @param timeoutMs Timeout in milliseconds
 * @returns AbortSignal that will abort after timeout
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

/**
 * Promise-based timeout utility
 * @param promise Promise to execute with timeout
 * @param timeoutMs Timeout in milliseconds
 * @param timeoutMessage Optional timeout error message
 * @returns Promise that resolves with result or rejects on timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

/**
 * Timeout decorator for async functions
 * @param timeoutMs Timeout in milliseconds
 * @param timeoutMessage Optional timeout error message
 * @returns Function decorator
 */
export function timeout(timeoutMs: number, timeoutMessage?: string) {
  return function <T extends (...args: any[]) => Promise<any>>(
    _target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ) {
    const originalMethod = descriptor.value!;
    
    descriptor.value = async function (this: any, ...args: any[]) {
      return withTimeout(
        originalMethod.apply(this, args),
        timeoutMs,
        timeoutMessage || `${propertyKey} timed out after ${timeoutMs}ms`
      );
    } as T;
  };
}

/**
 * Singleton timeout manager for global use
 */
export const timeoutManager = createTimeoutManager();