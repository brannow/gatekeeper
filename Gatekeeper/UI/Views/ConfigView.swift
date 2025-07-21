//
//  ConfigView.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import SwiftUI

struct ConfigView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var viewModel: ConfigViewModel
    
    init(viewModel: ConfigViewModel) {
        self.viewModel = viewModel
    }
    
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    esp32Section
                    mqttSection
                }
                .padding(.horizontal, 16)
                .padding(.top, 20)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        viewModel.saveConfiguration()
                        dismiss()
                    }
                    .disabled(!viewModel.isValidConfiguration)
                }
            }
        }
    }
    
    private var esp32Section: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("ESP32 Configuration")
                .font(.headline)
                .foregroundColor(.primary)
            
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Host Address")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    TextField("192.168.1.100", text: $viewModel.esp32IPAddress)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .accessibilityLabel("ESP32 Host Address")
                    
                    if !viewModel.isValidIPAddress {
                        Text("Please enter a valid host address")
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Port")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                    
                    TextField("8080", text: $viewModel.esp32Port)
                        .textFieldStyle(.roundedBorder)
                        .keyboardType(.numberPad)
                        .autocorrectionDisabled(true)
                        .accessibilityLabel("ESP32 Port")
                    
                    if !viewModel.isValidESP32Port {
                        Text("Please enter a valid port (1-65535)")
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
            }
        }
        .padding(16)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
    
    private var mqttSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("MQTT Configuration")
                .font(.headline)
                .foregroundColor(.primary)
            
            VStack(spacing: 16) {
                constraintFreeInputField(
                    title: "Host",
                    placeholder: "mqtt.broker.com",
                    text: $viewModel.mqttHost
                )
                
                inputField(
                    title: "Port", 
                    placeholder: "1883",
                    text: $viewModel.mqttPort,
                    keyboardType: .numberPad
                )
                
                constraintFreeInputField(
                    title: "Username",
                    placeholder: "username",
                    text: $viewModel.mqttUsername
                )
                
                constraintFreeInputField(
                    title: "Password",
                    placeholder: "password",
                    text: $viewModel.mqttPassword,
                    isSecure: true
                )
            }
        }
        .padding(16)
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }
    
    private func inputField(
        title: String,
        placeholder: String,
        text: Binding<String>,
        keyboardType: UIKeyboardType = .default,
        isSecure: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            Group {
                if isSecure {
                    SecureField(placeholder, text: text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .textContentType(.password)
                } else {
                    TextField(placeholder, text: text)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .textContentType(textContentType(for: title))
                }
            }
            .textFieldStyle(.roundedBorder)
            .accessibilityLabel("\(title) input field")
        }
    }
    
    private func textContentType(for title: String) -> UITextContentType? {
        switch title.lowercased() {
        case "host":
            return .URL
        case "username":
            return .username
        case "password":
            return .password
        default:
            return nil
        }
    }
    
    private func constraintFreeInputField(
        title: String,
        placeholder: String,
        text: Binding<String>,
        isSecure: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            Group {
                if isSecure {
                    SecureField(placeholder, text: text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .disableAutocorrection(true)
                        .textContentType(nil)
                } else {
                    TextField(placeholder, text: text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .disableAutocorrection(true)
                        .textContentType(textContentTypeForTitle(title))
                }
            }
            .textFieldStyle(.roundedBorder)
            .keyboardType(keyboardTypeForTitle(title))
            .accessibilityLabel("\(title) input field")
        }
    }
    
    private func keyboardTypeForTitle(_ title: String) -> UIKeyboardType {
        switch title.lowercased() {
        case "host":
            return .URL
        case "username":
            return .emailAddress
        default:
            return .asciiCapable
        }
    }
    
    private func textContentTypeForTitle(_ title: String) -> UITextContentType? {
        switch title.lowercased() {
        case "host":
            return .URL
        case "username":
            return nil
        default:
            return nil
        }
    }
}
