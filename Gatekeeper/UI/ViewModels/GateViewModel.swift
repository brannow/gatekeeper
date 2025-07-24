//
//  GateViewModel.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

@MainActor
final class GateViewModel: ObservableObject {
    @Published var currentState: GateState = .ready
    @Published var lastError: GateKeeperError?
    @Published var isNetworkReachable: Bool = false

    private let service: NetworkService
    private let config: ConfigManagerProtocol   // ← injected once, not stored publicly
    private let reachabilityService: ReachabilityServiceProtocol

    // MARK: - Public helpers used by the UI
    var buttonTitle: String {
        switch currentState {
        case .ready:  return isConfigured ? "Open Gate" : "Configure First"
        case .triggering: return "Triggering…"
        case .waitingForRelayClose: return "Opening…"
        case .timeout: return "Timeout"
        case .error:   return "Error"
        }
    }

    var isButtonDisabled: Bool {
        switch currentState {
        case .ready: return !isConfigured || !isNetworkReachable
        case .triggering, .waitingForRelayClose: return true
        case .timeout, .error: return false
        }
    }

    var isConfigured: Bool {
        config.getESP32Config() != nil || config.getMQTTConfig() != nil
    }

    // MARK: - Init
    init(service: NetworkService, config: ConfigManagerProtocol, reachabilityService: ReachabilityServiceProtocol) {
        self.service = service
        self.config  = config
        self.reachabilityService = reachabilityService
        service.delegate = self
        reachabilityService.delegate = self
    }

    // MARK: - Public API
    func triggerGate() {
        guard currentState == .ready else { return }
        currentState = .triggering
        service.triggerGate()
    }

    func checkConnectivity() {
        guard let targets = config.getReachabilityTargets(), !targets.isEmpty else {
            isNetworkReachable = true
            return
        }
        reachabilityService.checkTargets(targets)
    }

    func refreshConfiguration() {
        objectWillChange.send()   // force SwiftUI re-check of `isConfigured`
        checkConnectivity()       // re-check connectivity when config changes
    }
}

// MARK: - NetworkServiceDelegate
extension GateViewModel: NetworkServiceDelegate {
    func serviceDidReceive(_ relay: RelayState) {
        switch relay {
        case .activated: currentState = .waitingForRelayClose
        case .released:  currentState = .ready
        }
    }

    func serviceDidComplete() {
        currentState = .ready
    }

    func serviceDidFail(_ error: GateKeeperError) {
        lastError = error
        currentState = .error
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            currentState = .ready
        }
    }
}

// MARK: - ReachabilityServiceDelegate
extension GateViewModel: ReachabilityServiceDelegate {
    func reachabilityService(_ service: ReachabilityServiceProtocol, target: PingTarget, isReachable: Bool) {
        // Log individual ping results for debugging
        print("Ping \(target.host): \(isReachable)")
    }
    
    func reachabilityService(_ service: ReachabilityServiceProtocol, anyTargetReachable: Bool, from targets: [PingTarget]) {
        self.isNetworkReachable = anyTargetReachable
    }
}
