/**
 * State Machine Hook for Gatekeeper PWA
 * Manages gate state transitions, timeouts, and recovery logic
 * Provides simplified state management without reachability checking
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { 
  GateState, 
  GateAction, 
  GateStateInfo, 
  NetworkOperationContext,
  StateManagerInterface 
} from '../types';
import { 
  STATE_METADATA,
  STATE_TRANSITIONS,
  isValidTransition,
  getNextState,
  getStateTimeout,
  isTransitionalState
} from '../types/state-machine';

/**
 * State machine hook configuration
 */
export interface UseStateMachineConfig {
  initialState?: GateState;
  onStateChange?: (from: GateState, to: GateState, action: GateAction) => void;
  onTimeout?: (state: GateState) => void;
  onError?: (error: string, context?: NetworkOperationContext) => void;
  enableLogging?: boolean;
}

/**
 * State machine hook return interface
 */
export interface UseStateMachineReturn extends StateManagerInterface {
  // State information
  stateInfo: GateStateInfo;
  isTransitional: boolean;
  canRetry: boolean;
  
  // Actions
  triggerGate: () => Promise<boolean>;
  retry: () => Promise<boolean>;
  
  // Utility methods
  forceState: (state: GateState, context?: NetworkOperationContext) => void;
  getElapsedTime: () => number;
  hasTimedOut: () => boolean;
}

/**
 * State machine hook for managing gate operations
 * Provides complete state management matching Swift app behavior
 */
export function useStateMachine(config: UseStateMachineConfig = {}): UseStateMachineReturn {
  const {
    initialState = 'ready',
    onStateChange,
    onTimeout,
    onError: _onError,
    enableLogging = true
  } = config;

  // Core state
  const [currentState, setCurrentState] = useState<GateState>(initialState);
  const [stateTimestamp, setStateTimestamp] = useState<number>(Date.now());
  const [stateContext, setStateContext] = useState<NetworkOperationContext | undefined>();
  
  // Timeout management
  const timeoutRef = useRef<number | undefined>();
  const stateStartTimeRef = useRef<number>(Date.now());

  /**
   * Log state machine events
   */
  const log = useCallback((message: string, data?: any) => {
    if (enableLogging) {
      console.log(`[StateMachine] ${message}`, data || '');
    }
  }, [enableLogging]);

  /**
   * Clear existing timeout
   */
  const clearStateTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = undefined;
    }
  }, []);

  // `transition` needs to be defined before `setStateTimeout` because `setStateTimeout` calls `transition`
  // We'll use a ref for `transition` inside `setStateTimeout` to avoid circular dependencies in `useCallback`
  const transitionRef = useRef<StateManagerInterface['transition']>();

  /**
   * Set timeout for current state
   */
  const setStateTimeout = useCallback((state: GateState) => {
    clearStateTimeout();
    
    const timeout = getStateTimeout(state);
    if (timeout) {
      log(`Setting timeout for ${state}: ${timeout}ms`);
      
      timeoutRef.current = setTimeout(() => {
        log(`State ${state} timed out after ${timeout}ms`);
        
        // Determine timeout target state
        let timeoutAction: GateAction = 'timeout';
        
        switch (state) {
          case 'timeout':
          case 'error':
            timeoutAction = 'retry';
            break;
          default:
            break;
        }
        
        // Trigger timeout transition using the ref
        transitionRef.current?.(timeoutAction, { error: `${state} operation timed out` });
        onTimeout?.(state);
        
      }, timeout) as unknown as number;
    }
  }, [clearStateTimeout, log, onTimeout]);

  /**
   * Perform a state update, including side-effects like logging, timeouts, and callbacks.
   * This function is stable and can be used in other callbacks.
   * @private
   */
  const _performUpdate = useCallback((
    newState: GateState, 
    action: GateAction,
    context?: NetworkOperationContext
  ) => {
    setCurrentState(previousState => {
      // Avoid redundant updates
      if (previousState === newState) {
        return previousState;
      }

      const now = Date.now();
      log(`State transition: ${previousState} → ${newState} (${action})`);
      
      clearStateTimeout();
      
      setStateTimestamp(now);
      setStateContext(context);
      stateStartTimeRef.current = now;
      
      if (isTransitionalState(newState)) {
        setStateTimeout(newState);
      }
      
      onStateChange?.(previousState, newState, action);
      
      return newState;
    });
  }, [clearStateTimeout, setStateTimeout, log, onStateChange]);

  /**
   * Attempt state transition with validation. This function is stable and safe to use in effects and callbacks.
   */
  const transition = useCallback(async (
    action: GateAction, 
    context?: NetworkOperationContext
  ): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setCurrentState(currentState => {
        const nextState = getNextState(currentState, action, context);
    
        if (!nextState) {
          log(`Invalid transition: ${currentState} + ${action}`, context);
          resolve(false);
          return currentState;
        }
        
        if (!isValidTransition(currentState, nextState, action, context)) {
          log(`Transition validation failed: ${currentState} → ${nextState} (${action})`, context);
          resolve(false);
          return currentState;
        }
        
        // The rest of the update logic is now self-contained
        const now = Date.now();
        log(`State transition: ${currentState} → ${nextState} (${action})`);
        
        clearStateTimeout();
        
        setStateTimestamp(now);
        setStateContext(context);
        stateStartTimeRef.current = now;
        
        if (isTransitionalState(nextState)) {
          setStateTimeout(nextState);
        }
        
        onStateChange?.(currentState, nextState, action);
        
        resolve(true);
        return nextState;
      });
    });
  }, [clearStateTimeout, log, onStateChange, setStateTimeout]);

  // Update the ref whenever the `transition` function changes
  useEffect(() => {
    transitionRef.current = transition;
  }, [transition]);

  /**
   * Check if transition is valid
   */
  const canTransition = useCallback((
    to: GateState, 
    action: GateAction, 
    context?: NetworkOperationContext
  ): boolean => {
    return isValidTransition(currentState, to, action, context);
  }, [currentState]);

  /**
   * Get current state information with metadata
   */
  const getStateInfo = useCallback((): GateStateInfo => {
    const metadata = STATE_METADATA[currentState];
    return {
      state: currentState,
      title: metadata.title,
      isDisabled: metadata.isDisabled,
      canRetry: metadata.canRetry,
      timestamp: stateTimestamp,
      metadata: stateContext
    };
  }, [currentState, stateTimestamp, stateContext]);

  /**
   * Get valid actions for current state
   */
  const getValidActions = useCallback((): GateAction[] => {
    const transitions = STATE_TRANSITIONS[currentState];
    if (!transitions) return [];
    return Object.keys(transitions) as GateAction[];
  }, [currentState]);

  /**
   * Reset state to ready with cleanup
   */
  const reset = useCallback(async (): Promise<void> => {
    log('Resetting state machine to ready');
    clearStateTimeout();
    _performUpdate('ready', 'retry');
  }, [clearStateTimeout, _performUpdate, log]);

  /**
   * Trigger gate operation
   */
  const triggerGate = useCallback(async (): Promise<boolean> => {
    if (currentState !== 'ready') {
      log(`Cannot trigger gate from state: ${currentState}`);
      return false;
    }
    
    return transition('userPressed');
  }, [currentState, transition, log]);


  /**
   * Retry current operation
   */
  const retry = useCallback(async (): Promise<boolean> => {
    if (!STATE_METADATA[currentState].canRetry) {
      log(`Cannot retry from state: ${currentState}`);
      return false;
    }
    
    return transition('retry');
  }, [currentState, transition, log]);

  /**
   * Force state change (for testing/recovery)
   */
  const forceState = useCallback((
    state: GateState, 
    context?: NetworkOperationContext
  ) => {
    log(`Force state change to: ${state}`);
    _performUpdate(state, 'retry', context);
  }, [_performUpdate, log]);

  /**
   * Get elapsed time in current state
   */
  const getElapsedTime = useCallback((): number => {
    return Date.now() - stateStartTimeRef.current;
  }, []);

  /**
   * Check if current state has timed out
   */
  const hasTimedOut = useCallback((): boolean => {
    const timeout = getStateTimeout(currentState);
    if (!timeout) return false;
    return getElapsedTime() > timeout;
  }, [currentState, getElapsedTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearStateTimeout();
    };
  }, [clearStateTimeout]);

  // Memoize the returned object to ensure stability
  return useMemo(() => ({
    // StateManagerInterface implementation
    currentState,
    transition,
    canTransition,
    getStateInfo,
    getValidActions,
    reset,
    
    // Additional hook features
    stateInfo: getStateInfo(),
    isTransitional: isTransitionalState(currentState),
    canRetry: STATE_METADATA[currentState].canRetry,
    
    // Action methods
    triggerGate,
    retry,
    
    // Utility methods
    forceState,
    getElapsedTime,
    hasTimedOut
  }), [
    currentState,
    transition,
    canTransition,
    getStateInfo,
    getValidActions,
    reset,
    triggerGate,
    retry,
    forceState,
    getElapsedTime,
    hasTimedOut,
  ]);
}

/**
 * Helper hook for button state display
 * Matches Swift app's ButtonState logic
 */
export function useButtonState(
  stateMachine: UseStateMachineReturn,
  isConfigured: boolean = true
) {
  const { stateInfo, currentState } = stateMachine;
  
  // Override title based on configuration status
  let title = stateInfo.title;
  let isDisabled = stateInfo.isDisabled;
  
  if (currentState === 'ready') {
    title = isConfigured ? 'TRIGGER GATE' : 'CONFIGURE FIRST';
    isDisabled = !isConfigured;
  }
  
  return {
    title,
    isDisabled,
    canRetry: stateInfo.canRetry,
    severity: STATE_METADATA[currentState].severity,
    isTransitional: stateMachine.isTransitional
  };
}
