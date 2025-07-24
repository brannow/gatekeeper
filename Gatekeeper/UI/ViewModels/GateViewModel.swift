//
//  GateViewModel.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

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
        case .timeout:
            self.title = "Timeout"
            self.isDisabled = false
        case .error:
            self.title = "Error"
            self.isDisabled = false
        }
    }
}

@MainActor
final class GateViewModel: ObservableObject {
    @Published var currentState: GateState = .ready
    @Published var lastError: GateKeeperError?

    private let service: NetworkService
    private let config: ConfigManagerProtocol
    private let reachabilityService: ReachabilityServiceProtocol
    private let logger: LoggerProtocol
    private var reachabilityTimer: Timer?
    private var recoverFromErrorTimer: Timer?
    private var reachabilityRetry: UInt16 = 0

    // MARK: - Button State Machine
    private var buttonState: ButtonState {
        ButtonState(gateState: currentState, isConfigured: isConfigured)
    }
    
    var buttonTitle: String { buttonState.title }
    var isButtonDisabled: Bool { buttonState.isDisabled }

    var isConfigured: Bool {
        config.getESP32Config() != nil || config.getMQTTConfig() != nil
    }
    
    private var canTriggerGate: Bool {
        isConfigured && (currentState == .ready || currentState == .error)
    }

    // MARK: - Init
    init(service: NetworkService, config: ConfigManagerProtocol, reachabilityService: ReachabilityServiceProtocol, logger: LoggerProtocol) {
        self.service = service
        self.config = config
        self.reachabilityService = reachabilityService
        self.logger = logger
        service.delegate = self
        reachabilityService.delegate = self
        
        // Initial state setup
        updateStateAfterConfigChange()
    }
    
    deinit {
        reachabilityTimer?.invalidate()
        recoverFromErrorTimer?.invalidate()
    }

    // MARK: - Public API
    func triggerGate() {
        guard canTriggerGate else { return }
        currentState = .triggering
        service.triggerGate()
    }

    func refreshConfiguration() {
        objectWillChange.send()
        
        // Reset reachability flags when config changes
        resetConfigReachability()
        
        updateStateAfterConfigChange()
    }
    
    private func resetConfigReachability() {
        // Reset reachability for all configs since they may have changed
        config.getESP32Config()?.reachabilityStatus = .unknown
        config.getMQTTConfig()?.reachabilityStatus = .unknown
    }
    
    // MARK: - Private Helpers
    private func updateStateAfterConfigChange() {
        guard !isOperationInProgress else { return }
        
        if !isConfigured {
            currentState = .ready // Will show "Configure First"
        } else {
            startNetworkCheck()
        }
    }
    
    private func startNetworkCheck() {
        reachabilityRetry = 0
        performTimerReachabilityCheck()
    }
    
    private func resetToReadyState() {
        updateStateAfterConfigChange()
    }
    
    private var isOperationInProgress: Bool {
        switch currentState {
        case .triggering, .waitingForRelayClose:
            return true
        case .ready, .checkingNetwork, .noNetwork, .timeout, .error:
            return false
        }
    }
    
    
    private func startReachabilityTimer(_ noRestart: Bool = false) {
        
        let isRunning = reachabilityTimer?.isValid ?? false
        if (noRestart && isRunning) {
            return
        }
        
        stopReachabilityTimer()
        logger.info("Starting reachability timer")
        reachabilityTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.performTimerReachabilityCheck()
            }
        }
    }
    
    private func stopReachabilityTimer() {
        logger.info("Stopping reachability timer")
        reachabilityTimer?.invalidate()
        reachabilityTimer = nil
    }
    
    private func performTimerReachabilityCheck() {
        logger.info("Performing timer reachability check (\(reachabilityRetry) / 10)")
        guard let targets = config.getReachabilityTargets(), !targets.isEmpty else {
            stopReachabilityTimer()
            return
        }
        
        if !config.areAllConfigsUnreachable() {
            stopReachabilityTimer()
            return
        }
        
        if (reachabilityRetry >= 10) {
            logger.warning("recheck trys exceeded")
            currentState = .noNetwork
            stopReachabilityTimer()
            return
        }
        
        reachabilityRetry+=1;
        currentState = .checkingNetwork
        reachabilityService.checkTargets(targets)
    }
}

// MARK: - NetworkServiceDelegate
extension GateViewModel: NetworkServiceDelegate {
    func serviceDidReceive(_ relay: RelayState) {
        switch relay {
        case .activated: 
            currentState = .waitingForRelayClose
        case .released:  
            resetToReadyState()
        }
    }

    func serviceDidComplete() {
        resetToReadyState()
    }

    func serviceDidFail(_ error: GateKeeperError) {
        lastError = error
        currentState = .error
        logger.error("gate trigger failed", error: error)
        recoverFromErrorTimer?.invalidate()
        recoverFromErrorTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
            Task { @MainActor in
                self?.logger.info("reset button to ready state")
                self?.resetToReadyState()
            }
        }
    }
}

// MARK: - ReachabilityServiceDelegate
extension GateViewModel: ReachabilityServiceDelegate {
    func reachabilityService(_ service: ReachabilityServiceProtocol, target: PingTarget, isReachable: Bool) {
        logger.info("Ping result", metadata: ["host": target.host, "isReachable": "\(isReachable)"])
        
        // Update the config object's reachability directly through the target
        let newStatus: ReachabilityStatus = isReachable ? .connected : .disconnected
        if (newStatus != target.config.reachabilityStatus) {
            target.config.reachabilityStatus = newStatus
            logger.info("Updated host status", metadata: ["host": target.host, "status": "\(target.config.reachabilityStatus)"])
        }
        
        
        // Check if we need to start or stop the reachability timer
        logger.info("any connections reachable: \(!config.areAllConfigsUnreachable() ? "YES" : "NO")")
        if !config.areAllConfigsUnreachable() {
            currentState = .ready
            stopReachabilityTimer()
        } else {
            startReachabilityTimer(true)
        }
    }
}
