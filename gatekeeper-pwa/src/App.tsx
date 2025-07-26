import React, { useState } from 'react';
import TriggerButton from './components/TriggerButton';
import ConfigModal from './components/ConfigModal';
import { useConfig } from './hooks/useConfig';
import './App.css';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { config, loading, error, ...configActions } = useConfig();

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  return (
    <div className="App">
      <div className="main-content">
        <TriggerButton />
        <button className="config-button" onClick={openModal} aria-label="Open Configuration">
          ⚙️ Configuration
        </button>
      </div>
      {isModalOpen && (
        <ConfigModal
          isOpen={isModalOpen}
          onClose={closeModal}
          config={config}
          loading={loading}
          error={error}
          {...configActions}
        />
      )}
    </div>
  );
}

export default App;