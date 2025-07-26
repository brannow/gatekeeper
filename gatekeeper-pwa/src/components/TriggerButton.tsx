import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createNetworkService } from '../services/NetworkService';
import { createHttpAdapter } from '../adapters/HttpAdapter';
import { createMqttAdapter } from '../adapters/MqttAdapter';
import { createReachabilityService, createReachabilityTargets } from '../services/ReachabilityService';
import { useConfig } from '../hooks/useConfig';
import { useStateMachine, useButtonState } from '../hooks/useStateMachine';
import type { RelayState } from '../types';
import type { NetworkService, NetworkServiceDelegate } from '../types/network';
import type { ReachabilityService, ReachabilityServiceDelegate } from '../services/ReachabilityService';

const TriggerButton: React.FC = () => {
  const { 
    config, 
    loading, 
    error, 
    updateReachabilityStatus,
    // PWA support (Phase 4)
    offlineStatus,
    installStatus,
    queueSize,
    canInstall,
    showInstallPrompt,
    queueGateTrigger
  } = useConfig();
  const [networkService, setNetworkService] = useState<NetworkService | null>(null);
  const [reachabilityService, setReachabilityService] = useState<ReachabilityService | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [currentMethod, setCurrentMethod] = useState<'http' | 'mqtt' | null>(null);
  const [relayState, setRelayState] = useState<RelayState>('released');
  const elapsedTimeRef = useRef<number>(0);
  
  // Check if device is configured
  const isConfigured = Boolean(
    (config.esp32.host && config.esp32.port) || 
    (config.mqtt.host && config.mqtt.port)
  );
  
  // Initialize state machine
  const stateMachine = useStateMachine({
    initialState: 'ready',
    onStateChange: (from, to, action) => {
      console.log(`[TriggerButton] State transition: ${from} → ${to} (${action})`);
      
      // Handle specific state transitions
      if (to === 'checkingNetwork') {
        performReachabilityCheck();
      }
      
      if (to === 'triggering') {
        performGateTrigger();
      }
    },
    onTimeout: (state) => {
      console.warn(`[TriggerButton] State ${state} timed out`);
      setNetworkError(`Operation timed out in ${state} state`);
    },
    onError: (errorMsg, context) => {
      console.error(`[TriggerButton] State machine error:`, errorMsg, context);
      setNetworkError(errorMsg);
    },
    enableLogging: true
  });
  
  // Get button state information
  const buttonState = useButtonState(stateMachine, isConfigured);

  // Perform reachability check
  const performReachabilityCheck = useCallback(async () => {
    if (!reachabilityService || !isConfigured) {
      stateMachine.transition('reachabilityResult', { error: 'No reachability service or not configured' });
      return;
    }
    
    try {
      const targets = createReachabilityTargets(config.esp32, config.mqtt);
      const results = await reachabilityService.testTargets(targets);
      
      const hasReachable = results.some(r => r.isReachable);
      
      if (hasReachable) {
        // Update reachability status for all results
        for (const result of results) {
          const adapterType = result.target.type === 'esp32' ? 'esp32' : 'mqtt';
          const status = result.isReachable ? 'reachable' : 'unreachable';
          await updateReachabilityStatus(adapterType, status);
        }
        
        stateMachine.transition('reachabilityResult');
      } else {
        stateMachine.transition('reachabilityResult', { error: 'No reachable targets' });
      }
      
    } catch (err) {
      console.error('[TriggerButton] Reachability check failed:', err);
      stateMachine.transition('reachabilityResult', { 
        error: err instanceof Error ? err.message : 'Reachability check failed' 
      });
    }
  }, [reachabilityService, isConfigured, config, stateMachine, updateReachabilityStatus]);
  
  // Perform gate trigger operation
  const performGateTrigger = useCallback(async () => {
    if (!networkService) {
      stateMachine.transition('requestComplete', { error: 'No network service available' });
      return;
    }
    
    // Phase 4: Check offline status and queue if necessary
    if (offlineStatus === 'offline') {
      try {
        console.log('[TriggerButton] Device offline, queueing gate trigger');
        
        // Determine which config to queue
        let configToQueue = null;
        if (config.esp32.host && config.esp32.port) {
          configToQueue = config.esp32;
        } else if (config.mqtt.host && config.mqtt.port) {
          configToQueue = config.mqtt;
        }
        
        if (configToQueue) {
          await queueGateTrigger(configToQueue);
          stateMachine.transition('requestComplete', { 
            error: 'Gate trigger queued for when connection is restored'
          });
          setNetworkError('Gate trigger queued - will execute when online');
          return;
        } else {
          stateMachine.transition('requestComplete', { error: 'No valid configuration for offline queueing' });
          return;
        }
      } catch (queueError) {
        console.error('[TriggerButton] Failed to queue gate trigger:', queueError);
        stateMachine.transition('requestComplete', { error: 'Failed to queue gate trigger' });
        return;
      }
    }
    
    try {
      const success = await networkService.triggerGate();
      
      if (success) {
        // In a real scenario, we might get relay feedback
        // For now, simulate relay activation and release
        setRelayState('activated');
        
        // Transition to waiting for relay close
        stateMachine.transition('relayChanged');
        
        // Simulate relay release after delay
        setTimeout(() => {
          setRelayState('released');
          stateMachine.transition('relayChanged');
        }, 2000);
        
      } else {
        stateMachine.transition('requestComplete', { error: 'Gate trigger failed' });
      }
      
    } catch (err) {
      console.error('[TriggerButton] Gate trigger failed:', err);
      stateMachine.transition('requestComplete', { 
        error: err instanceof Error ? err.message : 'Gate trigger failed' 
      });
    }
  }, [networkService, stateMachine, offlineStatus, config, queueGateTrigger]);
  
  // Initialize services when config changes
  useEffect(() => {
    const initializeServices = async () => {
      if (loading || !config) return;
      
      try {
        // Initialize NetworkService
        const service = createNetworkService();
        
        // Set up delegate for network callbacks
        const networkDelegate: NetworkServiceDelegate = {
          onTriggerSuccess: (adapter, duration) => {
            console.log(`[TriggerButton] Gate triggered successfully via ${adapter.name} in ${duration}ms`);
            setNetworkError(null);
            setCurrentMethod(adapter.method);

            // Update reachability status for successful adapter
            const adapterType = adapter.method === 'http' ? 'esp32' : 'mqtt';
            updateReachabilityStatus(adapterType, 'reachable').catch(err => {
              console.warn(`[TriggerButton] Failed to update reachability status:`, err);
            });
          },
          onTriggerFailure: (adapter, error) => {
            const adapterName = adapter ? adapter.name : 'Unknown adapter';
            console.error(`[TriggerButton] Gate trigger failed via ${adapterName}:`, error.message);
            setNetworkError(error.message);
            setCurrentMethod(null);

            // Update reachability status for failed adapter if adapter is available
            if (adapter) {
              const adapterType = adapter.method === 'http' ? 'esp32' : 'mqtt';
              updateReachabilityStatus(adapterType, 'unreachable').catch(err => {
                console.warn(`[TriggerButton] Failed to update reachability status:`, err);
              });
            }
          },
          onConnectionTest: (adapter, success, duration) => {
            console.log(`[TriggerButton] Connection test for ${adapter.name}: ${success ? 'passed' : 'failed'} in ${duration}ms`);
          }
        };

        service.delegate = networkDelegate;
        
        // Add HTTP adapter for ESP32
        if (config.esp32.host && config.esp32.port) {
          const httpAdapter = createHttpAdapter(config.esp32);
          await service.addAdapter(httpAdapter);
        }
        
        // Add MQTT adapter if configured
        if (config.mqtt.host && config.mqtt.port) {
          const mqttAdapter = createMqttAdapter(config.mqtt);
          await service.addAdapter(mqttAdapter);
        }
        
        // Initialize all adapters
        await service.initialize();
        setNetworkService(service);
        
        // Initialize ReachabilityService
        const reachabilityDelegate: ReachabilityServiceDelegate = {
          onReachabilityResult: (_service, target, isReachable, duration) => {
            console.log(`[TriggerButton] Reachability result: ${target.type} is ${isReachable ? 'reachable' : 'unreachable'} (${duration}ms)`);
          },
          onConnectivityChanged: (_service, isOnline) => {
            console.log(`[TriggerButton] Connectivity changed: ${isOnline ? 'online' : 'offline'}`);
            if (!isOnline && stateMachine.currentState === 'ready') {
              stateMachine.transition('configChanged');
            }
          }
        };
        
        const reachability = createReachabilityService({}, reachabilityDelegate);
        setReachabilityService(reachability);
        
        setNetworkError(null);
        
        // If we just initialized and we're in ready state, check network
        if (stateMachine.currentState === 'ready' && isConfigured) {
          stateMachine.transition('configChanged');
        }
        
      } catch (err) {
        console.error('[TriggerButton] Failed to initialize services:', err);
        setNetworkError(err instanceof Error ? err.message : 'Failed to initialize services');
        stateMachine.transition('configChanged', { 
          error: err instanceof Error ? err.message : 'Service initialization failed' 
        });
      }
    };
    
    initializeServices();
    
    // Cleanup on unmount or config change
    return () => {
      if (networkService) {
        networkService.cleanup().catch(err => {
          console.error('[TriggerButton] Error cleaning up NetworkService:', err);
        });
      }
      if (reachabilityService) {
        reachabilityService.cleanup();
      }
      setCurrentMethod(null);
    };
  }, [config, loading, isConfigured, stateMachine, updateReachabilityStatus]);

  // Handle trigger button click
  const handleTrigger = useCallback(async () => {
    if (buttonState.isDisabled) {
      console.warn('[TriggerButton] Button is disabled, cannot trigger');
      return;
    }
    
    setNetworkError(null);
    
    // Handle different states
    switch (stateMachine.currentState) {
      case 'ready':
        if (!isConfigured) {
          setNetworkError('Please configure ESP32 or MQTT settings first');
          return;
        }
        stateMachine.triggerGate();
        break;
        
      case 'noNetwork':
      case 'timeout':
      case 'error':
        // Retry operations
        if (stateMachine.canRetry) {
          stateMachine.retry();
        }
        break;
        
      default:
        console.warn(`[TriggerButton] Cannot handle trigger in state: ${stateMachine.currentState}`);
        break;
    }
  }, [buttonState.isDisabled, stateMachine, isConfigured]);
  
  // Update elapsed time for display
  useEffect(() => {
    const interval = setInterval(() => {
      elapsedTimeRef.current = stateMachine.getElapsedTime();
    }, 100);
    
    return () => clearInterval(interval);
  }, [stateMachine]);

  // Show loading state while configuration is loading
  if (loading) {
    return (
      <div className="container">
        <h1>Gatekeeper</h1>
        <button className="trigger-button loading" disabled>
          LOADING CONFIG...
        </button>
      </div>
    );
  }

  // Show error state if configuration failed to load
  if (error) {
    return (
      <div className="container">
        <h1>Gatekeeper</h1>
        <button className="trigger-button error" disabled>
          CONFIG ERROR
        </button>
        <p className="error-message">{error}</p>
      </div>
    );
  }

  // Format elapsed time for display
  const formatElapsedTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };
  
  return (
    <div className="container">
      <h1>Gatekeeper</h1>
      <button 
        className={`trigger-button ${stateMachine.currentState}`}
        onClick={handleTrigger}
        disabled={buttonState.isDisabled}
        aria-label={buttonState.title}
      >
        {buttonState.title}
      </button>
      
      {/* Enhanced State Display */}
      <div className="state-display">
        <div className="state-info">
          <span className="state-title">
            {stateMachine.currentState.charAt(0).toUpperCase() + stateMachine.currentState.slice(1)}
          </span>
          {stateMachine.isTransitional && (
            <span className="state-elapsed">
              {formatElapsedTime(elapsedTimeRef.current)}
            </span>
          )}
        </div>
        
        {/* Progress Indicators for Transitional States */}
        {stateMachine.isTransitional && (
          <div className="progress-container">
            {['checkingNetwork', 'triggering'].includes(stateMachine.currentState) ? (
              <div className="spinner"></div>
            ) : (
              <div className="progress-bar">
                <div className="progress-fill indeterminate"></div>
              </div>
            )}
          </div>
        )}
        
        {/* Retry Button for Error States */}
        {stateMachine.canRetry && (
          <button 
            className="retry-button"
            onClick={handleTrigger}
            disabled={stateMachine.isTransitional}
          >
            🔄 Retry
          </button>
        )}
        
        {/* Network Error Display */}
        {networkError && (
          <div className="error-message">
            {networkError}
          </div>
        )}
        
        {/* PWA Status Display (Phase 4) */}
        <div className="pwa-status">
          <div className="pwa-indicators">
            <div className="offline-status">
              <span className="status-label">Status:</span>
              <span className={`status-indicator ${offlineStatus}`}>
                <span className="status-dot"></span>
                {offlineStatus === 'offline' ? 'Offline' : 'Online'}
              </span>
            </div>
            
            {queueSize > 0 && (
              <div className="queue-status">
                <span className="status-label">Queue:</span>
                <span className="queue-indicator">
                  {queueSize} pending operation{queueSize !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            
            {canInstall && (
              <button 
                className="install-button"
                onClick={showInstallPrompt}
                title="Install app on this device"
              >
                📱 Install App
              </button>
            )}
            
            {installStatus === 'installed' && (
              <div className="install-status">
                <span className="install-indicator">
                  ✅ App Installed
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Configuration Status */}
        <div className="config-display">
          <div className="network-status">
            <div className="network-method">
              <span className="method-label">ESP32:</span>
              <span className={`status-indicator esp32 ${config.esp32.reachabilityStatus}`}>
                <span className="status-dot"></span>
                {config.esp32.host}:{config.esp32.port}
              </span>
            </div>
            {config.mqtt.host && (
              <div className="network-method">
                <span className="method-label">MQTT:</span>
                <span className={`status-indicator mqtt ${config.mqtt.reachabilityStatus}`}>
                  <span className="status-dot"></span>
                  {config.mqtt.host}:{config.mqtt.port}{config.mqtt.ssl ? ' (SSL)' : ''}
                </span>
              </div>
            )}
            {currentMethod && (
              <div className="active-method">
                <span className="active-label">Active:</span>
                <span className={`active-indicator ${currentMethod}`}>
                  {currentMethod.toUpperCase()}
                </span>
              </div>
            )}
            {relayState === 'activated' && (
              <div className="active-method">
                <span className="active-label">Relay:</span>
                <span className="active-indicator">
                  ACTIVATED
                </span>
              </div>
            )}
            {networkService && (
              <div className="adapter-count">
                <small>{networkService.adapters.length} adapter{networkService.adapters.length !== 1 ? 's' : ''} configured</small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TriggerButton;
