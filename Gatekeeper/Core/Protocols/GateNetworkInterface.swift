//
//  GateNetworkInterface.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

protocol NetworkAdapterDelegate: AnyObject {
    func adapterDidConnect(_ adapter: GateNetworkInterface)
    func adapterDidFail(_ adapter: GateNetworkInterface, _ error: GateKeeperError)
    func adapterDidReceive(_ adapter: GateNetworkInterface, _ state: RelayState)
    func adapterDidComplete(_ adapter: GateNetworkInterface)
}

protocol GateNetworkInterface: AnyObject {
    var method: NetworkMethod { get }
    var delegate: NetworkAdapterDelegate? { get set }
    func start()
    func stop()
    func requireWifi() -> Bool
}
