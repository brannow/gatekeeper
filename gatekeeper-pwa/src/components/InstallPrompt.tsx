import React, { useCallback } from 'react';
import { useConfig } from '../hooks/useConfig';

interface InstallPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * PWA Installation Prompt Component
 * 
 * Features:
 * - Platform-specific installation instructions
 * - iOS Safari manual installation guidance
 * - Android/Desktop automatic installation
 * - Accessibility-optimized
 */
const InstallPrompt: React.FC<InstallPromptProps> = ({ isOpen, onClose }) => {
  const { installStatus, showInstallPrompt } = useConfig();

  // Handle installation action
  const handleInstall = useCallback(async () => {
    try {
      const installed = await showInstallPrompt();
      if (installed) {
        onClose();
      }
    } catch (error) {
      console.error('[InstallPrompt] Installation failed:', error);
    }
  }, [showInstallPrompt, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Detect iOS
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop install-prompt-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content install-prompt-content">
        <div className="modal-header">
          <h2>Install Gatekeeper</h2>
          <button 
            className="modal-close" 
            onClick={onClose} 
            aria-label="Close installation prompt"
          >
            ×
          </button>
        </div>
        
        <div className="modal-body install-prompt-body">
          <div className="install-icon">
            📲
          </div>
          
          <p className="install-description">
            Install Gatekeeper as a PWA for the best experience with offline support and quick access.
          </p>

          {isIOS ? (
            <div className="ios-instructions">
              <h3>iOS Installation Instructions:</h3>
              <ol className="install-steps">
                <li>
                  <span className="step-icon">📤</span>
                  Tap the <strong>Share</strong> button at the bottom of the screen
                </li>
                <li>
                  <span className="step-icon">⬇️</span>
                  Scroll down and tap <strong>"Add to Home Screen"</strong>
                </li>
                <li>
                  <span className="step-icon">✅</span>
                  Tap <strong>"Add"</strong> to install the app
                </li>
              </ol>
              
              <div className="ios-note">
                <strong>Note:</strong> Make sure you're using Safari browser on iOS for PWA installation.
              </div>
            </div>
          ) : (
            <div className="auto-install">
              <p>Click the button below to install Gatekeeper:</p>
              
              <button 
                className="btn-primary install-button"
                onClick={handleInstall}
                disabled={installStatus !== 'installable'}
              >
                🚀 Install App
              </button>
              
              {installStatus !== 'installable' && (
                <p className="install-note">
                  Installation is not available in this browser or the app is already installed.
                </p>
              )}
            </div>
          )}

          <div className="install-benefits">
            <h4>Benefits of Installing:</h4>
            <ul>
              <li>✅ Works offline</li>
              <li>✅ Faster loading</li>
              <li>✅ Desktop/home screen access</li>
              <li>✅ Push notifications (future)</li>
              <li>✅ Better performance</li>
            </ul>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            className="btn-secondary" 
            onClick={onClose}
          >
            Maybe Later
          </button>
          {!isIOS && installStatus === 'installable' && (
            <button 
              className="btn-primary" 
              onClick={handleInstall}
            >
              Install Now
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;