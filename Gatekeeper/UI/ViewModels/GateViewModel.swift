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
        isConfigured && currentState == .ready
    }

    // MARK: - Init
    init(service: NetworkService, config: ConfigManagerProtocol, reachabilityService: ReachabilityServiceProtocol) {
        self.service = service
        self.config = config
        self.reachabilityService = reachabilityService
        service.delegate = self
        reachabilityService.delegate = self
        
        // Initial state setup
        updateStateAfterConfigChange()
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
        config.getESP32Config()?.isReachable = false
        config.getMQTTConfig()?.isReachable = false
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
        guard let targets = config.getReachabilityTargets(), !targets.isEmpty else {
            currentState = .ready
            return
        }
        
        // Reset reachability before checking (in case host changed)
        for target in targets {
            target.config.isReachable = false
        }
        
        currentState = .checkingNetwork
        reachabilityService.checkTargets(targets)
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
        
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(1))
            resetToReadyState()
        }
    }
}

// MARK: - ReachabilityServiceDelegate
extension GateViewModel: ReachabilityServiceDelegate {
    func reachabilityService(_ service: ReachabilityServiceProtocol, target: PingTarget, isReachable: Bool) {
        print("Ping result: \(target.host) -> \(isReachable)")
        
        // Update the config object's reachability directly through the target
        target.config.isReachable = isReachable
        if currentState == .checkingNetwork {
            currentState = .ready
        }
    }
}
