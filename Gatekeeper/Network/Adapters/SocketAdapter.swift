//
//  SocketAdapter.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import Network

final class SocketAdapter: GateNetworkInterface {

    private let hostAddress: String
    private let port: UInt16
    private let logger: LoggerProtocol

    init(config: ConfigManagerProtocol, logger: LoggerProtocol) throws {
        guard let esp32Config = config.getESP32Config() else {
            throw GateKeeperError.configurationMissing
        }
        guard Self.isWiFiAvailable() else {
            throw GateKeeperError.udpConnectionFailed
        }
        self.hostAddress = esp32Config.host
        self.port = esp32Config.port
        self.logger = logger
    }

    func run() async throws -> NetworkOperationResult {
        logger.info("Starting UDP gate trigger",
                    metadata: ["host": hostAddress, "port": String(port)])

        let (stream, continuation) = AsyncStream<RelayState>.makeStream()
        
        Task {
            do {
                try await performUDPOperation(stateContinuation: continuation)
                logger.info("UDP operation completed successfully",
                            metadata: ["host": hostAddress])
            } catch {
                continuation.finish()
                throw error
            }
        }

        return NetworkOperationResult(success: true, stateUpdates: stream)
    }

    private func performUDPOperation(stateContinuation: AsyncStream<RelayState>.Continuation) async throws {
        let connection = try await createConnection()
        defer { connection.cancel() }

        try await sendTrigger(connection: connection)
        try await receiveResponse(connection: connection, stateContinuation: stateContinuation)

        logger.info("UDP operation completed successfully", metadata: ["host": hostAddress])
    }

    private func createConnection() async throws -> NWConnection {
        let host = NWEndpoint.Host(hostAddress)
        guard let portEndpoint = NWEndpoint.Port(rawValue: port) else {
            throw GateKeeperError.udpConnectionFailed
        }
        let connection = NWConnection(host: host,
                                      port: portEndpoint,
                                      using: .udp)

        return try await withCheckedThrowingContinuation { continuation in
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    continuation.resume(returning: connection)
                case .failed(let error):
                    continuation.resume(throwing: error)
                default:
                    break
                }
            }
            connection.start(queue: .global())
        }
    }

    private func sendTrigger(connection: NWConnection) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: Data([0x01]),
                            completion: .contentProcessed { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }
        logger.info("UDP trigger sent")
    }

    private func receiveResponse(connection: NWConnection, stateContinuation: AsyncStream<RelayState>.Continuation) async throws {
        var released  = false

        while !released {
            let data = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
                connection.receive(minimumIncompleteLength: 1,
                                   maximumLength: 1) { data, _, isComplete, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else if let data = data, !data.isEmpty {
                        continuation.resume(returning: data)
                    } else if isComplete {
                        continuation.resume(throwing: GateKeeperError.invalidResponse)
                    }
                }
            }

            switch data.first {
            case 0x01:
                stateContinuation.yield(.activated)
                logger.info("Relay activated")
            case 0x00:
                released = true
                stateContinuation.yield(.released)
                stateContinuation.finish()
                logger.info("Relay released")
            default:
                logger.warning("Unexpected UDP response byte")
            }
        }
    }

    private static func isWiFiAvailable() -> Bool {
        let monitor = NWPathMonitor()
        let semaphore = DispatchSemaphore(value: 0)
        var ok = false
        monitor.pathUpdateHandler = { path in
            ok = path.status == .satisfied && path.usesInterfaceType(.wifi)
            semaphore.signal()
        }
        monitor.start(queue: .global())
        semaphore.wait()
        monitor.cancel()
        return ok
    }
}
