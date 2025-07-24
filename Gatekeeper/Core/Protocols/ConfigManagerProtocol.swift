//
//  ConfigManagerProtocol.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

protocol ReachableConfig: AnyObject {
    var host: String { get }
    var isReachable: Bool { get set }
}

extension ESP32Config: ReachableConfig {}
extension MQTTConfig: ReachableConfig {}

protocol ConfigManagerProtocol {
    func saveMQTTConfig(_ config: MQTTConfig)
    func saveESP32Config(_ config: ESP32Config)
    func getMQTTConfig() -> MQTTConfig?
    func getESP32Config() -> ESP32Config?
    func getReachabilityTargets() -> [PingTarget]?
}
