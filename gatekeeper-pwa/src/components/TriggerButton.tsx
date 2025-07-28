import React from 'react';
import { useGatekeeper } from '../hooks/useGatekeeper';

const TriggerButton: React.FC = () => {
  const {
    loading,
    error,
    buttonState,
    handleTrigger,
    stateMachine,
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

    </>
  );
};

export default TriggerButton;