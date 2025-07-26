/**
 * Installation Service for Gatekeeper PWA
 * Phase 4: Manages PWA installation and related functionality
 * 
 * Features:
 * - BeforeInstallPrompt event handling
 * - Custom installation UI integration
 * - Installation analytics and tracking
 * - iOS Safari PWA detection
 */

/**
 * Installation service delegate interface
 */
export interface InstallServiceDelegate {
  onInstallPromptAvailable(): void;
  onInstallPromptDismissed(): void;
  onInstallCompleted(): void;
  onInstallDeclined(): void;
  onInstallError(error: Error): void;
}

/**
 * PWA installation status
 */
export type InstallStatus = 'unknown' | 'installable' | 'installed' | 'not_supported';

/**
 * Installation service implementation
 * Manages PWA installation across different platforms
 */
export class InstallService {
  private deferredPrompt: any = null;
  private isInstalled = false;
  private isIOSDevice = false;
  private isStandalone = false;
  public delegate?: InstallServiceDelegate;

  constructor() {
    this.detectPlatform();
    this.initializeEventListeners();
    this.checkInstallationStatus();
  }

  /**
   * Get current installation status
   */
  get installStatus(): InstallStatus {
    if (this.isInstalled || this.isStandalone) {
      return 'installed';
    }
    
    if (this.canShowInstallPrompt() || this.isIOSDevice) {
      return 'installable';
    }
    
    if (this.isPWASupported()) {
      return 'unknown';
    }
    
    return 'not_supported';
  }

  /**
   * Check if installation prompt can be shown
   */
  canShowInstallPrompt(): boolean {
    return this.deferredPrompt !== null && !this.isInstalled;
  }

  /**
   * Check if running on iOS
   */
  get isIOS(): boolean {
    return this.isIOSDevice;
  }

  /**
   * Check if running in standalone mode
   */
  get isInStandalone(): boolean {
    return this.isStandalone;
  }

  /**
   * Show installation prompt
   */
  async showInstallPrompt(): Promise<boolean> {
    try {
      if (!this.canShowInstallPrompt()) {
        console.warn('[InstallService] Install prompt not available');
        return false;
      }

      console.log('[InstallService] Showing install prompt');
      
      // Show the install prompt
      this.deferredPrompt.prompt();
      
      // Wait for user response
      const { outcome } = await this.deferredPrompt.userChoice;
      
      console.log(`[InstallService] Install prompt result: ${outcome}`);
      
      if (outcome === 'accepted') {
        this.delegate?.onInstallCompleted();
        this.isInstalled = true;
        this.trackInstallEvent('accepted');
        return true;
      } else {
        this.delegate?.onInstallDeclined();
        this.trackInstallEvent('declined');
        return false;
      }
    } catch (error) {
      console.error('[InstallService] Install prompt failed:', error);
      this.delegate?.onInstallError(error as Error);
      this.trackInstallEvent('error', error);
      return false;
    } finally {
      // Clear the deferred prompt
      this.deferredPrompt = null;
    }
  }

  /**
   * Get iOS installation instructions
   */
  getIOSInstallInstructions(): string[] {
    return [
      'Tap the Share button at the bottom of the screen',
      'Scroll down and tap "Add to Home Screen"',
      'Tap "Add" to install the app'
    ];
  }

  /**
   * Check if PWA is supported
   */
  isPWASupported(): boolean {
    return (
      'serviceWorker' in navigator &&
      ('PushManager' in window || this.isIOSDevice) &&
      ('indexedDB' in window)
    );
  }

  /**
   * Get installation analytics data
   */
  getInstallAnalytics(): any {
    return {
      platform: this.getPlatformName(),
      isInstallable: this.canShowInstallPrompt(),
      isInstalled: this.isInstalled,
      isStandalone: this.isStandalone,
      isIOSDevice: this.isIOSDevice,
      userAgent: navigator.userAgent,
      timestamp: Date.now()
    };
  }

  /**
   * Detect platform and device characteristics
   */
  private detectPlatform(): void {
    // Detect iOS
    this.isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    // Detect standalone mode
    this.isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    
    console.log(`[InstallService] Platform detected - iOS: ${this.isIOSDevice}, Standalone: ${this.isStandalone}`);
  }

  /**
   * Initialize event listeners
   */
  private initializeEventListeners(): void {
    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (event) => {
      console.log('[InstallService] Before install prompt event received');
      
      // Prevent the mini-infobar from appearing
      event.preventDefault();
      
      // Store the event for later use
      this.deferredPrompt = event;
      
      // Notify delegate
      this.delegate?.onInstallPromptAvailable();
      
      this.trackInstallEvent('prompt_available');
    });

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      console.log('[InstallService] App installed event received');
      this.isInstalled = true;
      this.deferredPrompt = null;
      this.delegate?.onInstallCompleted();
      this.trackInstallEvent('app_installed');
    });

    // Listen for display mode changes
    window.matchMedia('(display-mode: standalone)').addEventListener('change', (event) => {
      this.isStandalone = event.matches;
      console.log(`[InstallService] Display mode changed - Standalone: ${this.isStandalone}`);
    });
  }

  /**
   * Check current installation status
   */
  private checkInstallationStatus(): void {
    // Check if already installed/standalone
    if (this.isStandalone) {
      this.isInstalled = true;
      console.log('[InstallService] App is running in standalone mode');
    }

    // Check related applications (if supported)
    if ('getInstalledRelatedApps' in navigator) {
      (navigator as any).getInstalledRelatedApps()
        .then((apps: any[]) => {
          if (apps.length > 0) {
            this.isInstalled = true;
            console.log('[InstallService] Related app detected as installed');
          }
        })
        .catch((error: Error) => {
          console.warn('[InstallService] Failed to check related apps:', error);
        });
    }
  }

  /**
   * Get platform name for analytics
   */
  private getPlatformName(): string {
    if (this.isIOSDevice) {
      return 'iOS';
    }
    
    if (navigator.userAgent.includes('Android')) {
      return 'Android';
    }
    
    if (navigator.userAgent.includes('Windows')) {
      return 'Windows';
    }
    
    if (navigator.userAgent.includes('Mac')) {
      return 'macOS';
    }
    
    if (navigator.userAgent.includes('Linux')) {
      return 'Linux';
    }
    
    return 'Unknown';
  }

  /**
   * Track installation events for analytics
   */
  private trackInstallEvent(event: string, error?: any): void {
    try {
      const eventData = {
        event,
        platform: this.getPlatformName(),
        isIOSDevice: this.isIOSDevice,
        isStandalone: this.isStandalone,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
        error: error ? error.message : undefined
      };

      // Store in local storage for analytics
      const events = this.getStoredEvents();
      events.push(eventData);
      
      // Keep only last 50 events
      if (events.length > 50) {
        events.splice(0, events.length - 50);
      }
      
      localStorage.setItem('gatekeeper_install_events', JSON.stringify(events));
      
      console.log('[InstallService] Install event tracked:', event);
    } catch (error) {
      console.error('[InstallService] Failed to track install event:', error);
    }
  }

  /**
   * Get stored installation events
   */
  private getStoredEvents(): any[] {
    try {
      const eventsData = localStorage.getItem('gatekeeper_install_events');
      return eventsData ? JSON.parse(eventsData) : [];
    } catch (error) {
      console.error('[InstallService] Failed to get stored events:', error);
      return [];
    }
  }

  /**
   * Get installation events for analytics
   */
  getInstallEvents(): any[] {
    return this.getStoredEvents();
  }

  /**
   * Clear installation events
   */
  clearInstallEvents(): void {
    try {
      localStorage.removeItem('gatekeeper_install_events');
      console.log('[InstallService] Install events cleared');
    } catch (error) {
      console.error('[InstallService] Failed to clear install events:', error);
    }
  }
}

/**
 * Create installation service instance
 */
export function createInstallService(): InstallService {
  return new InstallService();
}

// Global installation service instance
export const installService = createInstallService();