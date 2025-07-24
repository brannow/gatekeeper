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
    private let networkService: NetworkService      // concrete type, no protocol
    private let reachabilityService: ReachabilityServiceProtocol

    @MainActor
    lazy var gateViewModel: GateViewModel = {
        GateViewModel(
            service: networkService,
            config: configManager,
            reachabilityService: reachabilityService,
            logger: logger
        )
    }()

    // If you still use ConfigViewModel, adjust its init as well
    @MainActor
    lazy var configViewModel: ConfigViewModel = {
        ConfigViewModel(configManager: configManager, logger: logger)
    }()

    init() {
        logger       = Logger()
        configManager = ConfigManager(logger: logger)
        networkService = NetworkService(config: configManager, logger: logger)
        reachabilityService = ReachabilityService(logger: logger)
    }
}
