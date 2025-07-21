//
//  GateKeeperError.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

enum GateKeeperError: Error {
    case configurationMissing
    case udpConnectionFailed
    case mqttConnectionFailed
    case allAdaptersFailed
    case operationTimeout
    case operationInProgress
    case invalidResponse
}