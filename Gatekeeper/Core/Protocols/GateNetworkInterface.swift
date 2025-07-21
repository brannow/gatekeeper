//
//  GateNetworkInterface.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

protocol NetworkAdapterDelegate: AnyObject {
    func adapterDidConnect()
    func adapterDidFail(_ error: GateKeeperError)
    func adapterDidReceive(_ state: RelayState)
    func adapterDidComplete()
}

protocol GateNetworkInterface: AnyObject {
    var method: NetworkMethod { get }
    var delegate: NetworkAdapterDelegate? { get set }
    func start()
    func stop()
}
