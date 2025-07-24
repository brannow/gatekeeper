//
//  PingTarget.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 24.07.25.
//

import Foundation

struct PingTarget: Equatable, Hashable {
    let host: String
    let method: NetworkMethod
    
    init(host: String, method: NetworkMethod = .udp) {
        self.host = host
        self.method = method
    }
}

extension PingTarget: Codable {
    enum CodingKeys: String, CodingKey {
        case host
        case method
    }
}

extension PingTarget: CustomStringConvertible {
    var description: String {
        return "\(host) (\(method))"
    }
}