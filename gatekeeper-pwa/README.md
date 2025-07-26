# Gatekeeper PWA - Phase 3 Complete

A React + TypeScript PWA for controlling a gate through HTTP and MQTT communication protocols, featuring complete state machine implementation, advanced error recovery, and comprehensive timeout management matching the Swift app architecture.

## Current Features (Phase 3 - COMPLETED)

### Network & Communication
- **Network Adapter Chain**: HTTP first, MQTT fallback with NetworkService orchestration
- **Dual-Protocol Configuration**: Tabbed interface for ESP32 HTTP and MQTT broker settings
- **Connection Testing**: Test both HTTP and MQTT connections before saving
- **Network Reachability**: Continuous network monitoring with configurable intervals

### State Management & Recovery
- **Complete State Machine**: 7-state machine matching Swift app behavior (ready, checkingNetwork, noNetwork, triggering, waitingForRelayClose, timeout, error)
- **State Persistence**: Crash recovery with automatic state restoration (5-minute expiry)
- **Advanced Error Recovery**: Exponential backoff retry with configurable parameters
- **Timeout Management**: Per-operation timeouts with intelligent fallback strategies

### Configuration & Validation
- **Enhanced Configuration**: State machine configuration with timeout, retry, and reachability settings
- **Centralized Validation**: ValidationService with dual modes and intelligent warnings
- **Unified Error Handling**: NetworkErrorHandler for consistent error management
- **Local Storage**: Persistent configuration with automatic validation and backup/restore
- **Form Validation**: Real-time validation for all parameters with bounds checking

### Architecture & Developer Experience
- **React Hooks**: Enhanced useConfig and new useStateMachine hooks for UI integration
- **TypeScript**: Comprehensive type safety with strict mode
- **Clean Architecture**: DRY principles, proper separation of concerns, no code duplication
- **Modular Design**: Utilities for timeout management, network state coordination, and validation

## Quick Start

1. **Start Docker Container** (if not running):
   ```bash
   docker compose up -d
   ```

2. **Install Dependencies**:
   ```bash
   docker exec gatekeeper-pwa npm install
   ```

3. **Start Development Server**:
   ```bash
   docker exec gatekeeper-pwa npm run dev
   ```

3. **Configure Protocols**: 
   - Click the gear icon in the app to open configuration modal
   - **ESP32 Tab**: Enter HTTP endpoint (IP address/hostname and port)
   - **MQTT Tab**: Enter broker settings (host, port, credentials, SSL)
   - Use connection test buttons to verify settings before saving
   - Configurations save automatically to Local Storage

4. **Protocol Endpoints**:
   - **HTTP**: ESP32 must respond to `POST /trigger` with 200 OK status
   - **MQTT**: Broker must accept publish to gate control topic

## Project Structure

```
gatekeeper-pwa/
├── src/
│   ├── components/
│   │   ├── TriggerButton.tsx    # Main trigger button with state machine integration
│   │   └── ConfigModal.tsx      # Dual-protocol config modal with tabbed interface
│   ├── adapters/
│   │   ├── HttpAdapter.ts       # HTTP protocol adapter (ESP32)
│   │   └── MqttAdapter.ts       # MQTT protocol adapter (WSS)
│   ├── services/
│   │   ├── NetworkService.ts    # Network service with adapter chain
│   │   ├── ConfigManager.ts     # Enhanced config persistence with state recovery
│   │   ├── ValidationService.ts # Centralized validation with warnings
│   │   ├── MqttService.ts       # MQTT service for WSS connections
│   │   └── ReachabilityService.ts # Network reachability checking
│   ├── network/
│   │   ├── NetworkConfig.ts     # Network timeouts and constants
│   │   └── NetworkErrorHandler.ts # Centralized error handling
│   ├── hooks/
│   │   ├── useConfig.ts         # Enhanced config hook with state machine support
│   │   └── useStateMachine.ts   # State machine hook for UI integration
│   ├── types/
│   │   ├── index.ts            # Core TypeScript interfaces
│   │   ├── network.ts          # Network-specific type definitions
│   │   ├── errors.ts           # Error type definitions
│   │   └── state-machine.ts    # Complete state machine definitions
│   ├── utils/
│   │   ├── validation.ts       # Low-level validation utilities
│   │   ├── TimeoutManager.ts   # Timeout management with exponential backoff
│   │   └── NetworkStateManager.ts # Network state coordination
│   ├── App.tsx                 # Main App component
│   ├── App.css                 # Component and modal styles
│   └── main.tsx                # React entry point
├── index.html                  # Vite HTML template
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript config
├── vite.config.ts             # Vite build config
└── README.md                  # This file
```

## ESP32 Minimal API

Your ESP32 code needs a minimal HTTP endpoint:

```cpp
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

## Phase 3 Success Criteria (COMPLETED)

### Core State Machine Implementation
- ✅ Complete 7-state machine implementation (`src/types/state-machine.ts`)
- ✅ State transition validation with comprehensive matrix (`STATE_TRANSITIONS`)
- ✅ State metadata for UI rendering (`STATE_METADATA`)
- ✅ State machine hook for React integration (`src/hooks/useStateMachine.ts`)

### Advanced Error Recovery & Timeouts
- ✅ Exponential backoff retry logic (`src/utils/TimeoutManager.ts`)
- ✅ Per-operation timeout configuration (checkingNetwork, triggering, waitingForRelayClose, errorRecovery)
- ✅ State persistence for crash recovery (`ConfigManager.saveState/loadState`)
- ✅ Configurable retry parameters (maxAttempts, backoffMultiplier, baseDelay)

### Enhanced Configuration Management
- ✅ State machine configuration with validation (`src/services/ValidationService.ts`)
- ✅ Enhanced useConfig hook with state machine support
- ✅ Configuration migration to version 2.0.0
- ✅ Comprehensive validation with intelligent warnings
- ✅ Export/import for complete configuration including state machine settings

### Network & Reachability
- ✅ Network reachability service implementation (`src/services/ReachabilityService.ts`)
- ✅ Continuous network monitoring with configurable intervals
- ✅ Network state coordination utilities (`src/utils/NetworkStateManager.ts`)
- ✅ Integration with existing adapter chain pattern

### Architecture & Quality
- ✅ TypeScript strict mode with comprehensive type definitions
- ✅ DRY principles - no code duplication
- ✅ Clean architecture with proper separation of concerns
- ✅ Backward compatibility with all existing Phase 1-2 functionality

## Next Steps (Phase 4)

PWA Features and UI Polish:
1. Service worker implementation for offline capability
2. App manifest for installable PWA
3. Enhanced UI animations and visual polish
4. Push notifications (optional)
5. Background sync for failed requests
6. Advanced error reporting and metrics
7. State machine configuration UI panels
8. Loading states and progress feedback enhancements

## Build Commands

All commands run inside the Docker container:

- **Development**: `docker exec gatekeeper-pwa npm run dev`
- **Build**: `docker exec gatekeeper-pwa npm run build`
- **Preview**: `docker exec gatekeeper-pwa npm run preview`
- **Lint**: `docker exec gatekeeper-pwa npm run lint` (when added)
- **Type Check**: `docker exec gatekeeper-pwa npm run typecheck`

**Container Management**:
- **Start**: `docker compose up -d`
- **Stop**: `docker compose down`
- **Logs**: `docker compose logs gatekeeper-pwa`

## Technology Stack

- **React 18**: Modern React with hooks and functional components
- **TypeScript**: Strict mode with comprehensive interface definitions
- **Vite**: Fast build tool and dev server
- **CSS**: Component styling with state-based colors and transitions
- **Clean Architecture**: Types → Services → Hooks → Components → App
- **Adapter Pattern**: Network protocol abstraction with fallback chain
- **DRY Principles**: No code duplication, centralized validation and error handling

## Architecture Highlights

- **NetworkService**: Orchestrates adapter chain with timeout management
- **ValidationService**: Centralized validation with dual modes (UI forms vs service validation)
- **NetworkErrorHandler**: Unified error categorization and user-friendly messaging
- **Adapter Chain**: HTTP primary, MQTT fallback with proper timeout handling
- **Clean Separation**: Clear boundaries between network, service, and UI layers