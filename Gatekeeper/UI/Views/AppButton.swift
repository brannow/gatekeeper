//
//  AppButton.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import SwiftUI

struct AppButton: View {
    @StateObject private var viewModel: GateViewModel
    private let configViewModel: ConfigViewModel
    @State private var showingConfiguration: Bool = false
    @State private var pulseScale: CGFloat = 1.0
    @State private var shockwave1Scale: CGFloat = 0.0
    @State private var shockwave2Scale: CGFloat = 0.0
    @State private var shockwave3Scale: CGFloat = 0.0
    @State private var shockwave1Opacity: Double = 0.0
    @State private var shockwave2Opacity: Double = 0.0
    @State private var shockwave3Opacity: Double = 0.0
    
    init(viewModel: GateViewModel, configViewModel: ConfigViewModel) {
        self._viewModel = StateObject(wrappedValue: viewModel)
        self.configViewModel = configViewModel
    }
    
    var body: some View {
        NavigationView {
            VStack(spacing: 40) {
                Spacer()
                
                gateButton
                
                statusText
                
                Spacer()
                
                configurationButton
            }
            .padding(.horizontal, 32)
            .navigationTitle("GateKeeper")
            .navigationBarTitleDisplayMode(.large)
            .sheet(isPresented: $showingConfiguration) {
                ConfigView(viewModel: configViewModel)
                    .onDisappear {
                        viewModel.refreshConfiguration()
                    }
            }
        }
    }
    
    private var gateButton: some View {
        ZStack {
            // Shockwave 3 (outermost)
            Circle()
                .stroke(buttonColor, lineWidth: 3)
                .frame(width: 200, height: 200)
                .scaleEffect(shockwave3Scale)
                .opacity(shockwave3Opacity)
            
            // Shockwave 2 (middle)
            Circle()
                .stroke(buttonColor, lineWidth: 4)
                .frame(width: 200, height: 200)
                .scaleEffect(shockwave2Scale)
                .opacity(shockwave2Opacity)
            
            // Shockwave 1 (innermost)
            Circle()
                .stroke(buttonColor, lineWidth: 5)
                .frame(width: 200, height: 200)
                .scaleEffect(shockwave1Scale)
                .opacity(shockwave1Opacity)
            
            // Main button
            Button(action: {
                triggerShockwaveEffect()
                Task {
                    await viewModel.triggerGate()
                }
            }) {
                Text(viewModel.buttonTitle)
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(.white)
                    .frame(width: 200, height: 200)
                    .background(buttonColor)
                    .clipShape(Circle())
                    .scaleEffect(buttonScale * pulseScale)
                    .animation(.easeInOut(duration: 0.4), value: viewModel.currentState)
            }
            .disabled(viewModel.isButtonDisabled)
            .accessibilityLabel("Gate trigger button")
            .accessibilityHint("Tap to open the gate")
        }
    }
    
    private var statusText: some View {
        Text(statusMessage)
            .font(.body)
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
    }
    
    private var configurationButton: some View {
        Button("Settings") {
            showingConfiguration = true
        }
        .font(.callout)
        .foregroundColor(.blue)
        .accessibilityLabel("Settings")
        .accessibilityHint("Configure MQTT and ESP32 settings")
    }
    
    private var buttonColor: Color {
        switch viewModel.currentState {
        case .ready:
            return viewModel.isConfigured ? .green : .gray
        case .triggering, .waitingForRelayClose:
            return .orange
        case .timeout, .error:
            return .red
        }
    }
    
    private var buttonScale: Double {
        switch viewModel.currentState {
        case .triggering, .waitingForRelayClose:
            return 0.95
        default:
            return 1.0
        }
    }
    
    private var statusMessage: String {
        switch viewModel.currentState {
        case .ready:
            return viewModel.isConfigured ? 
                "Ready to open gate" : 
                "Please configure settings first"
        case .triggering:
            return "Sending trigger signal..."
        case .waitingForRelayClose:
            return "Gate is opening..."
        case .timeout:
            return "Operation timed out. Tap to retry."
        case .error:
            return "An error occurred. Tap to retry."
        }
    }
    
    private func triggerShockwaveEffect() {
        // Reset all shockwaves
        shockwave1Scale = 1.0
        shockwave2Scale = 1.0
        shockwave3Scale = 1.0
        shockwave1Opacity = 0.6
        shockwave2Opacity = 0.4
        shockwave3Opacity = 0.3
        
        // Animate shockwave 1 (starts immediately)
        withAnimation(.easeOut(duration: 0.6)) {
            shockwave1Scale = 2.5
            shockwave1Opacity = 0.0
        }
        
        // Animate shockwave 2 (starts with 0.1s delay)
        withAnimation(.easeOut(duration: 0.8).delay(0.1)) {
            shockwave2Scale = 3.0
            shockwave2Opacity = 0.0
        }
        
        // Animate shockwave 3 (starts with 0.2s delay)
        withAnimation(.easeOut(duration: 1.0).delay(0.2)) {
            shockwave3Scale = 3.5
            shockwave3Opacity = 0.0
        }
        
        // Button pulse effect
        withAnimation(.easeOut(duration: 0.1)) {
            pulseScale = 1.15
        }
        withAnimation(.easeOut(duration: 0.2).delay(0.1)) {
            pulseScale = 1.0
        }
    }
}
