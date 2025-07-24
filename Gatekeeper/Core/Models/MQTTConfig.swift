//
//  MQTTConfig.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

class MQTTConfig {
    let host: String
    let port: UInt16
    let username: String
    let password: String
    var isReachable: Bool = false
    
    init(host: String, port: UInt16, username: String, password: String) {
        self.host = host
        self.port = port
        self.username = username
        self.password = password
    }
}
