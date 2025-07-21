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
        
        currentState = .triggering
        
        let result: GateOperationResult = await networkService.triggerGate()
        lastOperation = result
        
        if result.success {
            logger.info("Gate operation started successfully", metadata: [
                "method": String(describing: result.method),
                "duration": String(format: "%.2f", result.duration)
            ])
            
            // Listen to state updates from the network operation
            if let stateUpdates = result.stateUpdates {
                for await state in stateUpdates {
                    await handleRelayStateUpdate(state)
                }
            }
        } else {
            await handleError(result.error ?? GateKeeperError.allAdaptersFailed)
        }
    }
    
    func refreshConfiguration() {
        checkConfiguration()
    }
    
    private func checkConfiguration() {
        let hasESP32Config: Bool = configManager.getESP32Config() != nil
        let hasMQTTConfig: Bool = configManager.getMQTTConfig() != nil
        
        isConfigured = hasESP32Config || hasMQTTConfig
        logger.info("Configuration status", metadata: [
            "esp32_configured": String(hasESP32Config),
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
    
    private func handleRelayStateUpdate(_ state: RelayState) async {
        switch state {
        case .activated:
            currentState = .waitingForRelayClose
            logger.info("Relay activated - waiting for release")
        case .released:
            currentState = .ready
            logger.info("Relay released - gate operation complete")
        }
    }
}
