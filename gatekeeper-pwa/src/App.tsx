import { useState, useEffect, useCallback } from 'react';
import TriggerButton from './components/TriggerButton';
import ConfigButton from './components/ConfigButton';
import ConfigModal from './components/ConfigModal';
import InstallPrompt from './components/InstallPrompt';
import './App.css';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInstallPromptOpen, setIsInstallPromptOpen] = useState(false);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);
  
  const openInstallPrompt = useCallback(() => setIsInstallPromptOpen(true), []);
  const closeInstallPrompt = useCallback(() => setIsInstallPromptOpen(false), []);

  // Keyboard shortcut for configuration (Ctrl+C or Cmd+C)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'c' && !event.shiftKey) {
        // Prevent default clipboard behavior only if not in an input field
        const target = event.target as HTMLElement;
        const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        
        if (!isInputField) {
          event.preventDefault();
          openModal();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openModal]);


  return (
    <div className="container">
      <div className="main-content">
        <TriggerButton />
        
        {/* Floating Configuration Button */}
        <ConfigButton onClick={openModal} onInstallPrompt={openInstallPrompt} />
      </div>
      
      {isModalOpen && (
        <ConfigModal
          isOpen={isModalOpen}
          onClose={closeModal}
        />
      )}
      
      {isInstallPromptOpen && (
        <InstallPrompt
          isOpen={isInstallPromptOpen}
          onClose={closeInstallPrompt}
        />
      )}
    </div>
  );
}

export default App;