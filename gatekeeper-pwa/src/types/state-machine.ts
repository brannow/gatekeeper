/**
 * State machine type definitions for Gatekeeper PWA
 * Comprehensive state management matching Swift app architecture
 * 
 * STRUCTURE PRINCIPLE: Single source of truth for state machine logic
 * All state transitions, validations, and recovery patterns centralized here
 */

import type { GateState, GateAction, NetworkOperationContext } from './index';

/**
 * State machine configuration
 * Defines valid transitions and timing constraints
 */
export interface StateMachineConfig {
  /**
   * Maximum time to stay in transitional states before timeout (ms)
   */
  timeouts: {
    triggering: number;         // Max time for gate trigger
    waitingForRelayClose: number; // Max time waiting for relay
    errorRecovery: number;      // Delay before auto-recovery from error states
  };
  
  /**
   * Retry configuration for failed operations
   */
  retry: {
    maxAttempts: number;        // Maximum retry attempts
    backoffMultiplier: number;  // Exponential backoff multiplier
    baseDelay: number;          // Base delay between retries (ms)
  };
  
}

/**
 * State transition matrix
 * Defines all valid state transitions with their triggers
 * Based on Swift app's state machine logic
 */
export const STATE_TRANSITIONS: Record<GateState, Partial<Record<GateAction, GateState>>> = {
  ready: {
    userPressed: 'triggering'            // User triggers gate
  },
  
  triggering: {
    relayChanged: 'waitingForRelayClose', // Relay activated, wait for completion
    requestComplete: 'ready',            // Request completed without relay feedback
    timeout: 'timeout'                   // Trigger operation timed out
  },
  
  waitingForRelayClose: {
    relayChanged: 'ready',               // Relay released, operation complete
    timeout: 'timeout'                   // Relay close timed out
  },
  
  timeout: {
    retry: 'ready',                      // Auto or manual retry
    userPressed: 'triggering'            // User retry trigger
  },
  
  error: {
    retry: 'ready',                      // Auto or manual retry
    userPressed: 'triggering'            // User retry trigger
  }
};

/**
 * State metadata for UI rendering and behavior
 * Provides consistent state information across components
 */
export const STATE_METADATA: Record<GateState, {
  title: string;
  isDisabled: boolean;
  canRetry: boolean;
  isTransitional: boolean;
  severity: 'info' | 'warning' | 'error' | 'success';
}> = {
  ready: {
    title: 'TRIGGER GATE',
    isDisabled: false,
    canRetry: false,
    isTransitional: false,
    severity: 'success'
  },
  
  triggering: {
    title: 'TRIGGERING...',
    isDisabled: true,
    canRetry: false,
    isTransitional: true,
    severity: 'info'
  },
  
  waitingForRelayClose: {
    title: 'OPENING...',
    isDisabled: true,
    canRetry: false,
    isTransitional: true,
    severity: 'info'
  },
  
  timeout: {
    title: 'TIMEOUT',
    isDisabled: false,
    canRetry: true,
    isTransitional: false,
    severity: 'warning'
  },
  
  error: {
    title: 'ERROR',
    isDisabled: false,
    canRetry: true,
    isTransitional: false,
    severity: 'error'
  }
};

/**
 * Default state machine configuration
 * Based on Swift app's timing and retry patterns
 */
export const DEFAULT_STATE_MACHINE_CONFIG: StateMachineConfig = {
  timeouts: {
    triggering: 5000,            // 5 seconds for gate trigger
    waitingForRelayClose: 15000, // 15 seconds for relay completion
    errorRecovery: 3000          // 3 seconds before auto-recovery
  },
  
  retry: {
    maxAttempts: 3,
    backoffMultiplier: 2,
    baseDelay: 1000
  }
};

/**
 * State transition validation function
 * Ensures only valid transitions occur based on current state and action
 */
export function isValidTransition(
  from: GateState, 
  to: GateState, 
  action: GateAction,
  _context?: NetworkOperationContext
): boolean {
  const validTransitions = STATE_TRANSITIONS[from];
  if (!validTransitions) return false;
  
  const expectedTarget = validTransitions[action];
  if (!expectedTarget) return false;
  
  
  return expectedTarget === to;
}

/**
 * Get next state for a given current state and action
 * Returns null if no valid transition exists
 */
export function getNextState(
  currentState: GateState,
  action: GateAction,
  _context?: NetworkOperationContext
): GateState | null {
  const validTransitions = STATE_TRANSITIONS[currentState];
  if (!validTransitions) return null;
  
  const nextState = validTransitions[action];
  if (!nextState) return null;
  
  
  return nextState;
}

/**
 * Get valid actions for a given state
 * Used for UI state and validation
 */
export function getValidActions(state: GateState): GateAction[] {
  const transitions = STATE_TRANSITIONS[state];
  if (!transitions) return [];
  
  return Object.keys(transitions) as GateAction[];
}

/**
 * Check if state is transitional (temporary state)
 * Transitional states should have timeouts and progress indicators
 */
export function isTransitionalState(state: GateState): boolean {
  return STATE_METADATA[state].isTransitional;
}

/**
 * Check if state allows retry operations
 * Used for UI retry button display
 */
export function canRetryFromState(state: GateState): boolean {
  return STATE_METADATA[state].canRetry;
}

/**
 * Get timeout for a given state
 * Returns timeout in milliseconds or null if no timeout applies
 */
export function getStateTimeout(state: GateState, config = DEFAULT_STATE_MACHINE_CONFIG): number | null {
  switch (state) {
    case 'triggering':
      return config.timeouts.triggering;
    case 'waitingForRelayClose':
      return config.timeouts.waitingForRelayClose;
    case 'timeout':
    case 'error':
      return config.timeouts.errorRecovery;
    default:
      return null;
  }
}

/**
 * State transition event for logging and debugging
 * Provides comprehensive context about state changes
 */
export interface StateTransitionEvent {
  from: GateState;
  to: GateState;
  action: GateAction;
  timestamp: number;
  duration?: number;           // Time spent in previous state
  context?: NetworkOperationContext;
  success: boolean;
  error?: string;
}