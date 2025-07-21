//
//  GatekeeperApp.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import SwiftUI

@main
struct GatekeeperApp: App {
    private let dependencyContainer = DependencyContainer()
    
    var body: some Scene {
        WindowGroup {
            AppButton(
                viewModel: dependencyContainer.gateViewModel,
                configViewModel: dependencyContainer.configViewModel
            )
        }
    }
}
