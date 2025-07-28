import { useState, useEffect, useCallback } from 'react';
import TriggerButton from './components/TriggerButton';
import ConfigButton from './components/ConfigButton';
import InstallButton from './components/InstallButton';
import ConfigModal from './components/ConfigModal';
import InstallPrompt from './components/InstallPrompt';
import { useTheme } from './hooks/useTheme';
import './App.css';

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isInstallPromptOpen, setIsInstallPromptOpen] = useState(false);

  // Initialize theme management
  const { 
    themeMode, 
    resolvedTheme, 
    loading: themeLoading, 
    error: themeError 
  } = useTheme({
    enableLogging: import.meta.env.DEV,
    onThemeChange: (theme, resolved) => {
      console.log(`[App] Theme changed: ${theme} (resolved: ${resolved})`);
    }
  });

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


  // Show loading state while theme is initializing
  if (themeLoading) {
    return (
      <div className="container" data-theme-loading="true">
        <div className="main-content">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontSize: '16px',
            color: 'var(--text-secondary)'
          }}>
            Initializing theme...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="container" 
      data-theme-mode={themeMode}
      data-resolved-theme={resolvedTheme}
    >
      <div className="main-content">
        <TriggerButton />
        <ConfigButton onClick={openModal} />
        <InstallButton onInstallPrompt={openInstallPrompt} />
      </div>
      
      {/* Theme error display */}
      {themeError && (
        <div className="error-message" style={{ 
          position: 'fixed', 
          top: '20px', 
          left: '20px', 
          zIndex: 1100 
        }}>
          Theme Error: {themeError}
        </div>
      )}
      
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