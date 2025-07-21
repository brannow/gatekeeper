//
//  GateNetworkInterface.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

protocol GateNetworkInterface {
    var delegate: GateNetworkDelegate? { get set }
    func open() async throws
}

protocol GateNetworkDelegate: AnyObject {
    func gateDidReceiveRelayState(_ state: RelayState)
    func gateDidEncounterError(_ error: GateKeeperError)
}