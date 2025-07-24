//
//  ESP32Config.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

class ESP32Config {
    let host: String
    let port: UInt16
    var isReachable: Bool = false
    
    init(host: String, port: UInt16) {
        self.host = host
        self.port = port
    }
}