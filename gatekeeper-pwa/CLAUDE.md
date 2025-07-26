# Gatekeeper PWA Project

## Overview
Gatekeeper PWA is a React + TypeScript + Vite application for controlling a gate through network communication. This is the web version of the Swift iOS app, designed as a Progressive Web App (PWA) with ESP32 UDP/HTTP and MQTT protocol support.

## Quick Start Commands
```bash
# Container Management
docker compose up -d                              # Start Docker container
docker compose down                               # Stop Docker container
docker compose logs gatekeeper-node              # View container logs

# Development (all commands run in container)
docker exec gatekeeper-node npm run dev          # Start development server (http://localhost:5173)
docker exec gatekeeper-node npm run build        # Build for production
docker exec gatekeeper-node npm run preview      # Preview production build
docker exec gatekeeper-node npm run lint         # Run ESLint (when added)
docker exec gatekeeper-node npm run typecheck    # TypeScript type checking

# Project setup (run once)
docker exec gatekeeper-node npm install          # Install dependencies
```

## Claude behavior
** Sub Agents ** don't use Parallel Sub-Agents, there often interfere with each-other

## Current Phase Status
**Phase 3: Full State Machine & Advanced Features (COMPLETED)**
- ✅ React + TypeScript + Vite foundation
- ✅ Network adapter chain with HTTP and MQTT support
- ✅ Centralized error handling via NetworkErrorHandler
- ✅ Configuration validation via ValidationService
- ✅ Circular trigger button with state management
- ✅ Configuration modal with dual-protocol support
- ✅ Local Storage persistence via ConfigManager
- ✅ React hooks for configuration state (useConfig)
- ✅ Clean architecture with DRY principles
- ✅ Complete state machine implementation with state transitions
- ✅ Advanced error recovery and retry logic with exponential backoff
- ✅ State persistence for crash recovery
- ✅ Comprehensive timeout management and network reachability
- ✅ Enhanced hooks: useStateMachine for UI state management
- ✅ Network state management utilities and validation warnings
- 🎯 **Next**: Phase 4 - PWA features, service worker, and UI polish

## Project Structure
```
gatekeeper-pwa/
├── src/
│   ├── components/
│   │   ├── TriggerButton.tsx    # Presentation-only trigger button UI
│   │   └── ConfigModal.tsx      # Dual-protocol configuration modal
│   ├── adapters/
│   │   ├── HttpAdapter.ts       # HTTP protocol adapter (ESP32)
│   │   └── MqttAdapter.ts       # MQTT protocol adapter (WSS)
│   ├── services/
│   │   ├── ConfigManager.ts     # Enhanced config persistence with state recovery
│   │   ├── ValidationService.ts # Centralized validation with warnings
│   │   ├── MqttService.ts       # MQTT service for WSS connections
│   │   ├── NetworkService.ts    # Core network service logic (used by hooks)
│   │   └── ReachabilityService.ts # Core network reachability logic (used by hooks)
│   ├── network/
│   │   ├── NetworkConfig.ts     # Network timeouts and constants
│   │   └── NetworkErrorHandler.ts # Centralized error handling
│   ├── hooks/
│   │   ├── useConfig.ts         # Manages application configuration
│   │   ├── useStateMachine.ts   # Generic state machine hook
│   │   ├── useReachability.ts   # Manages ReachabilityService lifecycle
│   │   ├── useNetworkService.ts # Manages NetworkService lifecycle
│   │   └── useGatekeeper.ts     # Main orchestration hook for the application
│   ├── types/
│   │   ├── index.ts            # Core interfaces (GateState, AppConfig, etc.)
│   │   ├── network.ts          # Network-specific type definitions
│   │   ├── errors.ts           # Error type definitions
│   │   └── state-machine.ts    # Complete state machine definitions
│   ├── utils/
│   │   ├── validation.ts       # Low-level validation utilities
│   │   ├── TimeoutManager.ts   # Timeout management with exponential backoff
│   │   └── NetworkStateManager.ts # Network state coordination
│   ├── App.tsx                 # Main App component
│   ├── App.css                 # Component styles with modal and button design
│   └── main.tsx                # React 18 entry point
├── index.html                  # Vite HTML template
├── package.json               # React 18 + TypeScript + Vite dependencies
├── tsconfig.json              # TypeScript strict mode configuration
├── vite.config.ts             # Vite build configuration
└── README.md                  # Setup and usage instructions
```

## Architecture Patterns
- **Hook-Based Architecture**: The primary architectural pattern. All business logic, state management, and service orchestration are handled by custom React Hooks. UI components are simple, presentational, and decoupled from the application's core logic.
- **Clean Architecture**: Types → Services → Hooks → Components → App. This is now even more true, with a clearer separation of concerns.
- **Adapter Chain Pattern**: Still used within the `NetworkService`, which is managed by the `useNetworkService` hook.
- **Composition of Hooks**: The main `useGatekeeper` hook composes multiple smaller, focused hooks (`useConfig`, `useReachability`, `useNetworkService`, `useStateMachine`) to build complex functionality from simple, reusable pieces.
- **Service Layer**: Services like `ConfigManager` and `ValidationService` remain, but are now primarily consumed by the hooks instead of directly by UI components.
- **TypeScript**: Strict mode with comprehensive interface definitions.
- **DRY Principles**: No code duplication, single source of truth for validation/errors.

## Key Components

### useGatekeeper Hook (`src/hooks/useGatekeeper.ts`)
- **Orchestration**: The main application hook. Integrates configuration, services, and the state machine.
- **State Management**: Manages the core application state, including the current state from the state machine, network errors, and relay status.
- **Side Effects**: Contains all the core application logic, such as performing reachability checks and triggering the gate.
- **API for UI**: Exposes a clean, simple interface (`buttonState`, `handleTrigger`, etc.) for the `TriggerButton` component to consume.

### TriggerButton (`src/components/TriggerButton.tsx`)
- **Presentation Only**: A "dumb" component that is only responsible for rendering the UI.
- **No Business Logic**: Contains no application logic, state management, or service interactions.
- **Props-Driven**: Receives all its data and callbacks as props from the `useGatekeeper` hook.

### useNetworkService Hook (`src/hooks/useNetworkService.ts`)
- **Lifecycle Management**: Manages the lifecycle of the `NetworkService`.
- **Initialization**: Creates and initializes the `NetworkService` with the correct adapters based on the application configuration.
- **Cleanup**: Ensures the service is cleaned up properly when the component unmounts.

### useReachability Hook (`src/hooks/useReachability.ts`)
- **Lifecycle Management**: Manages the lifecycle of the `ReachabilityService`.
- **Connectivity State**: Monitors and exposes the online/offline status of the application.

### ConfigModal (`src/components/ConfigModal.tsx`)
- **Form State**: ESP32 host/port with validation.
- **Validation**: IP/hostname format, port range (1-65535).
- **Persistence**: Auto-saves to Local Storage via `useConfig`.
- **UX**: Modal with backdrop close, escape key, form errors.

### useConfig Hook (`src/hooks/useConfig.ts`)
- **State**: AppConfig with loading/error states.
- **Methods**: `updateESP32Config`, `updateMQTTConfig`, `validateAndSave`, `reset`, `import`/`export`.
- **Persistence**: Automatic Local Storage integration via `ConfigManager`.
- **Validation**: Real-time validation with error reporting.

### ConfigManager (`src/services/ConfigManager.ts`)
- **Storage**: Local Storage with JSON serialization.
- **Validation**: IP/hostname regex, port range checking.
- **Migration**: Version-aware configuration migration support.
- **Export/Import**: JSON configuration backup/restore.

### NetworkService (`src/services/NetworkService.ts`)
- **Pattern**: Adapter chain with HTTP first, MQTT fallback.
- **Timeout**: Centralized timeout management via `NetworkConfig`.
- **Error Handling**: Uses `NetworkErrorHandler` for consistent error categorization.
- **Delegation**: Callback pattern for async network operations.

### HttpAdapter (`src/adapters/HttpAdapter.ts`)
- **Method**: `triggerGate(config: ESP32Config) → Promise<boolean>`
- **Endpoint**: POST `/trigger` with configurable timeout.
- **Validation**: Uses `ValidationService` for configuration validation.
- **Error Handling**: Integrated with `NetworkErrorHandler`.

### MqttAdapter (`src/adapters/MqttAdapter.ts`)
- **Protocol**: MQTT over WebSocket Secure (WSS).
- **Method**: Publish to gate control topic.
- **Timeout**: Configurable connection and operation timeouts.
- **Error Handling**: Consistent with HTTP adapter via `NetworkErrorHandler`.

### ValidationService (`src/services/ValidationService.ts`)
- **Dual Modes**: Collect-all errors (forms) and fail-fast (services).
- **Validation**: IP/hostname regex, port ranges, MQTT credentials.
- **Consistency**: Single source of truth for all validation logic.
- **Integration**: Used by `ConfigManager`, adapters, and UI components.

### NetworkErrorHandler (`src/network/NetworkErrorHandler.ts`)
- **Centralized**: All network error categorization and formatting.
- **Context**: Includes adapter, operation, timing, and configuration details.
- **User-Friendly**: Actionable error messages with recovery suggestions.
- **Logging**: Structured error logging for debugging.

### Types (`src/types/index.ts`)
- **GateState**: 'ready' | 'triggering'
- **AppConfig**: Complete configuration structure (ESP32 + MQTT)
- **ValidationResult**: Error/warning reporting interface
- **ConfigHookInterface**: React hook contract definition

## CSS Styling Conventions
- **Button States**: 
  - `.ready` → #4CAF50 (green)
  - `.triggering` → #FF9800 (orange)
  - `:hover` → scale(1.05) transform
- **Layout**: Flexbox centering with min-height: 100vh
- **Typography**: -apple-system font stack for iOS consistency

## ESP32 Integration Requirements
- **Endpoint**: POST /trigger
- **Response**: 200 OK status (content agnostic)
- **CORS**: Must enable CORS for web requests
- **Timeout**: Service has 5s timeout for reliability

## Development Workflow
1. **Start Container**: `docker compose up -d` (if not running)
2. **Start Development**: `docker exec gatekeeper-node npm run dev`
3. **Configure ESP32**: Click gear icon in app to set ESP32 IP/port (auto-saved to Local Storage)
4. **Test Gate Trigger**: Button click → HTTP POST → ESP32 response → Gate activation
5. **Build for Production**: `docker exec gatekeeper-node npm run build` for static files
6. **Type Check**: `docker exec gatekeeper-node npm run typecheck` must pass without errors

## Phase Progression Plan
- **Phase 0** (COMPLETED): React MVP with hardcoded ESP32 IP
- **Phase 1** (COMPLETED): Configuration UI with Local Storage persistence
- **Phase 2** (COMPLETED): MQTT over WSS fallback with adapter chain pattern
- **Phase 3** (COMPLETED): Full state machine matching Swift app behavior
- **Phase 3.5 (Refactor)** (COMPLETED): Migrated to Hook-Based Architecture
- **Phase 4** (NEXT): PWA features (service worker, offline, installable)

## File Location Quick Reference
- **Main Application Logic**: `src/hooks/useGatekeeper.ts`
- **Main Button UI**: `src/components/TriggerButton.tsx`
- **Configuration Modal**: `src/components/ConfigModal.tsx:handleSave`
- **Config State Hook**: `src/hooks/useConfig.ts`
- **State Machine Hook**: `src/hooks/useStateMachine.ts`
- **Network Service Hook**: `src/hooks/useNetworkService.ts`
- **Reachability Hook**: `src/hooks/useReachability.ts`
- **Network Orchestration**: `src/hooks/useGatekeeper.ts:performGateTrigger`
- **Reachability Service**: `src/hooks/useGatekeeper.ts:performReachabilityCheck`
- **HTTP Protocol**: `src/adapters/HttpAdapter.ts:triggerGate`
- **MQTT Protocol**: `src/adapters/MqttAdapter.ts:triggerGate`
- **Validation Logic**: `src/services/ValidationService.ts:validateESP32Config`
- **State Machine Config**: `src/services/ValidationService.ts:validateStateMachineConfig`
- **Error Handling**: `src/network/NetworkErrorHandler.ts:categorizeError`
- **Network Config**: `src/network/NetworkConfig.ts:NETWORK_TIMEOUTS`
- **State Machine Types**: `src/types/state-machine.ts:StateMachineConfig`
- **State Transitions**: `src/types/state-machine.ts:STATE_TRANSITIONS`
- **Type Definitions**: `src/types/index.ts:AppConfig`
- **Form Validation**: `src/utils/validation.ts`
- **Timeout Management**: `src/utils/TimeoutManager.ts:createRetrySchedule`
- **Network State Manager**: `src/utils/NetworkStateManager.ts:coordinateNetworkState`
- **Styling**: `src/App.css:.trigger-button` and `.modal-*`
- **Dependencies**: `package.json:dependencies`

## Common Tasks
- **Change ESP32 Config**: Use configuration modal in app (gear icon) or edit `src/services/ConfigManager.ts` defaults
- **Add new component**: Create in `src/components/` with TypeScript interface
- **Add new service**: Create in `src/services/` with interface in `types/`
- **Extend configuration**: Add fields to `AppConfig` interface and update ConfigManager validation
- **Add form validation**: Extend validation logic in `src/utils/validation.ts`
- **Modify styling**: Edit `src/App.css` for button/modal styles
- **Update dependencies**: Use `docker exec gatekeeper-node npm install <package>`
- **Debug network**: Check browser DevTools Network tab and console logs
- **Export/Import config**: Use ConfigManager methods for backup/restore

## Technology Stack
- **Framework**: React 18 with hooks and functional components
- **Language**: TypeScript with strict mode enabled
- **Build Tool**: Vite for fast development and optimized builds
- **Styling**: CSS with CSS custom properties and transitions
- **Network**: Fetch API with AbortSignal for timeout handling
- **State**: React useState + custom useConfig hook for configuration management

## Code Style Preferences
- **Components**: Functional components with TypeScript React.FC
- **Imports**: Named imports with clear dependency organization
- **Error Handling**: Try-catch blocks with console logging
- **Naming**: camelCase for variables, PascalCase for components
- **File Extensions**: .tsx for React components, .ts for services/types
- **Indentation**: 2 spaces (configured in package.json)

## Phase 1 Success Criteria (COMPLETED)
- ✅ Configuration modal with form validation
- ✅ Local Storage persistence via ConfigManager service
- ✅ Custom useConfig React hook for state management
- ✅ IP/hostname and port validation with error messages
- ✅ Modal UX with backdrop close and escape key support
- ✅ ESP32 configuration display in trigger button
- ✅ TypeScript interfaces for all configuration types
- ✅ Import/export functionality for configuration backup

## Phase 2 Success Criteria (COMPLETED)
**MQTT over WSS Fallback with Adapter Chain Pattern:**
- ✅ MQTT network adapter with WebSocket over SSL (WSS) support
- ✅ NetworkService with adapter chain pattern (try HTTP first, fallback to MQTT)
- ✅ MQTT configuration form in ConfigModal with tabbed interface
- ✅ Connection testing for both HTTP and MQTT protocols
- ✅ Centralized validation and error handling architecture
- ✅ DRY principles enforced throughout codebase
- ✅ Clean architecture with proper separation of concerns

## Phase 3 Success Criteria (COMPLETED)
**Full State Machine and Advanced Features:**
- ✅ Complete state machine matching Swift app behavior (`src/types/state-machine.ts`)
- ✅ Network reachability status indicators (`src/services/ReachabilityService.ts`)
- ✅ Advanced error recovery and retry logic with exponential backoff (`src/utils/TimeoutManager.ts`)
- ✅ State persistence for crash recovery (`src/services/ConfigManager.ts:saveState/loadState`)
- ✅ Enhanced configuration management with state machine config
- ✅ Comprehensive validation with warning system (`src/services/ValidationService.ts`)
- ✅ State machine hook for UI integration (`src/hooks/useStateMachine.ts`)
- ✅ Network state coordination utilities (`src/utils/NetworkStateManager.ts`)

## Phase 4 Requirements (NEXT)
**PWA Features and UI Polish:**
- Service worker implementation for offline capability
- App manifest for installable PWA
- Enhanced UI animations and visual polish
- Push notifications (optional)
- Background sync for failed requests
- Advanced error reporting and metrics
