//
//  ConfigViewModel.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

@MainActor
final class ConfigViewModel: ObservableObject {
    @Published var esp32IPAddress: String = ""
    @Published var mqttHost: String = "mqtt.rannow.de"
    @Published var mqttPort: String = "8883"
    @Published var mqttUsername: String = "ctl_house_user"
    @Published var mqttPassword: String = "QuTrur*4gwjxuu@qpPHB"
    
    private let configManager: ConfigManagerProtocol
    private let logger: LoggerProtocol
    
    init(configManager: ConfigManagerProtocol, logger: LoggerProtocol) {
        self.configManager = configManager
        self.logger = logger
        
        loadExistingConfiguration()
    }
    
    var isValidIPAddress: Bool {
        return esp32IPAddress.isEmpty || isValidIP(esp32IPAddress)
    }
    
    var isValidConfiguration: Bool {
        let hasValidESP32: Bool = !esp32IPAddress.isEmpty && isValidIPAddress
        let hasValidMQTT: Bool = !mqttHost.isEmpty && 
                                !mqttUsername.isEmpty && 
                                !mqttPassword.isEmpty &&
                                Int(mqttPort) != nil
        
        return hasValidESP32 || hasValidMQTT
    }
    
    func saveConfiguration() {
        if !esp32IPAddress.isEmpty && isValidIPAddress {
            configManager.saveESP32IP(esp32IPAddress)
        }
        
        if !mqttHost.isEmpty && !mqttUsername.isEmpty && !mqttPassword.isEmpty,
           let port = Int(mqttPort) {
            let config = MQTTConfig(
                host: mqttHost,
                port: port,
                username: mqttUsername,
                password: mqttPassword
            )
            configManager.saveMQTTConfig(config)
        }
        
        logger.info("Configuration saved", metadata: [:])
    }
    
    private func loadExistingConfiguration() {
        if let ip = configManager.getESP32IP() {
            esp32IPAddress = ip
        }
        
        if let mqttConfig = configManager.getMQTTConfig() {
            mqttHost = mqttConfig.host
            mqttPort = String(mqttConfig.port)
            mqttUsername = mqttConfig.username
            mqttPassword = mqttConfig.password
        }
    }
    
    private func isValidIP(_ ip: String) -> Bool {
        let parts = ip.components(separatedBy: ".")
        guard parts.count == 4 else { return false }
        
        return parts.allSatisfy { part in
            guard let number = Int(part) else { return false }
            return number >= 0 && number <= 255
        }
    }
}
