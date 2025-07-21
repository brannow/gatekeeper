//
//  SocketAdapter.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import Network

final class SocketAdapter: GateNetworkInterface {
    weak var delegate: GateNetworkDelegate?
    
    private let ipAddress: String
    private let port: UInt16
    private let logger: LoggerProtocol
    private let timeoutInterval: TimeInterval = 2.0
    
    init(ipAddress: String, port: UInt16 = 8080, logger: LoggerProtocol) {
        self.ipAddress = ipAddress
        self.port = port
        self.logger = logger
    }
    
    func open() async throws {
        logger.info("Starting UDP gate trigger", metadata: ["ip": ipAddress, "port": String(port)])
        
        return try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await self.performUDPOperation()
            }
            
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(self.timeoutInterval * 1_000_000_000))
                throw GateKeeperError.operationTimeout
            }
            
            try await group.next()
            group.cancelAll()
        }
    }
    
    private func performUDPOperation() async throws {
        let connection: NWConnection = try await createConnection()
        defer { connection.cancel() }
        
        try await sendTrigger(connection: connection)
        try await receiveResponse(connection: connection)
        
        logger.info("UDP operation completed successfully", metadata: [:])
    }
    
    private func createConnection() async throws -> NWConnection {
        let host: NWEndpoint.Host = NWEndpoint.Host(ipAddress)
        guard let port: NWEndpoint.Port = NWEndpoint.Port(rawValue: port) else {
            throw GateKeeperError.udpConnectionFailed
        }
        
        let endpoint: NWEndpoint = NWEndpoint.hostPort(host: host, port: port)
        let connection: NWConnection = NWConnection(to: endpoint, using: .udp)
        
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
        let triggerData = Data([0x01])
        
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connection.send(content: triggerData, completion: .contentProcessed { error in
                if let error = error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            })
        }
        
        logger.info("UDP trigger sent", metadata: [:])
    }
    
    private func receiveResponse(connection: NWConnection) async throws {
        var hasReceivedActivated = false
        var hasReceivedReleased = false
        
        while !hasReceivedReleased {
            let data: Data = try await withCheckedThrowingContinuation { continuation in
                connection.receive(minimumIncompleteLength: 1, maximumLength: 1) { data, _, isComplete, error in
                    if let error = error {
                        continuation.resume(throwing: error)
                    } else if let data = data, !data.isEmpty {
                        continuation.resume(returning: data)
                    } else if isComplete {
                        continuation.resume(throwing: GateKeeperError.invalidResponse)
                    }
                }
            }
            
            guard let byte = data.first else {
                throw GateKeeperError.invalidResponse
            }
            
            switch byte {
            case 0x01:
                if !hasReceivedActivated {
                    hasReceivedActivated = true
                    await MainActor.run {
                        self.delegate?.gateDidReceiveRelayState(.activated)
                    }
                    logger.info("Relay activated", metadata: [:])
                }
            case 0x00:
                if hasReceivedActivated && !hasReceivedReleased {
                    hasReceivedReleased = true
                    await MainActor.run {
                        self.delegate?.gateDidReceiveRelayState(.released)
                    }
                    logger.info("Relay released", metadata: [:])
                }
            default:
                logger.warning("Unexpected UDP response byte", error: nil)
            }
        }
    }
}
