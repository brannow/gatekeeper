import React from 'react';
import { useGatekeeper } from '../hooks/useGatekeeper';

const TriggerButton: React.FC = () => {
  const {
    config,
    loading,
    error,
    networkError,
    relayState,
    stateMachine,
    buttonState,
    handleTrigger,
    currentMethod,
    networkService,
  } = useGatekeeper();

  if (loading) {
    return (
      <>
        <h1>Gatekeeper</h1>
        <button className="trigger-button loading" disabled>
          LOADING CONFIG...
        </button>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h1>Gatekeeper</h1>
        <button className="trigger-button error" disabled>
          CONFIG ERROR
        </button>
        <p className="error-message">{error}</p>
      </>
    );
  }

  const formatElapsedTime = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <>
      <h1>Gatekeeper</h1>
      <button
        className={`trigger-button ${stateMachine.currentState}`}
        onClick={handleTrigger}
        disabled={buttonState.isDisabled}
        aria-label={buttonState.title}
      >
        {buttonState.title}
      </button>

      <div className="state-display">
        <div className="state-info">
          <span className="state-title">
            {stateMachine.currentState.charAt(0).toUpperCase() + stateMachine.currentState.slice(1)}
          </span>
          {stateMachine.isTransitional && (
            <span className="state-elapsed">
              {formatElapsedTime(stateMachine.getElapsedTime())}
            </span>
          )}
        </div>

        {stateMachine.isTransitional && (
          <div className="progress-container">
            <div className="spinner"></div>
          </div>
        )}

        {stateMachine.canRetry && (
          <button
            className="retry-button"
            onClick={handleTrigger}
            disabled={stateMachine.isTransitional}
          >
            🔄 Retry
          </button>
        )}

        {networkError && <div className="error-message">{networkError}</div>}


        <div className="config-display">
          <div className="network-status">
            <div className="network-method">
              <span className="method-label">ESP32:</span>
              <span className="status-indicator esp32">
                {config?.esp32.host}:{config?.esp32.port}
              </span>
            </div>
            {config?.mqtt.host && (
              <div className="network-method">
                <span className="method-label">MQTT:</span>
                <span className="status-indicator mqtt">
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
    </>
  );
};

export default TriggerButton;