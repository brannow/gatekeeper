import React, { useCallback } from 'react';
import { useConfig } from '../hooks/useConfig';

interface InstallButtonProps {
  onInstallPrompt?: () => void;
  className?: string;
}

/**
 * PWA Installation Button Component
 * 
 * Features:
 * - Only shows when PWA is installable and not already installed
 * - Separate from config functionality
 * - Positioned below config button
 */
const InstallButton: React.FC<InstallButtonProps> = ({ onInstallPrompt, className = '' }) => {
  const { 
    installStatus, 
    canInstall,
    showInstallPrompt
  } = useConfig();

  // Detect standalone mode
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                       (window.navigator as any).standalone === true;

  // Handle installation action
  const handleInstall = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      // Use provided install prompt callback if available, otherwise use built-in
      if (onInstallPrompt) {
        onInstallPrompt();
      } else {
        const installed = await showInstallPrompt();
        if (installed) {
          console.log('[InstallButton] PWA installation completed');
        }
      }
    } catch (error) {
      console.error('[InstallButton] PWA installation failed:', error);
    }
  }, [showInstallPrompt, onInstallPrompt]);

  // Only show if PWA is installable and not already installed/standalone
  const shouldShow = installStatus === 'installable' && canInstall && !isStandalone;

  if (!shouldShow) {
    return null;
  }

  // Build CSS classes
  const getButtonClasses = () => {
    const classes = ['install-button'];
    if (className) classes.push(className);
    return classes.join(' ');
  };

  return (
    <button
      className={getButtonClasses()}
      onClick={handleInstall}
      title="Install Gatekeeper PWA"
      aria-label="Install Gatekeeper as PWA"
    >
      <span className="install-button-icon">📲</span>
      <span className="install-button-text">Install</span>
    </button>
  );
};

export default InstallButton;