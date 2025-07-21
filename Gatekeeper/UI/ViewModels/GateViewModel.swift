//
//  GateViewModel.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

@MainActor
final class GateViewModel: ObservableObject {
    @Published var state: GateState = .ready
    @Published var lastError: GateKeeperError?
    private let service: NetworkService

    init(service: NetworkService) {
        self.service = service
        service.delegate = self
    }

    func triggerGate() {
        guard state == .ready else { return }
        state = .triggering
        service.triggerGate()
    }
}

extension GateViewModel: NetworkServiceDelegate {
    func serviceDidReceive(_ relay: RelayState) {
        switch relay {
        case .activated: state = .waitingForRelayClose
        case .released:  state = .ready
        }
    }

    func serviceDidComplete() {
        state = .ready
    }

    func serviceDidFail(_ error: GateKeeperError) {
        lastError = error
        state = .error
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            state = .ready
        }
    }
}
