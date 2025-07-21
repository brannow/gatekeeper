//
//  ConfigManager.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import Security

final class ConfigManager: ConfigManagerProtocol {
    private let userDefaults: UserDefaults
    private let logger: LoggerProtocol
    
    private enum Keys {
        static let esp32IP = "esp32_ip_address"
        static let udpPort = "udp_port"
        static let mqttHost = "mqtt_host"
        static let mqttPort = "mqtt_port"
    }
    
    private enum KeychainKeys {
        static let mqttUsername = "mqtt_username"
        static let mqttPassword = "mqtt_password"
        static let service = "com.gatekeeper.credentials"
    }
    
    init(userDefaults: UserDefaults = .standard, logger: LoggerProtocol) {
        self.userDefaults = userDefaults
        self.logger = logger
    }
    
    func saveMQTTConfig(_ config: MQTTConfig) {
        userDefaults.set(config.host, forKey: Keys.mqttHost)
        userDefaults.set(config.port, forKey: Keys.mqttPort)
        
        saveToKeychain(key: KeychainKeys.mqttUsername, value: config.username)
        saveToKeychain(key: KeychainKeys.mqttPassword, value: config.password)
        
        logger.info("MQTT configuration saved", metadata: ["host": config.host])
    }
    
    func saveESP32IP(_ ip: String) {
        guard isValidIPAddress(ip) else {
            logger.warning("Invalid IP address format", error: nil)
            return
        }
        
        userDefaults.set(ip, forKey: Keys.esp32IP)
        logger.info("ESP32 IP address saved", metadata: ["ip": ip])
    }
    
    func getMQTTConfig() -> MQTTConfig? {
        guard let host: String = userDefaults.string(forKey: Keys.mqttHost),
              let username: String = getFromKeychain(key: KeychainKeys.mqttUsername),
              let password: String = getFromKeychain(key: KeychainKeys.mqttPassword) else {
            return nil
        }
        
        let port: Int = userDefaults.object(forKey: Keys.mqttPort) as? Int ?? 1883
        
        return MQTTConfig(host: host, port: port, username: username, password: password)
    }
    
    func getESP32IP() -> String? {
        return userDefaults.string(forKey: Keys.esp32IP)
    }
    
    private func saveToKeychain(key: String, value: String) {
        let data: Data = value.data(using: .utf8) ?? Data()
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: KeychainKeys.service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data
        ]
        
        SecItemDelete(query as CFDictionary)
        
        let status: OSStatus = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            logger.error("Failed to save to keychain", error: NSError(domain: NSOSStatusErrorDomain, code: Int(status)))
        }
    }
    
    private func getFromKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: KeychainKeys.service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var item: CFTypeRef?
        let status: OSStatus = SecItemCopyMatching(query as CFDictionary, &item)
        
        guard status == errSecSuccess,
              let data = item as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        
        return value
    }
    
    private func isValidIPAddress(_ ip: String) -> Bool {
        let parts: [String] = ip.components(separatedBy: ".")
        guard parts.count == 4 else { return false }
        
        return parts.allSatisfy { part in
            guard let number = Int(part) else { return false }
            return number >= 0 && number <= 255
        }
    }
}