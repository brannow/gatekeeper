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
**Phase 4: PWA Features & Hook-Based Architecture (COMPLETED)**
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
- ✅ **MAJOR FIX**: Hook-based architecture to prevent infinite re-render loops
- ✅ PWA Infrastructure: InstallService and OfflineService implemented
- ✅ **ConfigButton Enhancement**: Floating design with PWA integration
- ✅ **Service Worker**: Complete PWA implementation with offline support
- ✅ **Installation Flow**: Cross-platform PWA installation with platform detection
- ✅ **PWA Optimization**: iOS safe areas, standalone mode, keyboard shortcuts
- 🎯 **Status**: Production-ready PWA with complete feature set

## Project Structure
```
gatekeeper-pwa/
├── src/
│   ├── components/
│   │   ├── TriggerButton.tsx    # Presentation-only trigger button UI (fixed re-render loop)
│   │   ├── ConfigModal.tsx      # Dual-protocol configuration modal
│   │   ├── ConfigButton.tsx     # Floating config button with PWA status (Phase 4)
│   │   └── InstallPrompt.tsx    # PWA installation modal with platform detection
│   ├── adapters/
│   │   ├── HttpAdapter.ts       # HTTP protocol adapter (ESP32)
│   │   └── MqttAdapter.ts       # MQTT protocol adapter (WSS)
│   ├── services/
│   │   ├── ConfigManager.ts     # Enhanced config persistence with state recovery
│   │   ├── ValidationService.ts # Centralized validation with warnings
│   │   ├── MqttService.ts       # MQTT service for WSS connections
│   │   ├── NetworkService.ts    # Core network service logic (used by hooks)
│   │   ├── ReachabilityService.ts # Core network reachability logic (used by hooks)
│   │   ├── InstallService.ts    # PWA installation management with platform detection
│   │   └── OfflineService.ts    # Offline queue and sync management with service worker
│   ├── network/
│   │   ├── NetworkConfig.ts     # Network timeouts and constants
│   │   └── NetworkErrorHandler.ts # Centralized error handling
│   ├── hooks/
│   │   ├── useConfig.ts         # Enhanced config hook with PWA features
│   │   ├── useStateMachine.ts   # Generic state machine hook with timeout fixes
│   │   ├── useReachability.ts   # Manages ReachabilityService lifecycle
│   │   ├── useNetworkService.ts # Manages NetworkService lifecycle
│   │   └── useGatekeeper.ts     # Main orchestration hook (ARCHITECTURAL CORE)
│   ├── types/
│   │   ├── index.ts            # Core interfaces with PWA types
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
├── public/
│   ├── manifest.json           # PWA manifest for installation
│   ├── sw.js                   # Service worker for offline support
│   └── icons/                  # PWA icons (various sizes)
├── index.html                  # Vite HTML template with PWA meta tags
├── package.json               # React 18 + TypeScript + Vite + PWA dependencies
├── tsconfig.json              # TypeScript strict mode configuration
├── vite.config.ts             # Vite build configuration with PWA plugin
└── README.md                  # Setup and usage instructions
```

## Architecture Patterns
- **Hook-Based Architecture**: The primary architectural pattern. All business logic, state management, and service orchestration are handled by custom React Hooks. UI components are simple, presentational, and decoupled from the application's core logic.
- **Event System Refactoring**: **CRITICAL FIX** - Moved from component-based event handling to hook-based event management to prevent infinite re-render loops that were caused by improper event listener dependencies.
- **Clean Architecture**: Types → Services → Hooks → Components → App. This is now even more true, with a clearer separation of concerns.
- **Adapter Chain Pattern**: Still used within the `NetworkService`, which is managed by the `useNetworkService` hook.
- **Composition of Hooks**: The main `useGatekeeper` hook composes multiple smaller, focused hooks (`useConfig`, `useReachability`, `useNetworkService`, `useStateMachine`) to build complex functionality from simple, reusable pieces.
- **Service Layer**: Services like `ConfigManager` and `ValidationService` remain, but are now primarily consumed by the hooks instead of directly by UI components.
- **Memoization & Stability**: Extensive use of `useMemo`, `useCallback`, and stable object references to prevent unnecessary re-renders.
- **TypeScript**: Strict mode with comprehensive interface definitions.
- **DRY Principles**: No code duplication, single source of truth for validation/errors.

## Key Components

### useGatekeeper Hook (`src/hooks/useGatekeeper.ts`) - ARCHITECTURAL CORE
- **Orchestration**: The main application hook. Integrates configuration, services, and the state machine.
- **State Management**: Manages the core application state, including the current state from the state machine, network errors, and relay status.
- **Side Effects**: Contains all the core application logic, such as performing reachability checks and triggering the gate.
- **Event Handling**: **FIXED** - Uses stable memoized delegate objects and proper dependency arrays to prevent re-render loops.
- **API for UI**: Exposes a clean, simple interface (`buttonState`, `handleTrigger`, etc.) for the `TriggerButton` component to consume.
- **Service Integration**: Coordinates between `useConfig`, `useReachability`, `useNetworkService`, and `useStateMachine` hooks.

### TriggerButton (`src/components/TriggerButton.tsx`) - COMPLETELY REFACTORED
- **Presentation Only**: A "dumb" component that is only responsible for rendering the UI.
- **No Business Logic**: Contains no application logic, state management, or service interactions.
- **Props-Driven**: Receives all its data and callbacks as props from the `useGatekeeper` hook.
- **Performance Fix**: **CRITICAL** - No longer causes infinite re-render loops due to proper separation of concerns.
- **Enhanced Display**: Shows detailed state information, network status, PWA indicators, and method tracking.

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

### ConfigButton (`src/components/ConfigButton.tsx`) - NEW IN PHASE 4
- **Floating Design**: Top-right positioned floating button with proper z-index
- **PWA Integration**: Status-aware functionality based on app state
- **Smart Actions**: Queue processing → Installation prompts → Configuration modal
- **Accessibility**: Keyboard shortcuts (Ctrl+C), screen reader support, focus management
- **Mobile Optimized**: 44px+ touch targets, iOS safe area support
- **Status Indicators**: Visual badges for offline, queue, installable, and processing states
- **Platform Detection**: Different behavior for iOS Safari vs other browsers

### useConfig Hook (`src/hooks/useConfig.ts`) - ENHANCED FOR PWA
- **State**: AppConfig with loading/error states.
- **Methods**: `updateESP32Config`, `updateMQTTConfig`, `validateAndSave`, `reset`, `import`/`export`.
- **Persistence**: Automatic Local Storage integration via `ConfigManager`.
- **Validation**: Real-time validation with error reporting.
- **PWA Integration**: **NEW** - Includes offline status, install status, queue management for PWA features.
- **State Machine Config**: Enhanced with state machine configuration management and persistence.

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

### PWA Services (Phase 4 - COMPLETED)

### InstallService (`src/services/InstallService.ts`)
- **PWA Installation**: Complete beforeinstallprompt handling with cross-platform support
- **Platform Detection**: iOS Safari manual vs Android/Desktop automatic installation
- **Installation Flow**: Custom modals with platform-specific instructions
- **State Management**: Installation status tracking and user interaction analytics
- **Benefits Presentation**: User education about PWA advantages

### OfflineService (`src/services/OfflineService.ts`)
- **Queue Management**: Comprehensive offline operation queue with retry logic
- **Service Worker Integration**: Full coordination with workbox service worker
- **Background Sync**: Automatic processing when connectivity returns
- **Gate Trigger Queuing**: Reliable offline gate trigger operations
- **Sync Status**: Real-time queue status and processing indicators

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
- **ConfigButton States**:
  - `.offline-mode` → Gray with pulse animation
  - `.has-queue` → Blue with queue count badge
  - `.installable` → Purple with install icon
  - `.processing` → Orange with rotation animation
- **PWA Responsive Design**: iOS safe areas, standalone mode, mobile-first approach
- **Accessibility**: Focus indicators, high contrast support, reduced motion preferences

## ESP32 Integration Requirements
- **Endpoint**: POST /trigger
- **Response**: 200 OK status (content agnostic)
- **CORS**: Must enable CORS for web requests
- **Timeout**: Service has 5s timeout for reliability

## Development Workflow
1. **Start Container**: `docker compose up -d` (if not running)
2. **Start Development**: `docker exec gatekeeper-node npm run dev`
3. **Configure ESP32**: Click floating config button (⚙️) in top-right to set ESP32 IP/port
4. **PWA Testing**: Use Ctrl+C keyboard shortcut to open configuration
5. **Test Gate Trigger**: Button click → HTTP POST → ESP32 response → Gate activation
6. **Test PWA Installation**: Use browser's "Install App" or custom installation prompt
7. **Test Offline Mode**: Disconnect network to test offline queue functionality
8. **Build for Production**: `docker exec gatekeeper-node npm run build` for static files
9. **Type Check**: `docker exec gatekeeper-node npm run typecheck` must pass without errors

## Phase Progression Plan
- **Phase 0** (COMPLETED): React MVP with hardcoded ESP32 IP
- **Phase 1** (COMPLETED): Configuration UI with Local Storage persistence
- **Phase 2** (COMPLETED): MQTT over WSS fallback with adapter chain pattern
- **Phase 3** (COMPLETED): Full state machine matching Swift app behavior
- **Phase 3.5 (Refactor)** (COMPLETED): Migrated to Hook-Based Architecture
- **Phase 4** (COMPLETED): PWA features (service worker, offline, installable)

## File Location Quick Reference
- **Main Application Logic**: `src/hooks/useGatekeeper.ts`
- **Main Button UI**: `src/components/TriggerButton.tsx`
- **Configuration Modal**: `src/components/ConfigModal.tsx:handleSave`
- **Config Button UI**: `src/components/ConfigButton.tsx:handleAction`
- **PWA Installation Modal**: `src/components/InstallPrompt.tsx`
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
- **Styling**: `src/App.css:.trigger-button`, `.modal-*`, and `.config-button`
- **PWA Styles**: `src/App.css:@media (display-mode: standalone)` and `.pwa-*`
- **Service Worker**: `public/sw.js:*`
- **PWA Manifest**: `public/manifest.json:*`
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

## Phase 4 Status (COMPLETED)
**PWA Features and UI Polish:**
- ✅ InstallService implementation for PWA installation
- ✅ OfflineService implementation for queue management
- ✅ Enhanced useConfig hook with PWA integration
- ✅ PWA status indicators in TriggerButton
- ✅ Service worker implementation with workbox for offline capability
- ✅ App manifest for installable PWA with proper icons
- ✅ ConfigButton with floating design and PWA integration
- ✅ Cross-platform installation flow with platform detection
- ✅ Enhanced UI with accessibility and mobile optimization
- ✅ Background sync for failed requests with service worker
- ✅ iOS safe area support and standalone mode optimization
- ✅ Keyboard shortcuts and comprehensive accessibility features
- ❓ Push notifications (future enhancement)
- ❓ Advanced error reporting and metrics (future enhancement)

## Critical Architecture Fix Summary
**INFINITE RE-RENDER LOOP RESOLUTION:**
The major bug was caused by improper event handling in the component layer. The fix involved:

1. **Event Handler Extraction**: Moved all event handling logic from `TriggerButton` to `useGatekeeper` hook
2. **Memoization Strategy**: Used `useMemo` for delegate objects and `useCallback` for all handler functions
3. **Dependency Management**: Proper dependency arrays to prevent unnecessary re-creation of handlers
4. **Ref Pattern**: Used `useRef` in `useStateMachine` to break circular dependencies in timeout handling
5. **Service Integration**: Moved service initialization and lifecycle management to dedicated hooks

**Result**: Eliminated infinite re-render loops while maintaining all functionality and improving performance.
