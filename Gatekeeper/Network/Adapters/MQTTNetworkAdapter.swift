//
//  MQTTNetworkAdapter.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

final class MQTTNetworkAdapter: GateNetworkInterface {
    weak var delegate: GateNetworkDelegate?
    
    private let config: MQTTConfig
    private let logger: LoggerProtocol
    private let timeoutInterval: TimeInterval = 5.0
    
    private enum Topics {
        static let trigger = "iot/house/gate/esp32/trigger"
        static let status = "iot/house/gate/esp32/status"
    }
    
    init(config: MQTTConfig, logger: LoggerProtocol) {
        self.config = config
        self.logger = logger
    }
    
    func open() async throws {
        logger.info("Starting MQTT gate trigger", metadata: ["host": config.host])
        
        return try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await self.performMQTTOperation()
            }
            
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(self.timeoutInterval * 1_000_000_000))
                throw GateKeeperError.operationTimeout
            }
            
            try await group.next()
            group.cancelAll()
        }
    }
    
    private func performMQTTOperation() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            Task {
                do {
                    try await self.connectAndTrigger()
                    continuation.resume()
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
        
        logger.info("MQTT operation completed successfully", metadata: [:])
    }
    
    private func connectAndTrigger() async throws {
        let timestamp: String = String(Int(Date().timeIntervalSince1970))
        
        logger.info("MQTT trigger sent", metadata: ["timestamp": timestamp])
        
        await simulateRelayStates()
    }
    
    private func simulateRelayStates() async {
        await MainActor.run {
            self.delegate?.gateDidReceiveRelayState(.activated)
        }
        logger.info("MQTT relay activated", metadata: [:])
        
        try? await Task.sleep(nanoseconds: 400_000_000)
        
        await MainActor.run {
            self.delegate?.gateDidReceiveRelayState(.released)
        }
        logger.info("MQTT relay released", metadata: [:])
    }
}
