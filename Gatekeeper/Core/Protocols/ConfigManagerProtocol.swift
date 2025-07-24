//
//  ConfigManagerProtocol.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

protocol ConfigManagerProtocol {
    func saveMQTTConfig(_ config: MQTTConfig)
    func saveESP32Config(_ config: ESP32Config)
    func getMQTTConfig() -> MQTTConfig?
    func getESP32Config() -> ESP32Config?
    func saveReachabilityTargets(_ targets: [PingTarget])
    func getReachabilityTargets() -> [PingTarget]?
}