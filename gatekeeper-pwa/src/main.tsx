import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

/**
 * Initialize PWA features with Vite PWA plugin
 * Phase 4: Enable offline support and background sync
 */
async function initializePWA(): Promise<void> {
  try {
    console.log('[PWA] Initializing PWA features...');
    
    // Register service worker using VitePWA
    const updateSW = registerSW({
      onNeedRefresh() {
        console.log('[PWA] App update available');
        if (window.confirm('App update available. Reload to apply?')) {
          updateSW(true);
        }
      },
      onOfflineReady() {
        console.log('[PWA] App ready to work offline');
      },
      onRegistered(registration) {
        console.log('[PWA] Service worker registered:', registration?.scope);
        
        // Initialize offline and install services with registration
        initializeServices(registration).catch(error => {
          console.error('[PWA] Failed to initialize services:', error);
        });
      },
      onRegisterError(error) {
        console.error('[PWA] Service worker registration failed:', error);
      }
    });
    
  } catch (error) {
    console.error('[PWA] Failed to initialize PWA features:', error);
  }
}

/**
 * Initialize PWA services after service worker registration
 */
async function initializeServices(registration?: ServiceWorkerRegistration): Promise<void> {
  try {
    // Import and initialize PWA services
    const [{ offlineService }, { installService }] = await Promise.all([
      import('./services/OfflineService'),
      import('./services/InstallService')
    ]);
    
    // Initialize offline service with service worker registration
    if (registration) {
      await offlineService.initialize(registration);
    }
    
    console.log('[PWA] PWA services initialized successfully');
    console.log('[PWA] Install status:', installService.installStatus);
    console.log('[PWA] Offline status:', offlineService.offline ? 'offline' : 'online');
    
  } catch (error) {
    console.error('[PWA] Failed to initialize PWA services:', error);
  }
}

// Initialize PWA features
initializePWA();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)