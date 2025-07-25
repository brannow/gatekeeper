# Gatekeeper Project Structure

## Overview
Gatekeeper is a Swift iOS app for controlling a gate through network communication. It supports UDP (ESP32) and MQTT protocols with network reachability checking using ICMP ping.

## Architecture
**Clean Architecture with MVVM Pattern**
- **Core Layer**: Business logic, models, protocols, services
- **UI Layer**: SwiftUI views and ViewModels  
- **Network Layer**: Protocol adapters
- **Dependency Injection**: Centralized container

## File Structure
```
Gatekeeper/
├── GatekeeperApp.swift              # App entry point
├── Core/
│   ├── DependencyContainer.swift    # Dependency injection container
│   ├── Models/
│   │   ├── ESP32Config.swift        # ESP32 device configuration
│   │   ├── MQTTConfig.swift         # MQTT broker configuration
│   │   ├── GateState.swift          # App state management
│   │   ├── RelayState.swift         # Relay control states
│   │   ├── NetworkMethod.swift      # Communication protocol enum
│   │   ├── PingTarget.swift         # Reachability test target
│   │   ├── GateKeeperError.swift    # Error definitions
│   ├── Protocols/
│   │   ├── ConfigManagerProtocol.swift      # Configuration interface
│   │   ├── LoggerProtocol.swift             # Logging interface
│   │   ├── ReachabilityServiceProtocol.swift # Ping service interface
│   │   ├── GateNetworkInterface.swift       # Network adapter interface
│   │   └── NetworkServiceDelegate.swift     # Service delegate
│   └── Services/
│       ├── ConfigManager.swift              # Configuration persistence
│       ├── Logger.swift                     # Logging service
│       ├── ReachabilityService.swift        # ICMP ping service
│       └── ICMPPacket.swift                 # Low-level ICMP handling
├── UI/
│   ├── Views/
│   │   ├── AppButton.swift          # Main trigger button view
│   │   └── ConfigView.swift         # Configuration interface
│   └── ViewModels/
│       ├── GateViewModel.swift      # Main app view model
│       └── ConfigViewModel.swift    # Configuration view model
├── Network/
│   ├── NetworkService.swift         # Main network service
│   └── Adapters/
│       ├── SocketAdapter.swift      # UDP communication adapter
│       └── MQTTNetworkAdapter.swift # MQTT communication adapter
└── Assets.xcassets/                # App resources
```

## Core Components

### Models (`Core/Models/`)
- **ESP32Config**: Host, port, reachability for ESP32 devices
- **MQTTConfig**: Host, port, credentials, reachability for MQTT
- **GateState**: App states (ready, checkingNetwork, triggering, etc.)
- **RelayState**: Relay control states (activated, released)
- **NetworkMethod**: Communication protocols (udp, mqtt)
- **PingTarget**: Combines config and method for ping tests
- **GateKeeperError**: Comprehensive error definitions

### Services (`Core/Services/`)
- **ConfigManager**: Handles UserDefaults + Keychain storage
- **Logger**: os.log wrapper with metadata support
- **ReachabilityService**: ICMP ping implementation
- **ICMPPacket**: Low-level ICMP packet handling

### Network Layer (`Network/`)
- **NetworkService**: Main service with adapter chain pattern
- **SocketAdapter**: UDP communication for ESP32
- **MQTTNetworkAdapter**: MQTT using CocoaMQTT library

### UI Layer (`UI/`)
- **AppButton**: Main circular trigger button with status
- **ConfigView**: Configuration interface with sections
- **GateViewModel**: Main state orchestration
- **ConfigViewModel**: Configuration validation and persistence

## Key Patterns & Relationships

### Dependency Injection Flow
```
GatekeeperApp → DependencyContainer → Services → ViewModels → Views
```

### Network Communication Flow
```
GateViewModel → NetworkService → [SocketAdapter | MQTTNetworkAdapter] → Delegate callbacks → UI updates
```

### Configuration Flow
```
ConfigView → ConfigViewModel → ConfigManager → [UserDefaults | Keychain]
```

### Reachability Flow
```
GateViewModel → ReachabilityService → ICMP ping → Delegate callbacks → State updates
```

## State Management

### GateState Transitions
```
ready → checkingNetwork → [noNetwork | triggering] → waitingForRelayClose → ready
                                ↓
                            [timeout | error]
```

### Network Adapter Chain
1. Try all configured adapters in sequence
2. First successful response wins
3. Timeout handling per adapter
4. Delegate pattern for async results

## Storage Strategy
- **UserDefaults**: Non-sensitive config (hosts, ports)
- **Keychain**: Sensitive data (MQTT credentials)
- **Validation**: IP/domain regex validation

## External Dependencies
- **CocoaMQTT**: MQTT client library
- **Foundation**: Core iOS frameworks
- **SwiftUI**: Modern UI framework
- **Network**: iOS networking
- **Security**: Keychain access

## Key Implementation Details
- **@MainActor**: Proper concurrency handling
- **Adapter Chain Pattern**: Sequential network adapter trying
- **Delegate Pattern**: Loose coupling between layers
- **State Machine**: Well-defined state transitions
- **Raw Sockets**: Custom ICMP ping implementation
- **Security**: Keychain for sensitive data
- **Error Handling**: Comprehensive error types

## Quick Reference

### Finding Components
- **Gate Control Logic**: `GateViewModel.swift:*`
- **Network Communication**: `NetworkService.swift:*`
- **Configuration Management**: `ConfigManager.swift:*`
- **UI Components**: `UI/Views/`
- **Protocol Definitions**: `Core/Protocols/`
- **Error Handling**: `GateKeeperError.swift:*`
- **State Definitions**: `Core/Models/`

### Common Tasks
- **Add new network protocol**: Implement `GateNetworkInterface` in `Network/Adapters/`
- **Modify gate states**: Update `GateState.swift` and `GateViewModel.swift`
- **Change UI**: Edit `AppButton.swift` or `ConfigView.swift`
- **Add configuration**: Extend `ConfigManager.swift` and relevant config models
- **Debug network**: Check `Logger.swift` output and `NetworkService.swift`