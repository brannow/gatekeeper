//
//  NetworkService.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import Network

final class NetworkService {

    private let config: ConfigManagerProtocol
    private let logger: LoggerProtocol
    private var currentAdapter: GateNetworkInterface?

    // delegate is *always* accessed on the main actor
    @MainActor weak var delegate: NetworkServiceDelegate?

    init(config: ConfigManagerProtocol, logger: LoggerProtocol) {
        self.config  = config
        self.logger  = logger
    }

    func triggerGate() {
        // pick an adapter
        let adapter: GateNetworkInterface
        if let cfg = config.getESP32Config() {
            adapter = SocketAdapter(cfg: cfg, logger: logger)
        } else if let cfg = config.getMQTTConfig() {
            adapter = MQTTNetworkAdapter(cfg: cfg, logger: logger)
        } else {
            Task { @MainActor in
                delegate?.serviceDidFail(.configurationMissing)
            }
            return
        }

        adapter.delegate = AdapterBridge(service: self)
        currentAdapter   = adapter
        adapter.start()
    }
}

// MARK: - Bridge that keeps the adapter ignorant of @MainActor
private final class AdapterBridge: NetworkAdapterDelegate {
    private weak var service: NetworkService?

    init(service: NetworkService) { self.service = service }

    func adapterDidConnect() { /* nothing to do */ }

    func adapterDidFail(_ error: GateKeeperError) {
        Task { @MainActor [weak self] in
            self?.service?.delegate?.serviceDidFail(error)
        }
    }

    func adapterDidReceive(_ state: RelayState) {
        Task { @MainActor [weak self] in
            self?.service?.delegate?.serviceDidReceive(state)
        }
    }

    func adapterDidComplete() {
        Task { @MainActor [weak self] in
            self?.service?.delegate?.serviceDidComplete()
        }
    }
}
