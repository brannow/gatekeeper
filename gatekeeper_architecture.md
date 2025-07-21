# GateKeeper - Technical Architecture Specification

## Project Overview
GateKeeper is an iOS 18 app for controlling a garden gate via ESP32 relay. The app uses hybrid communication: local UDP for fast response, MQTT fallback for reliability over international connection (Germany broker → Thailand ESP32).

## System Architecture

### 8 Core Components

1. **AppButton** - SwiftUI main trigger interface with state management
2. **ConfigView** - Settings screen for MQTT broker and ESP32 IP configuration  
3. **NetworkManager** - Coordinates adapter selection, fallback logic, and timeout management
4. **MQTTNetworkAdapter** - MQTT broker communication implementation
5. **SocketAdapter** - UDP local network communication implementation
6. **ConfigManager** - Configuration persistence, validation, and retrieval
7. **Widget** - Today screen widget with shared business logic
8. **Logger** - Debugging, telemetry, and error tracking

## Communication Protocols

### UDP Protocol (Local Network - Primary)
- **Request**: Single byte `0x01` sent to ESP32 IP
- **Response**: Single byte `0x01` (relay activated) followed by `0x00` (relay released)
- **Port**: User-configurable (default: 8080)
- **Timeout**: 2 seconds for complete cycle
- **Packet Size**: 1 byte request, 2 bytes total response
- **Priority**: Try first when WiFi available

### MQTT Protocol (Remote Fallback)
- **Broker Settings**: User-configurable host, port, username, password
- **Connection**: 60-second keep-alive, QoS 0 for all messages
- **Trigger Topic**: `iot/house/gate/esp32/trigger`
  - Payload: Plain text timestamp (e.g., `1642678901`)
  - QoS: 0 (fire and forget)
- **Status Topic**: `iot/house/gate/esp32/status`
  - Payload: Plain text `1` (relay on) or `0` (relay off)
  - QoS: 0 (fire and forget)
- **Timeout**: 5 seconds for complete cycle

## Required Protocols & Interfaces

```swift
protocol GateNetworkInterface {
    var delegate: GateNetworkDelegate? { get set }
    func open() async throws
}

protocol GateNetworkDelegate: AnyObject {
    func gateDidReceiveRelayState(_ state: RelayState)
    func gateDidEncounterError(_ error: GateKeeperError)
}

protocol NetworkManagerProtocol {
    func triggerGate() async
    var currentState: GateState { get }
}

protocol ConfigManagerProtocol {
    func saveMQTTConfig(_ config: MQTTConfig)
    func saveESP32IP(_ ip: String)
    func getMQTTConfig() -> MQTTConfig?
    func getESP32IP() -> String?
}

protocol LoggerProtocol {
    func info(_ message: String, metadata: [String: String])
    func warning(_ message: String, error: Error?)
    func error(_ message: String, error: Error)
}
```

## Data Models & Enums

```swift
enum GateKeeperError: Error {
    case configurationMissing
    case udpConnectionFailed
    case mqttConnectionFailed
    case allAdaptersFailed
    case operationTimeout
    case operationInProgress
    case invalidResponse
}

enum RelayState {
    case activated  // "1" or 0x01 - relay on
    case released   // "0" or 0x00 - relay off
}

enum GateState {
    case ready
    case triggering
    case waitingForRelayClose
    case timeout
    case error
}

struct MQTTConfig {
    let host: String
    let port: Int
    let username: String
    let password: String
}
```

## State Management & Synchronization

### App/Widget Conflict Prevention
- **SharedStateManager**: Global operation state prevents simultaneous triggers
- **Operation Locking**: Widget shows "App in use" if main app is operating
- **State Broadcasting**: Both App and Widget observe same centralized state
- **Persistent State**: Last operation result visible in both components

### State Flow
```
READY → [trigger] → TRIGGERING → [receive "1"] → WAITING_FOR_RELAY_CLOSE → [receive "0"] → READY
                               ↘ [timeout] → TIMEOUT → [delay] → READY
```

## Configuration Management

### Settings Storage
- **MQTT Credentials**: Stored in Keychain (secure)
- **IP Addresses & Ports**: Stored in UserDefaults (plain text acceptable)
- **Shared Access**: App and Widget read same configuration
- **Validation**: IP address format validation, hostname validation
- **Hot Reloading**: Changes apply immediately without restart

### Default Values
- UDP Port: 8080
- MQTT Port: 1883  
- UDP Timeout: 2 seconds
- MQTT Timeout: 5 seconds
- Keep-alive: 60 seconds

## Network Manager Logic

### Adapter Selection
1. Check WiFi connectivity
2. If WiFi available → Try UDP adapter (2sec timeout)
3. If UDP fails/timeout → Fallback to MQTT adapter (5sec timeout)
4. If both fail → Error state, reset after delay

### Timeout Handling
- **Complete Cycle Required**: Must receive both "1" and "0" responses
- **Incomplete Cycle**: If "1" received but "0" never comes, timeout and reset
- **Universal Reset**: Any timeout/error → ready state after brief delay

## Widget Considerations

### iOS Limitations
- **Background Execution**: Limited background processing time
- **Timeline Updates**: Respect iOS widget update frequency limits
- **Memory Constraints**: Minimal memory footprint required
- **Shared Data**: Use App Groups for configuration sharing

### Widget Behavior
- **Independent Operation**: Can trigger without main app running
- **State Display**: Shows current operation state or "ready"
- **Error Handling**: Simple error states, no complex recovery

## Logging & Telemetry

### Required Logging
- **Adapter Success**: Which method succeeded (UDP vs MQTT)
- **Performance Metrics**: Response times for debugging latency
- **Error Categorization**: Timeout vs connection vs configuration errors
- **State Transitions**: All state changes for debugging
- **Configuration Changes**: Audit trail for settings

### Debug Information
- Network connectivity state
- Adapter selection decisions
- Timeout occurrences
- Widget vs App usage patterns

## ESP32 Integration Notes

### Relay Behavior
- **400ms Activation**: ESP32 holds relay for 400ms then releases
- **State Reporting**: ESP32 reports "1" when activated, "0" when released
- **Dual Protocol**: ESP32 handles both UDP and MQTT simultaneously
- **No Security**: Local UDP has no authentication/encryption

### Expected ESP32 Response Pattern
1. Receive trigger (UDP `0x01` or MQTT timestamp)
2. Activate relay, send "1" status
3. Hold relay for 400ms
4. Release relay, send "0" status
5. Ready for next trigger

## Security Considerations

### Local Network (UDP)
- **No Security**: Anyone on local network can trigger
- **Acceptable Risk**: Home network assumption
- **Simple Protocol**: No encryption overhead

### Remote Network (MQTT)
- **Basic Auth**: Username/password for broker access
- **Credential Storage**: MQTT credentials in Keychain
- **No Certificate Pinning**: Unnecessary for home automation

## Testing Strategy

### Critical Test Cases
- **State Transitions**: Ready → Triggering → Waiting → Ready
- **Timeout Scenarios**: No response, incomplete response cycles  
- **Adapter Fallback**: UDP failure → MQTT success
- **Configuration Validation**: Invalid IP addresses, missing credentials
- **Widget/App Conflicts**: Simultaneous trigger attempts

### Mock Requirements
- Mock both UDP and MQTT adapters
- Mock network connectivity states
- Mock configuration manager for testing