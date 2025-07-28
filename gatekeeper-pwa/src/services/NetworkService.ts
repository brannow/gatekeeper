import type { 
  NetworkService as INetworkService,
  NetworkAdapter, 
  NetworkServiceDelegate, 
  NetworkResult, 
  NetworkError 
} from '../types/network';
import type { RelayState } from '../types';
import { categorizeNetworkError } from '../network/NetworkErrorHandler';
import { NETWORK_TIMEOUTS } from '../network/NetworkConfig';

/**
 * Network service implementation with adapter chain pattern
 * Follows Swift reference architecture for reliable network communication
 * Simplified without reachability checking for direct adapter chain execution
 */
export class NetworkService implements INetworkService {
  private _adapters: NetworkAdapter[] = [];
  private _isRunning = false; // Simple lock flag
  private readonly timeoutMs = NETWORK_TIMEOUTS.HTTP;
  
  public delegate?: NetworkServiceDelegate;
  
  // Relay state tracking
  private currentRelayState: RelayState = 'released';

  constructor() {
    // Network service initialization
  }

  get adapters(): NetworkAdapter[] {
    return [...this._adapters]; // Return copy to prevent external mutation
  }

  get currentAdapter(): NetworkAdapter | null {
    return null; // Not tracking current adapter anymore
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Initialize all adapters in the chain
   */
  async initialize(): Promise<void> {
    console.log(`[NetworkService] Initializing ${this._adapters.length} adapters...`);
    
    const initPromises = this._adapters.map(async (adapter, index) => {
      try {
        await adapter.initialize();
        console.log(`[NetworkService] Adapter ${index + 1}/${this._adapters.length} (${adapter.name}) initialized`);
      } catch (error) {
        console.error(`[NetworkService] Failed to initialize adapter ${adapter.name}:`, error);
        // Continue with other adapters even if one fails
      }
    });

    await Promise.allSettled(initPromises);
    console.log('[NetworkService] Initialization completed');
  }

  /**
   * Clean up all adapters and service resources
   */
  async cleanup(): Promise<void> {
    console.log('[NetworkService] Cleaning up...');
    
    this.stopCurrentOperation();
    
    const cleanupPromises = this._adapters.map(async (adapter) => {
      try {
        await adapter.cleanup();
      } catch (error) {
        console.error(`[NetworkService] Error cleaning up adapter ${adapter.name}:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    this._adapters = [];
    
    
    console.log('[NetworkService] Cleanup completed');
  }

  /**
   * Ultra-simple gate trigger: loop through adapters until one succeeds
   * Button is locked while this runs, released when done (success or failure)
   */
  async triggerGate(timestamp: string): Promise<boolean> {
    // Button lock - if already running, ignore
    if (this._isRunning) {
      console.warn('[NetworkService] Button locked - already running');
      return false;
    }

    // No adapters configured
    if (this._adapters.length === 0) {
      console.error('[NetworkService] No adapters configured');
      return false;
    }

    console.log(`[NetworkService] Button pressed - trying ${this._adapters.length} adapters`);
    
    // Lock the button
    this._isRunning = true;
    
    try {
      // Loop through all adapters - if any succeeds, break and return true
      for (const adapter of this._adapters) {
        console.log(`[NetworkService] Trying adapter: ${adapter.name}`);
        
        if (await this.tryAdapter(adapter, timestamp)) {
          console.log(`[NetworkService] SUCCESS - ${adapter.name} worked!`);
          return true; // Success - break the loop, release button
        }
        
        console.log(`[NetworkService] Failed - ${adapter.name}`);
      }
      
      // All adapters failed
      console.warn('[NetworkService] All adapters failed - releasing button');
      return false;
      
    } finally {
      // Always release the button lock
      this._isRunning = false;
    }
  }

  /**
   * Try a single adapter with timeout - return true if success, false if fail/timeout
   */
  private async tryAdapter(adapter: NetworkAdapter, timestamp: string): Promise<boolean> {
    try {
      // Race the adapter call against a timeout
      const result = await Promise.race([
        adapter.triggerGate(timestamp),
        this.createTimeout(this.timeoutMs)
      ]);
      
      return result === true;
      
    } catch (error) {
      // Any error (including timeout) = failure
      console.log(`[NetworkService] Adapter ${adapter.name} error:`, error);
      adapter.cancelCurrentOperation?.(); // Clean up if possible
      return false;
    }
  }

  /**
   * Create a timeout promise that rejects after ms milliseconds
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Test connection for all adapters
   * @returns Promise<NetworkResult[]> - Results for each adapter
   */
  async testAllConnections(): Promise<NetworkResult[]> {
    console.log(`[NetworkService] Testing connections for ${this._adapters.length} adapters`);
    
    const results: NetworkResult[] = [];
    
    for (const adapter of this._adapters) {
      const startTime = Date.now();
      
      try {
        const success = await adapter.testConnection();
        const duration = Date.now() - startTime;
        
        const result: NetworkResult = {
          success,
          adapter,
          duration,
          timestamp: Date.now()
        };
        
        results.push(result);
        this.delegate?.onConnectionTest(adapter, success, duration);
        
      } catch (error) {
        const duration = Date.now() - startTime;
        const networkError = this.categorizeError(error as Error, adapter);
        
        const result: NetworkResult = {
          success: false,
          adapter,
          error: networkError,
          duration,
          timestamp: Date.now()
        };
        
        results.push(result);
        this.delegate?.onConnectionTest(adapter, false, duration);
      }
    }
    
    console.log(`[NetworkService] Connection tests completed: ${results.filter(r => r.success).length}/${results.length} successful`);
    return results;
  }

  /**
   * Add adapter to the chain
   * @param adapter NetworkAdapter to add
   */
  async addAdapter(adapter: NetworkAdapter): Promise<void> {
    console.log(`[NetworkService] Adding adapter: ${adapter.name}`);
    
    // Avoid duplicates
    if (this._adapters.find(a => a === adapter)) {
      console.warn(`[NetworkService] Adapter ${adapter.name} already exists in chain`);
      return;
    }
    
    this._adapters.push(adapter);
    
    try {
      await adapter.initialize();
      console.log(`[NetworkService] Adapter ${adapter.name} added and initialized`);
    } catch (error) {
      console.error(`[NetworkService] Failed to initialize new adapter ${adapter.name}:`, error);
      // Keep adapter in chain but log the error
    }
  }

  /**
   * Remove adapter from the chain
   * @param adapter NetworkAdapter to remove
   */
  async removeAdapter(adapter: NetworkAdapter): Promise<void> {
    console.log(`[NetworkService] Removing adapter: ${adapter.name}`);
    
    const index = this._adapters.findIndex(a => a === adapter);
    if (index === -1) {
      console.warn(`[NetworkService] Adapter ${adapter.name} not found in chain`);
      return;
    }
    
    // If we're currently running, we can't safely remove adapters
    if (this._isRunning) {
      console.warn(`[NetworkService] Cannot remove adapter ${adapter.name} while operation is running`);
      return;
    }
    
    // Clean up the adapter
    try {
      await adapter.cleanup();
    } catch (error) {
      console.error(`[NetworkService] Error cleaning up removed adapter ${adapter.name}:`, error);
    }
    
    // Remove from chain
    this._adapters.splice(index, 1);
    console.log(`[NetworkService] Adapter ${adapter.name} removed`);
  }

  /**
   * Clear all adapters and stop any running operations
   */
  async clearAdapters(): Promise<void> {
    console.log('[NetworkService] Clearing all adapters');
    this.stopCurrentOperation();
    await this.cleanup();
  }

  /**
   * Cancel any ongoing operations across all adapters
   */
  cancelCurrentOperation(): void {
    console.log('[NetworkService] Cancelling operations across all adapters');
    this._adapters.forEach(adapter => adapter.cancelCurrentOperation?.());
    this._isRunning = false; // Release button lock
  }




  /**
   * Get current relay state
   * @returns Current relay state
   */
  getCurrentRelayState(): RelayState {
    return this.currentRelayState;
  }










  /**
   * Stop current operation and clean up state
   */
  private stopCurrentOperation(): void {
    this._isRunning = false;
  }

  /**
   * Categorize error using centralized error handling
   * @param error The error that occurred
   * @param adapter The adapter that threw the error
   * @returns NetworkError with proper categorization
   */
  private categorizeError(error: Error, adapter: NetworkAdapter): NetworkError {
    return categorizeNetworkError(error, adapter.method);
  }
}

/**
 * Create a new NetworkService instance
 * @returns NetworkService instance
 */
export function createNetworkService(): NetworkService {
  return new NetworkService();
}
