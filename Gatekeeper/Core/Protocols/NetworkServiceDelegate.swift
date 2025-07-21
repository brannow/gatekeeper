//
//  NetworkServiceDelegate.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

@MainActor
protocol NetworkServiceDelegate: AnyObject {
    func serviceDidReceive(_ state: RelayState)
    func serviceDidComplete()
    func serviceDidFail(_ error: GateKeeperError)
}
