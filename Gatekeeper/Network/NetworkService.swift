//
//  NetworkService.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import Network

protocol NetworkServiceProtocol {
    func triggerGate() async throws -> GateOperationResult
}

struct GateOperationResult {
    let success: Bool
    let method: NetworkMethod
    let duration: TimeInterval
    let error: GateKeeperError?
}

enum NetworkMethod {
    case udp
    case mqtt
}

final class NetworkService: NetworkServiceProtocol {
    private let configManager: ConfigManagerProtocol
    private let logger: LoggerProtocol
    private let monitor: NWPathMonitor
    
    init(configManager: ConfigManagerProtocol, logger: LoggerProtocol) {
        self.configManager = configManager
        self.logger = logger
        self.monitor = NWPathMonitor()
        startNetworkMonitoring()
    }
    
    func triggerGate() async throws -> GateOperationResult {
        let startTime: Date = Date()
        
        do {
            let method: NetworkMethod = try await performGateTrigger()
            let duration: TimeInterval = Date().timeIntervalSince(startTime)
            
            logger.info("Gate operation completed: ", metadata: [
                "method": String(describing: method),
                "duration": String(format: "%.2f", duration)
            ])
            
            return GateOperationResult(
                success: true,
                method: method,
                duration: duration,
                error: nil
            )
        } catch let error as GateKeeperError {
            let duration: TimeInterval = Date().timeIntervalSince(startTime)
            logger.error("Gate operation failed: ", error: error)
            
            return GateOperationResult(
                success: false,
                method: .udp,
                duration: duration,
                error: error
            )
        }
    }
    
    private func performGateTrigger() async throws -> NetworkMethod {
        if isWiFiAvailable() {
            return try await attemptUDPTrigger()
        } else {
            return try await attemptMQTTTrigger()
        }
    }
    
    private func attemptUDPTrigger() async throws -> NetworkMethod {
        guard let ipAddress: String = configManager.getESP32IP() else {
            logger.warning("UDP config missing, falling back to MQTT", error: nil)
            return try await attemptMQTTTrigger()  // Fallback, don't throw
        }
        
        logger.info("Attempting UDP trigger", metadata: ["method": "udp"])
        
        do {
            let adapter = SocketAdapter(ipAddress: ipAddress, logger: logger)
            try await adapter.open()
            return .udp
        } catch {
            logger.warning("UDP failed, falling back to MQTT", error: error)
            return try await attemptMQTTTrigger()
        }
    }
    
    private func attemptMQTTTrigger() async throws -> NetworkMethod {
        guard let mqttConfig: MQTTConfig = configManager.getMQTTConfig() else {
            throw GateKeeperError.configurationMissing
        }
        
        logger.info("Attempting MQTT trigger", metadata: ["method": "mqtt"])
        
        let adapter = MQTTNetworkAdapter(config: mqttConfig, logger: logger)
        try await adapter.open()
        return .mqtt
    }
    
    private func isWiFiAvailable() -> Bool {
        return monitor.currentPath.status == .satisfied && 
               monitor.currentPath.usesInterfaceType(.wifi)
    }
    
    private func startNetworkMonitoring() {
        monitor.start(queue: DispatchQueue.global(qos: .background))
    }
}
