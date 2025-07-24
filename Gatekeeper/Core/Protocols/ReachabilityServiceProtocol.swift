//
//  ReachabilityServiceProtocol.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 24.07.25.
//

import Foundation

protocol ReachabilityServiceProtocol: AnyObject {
    var delegate: ReachabilityServiceDelegate? { get set }
    func checkTarget(_ target: PingTarget)
    func checkTargets(_ targets: [PingTarget])
    func cancelAllChecks()
}

@MainActor
protocol ReachabilityServiceDelegate: AnyObject {
    func reachabilityService(_ service: ReachabilityServiceProtocol, target: PingTarget, isReachable: Bool)
    func reachabilityService(_ service: ReachabilityServiceProtocol, anyTargetReachable: Bool, from targets: [PingTarget])
}