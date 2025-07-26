/**
 * Gatekeeper PWA Service Worker
 * Phase 4: Comprehensive PWA features with offline support
 * 
 * Features:
 * - Network-first strategy for API calls
 * - Cache-first strategy for static assets
 * - Offline queue for failed gate triggers
 * - Background sync for network recovery
 * - Cache management and cleanup
 */

const CACHE_NAME = 'gatekeeper-v1.0.0';
const STATIC_CACHE_NAME = 'gatekeeper-static-v1.0.0';
const OFFLINE_QUEUE_NAME = 'gatekeeper-offline-queue';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Network timeout for online requests (5 seconds)
const NETWORK_TIMEOUT = 5000;

// Background sync tags
const SYNC_TAG_GATE_TRIGGER = 'gate-trigger-sync';
const SYNC_TAG_CONFIG_UPDATE = 'config-update-sync';

// Offline queue storage
let offlineQueue = [];

/**
 * Service Worker installation
 * Cache static assets for offline use
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE_NAME).then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      }),
      
      // Initialize offline queue
      initializeOfflineQueue(),
      
      // Skip waiting to activate immediately
      self.skipWaiting()
    ])
  );
});

/**
 * Service Worker activation
 * Clean up old caches and claim clients
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      cleanupOldCaches(),
      
      // Claim all clients
      self.clients.claim()
    ])
  );
});

/**
 * Fetch event handler
 * Implements caching strategy based on request type
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-HTTP requests
  if (!request.url.startsWith('http')) {
    return;
  }
  
  // Handle different request types
  if (isStaticAsset(request)) {
    // Cache-first for static assets
    event.respondWith(handleStaticAsset(request));
  } else if (isAPIRequest(request)) {
    // Network-first for API calls
    event.respondWith(handleAPIRequest(request));
  } else {
    // Default network-first with cache fallback
    event.respondWith(handleDefaultRequest(request));
  }
});

/**
 * Background sync event handler
 * Process offline queue when network is restored
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === SYNC_TAG_GATE_TRIGGER) {
    event.waitUntil(processOfflineQueue());
  } else if (event.tag === SYNC_TAG_CONFIG_UPDATE) {
    event.waitUntil(syncConfigUpdates());
  }
});

/**
 * Message event handler
 * Handle messages from main thread
 */
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  switch (type) {
    case 'QUEUE_GATE_TRIGGER':
      queueGateTrigger(data);
      break;
    case 'GET_OFFLINE_STATUS':
      event.ports[0].postMessage({
        isOffline: !navigator.onLine,
        queueSize: offlineQueue.length
      });
      break;
    case 'CLEAR_OFFLINE_QUEUE':
      clearOfflineQueue();
      break;
    default:
      console.warn('[SW] Unknown message type:', type);
  }
});

/**
 * Check if request is for a static asset
 */
function isStaticAsset(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  return (
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.includes('/assets/') ||
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/manifest.json'
  );
}

/**
 * Check if request is an API call
 */
function isAPIRequest(request) {
  const url = new URL(request.url);
  
  // ESP32 HTTP requests
  if (request.method === 'POST' && url.pathname === '/trigger') {
    return true;
  }
  
  // MQTT WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return true;
  }
  
  // Reachability check requests
  if (request.method === 'HEAD' || request.method === 'GET') {
    return url.hostname !== self.location.hostname;
  }
  
  return false;
}

/**
 * Handle static asset requests with cache-first strategy
 */
async function handleStaticAsset(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      console.log('[SW] Serving from cache:', request.url);
      return cachedResponse;
    }
    
    // Fetch from network and cache
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
      console.log('[SW] Cached new asset:', request.url);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Static asset fetch failed:', error);
    
    // Return cached version or offline page
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return basic offline response for HTML requests
    if (request.destination === 'document') {
      return new Response(
        '<html><body><h1>Offline</h1><p>App is offline. Please check your connection.</p></body></html>',
        { headers: { 'Content-Type': 'text/html' } }
      );
    }
    
    throw error;
  }
}

/**
 * Handle API requests with network-first strategy and offline queueing
 */
async function handleAPIRequest(request) {
  try {
    // Try network first with timeout
    const networkResponse = await Promise.race([
      fetch(request),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Network timeout')), NETWORK_TIMEOUT)
      )
    ]);
    
    if (networkResponse.ok) {
      console.log('[SW] API request succeeded:', request.url);
      return networkResponse;
    } else {
      throw new Error(`API request failed: ${networkResponse.status}`);
    }
  } catch (error) {
    console.warn('[SW] API request failed, queueing for later:', error);
    
    // Queue gate trigger requests for later
    if (request.method === 'POST' && new URL(request.url).pathname === '/trigger') {
      await queueGateTriggerRequest(request);
      
      // Register background sync
      try {
        await self.registration.sync.register(SYNC_TAG_GATE_TRIGGER);
      } catch (syncError) {
        console.warn('[SW] Background sync registration failed:', syncError);
      }
      
      // Return offline response
      return new Response(
        JSON.stringify({
          queued: true,
          message: 'Gate trigger queued for when connection is restored'
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // For other API requests, return error
    return new Response(
      JSON.stringify({
        error: 'Network unavailable',
        message: 'Please check your connection and try again'
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Handle default requests with network-first strategy
 */
async function handleDefaultRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful GET requests
    if (networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('[SW] Default request failed, trying cache:', error);
    
    // Try cache fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    throw error;
  }
}

/**
 * Queue gate trigger request for background sync
 */
async function queueGateTriggerRequest(request) {
  try {
    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: request.method !== 'GET' ? await request.text() : null,
      timestamp: Date.now(),
      retryCount: 0
    };
    
    offlineQueue.push(requestData);
    await saveOfflineQueue();
    
    // Notify main thread
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'GATE_TRIGGER_QUEUED',
        queueSize: offlineQueue.length
      });
    });
    
    console.log('[SW] Gate trigger queued:', requestData.url);
  } catch (error) {
    console.error('[SW] Failed to queue gate trigger:', error);
  }
}

/**
 * Process offline queue during background sync
 */
async function processOfflineQueue() {
  console.log(`[SW] Processing offline queue: ${offlineQueue.length} items`);
  
  const successfulRequests = [];
  const failedRequests = [];
  
  for (const requestData of offlineQueue) {
    try {
      // Reconstruct request
      const request = new Request(requestData.url, {
        method: requestData.method,
        headers: requestData.headers,
        body: requestData.body
      });
      
      // Attempt to send request
      const response = await fetch(request);
      
      if (response.ok) {
        console.log('[SW] Offline request succeeded:', requestData.url);
        successfulRequests.push(requestData);
      } else {
        // Increment retry count
        requestData.retryCount = (requestData.retryCount || 0) + 1;
        
        // Give up after 3 retries
        if (requestData.retryCount >= 3) {
          console.error('[SW] Offline request failed permanently:', requestData.url);
          failedRequests.push(requestData);
        } else {
          console.warn(`[SW] Offline request failed, retry ${requestData.retryCount}/3:`, requestData.url);
          failedRequests.push(requestData);
        }
      }
    } catch (error) {
      console.error('[SW] Error processing offline request:', error);
      requestData.retryCount = (requestData.retryCount || 0) + 1;
      
      if (requestData.retryCount >= 3) {
        failedRequests.push(requestData);
      } else {
        failedRequests.push(requestData);
      }
    }
  }
  
  // Update queue with failed requests
  offlineQueue = failedRequests.filter(req => req.retryCount < 3);
  await saveOfflineQueue();
  
  // Notify main thread of results
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'OFFLINE_QUEUE_PROCESSED',
      processed: successfulRequests.length,
      failed: failedRequests.length,
      remaining: offlineQueue.length
    });
  });
  
  console.log(`[SW] Offline queue processed: ${successfulRequests.length} successful, ${failedRequests.length} failed, ${offlineQueue.length} remaining`);
}

/**
 * Initialize offline queue from storage
 */
async function initializeOfflineQueue() {
  try {
    const cache = await caches.open(OFFLINE_QUEUE_NAME);
    const request = new Request('/offline-queue');
    const response = await cache.match(request);
    
    if (response) {
      const queueData = await response.json();
      offlineQueue = queueData.queue || [];
      console.log(`[SW] Loaded offline queue: ${offlineQueue.length} items`);
    } else {
      offlineQueue = [];
      console.log('[SW] Initialized empty offline queue');
    }
  } catch (error) {
    console.error('[SW] Failed to initialize offline queue:', error);
    offlineQueue = [];
  }
}

/**
 * Save offline queue to storage
 */
async function saveOfflineQueue() {
  try {
    const cache = await caches.open(OFFLINE_QUEUE_NAME);
    const queueData = {
      queue: offlineQueue,
      timestamp: Date.now()
    };
    
    const response = new Response(JSON.stringify(queueData));
    await cache.put('/offline-queue', response);
  } catch (error) {
    console.error('[SW] Failed to save offline queue:', error);
  }
}

/**
 * Clear offline queue
 */
async function clearOfflineQueue() {
  try {
    offlineQueue = [];
    await saveOfflineQueue();
    
    // Notify main thread
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'OFFLINE_QUEUE_CLEARED'
      });
    });
    
    console.log('[SW] Offline queue cleared');
  } catch (error) {
    console.error('[SW] Failed to clear offline queue:', error);
  }
}

/**
 * Sync configuration updates (placeholder for future)
 */
async function syncConfigUpdates() {
  console.log('[SW] Syncing configuration updates...');
  // Placeholder for future configuration sync functionality
}

/**
 * Clean up old caches
 */
async function cleanupOldCaches() {
  const cacheNames = await caches.keys();
  const currentCaches = [CACHE_NAME, STATIC_CACHE_NAME, OFFLINE_QUEUE_NAME];
  
  const deletionPromises = cacheNames
    .filter(cacheName => !currentCaches.includes(cacheName))
    .map(cacheName => {
      console.log('[SW] Deleting old cache:', cacheName);
      return caches.delete(cacheName);
    });
  
  await Promise.all(deletionPromises);
  console.log(`[SW] Cleaned up ${deletionPromises.length} old caches`);
}

/**
 * Queue gate trigger from main thread
 */
function queueGateTrigger(data) {
  const requestData = {
    url: data.url || `http://${data.host}:${data.port}/trigger`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data.body || {}),
    timestamp: Date.now(),
    retryCount: 0
  };
  
  offlineQueue.push(requestData);
  saveOfflineQueue();
  
  console.log('[SW] Gate trigger queued from main thread');
}