//
//  PingTarget.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 24.07.25.
//

import Foundation

struct PingTarget: Equatable, Hashable {
    let config: ReachableConfig
    let method: NetworkMethod
    
    var host: String {
        config.host
    }
    
    init(config: ReachableConfig, method: NetworkMethod = .udp) {
        self.config = config
        self.method = method
    }
    
    static func == (lhs: PingTarget, rhs: PingTarget) -> Bool {
        return lhs.host == rhs.host && lhs.method == rhs.method
    }
    
    func hash(into hasher: inout Hasher) {
        hasher.combine(host)
        hasher.combine(method)
    }
}

// Note: PingTarget is no longer Codable since it contains a protocol reference
// If serialization is needed, create PingTarget from serialized config data

extension PingTarget: CustomStringConvertible {
    var description: String {
        return "\(host) (\(method))"
    }
}