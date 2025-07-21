//
//  GateViewModel.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

@MainActor
final class GateViewModel: ObservableObject {
    @Published var currentState: GateState = .ready
    @Published var isConfigured: Bool = false
    @Published var lastOperation: GateOperationResult?
    
    private let networkService: NetworkServiceProtocol
    private let configManager: ConfigManagerProtocol
    private let logger: LoggerProtocol
    private var isOperationInProgress: Bool = false
    
    init(networkService: NetworkServiceProtocol, 
         configManager: ConfigManagerProtocol, 
         logger: LoggerProtocol) {
        self.networkService = networkService
        self.configManager = configManager
        self.logger = logger
        
        checkConfiguration()
    }
    
    func triggerGate() async {
        guard isConfigured && !isOperationInProgress else {
            if !isConfigured {
                logger.warning("Configuration missing", error: nil)
            }
            return
        }
        
        isOperationInProgress = true
        currentState = .triggering
        
        defer {
            isOperationInProgress = false
        }
        
        do {
            currentState = .triggering
            
            let result: GateOperationResult = try await networkService.triggerGate()
            lastOperation = result
            
            if result.success {
                currentState = .waitingForRelayClose
                try? await Task.sleep(nanoseconds: 500_000_000)
                currentState = .ready
                
                logger.info("Gate operation completed successfully", metadata: [
                    "method": String(describing: result.method),
                    "duration": String(format: "%.2f", result.duration)
                ])
            } else {
                await handleError(result.error ?? GateKeeperError.allAdaptersFailed)
            }
        } catch {
            await handleError(error as? GateKeeperError ?? GateKeeperError.allAdaptersFailed)
        }
    }
    
    func refreshConfiguration() {
        checkConfiguration()
    }
    
    private func checkConfiguration() {
        let hasESP32IP: Bool = configManager.getESP32IP() != nil
        let hasMQTTConfig: Bool = configManager.getMQTTConfig() != nil
        
        isConfigured = hasESP32IP || hasMQTTConfig
        logger.info("Configuration status", metadata: [
            "esp32_configured": String(hasESP32IP),
            "mqtt_configured": String(hasMQTTConfig)
        ])
    }
    
    private func handleError(_ error: GateKeeperError) async {
        currentState = .error
        logger.error("Gate operation failed", error: error)
        
        try? await Task.sleep(nanoseconds: 2_000_000_000)
        currentState = .ready
    }
    
    var buttonTitle: String {
        switch currentState {
        case .ready:
            return "Open Gate"
        case .triggering:
            return "Triggering..."
        case .waitingForRelayClose:
            return "Opening..."
        case .timeout:
            return "Timeout"
        case .error:
            return "Error"
        }
    }
    
    var isButtonDisabled: Bool {
        switch currentState {
        case .ready:
            return !isConfigured
        case .triggering, .waitingForRelayClose:
            return true
        case .timeout, .error:
            return false
        }
    }
}