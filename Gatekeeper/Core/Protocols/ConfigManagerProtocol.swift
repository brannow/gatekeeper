//
//  ConfigManagerProtocol.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

protocol ConfigManagerProtocol {
    func saveMQTTConfig(_ config: MQTTConfig)
    func saveESP32IP(_ ip: String)
    func getMQTTConfig() -> MQTTConfig?
    func getESP32IP() -> String?
}