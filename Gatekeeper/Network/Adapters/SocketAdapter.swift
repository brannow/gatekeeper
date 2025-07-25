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

    private let cfg: ESP32Config
    private let logger: LoggerProtocol
    private var conn: NWConnection?

    init(cfg: ESP32Config, logger: LoggerProtocol) {
        self.cfg    = cfg
        self.logger = logger
    }

    // MARK: - API
    func start() {
        logger.info("UDP start", metadata: ["host": cfg.host, "port": "\(cfg.port)"])
        conn = NWConnection(host: .init(cfg.host),
                            port: .init(integerLiteral: cfg.port),
                            using: .udp)

        conn?.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            self.logger.info("state → \(state)")
            if state == .ready {
                self.logger.info("socket ready")
                self.handshake()
            }
            if case .failed(let e) = state {
                self.logger.error("socket failed", error: nil, metadata: ["error": "\(e)"])
                self.delegate?.adapterDidFail(self, .udpConnectionFailed)
            }
        }

        conn?.start(queue: .global())
    }

    func stop() {
        logger.info("UDP stop")
        conn?.cancel()
        conn = nil
    }

    // MARK: - private
    private func handshake() {
        logger.info("sending trigger 0x01")
        conn?.send(content: Data([0x01]),
                   completion: .contentProcessed { [weak self] error in
            guard let self = self else { return }
            if let e = error {
                self.logger.error("send failed", error: error, metadata: ["error": "\(e)"])
                self.delegate?.adapterDidFail(self, .udpConnectionFailed)
                return
            }
            self.logger.info("trigger sent, waiting 0x01")
            self.expect(0x01) { [weak self] in
                guard let self = self else { return }
                self.logger.info("received 0x01 → activated")
                self.delegate?.adapterDidReceive(self, .activated)

                self.logger.info("waiting 0x00")
                self.expect(0x00) { [weak self] in
                    guard let self = self else { return }
                    self.logger.info("received 0x00 → released")
                    self.delegate?.adapterDidReceive(self, .released)
                    self.delegate?.adapterDidComplete(self)
                }
            }
        })
    }

    private func expect(_ byte: UInt8, then: @escaping () -> Void) {
        conn?.receiveMessage { [weak self] data, _, _, error in
            guard let self = self else { return }
            if let e = error {
                self.logger.error("receive error", error: e, metadata: ["error": "\(e)"])
                self.delegate?.adapterDidFail(self, .invalidResponse)
                return
            }
            let got = data?.first ?? 0xFF
            self.logger.info("expecting 0x\(String(byte, radix: 16)) got 0x\(String(got, radix: 16))")
            if got == byte {
                then()
            } else {
                self.logger.error("unexpected byte")
                self.delegate?.adapterDidFail(self, .invalidResponse)
            }
        }
    }
}
