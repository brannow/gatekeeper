//
//  ESP32Config.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

enum ReachabilityStatus {
    case unknown
    case connected
    case disconnected
}

class ESP32Config {
    var host: String
    var port: UInt16
    var reachabilityStatus: ReachabilityStatus = .unknown
    
    init(host: String, port: UInt16) {
        self.host = host
        self.port = port
    }
}
