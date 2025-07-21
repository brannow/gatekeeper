//
//  GateNetworkInterface.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

struct NetworkOperationResult {
    let success: Bool
    let stateUpdates: AsyncStream<RelayState>
}

protocol GateNetworkInterface {
    func run() async throws -> NetworkOperationResult
}
