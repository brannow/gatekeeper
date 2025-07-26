# Gatekeeper Swift to PWA Conversion Plan

## **🎯 CORE VISION - DEAD SIMPLE**

**This app is EXACTLY TWO THINGS:**

### **1. ONE BIG BUTTON** 
- Circular button that triggers the gate
- Shows status: Ready (green) → Triggering (orange) → Ready (green)
- That's it. Nothing more.

### **2. CONFIG PAGE WITH 6 INPUT FIELDS**
- **ESP32 Section**: Host IP, Port
- **MQTT Section**: Host IP, Port, Username, Password  
- Save/Load from Local Storage
- Basic validation (IP format, port range)
- That's it. Nothing more.

### **THE MAGIC: Adapter Chain**
When button pressed → Try ESP32 HTTP API → If fails, try MQTT → Done.
Each adapter has timeout, moves to next on failure.

**EVERYTHING ELSE IS JUST QUALITY OF LIFE:**
- Animations, colors, sound effects
- Error messages, retry logic  
- Offline mode, PWA features
- Logging, monitoring

** THE Original Swift Code **
- all swift code references are based on ../Gatekeeper/
- example Core/Models/GateState.swift is under -> ../Gatekeeper/Core/Models/GateState.swift

---

## **🔍 Current Swift Architecture (For Reference)**

### **Flow Analysis:**
- **State Machine**: `ready → triggering → ready` (simplified, no network checking)
  - **Swift Reference**: `Core/Models/GateState.swift:*` - Defines all gate states
  - **Implementation**: `UI/ViewModels/GateViewModel.swift:updateState` - State transitions
- **Network Adapters**: Chain pattern with HTTP API (ESP32) and MQTT fallback with timeouts
  - **Swift Reference**: `Network/NetworkService.swift:adapters` - Adapter chain implementation
  - **Protocol**: `Core/Protocols/GateNetworkInterface.swift:*` - Network adapter interface
- **Connectivity**: Handled by adapter timeouts and fallback chain
  - **Swift Reference**: `Core/Services/ReachabilityService.swift:startPing` - ICMP ping implementation
- **UI**: Single trigger button with visual feedback + configuration modal
  - **Button**: `UI/Views/AppButton.swift:*` - Main trigger button implementation
  - **Config**: `UI/Views/ConfigView.swift:*` - Configuration interface
- **Communication Protocols**:
  - **UDP**: Send `0x01` → Expect `0x01` (activated) → Expect `0x00` (released)
    - **Swift Reference**: `Network/Adapters/SocketAdapter.swift:sendCommand` - UDP implementation
  - **HTTP API**: POST request → Receive `0x01` (success only, no relay state tracking)
  - **MQTT**: Publish to `iot/house/gate/esp32/trigger` → Subscribe to `iot/house/gate/esp32/status`
    - **Swift Reference**: `Network/Adapters/MQTTNetworkAdapter.swift:publish` - MQTT implementation

## **🚧 PWA Challenges & Solutions**

### **Critical Challenges:**
1. **UDP Sockets**: Not accessible → Use micro Web API (POST → 0x01 success response only)  
2. **MQTT over WSS**: Requires WebSocket Secure connection
3. **Local Network**: HTTPS context restrictions for local IPs
4. **Security Storage**: Local Storage for persistent data
5. **Connectivity**: Adapter timeouts handle network issues (no ping needed)

---

## **📋 PWA Conversion Plan - MVP First Approach**

### **🎯 Strategy: Prove It Works, Then Build It Right**

**Why MVP First?**
- **Risk Reduction**: Validate web→ESP32 communication works before investing in architecture
- **Fast Feedback**: Get physical gate triggering in days, not weeks  
- **Iterative Validation**: Each phase proves incrementally more functionality
- **Clear Success Criteria**: Concrete checkpoints prevent over-engineering

**Phase Progression Rules:**
- ✅ **Phase 0**: Must physically trigger gate via web button before proceeding
- ✅ **Phase 1**: Must have working configuration UI before adding MQTT
- ✅ **Phase 2**: Must have reliable HTTP+MQTT fallback before state complexity
- 🎯 **Phase 3**: Must match Swift app behavior before PWA features

---

### **⚡ QUICK START - Begin Here**

**For Claude Code: Start with Phase 0 React MVP**
1. Run `npm create vite@latest gatekeeper-mvp -- --template react-ts`
2. Create the React components and services from Phase 0.3
3. Use proper TypeScript types and React hooks from the start
4. Test with hardcoded ESP32 IP address (192.168.1.100)
5. **Only proceed to Phase 1 after gate physically triggers**

---

### **🚀 Phase 0: React MVP (Day 1-3)**

**Goal**: Minimal React app that can trigger the gate via HTTP API with proper foundation for expansion

#### **0.1 React MVP Setup**
```
gatekeeper-mvp/
├── src/
│   ├── components/
│   │   └── TriggerButton.tsx    # Main trigger button component
│   ├── services/
│   │   └── HttpService.ts       # HTTP API service
│   ├── types/
│   │   └── index.ts            # Basic TypeScript types
│   ├── App.tsx                 # Main App component
│   ├── App.css                 # Component styles
│   └── main.tsx                # React entry point
├── index.html                  # Vite HTML template
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── vite.config.ts             # Vite build config
└── README.md                  # Setup instructions
```

#### **0.2 Core MVP Features**
- **React + TypeScript + Vite** (proper foundation from day 1)
- **Hardcoded ESP32 IP** (no configuration UI yet)
- **HTTP API only** (simplest network approach)
- **React state management** (useState hook)
- **Component-based architecture** (scalable from start)

#### **0.3 MVP Implementation**

**Setup Commands:**
```bash
npm create vite@latest gatekeeper-mvp -- --template react-ts
cd gatekeeper-mvp
npm install
```

**src/types/index.ts:**
```typescript
export type GateState = 'ready' | 'triggering';

export interface HttpService {
  triggerGate(host: string): Promise<boolean>;
}
```

**src/services/HttpService.ts:**
```typescript
export class HttpService {
  async triggerGate(host: string): Promise<boolean> {
    try {
      const response = await fetch(`http://${host}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      
      return response.ok;
    } catch (error) {
      console.error('Failed to trigger gate:', error);
      return false;
    }
  }
}

export const httpService = new HttpService();
```

**src/components/TriggerButton.tsx:**
```typescript
import React, { useState } from 'react';
import { httpService } from '../services/HttpService';
import type { GateState } from '../types';

const TriggerButton: React.FC = () => {
  const [state, setState] = useState<GateState>('ready');
  const esp32Host = '192.168.1.100'; // Hardcoded for MVP

  const handleTrigger = async () => {
    if (state !== 'ready') return;

    setState('triggering');
    
    try {
      const success = await httpService.triggerGate(esp32Host);
      if (success) {
        console.log('Gate triggered successfully');
      } else {
        console.error('Gate trigger failed');
      }
    } catch (error) {
      console.error('Gate trigger error:', error);
    } finally {
      setState('ready');
    }
  };

  return (
    <div className="container">
      <h1>Gatekeeper</h1>
      <button 
        className={`trigger-button ${state}`}
        onClick={handleTrigger}
        disabled={state !== 'ready'}
      >
        {state === 'ready' ? 'TRIGGER GATE' : 'TRIGGERING...'}
      </button>
    </div>
  );
};

export default TriggerButton;
```

**src/App.tsx:**
```typescript
import React from 'react';
import TriggerButton from './components/TriggerButton';
import './App.css';

function App() {
  return <TriggerButton />;
}

export default App;
```

**src/App.css:**
```css
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.trigger-button {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  border: none;
  font-size: 18px;
  font-weight: bold;
  color: white;
  background: #4CAF50;
  cursor: pointer;
  transition: all 0.3s ease;
}

.trigger-button:disabled,
.trigger-button.triggering {
  background: #FF9800;
  cursor: not-allowed;
}

.trigger-button:hover:not(:disabled) {
  transform: scale(1.05);
}

.trigger-button.ready {
  background: #4CAF50;
}
```

**Swift References:**
- `UI/Views/AppButton.swift:*` - Button behavior to replicate
- `Network/Adapters/SocketAdapter.swift:sendCommand` - Core trigger logic 
- `UI/ViewModels/GateViewModel.swift:triggerGate` - State management pattern

#### **0.4 ESP32 Minimal API**
```cpp
// ESP32 code - Ultra-minimal HTTP endpoint
#include <WiFi.h>
#include <WebServer.h>

WebServer server(80);

void handleTrigger() {
  triggerRelay(); // Your existing relay logic
  server.send(200, "text/plain", "OK");
}

void setup() {
  server.on("/trigger", HTTP_POST, handleTrigger);
  server.enableCORS(true); // Allow web requests
  server.begin();
}
```

#### **0.5 MVP Success Criteria**
- [ ] Button click sends HTTP POST to ESP32
- [ ] ESP32 responds with 200 OK
- [ ] Gate physically triggers
- [ ] Button shows loading state during request
- [ ] Basic error handling for network failures

---

### **Phase 1: Configuration & Storage (Week 1)**

**Goal**: Add configuration UI and persistent storage to React MVP

#### **1.1 Enhanced Structure**
```
gatekeeper-mvp/ (expanded)
├── src/
│   ├── components/
│   │   ├── TriggerButton.tsx    # Enhanced with config
│   │   └── ConfigModal.tsx      # New configuration UI
│   ├── services/
│   │   ├── HttpService.ts       # Enhanced HTTP service
│   │   └── ConfigManager.ts     # Local Storage wrapper  
│   ├── types/
│   │   └── index.ts            # Expanded TypeScript interfaces
│   ├── hooks/
│   │   └── useConfig.ts        # Configuration state hook
│   └── App.tsx                 # Enhanced main component
└── ... (same build setup)
```

#### **1.2 Technology Stack (Already Set)**
- **Framework**: React 18 + TypeScript ✅ (already in place)
- **State Management**: React useState + custom hooks
- **Network**: Fetch API ✅ (already working)
- **Storage**: Local Storage (simple persistence)
- **Build**: Vite ✅ (already configured)
- **UI**: CSS + CSS Modules (component-scoped styling)

#### **1.3 Core Models (TypeScript)**
```typescript
// Core state and data models
interface GateState { /* ready | checkingNetwork | ... */ }
interface RelayState { /* activated | released */ }
interface ESP32Config { /* host, port, reachabilityStatus */ }
interface MQTTConfig { /* host, port, username, password, ssl */ }
interface NetworkMethod { /* udp | mqtt */ }
```
**Swift References:**
- `Core/Models/GateState.swift:*` - Complete gate state definitions
- `Core/Models/RelayState.swift:*` - Relay control states  
- `Core/Models/ESP32Config.swift:*` - ESP32 device configuration model
- `Core/Models/MQTTConfig.swift:*` - MQTT broker configuration model
- `Core/Models/NetworkMethod.swift:*` - Communication protocol enumeration

#### **1.4 Enhancement Steps**
1. **Add Configuration Types**: Expand TypeScript interfaces for ESP32 config
2. **Create ConfigManager**: Local Storage service for persistent settings
3. **Build Configuration UI**: Modal/form for ESP32 IP/port settings
4. **Create useConfig Hook**: Custom hook for configuration state management
5. **Update TriggerButton**: Use dynamic config instead of hardcoded values

#### **1.5 Phase 1 Success Criteria**
- [ ] Configuration modal opens and allows IP/port editing
- [ ] Settings persist in Local Storage between sessions
- [ ] Gate triggering works with user-configured settings
- [ ] Form validation prevents invalid IP addresses/ports
- [ ] TypeScript compilation passes without errors

### **Phase 2: Network Layer Implementation (Week 2-3)**

#### **2.1 Network Adapter Chain with Timeouts**
```typescript
interface NetworkAdapter {
  readonly method: NetworkMethod;
  readonly timeout: number; // Request timeout in ms
  start(): Promise<void>;
  stop(): void;
  delegate?: NetworkAdapterDelegate;
}

class HTTPAPIAdapter implements NetworkAdapter {
  readonly timeout = 5000; // 5 second timeout
  // POST /trigger → 0x01 success response
  // If timeout/error, chain moves to next adapter
}

class MQTTWSAdapter implements NetworkAdapter {
  readonly timeout = 10000; // 10 second timeout  
  // MQTT over WebSocket Secure (WSS)
  // Timeout handles connection issues automatically
}

class NetworkService {
  private adapters: NetworkAdapter[] = [];
  // Try each adapter with timeout, fallback to next on failure
  // No separate reachability checking needed
}
```
**Swift References:**
- `Network/NetworkService.swift:*` - Main network service implementation
- `Network/NetworkService.swift:adapters` - Adapter chain management
- `Network/NetworkService.swift:triggerGate` - Main trigger method with fallback logic
- `Core/Protocols/GateNetworkInterface.swift:*` - NetworkAdapter protocol definition

#### **2.2 ESP32 Micro Web API** 
```javascript
// Minimal HTTP endpoint on ESP32
app.post('/trigger', (req, res) => {
  triggerRelay(); // Gate activation logic
  res.send(0x01); // Success confirmation only
  // Timeout handled by client - no ping needed
});
```

### **Phase 3: State Management & Business Logic (Week 3-4)**

#### **3.1 Zustand Store Setup**
```typescript
interface GateStore {
  // State (simplified - no network checking states)
  currentState: GateState; // ready | triggering  
  lastError: GateKeeperError | null;
  isConfigured: boolean;
  
  // Actions
  triggerGate: () => Promise<void>; // Try adapters with timeouts
  refreshConfiguration: () => void;
  updateState: (state: GateState) => void;
  
  // Config
  esp32Config: ESP32Config | null;
  mqttConfig: MQTTConfig | null;
}

const useGateStore = create<GateStore>()((set, get) => ({
  // Implementation with same state machine logic
}));
```
**Swift References:**
- `UI/ViewModels/GateViewModel.swift:*` - Main view model with state management
- `UI/ViewModels/GateViewModel.swift:currentState` - Current gate state property
- `UI/ViewModels/GateViewModel.swift:triggerGate` - Main gate trigger action
- `UI/ViewModels/GateViewModel.swift:updateState` - State transition method

#### **3.2 Configuration Management**
```typescript
class ConfigManager {
  // Local Storage for all configuration data
  saveESP32Config(config: ESP32Config): void
  getESP32Config(): ESP32Config | null
  
  // Local Storage for MQTT credentials (plaintext)
  saveMQTTCredentials(username: string, password: string): void
  getMQTTCredentials(): {username: string, password: string} | null
  
  // No ping/reachability configuration needed
}
```
**Swift References:**
- `Core/Services/ConfigManager.swift:*` - Configuration persistence service
- `Core/Services/ConfigManager.swift:saveESP32Config` - ESP32 config storage
- `Core/Services/ConfigManager.swift:saveMQTTCredentials` - MQTT credentials in Keychain
- `Core/Protocols/ConfigManagerProtocol.swift:*` - Configuration manager interface

### **Phase 4: UI Components (Week 4-5)**

#### **4.1 Main Trigger Button**
```typescript
const TriggerButton: React.FC = () => {
  const { currentState, triggerGate, buttonTitle, isDisabled } = useGateStore();
  
  // Replicate Swift animations with CSS transitions
  // Shockwave effect, pulse animation, color states
  
  return (
    <button 
      className={`trigger-button ${currentState}`}
      onClick={triggerGate}
      disabled={isDisabled}
    >
      {buttonTitle}
    </button>
  );
};
```
**Swift References:**
- `UI/Views/AppButton.swift:*` - Main trigger button implementation
- `UI/Views/AppButton.swift:buttonColor` - Dynamic button color based on state
- `UI/Views/AppButton.swift:shockwaveAnimation` - Button press animation
- `UI/ViewModels/GateViewModel.swift:buttonTitle` - Dynamic button text
- `UI/ViewModels/GateViewModel.swift:isButtonDisabled` - Button state management

#### **4.2 Configuration Modal**
```typescript
const ConfigModal: React.FC = () => {
  // Form validation matching Swift version
  // ESP32 and MQTT sections
  // Same validation rules for IP addresses and ports
};
```
**Swift References:**
- `UI/Views/ConfigView.swift:*` - Complete configuration interface
- `UI/ViewModels/ConfigViewModel.swift:*` - Configuration validation and logic
- `UI/ViewModels/ConfigViewModel.swift:validateIPAddress` - IP validation method
- `UI/ViewModels/ConfigViewModel.swift:validatePort` - Port validation method
- `UI/Views/ConfigView.swift:ESP32Section` - ESP32 configuration section
- `UI/Views/ConfigView.swift:MQTTSection` - MQTT configuration section

#### **4.3 CSS Animations & Styling**
```css
.trigger-button {
  width: 200px;
  height: 200px;
  border-radius: 50%;
  transition: all 0.3s ease;
  
  /* Simplified color states */
  &.ready { background: #4CAF50; }
  &.triggering { background: #FF9800; }
  &.error { background: #F44336; } /* Only on adapter timeout/failure */
}

/* Shockwave animation */
@keyframes shockwave {
  0% { transform: scale(1); opacity: 0.6; }
  100% { transform: scale(2.5); opacity: 0; }
}
```

### **Phase 5: PWA Features (Week 5-6)**

#### **5.1 Service Worker**
```javascript
// Cache network requests for offline capability
// Background sync for failed gate triggers
// Push notifications for gate status (optional)
```

#### **5.2 PWA Manifest**
```json
{
  "name": "Gatekeeper",
  "short_name": "Gate",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#4CAF50",
  "background_color": "#ffffff",
  "start_url": "/",
  "icons": [/* Various sizes */]
}
```

#### **5.3 Installation & Updates**
- Add-to-homescreen prompt
- App update notifications
- Offline mode with cached configuration

### **Phase 6: Security & Production (Week 6-7)**

#### **6.1 Data Persistence**
```typescript
class StorageManager {
  // Simple Local Storage operations
  setItem(key: string, value: string): void
  getItem(key: string): string | null
  removeItem(key: string): void
  
  // JSON serialization helpers
  setObject(key: string, obj: any): void
  getObject<T>(key: string): T | null
}
```

#### **6.2 HTTPS & Local Network Access**
- Configure HTTPS for local development
- Handle mixed content warnings
- Implement certificate handling for local MQTT brokers

#### **6.3 Error Handling & Logging**
```typescript
class Logger {
  // Structured logging matching Swift version
  info(message: string, metadata?: Record<string, any>): void
  warning(message: string, error?: Error): void
  error(message: string, error: Error): void
}
```
**Swift References:**
- `Core/Services/Logger.swift:*` - Complete logging service implementation
- `Core/Services/Logger.swift:info` - Info level logging method
- `Core/Services/Logger.swift:warning` - Warning level logging method
- `Core/Services/Logger.swift:error` - Error level logging method
- `Core/Protocols/LoggerProtocol.swift:*` - Logger protocol definition

### **Phase 7: Testing & Optimization (Week 7-8)**

#### **7.1 Testing Strategy**
- Unit tests for state management (Jest)
- Integration tests for network adapters
- E2E tests with actual ESP32/MQTT setup (Playwright)
- Manual testing on iOS Safari

#### **7.2 Performance Optimization**
- Code splitting for network adapters
- Service worker caching strategy
- Minimize bundle size
- Battery optimization for background operations

#### **7.3 Cross-Platform Compatibility**
- iOS Safari optimization
- Android Chrome testing
- Desktop browser support
- Touch vs. mouse interaction handling

---

## **🚀 Implementation Priority - Progressive Development**

### **Phase 0: React MVP (Day 1-3)**
✅ **GOAL**: Prove the concept works with proper React foundation
1. React + TypeScript + Vite setup with hardcoded IP
2. Component-based architecture from day one
3. HTTP POST to ESP32 `/trigger` endpoint with proper state management
4. Modern React patterns (hooks, TypeScript, services)
   - **Swift Reference**: `UI/Views/AppButton.swift:*` - Basic button behavior
   - **Swift Reference**: `Network/Adapters/SocketAdapter.swift:sendCommand` - Core trigger logic

### **Phase 1: Configuration & Storage (Week 1)**
✅ **GOAL**: Add configuration UI and persistence
1. Configuration modal for ESP32 IP/port settings
2. Local Storage service for persistent configuration
3. Form validation and error handling
4. Custom React hooks for configuration state
   - **Swift Reference**: `UI/Views/ConfigView.swift:ESP32Section` - Configuration interface
   - **Swift Reference**: `Core/Services/ConfigManager.swift:saveESP32Config` - Config persistence

### **Phase 2: Network Reliability (Week 2)**  
✅ **GOAL**: Robust network communication
1. ✅ Add MQTT over WSS as fallback with MqttAdapter
2. ✅ Adapter chain pattern implementation in NetworkService
3. ✅ Centralized timeout handling via NetworkConfig
4. ✅ Unified error handling via NetworkErrorHandler
5. ✅ ValidationService for consistent validation
6. ✅ DRY principles - eliminated code duplication
   - **Swift Reference**: `Network/NetworkService.swift:adapters` - Adapter chain pattern
   - **Swift Reference**: `Network/Adapters/MQTTNetworkAdapter.swift:*` - MQTT implementation

### **Phase 3: Full Feature Parity (Week 3-4)**
✅ **GOAL**: Match Swift app functionality
1. ✅ Complete state machine with relay state tracking (`src/types/state-machine.ts`)
2. ✅ Advanced error recovery and retry logic (`src/services/ConfigManager.ts`, `src/hooks/useConfig.ts`)
3. ✅ Enhanced configuration management with state persistence
4. ✅ Timeout management and exponential backoff retry (`src/utils/TimeoutManager.ts`)
5. ✅ Comprehensive validation with warning system (`src/services/ValidationService.ts`)
6. ✅ Network reachability service implementation (`src/services/ReachabilityService.ts`)
7. ✅ State machine hook for UI integration (`src/hooks/useStateMachine.ts`)
8. ✅ Network state management utilities (`src/utils/NetworkStateManager.ts`)
   - **Swift Reference**: `Core/Models/GateState.swift:*` - Complete state machine ✅ IMPLEMENTED
   - **Swift Reference**: `Core/Services/ReachabilityService.swift:*` - Ping logic ✅ ADAPTED

### **Phase 4: PWA Enhancement (Week 5-6)**
✅ **GOAL**: Native app experience  
1. Service worker and offline support
2. App manifest and installability
3. Push notifications (optional)
4. Background sync for failed requests

### **Enhanced Features**
1. Offline mode support  
2. Push notifications
3. Background app refresh
4. Advanced security features
5. Enhanced error reporting and retry logic

### **Technical Considerations**

#### **Network Architecture Decision**
For UDP limitation, recommended approach:
1. **Primary**: Micro Web API on ESP32 (POST /trigger → 0x01 response)
   - **Swift Reference**: `Network/Adapters/SocketAdapter.swift:sendCommand` - UDP send logic to replicate
2. **Fallback**: MQTT over WSS with full relay state tracking  
   - **Swift Reference**: `Network/Adapters/MQTTNetworkAdapter.swift:publish` - MQTT publish method
   - **Swift Reference**: `Network/Adapters/MQTTNetworkAdapter.swift:subscribe` - Status subscription
3. **Benefit**: Simplified state machine for HTTP, maintains original UDP simplicity
   - **Swift Reference**: `UI/ViewModels/GateViewModel.swift:triggerGate` - Main trigger logic

#### **MQTT Broker Requirements**
- Must support WebSocket Secure (WSS) on port 8083/8884
- Consider using mosquitto with WebSocket support
- Cloud MQTT services (AWS IoT, HiveMQ) support WSS natively
- **Swift Reference**: `Core/Models/MQTTConfig.swift:*` - MQTT broker configuration model

---

## **📁 Complete Swift Reference Index**

### **Core Architecture**
- `Core/DependencyContainer.swift:*` - Dependency injection container
- `GatekeeperApp.swift:*` - Application entry point

### **Models & State Management**
- `Core/Models/GateState.swift:*` - All gate state definitions
- `Core/Models/RelayState.swift:*` - Relay control states
- `Core/Models/ESP32Config.swift:*` - ESP32 device configuration
- `Core/Models/MQTTConfig.swift:*` - MQTT broker configuration
- `Core/Models/NetworkMethod.swift:*` - Communication protocol enum
- `Core/Models/PingTarget.swift:*` - Reachability test targets
- `Core/Models/GateKeeperError.swift:*` - Error type definitions

### **Services & Business Logic**
- `Core/Services/ConfigManager.swift:*` - Configuration persistence
- `Core/Services/Logger.swift:*` - Structured logging service
- `Core/Services/ReachabilityService.swift:*` - ICMP ping implementation
- `Core/Services/ICMPPacket.swift:*` - Low-level ICMP handling

### **Network Layer**
- `Network/NetworkService.swift:*` - Main network service with adapter chain
- `Network/Adapters/SocketAdapter.swift:*` - UDP communication adapter
- `Network/Adapters/MQTTNetworkAdapter.swift:*` - MQTT communication adapter
- `Core/Protocols/GateNetworkInterface.swift:*` - Network adapter protocol
- `Core/Protocols/NetworkServiceDelegate.swift:*` - Service delegate protocol

### **UI Components**
- `UI/Views/AppButton.swift:*` - Main trigger button implementation
- `UI/Views/ConfigView.swift:*` - Configuration interface
- `UI/ViewModels/GateViewModel.swift:*` - Main application view model
- `UI/ViewModels/ConfigViewModel.swift:*` - Configuration view model

### **Protocols & Interfaces**
- `Core/Protocols/ConfigManagerProtocol.swift:*` - Configuration manager interface
- `Core/Protocols/LoggerProtocol.swift:*` - Logging service interface
- `Core/Protocols/ReachabilityServiceProtocol.swift:*` - Ping service interface

This plan maintains the exact same functionality and user experience as your Swift app while adapting to web platform constraints using modern, industry-standard technologies.
