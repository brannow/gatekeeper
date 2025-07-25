// AppButton.swift
import SwiftUI

struct AppButton: View {
    @ObservedObject var vm: GateViewModel
    private let cfgVM: ConfigViewModel

    @State private var showConfig   = false
    @State private var pulseScale   = 1.0
    @State private var shockScale   = 1.0
    @State private var shockOpacity = 0.6

    init(viewModel: GateViewModel, configViewModel: ConfigViewModel) {
        vm   = viewModel          // plain assignment
        cfgVM = configViewModel
    }

    var body: some View {
        VStack(spacing: 40) {
            Spacer()
            triggerButton
            statusText
            Spacer()
            settingsButton
        }
        .padding(.horizontal, 32)
        .sheet(isPresented: $showConfig) {
            ConfigView(viewModel: cfgVM)
                .onDisappear { vm.refreshConfiguration() }
        }
    }

    // MARK: - Subviews
    private var triggerButton: some View {
        ZStack {
            // Shockwave – always visible, always animates on tap
            Circle()
                .stroke(buttonColor, lineWidth: 5)
                .frame(width: 200, height: 200)
                .scaleEffect(shockScale)
                .opacity(shockOpacity)

            // Main button
            Button {
                triggerEffect()
                Task { @MainActor in
                    vm.triggerGate()
                }
            } label: {
                Text(vm.buttonTitle)
                    .font(.title2.bold())
                    .foregroundColor(.white)
                    .frame(width: 200, height: 200)
                    .background(buttonColor)
                    .clipShape(Circle())
                    .scaleEffect(pulseScale)
            }
        }
    }

    private var statusText: some View {
        Text(statusMessage)
            .font(.body)
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
    }

    private var settingsButton: some View {
        Button("Settings") { showConfig = true }
            .font(.callout)
            .foregroundColor(.blue)
    }

    // MARK: - Helpers
    private var buttonColor: Color {
        switch vm.currentState {
        case .ready: return vm.isConfigured ? .green : .gray
        case .checkingNetwork: return .orange
        case .noNetwork: return .red
        case .triggering, .waitingForRelayClose: return .orange
        case .timeout, .error: return .red
        }
    }

    private var statusMessage: String {
        switch vm.currentState {
        case .ready:
            return vm.isConfigured ? "Ready to open gate" : "Please configure settings first"
        case .checkingNetwork:
            return "Checking network connectivity…"
        case .noNetwork:
            return "No configured hosts are reachable"
        case .triggering:
            return "Sending trigger signal…"
        case .waitingForRelayClose:
            return "Gate is opening…"
        case .timeout:
            return "Operation timed out. Tap to retry."
        case .error:
            return "An error occurred. Tap to retry."
        }
    }

    private func triggerEffect() {
        shockScale   = 1
        shockOpacity = 0.6

        withAnimation(.easeOut(duration: 0.6)) {
            shockScale   = 2.5
            shockOpacity = 0
        }

        withAnimation(.easeOut(duration: 0.1)) { pulseScale = 1.15 }
        withAnimation(.easeOut(duration: 0.2).delay(0.1)) { pulseScale = 1 }
    }
}
