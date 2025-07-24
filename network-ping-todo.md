# ICMP Ping Reachability Service Implementation Plan

## Overview
Implementation of an on-demand, delegate-based network reachability service using raw ICMP ping to check if IP addresses/hostnames are reachable. The service provides fast IP-level connectivity testing without requiring any services or open ports on target hosts.

## Architecture Design

### Core Components
1. **`ReachabilityServiceProtocol`** - Service interface for on-demand ping operations
2. **`ReachabilityService`** - ICMP ping implementation using BSD sockets
3. **`PingTarget`** - Model representing hostname/IP with NetworkMethod for future UDP/MQTT distinction
4. **`ReachabilityServiceDelegate`** - Protocol for ping result callbacks

### Integration Points
- **DependencyContainer**: Add reachability service as singleton
- **GateViewModel**: Implement delegate to receive ping results and enable/disable gate
- **ConfigManager**: Store target IPs/hostnames for reachability checking

## Technical Approach

### 1. Protocol Design
```swift
protocol ReachabilityServiceProtocol {
    var delegate: ReachabilityServiceDelegate? { get set }
    func checkTarget(_ target: PingTarget)
    func checkTargets(_ targets: [PingTarget])
    func cancelAllChecks()
}

@MainActor
protocol ReachabilityServiceDelegate: AnyObject {
    func reachabilityService(_ service: ReachabilityServiceProtocol, target: PingTarget, isReachable: Bool)
    func reachabilityService(_ service: ReachabilityServiceProtocol, anyTargetReachable: Bool, from targets: [PingTarget])
}
```

### 2. ICMP Implementation Strategy
- **Raw BSD Sockets**: Use `socket()`, `sendto()`, `recvfrom()` for ICMP packets
- **ICMP Echo Request/Reply**: Standard ping protocol (Type 8 request, Type 0 reply)
- **Concurrent Processing**: Multiple targets checked simultaneously using `TaskGroup`
- **DNS Resolution**: Convert hostnames to IP addresses before pinging
- **Packet Crafting**: Build proper ICMP headers with sequence numbers and checksums

### 3. On-Demand Operation
- No continuous monitoring - only ping when explicitly requested
- Delegate callbacks provide immediate results
- Button enables when **ANY** target responds to ping
- Individual result callbacks for debugging/logging
- Overall reachability callback for UI state management

## File Structure & Locations

```
Gatekeeper/Core/
├── Protocols/
│   └── ReachabilityServiceProtocol.swift          # Service protocol definition
├── Models/
│   └── PingTarget.swift                           # Target hostname/IP model with NetworkMethod
└── Services/
    ├── ReachabilityService.swift                  # ICMP ping implementation
    └── ConfigManager.swift                        # Extend for target configuration

Gatekeeper/UI/ViewModels/
└── GateViewModel.swift                            # Implement delegate for ping results

Gatekeeper/
└── DependencyContainer.swift                      # Add reachability service injection
```

## Implementation Tasks

### High Priority
1. **Implement ICMP packet structure and checksum calculation**
   - Define ICMP header struct (type, code, checksum, identifier, sequence)
   - Implement Internet checksum algorithm - use `in_cksum` from Apple's open-source Libc to handle endianness correctly
   - Handle byte order conversion for network transmission

2. **Create raw socket implementation for ICMP ping**
   - Use `socket(AF_INET, SOCK_DGRAM, IPPROTO_ICMP)` for ICMP socket
   - Implement packet sending with `sendto()`
   - Implement packet receiving with `recvfrom()` and timeout handling
   - Parse ICMP reply packets and validate sequence numbers

3. **Design ReachabilityService with delegate pattern**
   - Implement protocol with on-demand checking methods
   - Add proper task management for concurrent pings - store TaskGroup handle and cancel on `cancelAllChecks()`
   - Ensure delegate callbacks happen on MainActor
   - Handle cancellation of in-flight ping operations

### Medium Priority
4. **Add hostname to IP resolution using DNS lookup**
   - Use `getaddrinfo()` for DNS resolution
   - Support both IPv4 and IPv6 addresses
   - Handle DNS resolution failures gracefully
   - Cache resolution results for performance

5. **Integrate service into DependencyContainer and GateViewModel**
   - Add reachability service to DI container as singleton
   - Implement ReachabilityServiceDelegate in GateViewModel
   - Add ping trigger logic (when to check reachability)
   - Update gate button state based on delegate callbacks

6. **Add configuration support for ping targets**
   - Extend ConfigManager to store target IPs/hostnames
   - Add validation for target configuration
   - Support configuration updates at runtime

### Low Priority
7. **Add error handling and logging**
   - Comprehensive error types for different failure modes
   - Proper timeout handling for unresponsive targets
   - Network permission and capability checking
   - Debug logging for ping operations

8. **Performance optimization**
   - Connection pooling for socket reuse
   - Configurable ping timeout and retry logic
   - Efficient packet parsing and validation
   - Memory management for concurrent operations

## Benefits of This Approach

1. **True IP Reachability**: ICMP ping tests actual network-level connectivity
2. **No Port Dependencies**: Works regardless of services running on target
3. **Fast & Lightweight**: Raw ICMP is faster than TCP connections
4. **On-Demand Only**: No continuous monitoring overhead
5. **Clean Architecture**: Follows existing delegate and DI patterns
6. **Concurrent**: Tests multiple targets simultaneously
7. **Immediate Feedback**: Delegate callbacks provide real-time results

## Usage Example
```swift
// In GateViewModel - implement delegate
extension GateViewModel: ReachabilityServiceDelegate {
    func reachabilityService(_ service: ReachabilityServiceProtocol, anyTargetReachable: Bool, from targets: [PingTarget]) {
        self.isNetworkReachable = anyTargetReachable
        // Gate button automatically enables/disables
    }
    
    func reachabilityService(_ service: ReachabilityServiceProtocol, target: PingTarget, isReachable: Bool) {
        // Log individual ping results for debugging
        logger.debug("Ping \(target.host): \(isReachable)")
    }
}

// Trigger reachability check before gate operations
func checkConnectivityBeforeGate() {
    let targets = configManager.reachabilityTargets
    reachabilityService.checkTargets(targets)
}
```

## Technical Considerations

### Platform Requirements
- **Direct Deployment**: App deployed via Xcode directly to devices (no App Store restrictions)
- **Raw Socket Access**: Full BSD socket access available for ICMP implementation

### Security & Validation
- **Input Validation**: Sanitize all hostname/IP inputs
- **Rate Limiting**: Prevent ping flooding
- **Network Privacy**: Respect iOS network privacy settings
- **Error Handling**: Graceful degradation when ping fails

### Performance Characteristics
- **Latency**: ICMP typically faster than TCP handshake
- **Concurrency**: TaskGroup allows parallel ping operations
- **Resource Usage**: Minimal memory footprint with raw sockets
- **Battery Impact**: On-demand operation minimizes power consumption

## Risk Mitigation

### ICMP Limitations
- **Firewall Blocking**: Some networks may block ICMP traffic
- **Router Configuration**: Corporate/public networks might filter ICMP packets

### Implementation Complexity
- **Socket Programming**: Raw sockets require careful memory management
- **Packet Crafting**: ICMP headers must be perfectly formatted
- **Testing Strategy**: Test on your target network environments

This refined plan focuses specifically on your requirements: on-demand reachability checking using ICMP ping with a clean delegate pattern for result handling.
