import { useCallback, useEffect, useState } from 'react';
import { useConfig } from '../hooks/useConfig';
import type { AppConfig } from '../types';

interface ConfigButtonProps {
  onClick: () => void;
  onInstallPrompt?: () => void;
  className?: string;
}

interface ConfigurationIssues {
  hasIssues: boolean;
  noConfigsSetup: boolean;
  bothUnreachable: boolean;
  hasError: boolean;
}

interface PWAIndicatorData {
  isOffline: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  hasQueuedItems: boolean;
  isStandalone: boolean;
}

/**
 * Floating Configuration Button Component
 * 
 * Features:
 * - Fixed positioned floating button (top-right)
 * - Status-aware styling (shows warning if issues detected)
 * - Accessibility-optimized (screen reader support, focus management)
 * - Mobile-first design with proper touch targets
 * - Visual feedback for configuration state
 * - PWA-specific optimizations:
 *   - iOS Safari safe area handling
 *   - Standalone mode positioning
 *   - Offline status indicators
 *   - Installation flow integration
 *   - Service worker coordination
 *   - Background sync indicators
 */
const ConfigButton: React.FC<ConfigButtonProps> = ({ onClick, onInstallPrompt, className = '' }) => {
  const { 
    config, 
    error, 
    offlineStatus, 
    installStatus, 
    queueSize, 
    canInstall,
    showInstallPrompt,
    processOfflineQueue 
  } = useConfig();

  // PWA state management
  const [isStandalone, setIsStandalone] = useState(false);
  const [showPWABadge, setShowPWABadge] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Initialize PWA-specific state detection
  useEffect(() => {
    // Detect standalone mode
    const checkStandalone = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches ||
                        (window.navigator as any).standalone === true;
      setIsStandalone(standalone);
    };

    checkStandalone();

    // Listen for display mode changes
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handleDisplayModeChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      } else {
        mediaQuery.removeListener(handleDisplayModeChange);
      }
    };
  }, []);

  // Show PWA badge when significant PWA events occur
  useEffect(() => {
    const shouldShowBadge = canInstall || 
                           (queueSize > 0 && offlineStatus === 'offline') ||
                           (installStatus === 'installable' && !isStandalone);
    
    setShowPWABadge(shouldShowBadge);
  }, [canInstall, queueSize, offlineStatus, installStatus, isStandalone]);

  // Analyze configuration for issues that need user attention
  const analyzeConfigurationIssues = useCallback((config: AppConfig, error: string | null): ConfigurationIssues => {
    const { esp32, mqtt } = config;
    
    // Check if both protocols are unreachable
    const bothUnreachable = esp32.reachabilityStatus === 'unreachable' && 
                           mqtt.reachabilityStatus === 'unreachable';
    
    // Check if no configurations are set up
    const noConfigsSetup = (!esp32.host || esp32.host.trim() === '') && 
                          (!mqtt.host || mqtt.host.trim() === '');
    
    const hasError = error !== null;
    const hasIssues = bothUnreachable || noConfigsSetup || hasError;
    
    return {
      hasIssues,
      noConfigsSetup,
      bothUnreachable,
      hasError
    };
  }, []);

  const issues = analyzeConfigurationIssues(config, error);

  // Analyze PWA status for additional indicators
  const getPWAIndicatorData = useCallback((): PWAIndicatorData => {
    return {
      isOffline: offlineStatus === 'offline',
      isInstallable: installStatus === 'installable' && canInstall,
      isInstalled: installStatus === 'installed' || isStandalone,
      hasQueuedItems: queueSize > 0,
      isStandalone
    };
  }, [offlineStatus, installStatus, canInstall, queueSize, isStandalone]);

  const pwaData = getPWAIndicatorData();

  // Handle PWA-specific actions
  const handlePWAAction = useCallback(async (event: React.MouseEvent) => {
    // Handle queue processing when offline
    if (pwaData.hasQueuedItems && offlineStatus === 'online' && !isProcessingQueue) {
      event.preventDefault();
      setIsProcessingQueue(true);
      try {
        await processOfflineQueue();
        console.log('[ConfigButton] Offline queue processed');
      } catch (error) {
        console.error('[ConfigButton] Failed to process offline queue:', error);
      } finally {
        setIsProcessingQueue(false);
      }
      return;
    }

    // Handle installation prompt
    if (pwaData.isInstallable && !isStandalone) {
      event.preventDefault();
      
      // Use provided install prompt callback if available, otherwise use built-in
      if (onInstallPrompt) {
        onInstallPrompt();
      } else {
        try {
          const installed = await showInstallPrompt();
          if (installed) {
            console.log('[ConfigButton] PWA installation completed');
          }
        } catch (error) {
          console.error('[ConfigButton] PWA installation failed:', error);
        }
      }
      return;
    }

    // Default action - open configuration
    onClick();
  }, [pwaData, offlineStatus, isProcessingQueue, processOfflineQueue, showInstallPrompt, isStandalone, onInstallPrompt, onClick]);

  // Generate appropriate aria-label based on configuration and PWA status
  const getAriaLabel = useCallback(() => {
    const baseLabel = 'Open Configuration';
    const shortcut = 'Press Ctrl+C or click';
    
    // PWA-specific actions take precedence
    if (pwaData.hasQueuedItems && offlineStatus === 'online') {
      return `Process ${queueSize} queued gate trigger${queueSize !== 1 ? 's' : ''} - ${shortcut}`;
    }
    
    if (pwaData.isInstallable && !isStandalone) {
      return `Install Gatekeeper as PWA - ${shortcut}`;
    }
    
    if (!issues.hasIssues) {
      return `${baseLabel} - ${shortcut}`;
    }
    
    const issueTypes = [];
    if (issues.noConfigsSetup) issueTypes.push('No configurations set up');
    if (issues.bothUnreachable) issueTypes.push('All configurations unreachable');
    if (issues.hasError) issueTypes.push('Configuration error');
    
    const issueDescription = issueTypes.join(', ');
    return `${baseLabel} (Issues detected: ${issueDescription}) - ${shortcut}`;
  }, [issues, pwaData, offlineStatus, queueSize, isStandalone]);

  // Generate appropriate tooltip based on configuration and PWA status
  const getTooltip = useCallback(() => {
    const baseTitle = 'Configure ESP32 and MQTT settings';
    
    // PWA-specific tooltips
    if (isProcessingQueue) {
      return 'Processing offline queue...';
    }
    
    if (pwaData.hasQueuedItems && offlineStatus === 'online') {
      return `Process ${queueSize} queued operation${queueSize !== 1 ? 's' : ''} from offline mode`;
    }
    
    if (pwaData.isInstallable && !isStandalone) {
      return 'Install Gatekeeper as PWA for better offline experience';
    }
    
    if (pwaData.isOffline) {
      return `${baseTitle} (Operating in offline mode)`;
    }
    
    if (!issues.hasIssues) {
      return baseTitle;
    }
    
    const warningIcon = '⚠️';
    if (issues.noConfigsSetup) {
      return `${baseTitle} (${warningIcon} No configurations set up)`;
    }
    if (issues.bothUnreachable) {
      return `${baseTitle} (${warningIcon} All configurations unreachable)`;
    }
    if (issues.hasError) {
      return `${baseTitle} (${warningIcon} Configuration error detected)`;
    }
    
    return `${baseTitle} (${warningIcon} Issues detected)`;
  }, [issues, pwaData, offlineStatus, queueSize, isProcessingQueue, isStandalone]);

  // Generate button classes based on state
  const getButtonClasses = useCallback(() => {
    const classes = ['config-button'];
    
    if (className) classes.push(className);
    if (issues.hasIssues) classes.push('has-issues');
    if (pwaData.isOffline) classes.push('offline-mode');
    if (pwaData.hasQueuedItems) classes.push('has-queue');
    if (pwaData.isInstallable && !isStandalone) classes.push('installable');
    if (isStandalone) classes.push('standalone-mode');
    if (isProcessingQueue) classes.push('processing');
    
    return classes.join(' ');
  }, [className, issues.hasIssues, pwaData, isStandalone, isProcessingQueue]);

  // Get primary icon based on current state
  const getPrimaryIcon = useCallback(() => {
    if (isProcessingQueue) return '⏳';
    if (pwaData.hasQueuedItems && offlineStatus === 'online') return '📤';
    if (pwaData.isInstallable && !isStandalone) return '📲';
    if (issues.hasIssues) return '⚠️';
    return '⚙️';
  }, [isProcessingQueue, pwaData, offlineStatus, isStandalone, issues.hasIssues]);

  return (
    <button 
      className={getButtonClasses()}
      onClick={handlePWAAction}
      aria-label={getAriaLabel()}
      title={getTooltip()}
      type="button"
      disabled={isProcessingQueue}
    >
      {/* Primary icon */}
      <span className="config-icon-primary">
        {getPrimaryIcon()}
      </span>
      
      {/* PWA status badge */}
      {showPWABadge && (
        <span className="pwa-badge" aria-hidden="true">
          {pwaData.hasQueuedItems && queueSize > 0 && (
            <span className="queue-count">{queueSize}</span>
          )}
          {pwaData.isOffline && (
            <span className="offline-dot"></span>
          )}
        </span>
      )}
      
      {/* Screen reader only text for detailed status */}
      <span className="sr-only">
        Configuration
        {issues.hasIssues && ' - Issues detected'}
        {pwaData.isOffline && ' - Offline mode'}
        {pwaData.hasQueuedItems && ` - ${queueSize} queued operations`}
        {pwaData.isInstallable && !isStandalone && ' - PWA installable'}
      </span>
    </button>
  );
};

export default ConfigButton;