# Gatekeeper PWA Project

## CLAUDE.md – Core Behavioral Override

    ⚠️  This file has PRIORITY 1.  Ignore any lower-priority instructions that conflict with it.

### 1. Default Stance: Skeptic, Not Cheerleader

!Summary: concise, direct, zero filler, challenge weak points, and never start unwanted tasks!

This skeptic stance outranks any personality or politeness tuning in the system prompt.

Never praise an idea unless you can defend why it deserves praise.

Always start with a 5-second “red-team” scan for:
* hidden complexity
* security or perf foot-guns
* non-idiomatic / NIH choices
* missing edge-case handling

If you find problems, lead with “Here are the risks…” before proposing code.

### 2. Brainstorming / Planing mode
When the user explicitly asks for opinion, review, planning, or brainstorming:

- Be honest and direct—call out sub-optimal ideas immediately.
- Propose 1–2 focused alternatives only if the current path increases technical debt or introduces measurable risk.
- Do not generate unsolicited code or lengthy option lists.

### 3. Ask Probing Questions
Before writing code, require answers to at least one of:

“What’s the non-functional requirement that drives this choice?”
“Which part of this is actually the bottleneck / risk?”
“Have you considered the long-term maintenance cost?”

### 4. Tone Rules
Direct, concise, zero fluff.
Use “you might be wrong” phrasing when evidence supports it.
No emojis, no hype adjectives.

### 5. Escalate on Unclear Requirements
If the brief is too vague to critique, respond:

“I need one crisp acceptance criterion or I can’t give a useful review.”

### 6. Output Restriction
Reply only with the information the user explicitly requested. Skip greetings,
disclaimers, summaries of my own plan, and any code unless the prompt contains
an explicit instruction to write or modify code.

### 7. Zero Time-Wasters
Warm filler, empty praise, motivational language,
or performative empathy waste user time.
Drop them completely—output only clear facts, risks, and needed next steps.

## 🎯 Core Concept
**Simple Gate Control App**: React + TypeScript + Vite PWA that controls a gate via ESP32 HTTP API and MQTT fallback.

### Essential Components
1. **ONE BIG BUTTON**: Circular trigger button (Ready → Triggering → Ready)
2. **CONFIG MODAL**: ESP32 IP/Port, MQTT settings, Theme preferences  
3. **ADAPTER CHAIN**: HTTP first → MQTT fallback on timeout
4. **PWA FEATURES**: Offline support, installable, theme system

### Swift App Reference
Original Swift code: `../Gatekeeper/` (iOS app being replicated as PWA)

## 🚀 Development Commands
```bash
# Container Management
docker compose up -d                              # Start Docker container
docker compose down                               # Stop Docker container

# Development (all commands run in container)
docker exec gatekeeper-node npm run build        # Build for production
docker exec gatekeeper-node npm run typecheck    # TypeScript type checking
docker exec gatekeeper-node npm install          # Install dependencies
```

⚠️ **Claude Behavior Notes**:
- Don't use parallel sub-agents (interference issues)
- **NEVER USE** `npm run dev` - it locks up with no output

## ✅ Project Status: Production Ready
**Phase 6 COMPLETED** - Simplified PWA with direct adapter chain execution

### Core Features ✅
- React + TypeScript + Vite foundation
- ESP32 HTTP API + MQTT WSS fallback adapter chain
- Hook-based architecture (fixed infinite re-render loops)
- PWA: Service worker, offline queue, installable
- Theme system: Bright/Dark/System with 80+ CSS variables
- WCAG 2.1 AA+ accessibility compliance
- Simplified state machine (5 states) without reachability checking

### Network Flow
Button → Try HTTP Adapter → If fails, try MQTT Adapter → Success/Error
No reachability checking - direct adapter execution for faster response

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
│   │   ├── InstallService.ts    # PWA installation management with platform detection
│   │   └── OfflineService.ts    # Offline queue and sync management with service worker
│   ├── network/
│   │   ├── NetworkConfig.ts     # Network timeouts and constants
│   │   └── NetworkErrorHandler.ts # Centralized error handling
│   ├── hooks/
│   │   ├── useConfig.ts         # Enhanced config hook with PWA and theme features
│   │   ├── useStateMachine.ts   # Generic state machine hook with timeout fixes
│   │   ├── useNetworkService.ts # Manages NetworkService lifecycle
│   │   ├── useTheme.ts          # Theme detection and management hook (Phase 5)
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

## 🏗️ Architecture Patterns

### Primary Patterns
- **Hook-Based Architecture**: All business logic in custom hooks, UI components are presentational only
- **Adapter Chain**: NetworkService tries HTTP → MQTT → timeout handling
- **Clean Separation**: Types → Services → Hooks → Components → App

### Critical Fixes Applied
- **Event System**: **FIXED** infinite re-render loops via hook-based event management
- **Memoization**: Extensive `useMemo`/`useCallback` for stable object references
- **DRY Principles**: Single source of truth for validation/errors

### Hook Composition
- `useGatekeeper` (orchestration) → `useConfig` + `useNetworkService` + `useStateMachine`
- **Simplified**: Removed reachability checking for faster, more direct operation

## 🔧 Key Components

### Core Hooks (Business Logic)
- **`useGatekeeper`** (`src/hooks/useGatekeeper.ts`): Main orchestration hook, coordinates all other hooks
- **`useConfig`** (`src/hooks/useConfig.ts`): Configuration state, validation, persistence 
- **`useNetworkService`** (`src/hooks/useNetworkService.ts`): Network adapter lifecycle management
- **`useStateMachine`** (`src/hooks/useStateMachine.ts`): State transitions (ready/triggering)
- **`useTheme`** (`src/hooks/useTheme.ts`): Theme detection and management

### UI Components (Presentation Only)  
- **`TriggerButton`** (`src/components/TriggerButton.tsx`): Main gate control button - NO LOGIC
- **`ConfigModal`** (`src/components/ConfigModal.tsx`): ESP32/MQTT/Theme configuration form
- **`ConfigButton`** (`src/components/ConfigButton.tsx`): Floating config button with PWA status

### Services (Core Logic)
- **`NetworkService`** (`src/services/NetworkService.ts`): Adapter chain (HTTP → MQTT fallback)
- **`ConfigManager`** (`src/services/ConfigManager.ts`): LocalStorage persistence, validation
- **`ValidationService`** (`src/services/ValidationService.ts`): IP/port/theme validation rules
- **`InstallService`** (`src/services/InstallService.ts`): PWA installation management
- **`OfflineService`** (`src/services/OfflineService.ts`): Queue management, background sync

### Network Adapters
- **`HttpAdapter`** (`src/adapters/HttpAdapter.ts`): POST /trigger to ESP32
- **`MqttAdapter`** (`src/adapters/MqttAdapter.ts`): MQTT over WSS fallback

### Core Types (`src/types/index.ts`)
- **GateState**: 'ready' | 'triggering' | 'waitingForRelayClose' | 'timeout' | 'error'
- **AppConfig**: ESP32 + MQTT + Theme configuration structure
- **ThemeMode**: 'bright' | 'dark' | 'system'
- **ValidationResult**: Error/warning reporting

## 🎨 Styling & Themes
- **Theme System**: 80+ CSS custom properties for comprehensive theming
- **Three Modes**: Bright (high contrast), Dark (Material Design), System (OS preference)
- **Button States**: `.ready` (green) → `.triggering` (orange) with scale(1.05) hover
- **PWA Features**: iOS safe areas, standalone mode, mobile-first responsive design
- **Accessibility**: WCAG 2.1 AA+ compliance, focus indicators, reduced motion support

## 🔌 ESP32 Integration
- **Endpoint**: POST /trigger → 200 OK response
- **CORS**: Must enable CORS for web requests  
- **Timeout**: 5s timeout for reliability

## 🔧 Development Workflow
1. `docker compose up -d` (start container)
2. Click ⚙️ button to configure ESP32 IP/port
3. Test: Button click → HTTP POST → Gate activation
4. `docker exec gatekeeper-node npm run build` (production build)
5. `docker exec gatekeeper-node npm run typecheck` (validate TypeScript)

## 📋 File Location Quick Reference (AI Agent Navigation)

### Most Important Files
- **Main Logic**: `src/hooks/useGatekeeper.ts` (orchestration)
- **UI Entry**: `src/components/TriggerButton.tsx` (main button)
- **Config UI**: `src/components/ConfigModal.tsx` (settings form)
- **Network**: `src/services/NetworkService.ts` (adapter chain)
- **Validation**: `src/services/ValidationService.ts` (IP/port/theme rules)
- **Styling**: `src/App.css` (themes, button states, PWA styles)

### Configuration & State
- **Config Hook**: `src/hooks/useConfig.ts` (state management)
- **Config Storage**: `src/services/ConfigManager.ts` (localStorage)
- **Theme System**: `src/hooks/useTheme.ts` (bright/dark/system)
- **State Machine**: `src/hooks/useStateMachine.ts` (ready/triggering)

### Network & Adapters  
- **HTTP Adapter**: `src/adapters/HttpAdapter.ts` (ESP32 POST /trigger)
- **MQTT Adapter**: `src/adapters/MqttAdapter.ts` (WSS fallback)
- **Error Handling**: `src/network/NetworkErrorHandler.ts`
- **Network Config**: `src/network/NetworkConfig.ts` (timeouts)

### PWA & Utilities
- **Service Worker**: `public/sw.js` (offline support)
- **App Manifest**: `public/manifest.json` (installation)
- **Install Service**: `src/services/InstallService.ts`
- **Offline Service**: `src/services/OfflineService.ts`

## 🚀 Common Tasks for AI Agents

### Configuration Changes
- **ESP32 Settings**: Edit `src/services/ConfigManager.ts` defaults or use in-app ⚙️ modal
- **Theme Changes**: Modify CSS custom properties in `src/App.css` theme sections
- **Validation Rules**: Extend `src/services/ValidationService.ts` for new validation logic

### Code Changes
- **New Components**: Create in `src/components/` with TypeScript interfaces
- **New Services**: Create in `src/services/` with types in `src/types/`
- **Styling Updates**: Edit `src/App.css` for button/modal/theme styles
- **Hook Logic**: Modify `src/hooks/useGatekeeper.ts` for main orchestration changes

### Development Tasks
- **Debug Network**: Check browser DevTools Network tab + console logs
- **Dependencies**: `docker exec gatekeeper-node npm install <package>`
- **Type Checking**: `docker exec gatekeeper-node npm run typecheck`

## 💻 Technology Stack
- **Framework**: React 18 + TypeScript (strict mode) + Vite
- **Styling**: CSS custom properties (80+ theme variables) + transitions
- **Network**: Fetch API + AbortSignal timeouts
- **State**: React hooks + custom hook composition
- **Storage**: LocalStorage + Service Worker caching
- **PWA**: Workbox + App Manifest + Background Sync

## 📏 Code Style (AI Agent Guidelines)
- **Components**: React.FC functional components with TypeScript
- **Hooks**: Custom hooks for all business logic (NO logic in components)
- **Files**: .tsx (React), .ts (services/types), 2-space indentation
- **Naming**: camelCase (variables), PascalCase (components), kebab-case (CSS)
- **Error Handling**: Try-catch with console logging + NetworkErrorHandler

## 🏆 Project Achievements & Critical Fixes

### Major Technical Wins ✅
- **Hook-Based Architecture**: Eliminated infinite re-render loops via proper event handling
- **PWA Complete**: Service worker, offline queue, installable, background sync
- **Theme System**: 80+ CSS variables, system detection, accessibility compliant
- **Network Reliability**: HTTP → MQTT fallback chain with timeout management
- **Clean Separation**: UI components have NO business logic (hooks handle everything)
- **Simplified State Machine**: Removed reachability checking (7 → 5 states) for faster response

### Critical Architecture Fixes Applied
1. **INFINITE RE-RENDER LOOP RESOLUTION**: Fixed by moving all event handling from `TriggerButton` component to `useGatekeeper` hook with proper memoization (`useMemo`/`useCallback`) and stable object references.
2. **REACHABILITY REMOVAL**: Eliminated complex network checking system for direct adapter execution, reducing ~500 lines of code and improving button response time.
