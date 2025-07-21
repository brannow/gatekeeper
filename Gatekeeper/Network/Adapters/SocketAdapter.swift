//
//  SocketAdapter.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import Network

final class SocketAdapter: GateNetworkInterface {
    let method: NetworkMethod = .udp
    weak var delegate: NetworkAdapterDelegate?
    private let host: String
    private let port: UInt16
    private let logger: LoggerProtocol
    private var conn: NWConnection?

    init(cfg: ESP32Config, logger: LoggerProtocol) {
        self.host = cfg.host
        self.port = cfg.port
        self.logger = logger
    }

    func start() {
        conn = NWConnection(host: .init(host), port: .init(integerLiteral: port), using: .udp)
        conn?.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready: self?.handleReady()
            case .failed: self?.delegate?.adapterDidFail(.udpConnectionFailed)
            default: break
            }
        }
        conn?.start(queue: .main)
    }

    func stop() { conn?.cancel(); conn = nil }

    private func handleReady() {
        delegate?.adapterDidConnect()
        sendTrigger()
    }

    private func sendTrigger() {
        conn?.send(content: Data([0x01]), completion: .contentProcessed { [weak self] error in
            if error != nil { self?.delegate?.adapterDidFail(.udpConnectionFailed); return }
            self?.receive()
        })
    }

    private func receive() {
        conn?.receive(minimumIncompleteLength: 1, maximumLength: 1) { [weak self] data, _, _, error in
            if error != nil { self?.delegate?.adapterDidFail(.invalidResponse); return }
            guard let byte = data?.first else { return }
            switch byte {
            case 0x01: self?.delegate?.adapterDidReceive(.activated); self?.receive()
            case 0x00: self?.delegate?.adapterDidReceive(.released); self?.delegate?.adapterDidComplete()
            default:   self?.delegate?.adapterDidFail(.invalidResponse)
            }
        }
    }
}
