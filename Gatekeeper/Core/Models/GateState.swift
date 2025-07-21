//
//  GateState.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

enum GateState {
    case ready
    case triggering
    case waitingForRelayClose
    case timeout
    case error
}