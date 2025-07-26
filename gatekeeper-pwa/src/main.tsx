import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

/**
 * Register service worker for PWA functionality
 * Phase 4: Enable offline support and background sync
 */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if ('serviceWorker' in navigator) {
    try {
      console.log('[PWA] Registering service worker...');
      
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('[PWA] Service worker registered successfully:', registration.scope);
      
      // Listen for updates
      registration.addEventListener('updatefound', () => {
        console.log('[PWA] Service worker update found');
        
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[PWA] New service worker installed, app will update on next load');
              
              // Optionally notify user about update
              if (window.confirm('App update available. Reload to apply?')) {
                window.location.reload();
              }
            }
          });
        }
      });
      
      return registration;
    } catch (error) {
      console.error('[PWA] Service worker registration failed:', error);
      return null;
    }
  } else {
    console.warn('[PWA] Service workers not supported in this browser');
    return null;
  }
}

/**
 * Initialize PWA features
 */
async function initializePWA(): Promise<void> {
  try {
    // Register service worker
    const registration = await registerServiceWorker();
    
    if (registration) {
      // Initialize offline and install services with registration
      const { offlineService } = await import('./services/OfflineService');
      await import('./services/InstallService'); // InstallService initializes itself
      
      await offlineService.initialize(registration);
      
      console.log('[PWA] PWA features initialized successfully');
    }
  } catch (error) {
    console.error('[PWA] Failed to initialize PWA features:', error);
  }
}

// Initialize PWA features
initializePWA();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)