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
    @Published var esp32Port: String = "8080"
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
        return esp32IPAddress.isEmpty || isValidHostAddress(esp32IPAddress)
    }
    
    var isValidESP32Port: Bool {
        guard let port = UInt16(esp32Port) else { return false }
        return port > 0 && port <= 65535
    }
    
    var isValidMqttPort: Bool {
        guard let port = UInt16(mqttPort) else { return false }
        return port > 0 && port <= 65535
    }
    
    var isValidConfiguration: Bool {
        let hasValidESP32: Bool = !esp32IPAddress.isEmpty && isValidIPAddress && isValidESP32Port
        let hasValidMQTT: Bool = !mqttHost.isEmpty && 
                                !mqttUsername.isEmpty && 
                                !mqttPassword.isEmpty &&
                                isValidMqttPort
        
        return hasValidESP32 || hasValidMQTT
    }
    
    func saveConfiguration() {
        if !esp32IPAddress.isEmpty && isValidIPAddress && isValidESP32Port,
           let port = UInt16(esp32Port) {
            let esp32Config = ESP32Config(host: esp32IPAddress, port: port)
            configManager.saveESP32Config(esp32Config)
        }
        
        if !mqttHost.isEmpty && !mqttUsername.isEmpty && !mqttPassword.isEmpty,
           let port = UInt16(mqttPort) {
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
        if let esp32Config = configManager.getESP32Config() {
            esp32IPAddress = esp32Config.host
            esp32Port = String(esp32Config.port)
        }
        
        if let mqttConfig = configManager.getMQTTConfig() {
            mqttHost = mqttConfig.host
            mqttPort = String(mqttConfig.port)
            mqttUsername = mqttConfig.username
            mqttPassword = mqttConfig.password
        }
    }
    
    private func isValidHostAddress(_ address: String) -> Bool {
        return isValidIP(address) || isValidDomainName(address)
    }
    
    private func isValidIP(_ ip: String) -> Bool {
        let parts = ip.components(separatedBy: ".")
        guard parts.count == 4 else { return false }
        
        return parts.allSatisfy { part in
            guard let number = Int(part) else { return false }
            return number >= 0 && number <= 255
        }
    }
    
    private func isValidDomainName(_ domain: String) -> Bool {
        let domainRegex = "^[a-zA-Z0-9]([a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?\\.[a-zA-Z]{2,}$|^[a-zA-Z0-9]([a-zA-Z0-9\\-]{0,61}[a-zA-Z0-9])?\\.local$"
        let predicate = NSPredicate(format: "SELF MATCHES %@", domainRegex)
        return predicate.evaluate(with: domain) || !domain.contains(".") && domain.count > 0
    }
}
