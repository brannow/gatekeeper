//
//  MQTTConfig.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

class MQTTConfig {
    var host: String
    var port: UInt16
    var username: String
    var password: String
    var reachabilityStatus: ReachabilityStatus = .unknown
    
    init(host: String, port: UInt16, username: String, password: String) {
        self.host = host
        self.port = port
        self.username = username
        self.password = password
    }
}
