# Network Layer Refactoring Plan

## 🎯 **Objective**
Refactor the network layer to eliminate connection loops, reduce architectural complexity, and align network lifecycle with React best practices.

## 🚨 **Current Problems**

### Connection Loop Issue
- MQTT adapters recreated on every useEffect run
- New client IDs cause connection spam to broker
- Status callbacks trigger useEffect dependencies → infinite loop

### Architectural Issues
1. **Reactive Model Conflict**: Network connections managed in React component lifecycle
2. **Over-Orchestrated Hooks**: `useGatekeeper + useConfig + useNetworkService` creates tight coupling
3. **Adapter Recreation Anti-Pattern**: New network adapters created unnecessarily
4. **State Synchronization Complexity**: Three hooks need to stay in sync
5. **Testing/Debugging Difficulty**: Hook chain makes state bugs hard to trace

### Performance Problems
- Expensive MQTT connection recreation
- Multiple WebSocket connections to same broker
- Memory leaks from improper adapter cleanup

## 🏗️ **Refactoring Strategy**

### Phase 1: Consolidate Network Management
**Goal**: Single hook manages network state and connections

**Target Files:**
- `src/hooks/useGatekeeper.ts` → `src/hooks/useGateControl.ts`
- `src/hooks/useNetworkService.ts` → Remove/merge
- `src/hooks/useConfig.ts` → Simplified config-only hook

### Phase 2: Persistent Network Layer
**Goal**: Network connections survive React re-renders

**Target Files:**
- `src/services/NetworkService.ts` → Enhanced with persistence
- `src/adapters/HttpAdapter.ts` → Reconfigurable without recreation
- `src/adapters/MqttAdapter.ts` → Persistent connections with config updates

### Phase 3: Event-Driven Status Updates
**Goal**: Replace callback chains with event system

**Target Files:**
- `src/services/NetworkEventBus.ts` → New event system
- `src/hooks/useNetworkStatus.ts` → Event subscriber hook

## 📋 **Implementation Plan**

### **PHASE 1: Hook Consolidation** (2-3 hours)

#### Step 1.1: Create New `useGateControl` Hook
```typescript
// src/hooks/useGateControl.ts
export const useGateControl = (initialConfig?: AppConfig) => {
  const [config, setConfig] = useState(initialConfig);
  const [status, setStatus] = useState<GateStatus>('disconnected');
  const [isOnline, setIsOnline] = useState(false);
  const networkServiceRef = useRef<NetworkService | null>(null);
  
  // Only recreate on fundamental config changes (host changes)
  useEffect(() => {
    if (!networkServiceRef.current) {
      networkServiceRef.current = new PersistentNetworkService({
        onStatusChange: setStatus,
        onConnectionChange: setIsOnline
      });
    }
    
    // Reconfigure existing service instead of recreating
    if (config) {
      networkServiceRef.current.updateConfig(config);
    }
    
    return () => networkServiceRef.current?.cleanup();
  }, [config?.esp32.host, config?.mqtt.host]); // Only on host changes
  
  const triggerGate = useCallback(async () => {
    return networkServiceRef.current?.triggerGate() || false;
  }, []);
  
  const updateConfig = useCallback((newConfig: AppConfig) => {
    setConfig(newConfig);
    // Config persistence handled separately
  }, []);
  
  return {
    config,
    status,
    isOnline,
    triggerGate,
    updateConfig,
    networkService: networkServiceRef.current
  };
};
```

#### Step 1.2: Simplify `useConfig` Hook
```typescript
// src/hooks/useConfig.ts - Simplified version
export const useConfig = () => {
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  
  // Only handle config persistence, validation, and PWA features
  // Remove network service integration
  
  return {
    config,
    loading,
    saveConfig,
    validateConfig,
    // PWA features remain
    offlineStatus,
    installStatus,
    // Remove: handleStatusChange, isOnline, updateReachabilityStatus
  };
};
```

#### Step 1.3: Update Components
- `src/components/TriggerButton.tsx`: Use `useGateControl` instead of `useGatekeeper`
- `src/components/ConfigModal.tsx`: Use simplified `useConfig`

### **PHASE 2: Persistent Network Service** (3-4 hours)

#### Step 2.1: Create `PersistentNetworkService`
```typescript
// src/services/PersistentNetworkService.ts
export class PersistentNetworkService {
  private adapters = new Map<string, NetworkAdapter>();
  private eventBus = new NetworkEventBus();
  private currentConfig: AppConfig | null = null;
  
  constructor(private callbacks: NetworkCallbacks) {
    this.eventBus.on('statusChange', this.handleStatusChange.bind(this));
  }
  
  async updateConfig(config: AppConfig): Promise<void> {
    console.log('[PersistentNetworkService] Updating config');
    
    // Update existing adapters instead of recreating
    const httpAdapter = this.adapters.get('http');
    if (config.esp32.host && httpAdapter) {
      await httpAdapter.updateConfig(config.esp32);
    } else if (config.esp32.host && !httpAdapter) {
      await this.addHttpAdapter(config.esp32);
    }
    
    const mqttAdapter = this.adapters.get('mqtt');
    if (config.mqtt.host && mqttAdapter) {
      await mqttAdapter.updateConfig(config.mqtt);
    } else if (config.mqtt.host && !mqttAdapter) {
      await this.addMqttAdapter(config.mqtt);
    }
    
    this.currentConfig = config;
  }
  
  private async addHttpAdapter(config: ESP32Config): Promise<void> {
    const adapter = new PersistentHttpAdapter(config, this.eventBus);
    this.adapters.set('http', adapter);
    await adapter.initialize();
  }
  
  private async addMqttAdapter(config: MQTTConfig): Promise<void> {
    const adapter = new PersistentMqttAdapter(config, this.eventBus);
    this.adapters.set('mqtt', adapter);
    await adapter.initialize();
  }
  
  async triggerGate(): Promise<boolean> {
    // Try adapters in priority order
    for (const adapter of this.adapters.values()) {
      try {
        const result = await adapter.triggerGate();
        if (result) return true;
      } catch (error) {
        console.warn(`[PersistentNetworkService] Adapter ${adapter.name} failed:`, error);
      }
    }
    return false;
  }
}
```

#### Step 2.2: Create `PersistentHttpAdapter`
```typescript
// src/adapters/PersistentHttpAdapter.ts
export class PersistentHttpAdapter implements NetworkAdapter {
  private config: ESP32Config;
  private eventBus: NetworkEventBus;
  
  constructor(config: ESP32Config, eventBus: NetworkEventBus) {
    this.config = config;
    this.eventBus = eventBus;
  }
  
  async updateConfig(newConfig: ESP32Config): Promise<void> {
    console.log('[PersistentHttpAdapter] Config updated');
    this.config = newConfig;
    // Test connection with new config
    const reachable = await this.testConnection();
    this.eventBus.emit('statusChange', {
      adapter: 'esp32',
      status: reachable ? 'reachable' : 'unreachable'
    });
  }
  
  async triggerGate(): Promise<boolean> {
    try {
      const result = await this.executeHttpRequest();
      this.eventBus.emit('statusChange', {
        adapter: 'esp32',
        status: result ? 'reachable' : 'unreachable'
      });
      return result;
    } catch (error) {
      this.eventBus.emit('statusChange', {
        adapter: 'esp32',
        status: 'unreachable'
      });
      return false;
    }
  }
  
  // No more recreation - just reconfiguration
}
```

#### Step 2.3: Create `PersistentMqttAdapter`
```typescript
// src/adapters/PersistentMqttAdapter.ts
export class PersistentMqttAdapter implements NetworkAdapter {
  private config: MQTTConfig;
  private eventBus: NetworkEventBus;
  private mqttService: MqttService | null = null;
  private clientId: string;
  
  constructor(config: MQTTConfig, eventBus: NetworkEventBus) {
    this.config = config;
    this.eventBus = eventBus;
    this.clientId = `gate-pwa-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  }
  
  async updateConfig(newConfig: MQTTConfig): Promise<void> {
    console.log('[PersistentMqttAdapter] Config updated');
    
    // If significant config change (host/port), reconnect
    const needsReconnect = (
      newConfig.host !== this.config.host ||
      newConfig.port !== this.config.port ||
      newConfig.ssl !== this.config.ssl
    );
    
    this.config = newConfig;
    
    if (needsReconnect && this.mqttService) {
      await this.mqttService.disconnect();
      this.mqttService = new MqttService(this.config);
      await this.mqttService.connect();
    }
    
    // Test connection
    const connected = this.mqttService?.connected || false;
    this.eventBus.emit('statusChange', {
      adapter: 'mqtt',
      status: connected ? 'reachable' : 'unreachable'
    });
  }
  
  async initialize(): Promise<void> {
    this.mqttService = new MqttService(this.config);
    const connected = await this.mqttService.connect();
    
    this.eventBus.emit('statusChange', {
      adapter: 'mqtt',
      status: connected ? 'reachable' : 'unreachable'
    });
  }
  
  // Keep same client ID across reconfigurations
  // Only reconnect on significant config changes
}
```

### **PHASE 3: Event-Driven Status System** (2-3 hours)

#### Step 3.1: Create `NetworkEventBus`
```typescript
// src/services/NetworkEventBus.ts
export type NetworkEvent = {
  statusChange: {
    adapter: 'esp32' | 'mqtt';
    status: 'reachable' | 'unreachable' | 'unknown';
    timestamp?: number;
  };
  connectionStateChange: {
    isOnline: boolean;
    activeAdapters: string[];
  };
  gateTrigger: {
    success: boolean;
    adapter?: string;
    duration: number;
  };
};

export class NetworkEventBus {
  private listeners = new Map<keyof NetworkEvent, Set<Function>>();
  
  on<K extends keyof NetworkEvent>(
    event: K,
    listener: (data: NetworkEvent[K]) => void
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    this.listeners.get(event)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }
  
  emit<K extends keyof NetworkEvent>(
    event: K,
    data: NetworkEvent[K]
  ): void {
    console.log(`[NetworkEventBus] ${event}:`, data);
    this.listeners.get(event)?.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`[NetworkEventBus] Error in ${event} listener:`, error);
      }
    });
  }
}
```

#### Step 3.2: Create Status Subscription Hook
```typescript
// src/hooks/useNetworkStatus.ts
export const useNetworkStatus = (eventBus?: NetworkEventBus) => {
  const [adapterStatus, setAdapterStatus] = useState<{
    esp32: 'reachable' | 'unreachable' | 'unknown';
    mqtt: 'reachable' | 'unreachable' | 'unknown';
  }>({
    esp32: 'unknown',
    mqtt: 'unknown'
  });
  
  const [isOnline, setIsOnline] = useState(false);
  
  useEffect(() => {
    if (!eventBus) return;
    
    const unsubscribe = eventBus.on('statusChange', ({ adapter, status }) => {
      setAdapterStatus(prev => {
        const newStatus = { ...prev, [adapter]: status };
        
        // Compute global online status
        const online = Object.values(newStatus).some(s => s === 'reachable');
        setIsOnline(online);
        
        return newStatus;
      });
    });
    
    return unsubscribe;
  }, [eventBus]);
  
  return {
    adapterStatus,
    isOnline,
    esp32Status: adapterStatus.esp32,
    mqttStatus: adapterStatus.mqtt
  };
};
```

## 🧪 **Testing Strategy**

### Unit Tests
- `PersistentNetworkService.test.ts`: Config updates without recreation
- `PersistentMqttAdapter.test.ts`: Connection persistence across reconfigs
- `NetworkEventBus.test.ts`: Event emission and subscription

### Integration Tests
- MQTT connection stability under config changes
- Broker connection count remains stable
- Status updates propagate correctly through event system

### Performance Tests
- Memory usage during config changes
- Connection count monitoring
- WebSocket connection reuse verification

## 📁 **File Structure After Refactoring**

```
src/
├── hooks/
│   ├── useGateControl.ts           # Main control hook (replaces useGatekeeper)
│   ├── useConfig.ts               # Simplified config-only hook
│   ├── useNetworkStatus.ts        # Event-driven status subscription
│   └── useStateMachine.ts         # Unchanged
├── services/
│   ├── PersistentNetworkService.ts # New persistent network layer
│   ├── NetworkEventBus.ts         # New event system
│   ├── MqttService.ts             # Unchanged core MQTT logic
│   └── ConfigManager.ts           # Unchanged
├── adapters/
│   ├── PersistentHttpAdapter.ts   # Reconfigurable HTTP adapter
│   ├── PersistentMqttAdapter.ts   # Persistent MQTT adapter
│   ├── HttpAdapter.ts             # Legacy (remove after migration)
│   └── MqttAdapter.ts             # Legacy (remove after migration)
└── components/
    ├── TriggerButton.tsx          # Uses useGateControl
    └── ConfigModal.tsx            # Uses simplified useConfig
```

## 🚀 **Migration Steps**

### Step 1: Create New Components
1. Implement `PersistentNetworkService`
2. Create `NetworkEventBus` 
3. Build `PersistentHttpAdapter` and `PersistentMqttAdapter`

### Step 2: Create New Hooks
1. Implement `useGateControl` hook
2. Simplify `useConfig` hook
3. Create `useNetworkStatus` hook

### Step 3: Update UI Components
1. Update `TriggerButton` to use `useGateControl`
2. Update `ConfigModal` to use simplified `useConfig`
3. Test status indicators update correctly

### Step 4: Cleanup Legacy Code
1. Remove `useNetworkService` hook
2. Remove old `HttpAdapter` and `MqttAdapter`
3. Remove `useGatekeeper` hook

## ✅ **Success Criteria**

### Connection Stability
- ✅ No MQTT connection loops in broker logs
- ✅ Same MQTT client ID persists across config changes
- ✅ Only one WebSocket connection per adapter

### Performance Improvements
- ✅ <100ms config update time (vs current ~2s)
- ✅ Memory usage stable during config changes
- ✅ No memory leaks from adapter recreation

### Code Quality
- ✅ <3 hooks total (vs current 5+)
- ✅ Single network service instance
- ✅ Event-driven status updates
- ✅ 90%+ test coverage

### Functional Requirements
- ✅ Real-time status indicators work
- ✅ Gate triggering works reliably
- ✅ Config changes apply immediately
- ✅ Offline queue functionality preserved
- ✅ PWA features unchanged

## 🔄 **Rollback Plan**

If issues arise during refactoring:

1. **Incremental Rollback**: Revert by phase (Phase 3 → 2 → 1)
2. **Feature Flags**: Use feature flags to toggle between old/new implementations
3. **Parallel Implementation**: Keep old hooks alongside new ones during transition
4. **Quick Fix**: Revert to current useRef band-aid if needed

## 📊 **Timeline Estimate**

- **Phase 1**: 2-3 hours (Hook consolidation)
- **Phase 2**: 3-4 hours (Persistent network layer)  
- **Phase 3**: 2-3 hours (Event system)
- **Testing**: 2-3 hours
- **Migration**: 1-2 hours

**Total**: ~10-15 hours for complete refactoring

## 🎯 **Benefits After Refactoring**

### Developer Experience
- Simplified debugging (single hook vs hook chain)
- Faster development (fewer moving parts)
- Better testability (isolated concerns)

### Performance
- Elimination of connection recreation overhead
- Reduced memory usage
- Faster config updates

### Architecture
- Aligned with React best practices
- Separation of network and component lifecycles
- Event-driven updates (more scalable)

### Reliability
- No more connection loops
- Persistent connections
- Better error handling and recovery

---

## 📝 **Notes**

- This refactoring addresses the root cause of the connection loop
- The current useRef fix can remain as a temporary measure
- Event-driven architecture provides foundation for future features
- Network layer becomes reusable across different React contexts