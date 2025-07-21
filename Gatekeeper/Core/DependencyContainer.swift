//
//  DependencyContainer.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

final class DependencyContainer {
    private let logger: LoggerProtocol
    private let configManager: ConfigManagerProtocol
    private let networkService: NetworkServiceProtocol
    
    @MainActor
    lazy var gateViewModel: GateViewModel = {
        return GateViewModel(
            networkService: networkService,
            configManager: configManager,
            logger: logger
        )
    }()
    
    @MainActor
    lazy var configViewModel: ConfigViewModel = {
        return ConfigViewModel(
            configManager: configManager,
            logger: logger
        )
    }()
    
    init() {
        self.logger = Logger()
        self.configManager = ConfigManager(logger: logger)
        self.networkService = NetworkService(
            config: configManager,
            logger: logger
        )
    }
}
