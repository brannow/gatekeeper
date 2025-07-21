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

    private let service: NetworkService
    private let config: ConfigManagerProtocol   // ← injected once, not stored publicly

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
        case .ready: return !isConfigured
        case .triggering, .waitingForRelayClose: return true
        case .timeout, .error: return false
        }
    }

    var isConfigured: Bool {
        config.getESP32Config() != nil || config.getMQTTConfig() != nil
    }

    // MARK: - Init
    init(service: NetworkService, config: ConfigManagerProtocol) {
        self.service = service
        self.config  = config
        service.delegate = self
    }

    // MARK: - Public API
    func triggerGate() {
        guard currentState == .ready else { return }
        currentState = .triggering
        service.triggerGate()
    }

    func refreshConfiguration() {
        objectWillChange.send()   // force SwiftUI re-check of `isConfigured`
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
