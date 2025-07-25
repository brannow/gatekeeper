//
//  GateViewModel.swift
//
import Foundation

// MARK: - UI façade -----------------------------------------------------------

struct ButtonState {
    let title: String
    let isDisabled: Bool
    
    init(gateState: GateState, isConfigured: Bool) {
        switch gateState {
        case .ready:
            self.title = isConfigured ? "Open Gate" : "Configure First"
            self.isDisabled = !isConfigured
        case .checkingNetwork:
            self.title = "Checking Network..."
            self.isDisabled = true
        case .noNetwork:
            self.title = "No Network"
            self.isDisabled = true
        case .triggering:
            self.title = "Triggering…"
            self.isDisabled = true
        case .waitingForRelayClose:
            self.title = "Opening…"
            self.isDisabled = true
        case .timeout, .error:
            self.title = "\(gateState)".capitalized
            self.isDisabled = false
        }
    }
}

// MARK: - Events --------------------------------------------------------------
/// All external stimuli go through this single entry.
private enum Event {
    case userPressed
    case configChanged
    case reachabilityResult(reachable: Bool)
    case relayChanged(RelayState)
    case requestComplete
    case requestFailed(GateKeeperError)
}

// MARK: - State machine -------------------------------------------------------

@MainActor
final class GateViewModel: ObservableObject {
    
    // MARK: 1. Public façade
    @Published private(set) var currentState: GateState = .ready
    @Published var lastError: GateKeeperError?
    
    var buttonTitle: String       { buttonState.title }
    var isButtonDisabled: Bool    { buttonState.isDisabled }
    
    private var buttonState: ButtonState {
        ButtonState(gateState: currentState, isConfigured: isConfigured)
    }
    
    // MARK: 2. Private state
    private enum InternalState {
        case idle
        case pinging(retry: UInt16)
        case recoveringFromError
    }
    private var internalState: InternalState = .idle
    
    private var timer: Timer?          // single timer for everything
    private var reachabilityRetry: UInt16 = 0
    
    // MARK: 3. Dependencies
    private let service: NetworkService
    private let config: ConfigManagerProtocol
    private let reachabilityService: ReachabilityServiceProtocol
    private let logger: LoggerProtocol
    
    // MARK: 4. Init
    init(service: NetworkService,
         config: ConfigManagerProtocol,
         reachabilityService: ReachabilityServiceProtocol,
         logger: LoggerProtocol) {
        
        self.service       = service
        self.config        = config
        self.reachabilityService = reachabilityService
        self.logger        = logger
        
        service.delegate           = self
        reachabilityService.delegate = self
        
        // bootstrap
        transition(to: .ready)
        advance()
    }
    
    deinit { timer?.invalidate() }
    
    // MARK: 5. Public API ------------------------------------------------------
    
    func triggerGate() {
        handle(.userPressed)
    }
    
    /// Feed an event into the machine and run the rules once.
    private func handle(_ event: Event) {
        switch (currentState, event) {

        // 1. User taps while idle → trigger gate
        case (.ready, .userPressed):
            transition(to: .triggering)
            service.triggerGate()

        // 2. User taps while offline → restart reachability
        case (.noNetwork, .userPressed):
            transition(to: .checkingNetwork)
            internalState = .pinging(retry: 0)
            startPingCycle()

        // 3. User taps after error/timeout → re-evaluate
        case (.timeout, .userPressed),
             (.error,   .userPressed):
            transition(to: .ready)
            advance()               // will re-check network if needed

        // 4. All other combinations are no-ops
        default:
            break
        }
    }
    
    func refreshConfiguration() {
        objectWillChange.send()
        resetConfigReachability()
        transition(to: .ready)   // kick the machine
        advance()
    }
    
    // MARK: 6. State transitions ----------------------------------------------
    
    private func transition(to new: GateState) {
        logger.info("State  \(currentState) → \(new)")
        currentState = new
    }
    
    /// Central brain: decides what to do next based on
    /// - currentState
    /// - internalState
    /// - configuration
    private func advance() {
        timer?.invalidate()
        timer = nil
        
        switch currentState {
            
        case .ready:
            guard isConfigured else { return }
            if config.areAllConfigsUnreachable() {
                transition(to: .checkingNetwork)
                internalState = .pinging(retry: 0)
                startPingCycle()
            }
            
        case .checkingNetwork:
            // internalState == .pinging handled by startPingCycle()
            break
            
        case .noNetwork:
            // we stay here until reachability changes
            break
            
        case .error, .timeout:
            internalState = .recoveringFromError
            timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
                Task { @MainActor in
                    self?.transition(to: .ready)
                    self?.advance()
                }
            }
            
        case .triggering, .waitingForRelayClose:
            break  // handled by network delegate
        }
    }
    
    // MARK: 7. Helpers ---------------------------------------------------------
    
    var isConfigured: Bool {
        config.getESP32Config() != nil || config.getMQTTConfig() != nil
    }
    
    private func resetConfigReachability() {
        config.getESP32Config()?.reachabilityStatus = .unknown
        config.getMQTTConfig()?.reachabilityStatus = .unknown
    }
    
    // MARK: 8. Timer based reachability ---------------------------------------
    
    private func startPingCycle() {
        guard case let .pinging(retry) = internalState else { return }
        
        guard let targets = config.getReachabilityTargets(), !targets.isEmpty else {
            transition(to: .ready)   // nothing to ping
            internalState = .idle
            return
        }
        
        if retry >= 10 {
            transition(to: .noNetwork)
            internalState = .idle
            return
        }
        
        reachabilityService.checkTargets(targets)
        
        timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
            Task { @MainActor in
                guard let self = self,
                      case .pinging(let r) = self.internalState else { return }
                self.internalState = .pinging(retry: r + 1)
                self.startPingCycle()
            }
        }
    }
}

// MARK: - Delegates -----------------------------------------------------------

extension GateViewModel: NetworkServiceDelegate {
    func serviceDidReceive(_ relay: RelayState) {
        switch relay {
        case .activated:
            transition(to: .waitingForRelayClose)
        case .released:
            transition(to: .ready)
            advance()
        }
    }
    
    func serviceDidComplete() {
        transition(to: .ready)
        advance()
    }
    
    func serviceDidFail(_ error: GateKeeperError) {
        lastError = error
        transition(to: .error)
        advance()
    }
}

extension GateViewModel: ReachabilityServiceDelegate {
    func reachabilityService(_ service: ReachabilityServiceProtocol,
                             target: PingTarget,
                             isReachable: Bool) {
        
        logger.info("Ping result", metadata: ["host": target.host,
                                              "isReachable": "\(isReachable)"])
        
        let newStatus: ReachabilityStatus = isReachable ? .connected : .disconnected
        if newStatus != target.config.reachabilityStatus {
            target.config.reachabilityStatus = newStatus
            logger.info("Updated host status",
                        metadata: ["host": target.host,
                                   "status": "\(target.config.reachabilityStatus)"])
        }
        
        // If any host just came back online we immediately re-evaluate
        if !config.areAllConfigsUnreachable() {
            transition(to: .ready)
            advance()
        }
    }
}
