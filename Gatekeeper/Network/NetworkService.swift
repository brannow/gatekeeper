//
//  NetworkService.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import Network

protocol NetworkServiceProtocol {
    func triggerGate() async -> GateOperationResult
}

struct GateOperationResult {
    let success: Bool
    let method: NetworkMethod
    let duration: TimeInterval
    let error: GateKeeperError?
    let stateUpdates: AsyncStream<RelayState>?
}

enum NetworkMethod {
    case udp
    case mqtt
}

final class NetworkService: NetworkServiceProtocol {

    private let config: ConfigManagerProtocol
    private let logger: LoggerProtocol
    private let timeoutInterval: TimeInterval = 5

    init(config: ConfigManagerProtocol, logger: LoggerProtocol) {
        self.config = config
        self.logger = logger
    }

    func triggerGate() async -> GateOperationResult {
        let start = Date()

        let factories: [() throws -> GateNetworkInterface] = [
            { try SocketAdapter(config: self.config, logger: self.logger) },
            { try MQTTNetworkAdapter(config: self.config, logger: self.logger) }
        ]

        // MARK: - Adapter execution with strict 5-second budget
        for (index, makeAdapter) in factories.enumerated() {
            do {
                let adapter = try makeAdapter()

                let operationResult: NetworkOperationResult = try await withTimeout(seconds: timeoutInterval) {
                    try await adapter.run()
                }

                let duration = Date().timeIntervalSince(start)
                let method: NetworkMethod = index == 0 ? .udp : .mqtt

                logger.info("Gate opened",
                            metadata: ["method": "\(method)",
                                       "duration": String(format: "%.2f", duration)])
                return GateOperationResult(success: operationResult.success,
                                           method: method,
                                           duration: duration,
                                           error: nil,
                                           stateUpdates: operationResult.stateUpdates)

            } catch is CancellationError {
                logger.warning("Adapter \(index) timed out")
            } catch {
                logger.warning("Adapter \(index) failed", error: error)
            }
        }

        let duration = Date().timeIntervalSince(start)
        let error = GateKeeperError.allAdaptersFailed
        logger.error("No adapter succeeded", error: error)
        return GateOperationResult(success: false,
                                   method: .mqtt,
                                   duration: duration,
                                   error: error,
                                   stateUpdates: nil)
    }

    private func withTimeout<T>(seconds: TimeInterval,
                                operation: @escaping () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await operation() }
            group.addTask {
                try await Task.sleep(for: .seconds(seconds))
                throw GateKeeperError.operationTimeout
            }
            let result = try await group.next()!
            group.cancelAll()
            return result
        }
    }
}
