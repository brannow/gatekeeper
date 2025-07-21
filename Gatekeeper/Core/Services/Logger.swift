//
//  Logger.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import os.log

final class Logger: LoggerProtocol {
    private let osLogger: os.Logger
    private let queue: DispatchQueue
    
    init(subsystem: String = Bundle.main.bundleIdentifier ?? "com.gatekeeper", 
         category: String = "default") {
        self.osLogger = os.Logger(subsystem: subsystem, category: category)
        self.queue = DispatchQueue(label: "logger.queue", qos: .utility)
    }
    
    func info(_ message: String, metadata: [String: String] = [:]) {
        queue.async {
            let metadataString: String = self.formatMetadata(metadata)
            self.osLogger.info("\(message) \(metadataString)")
        }
    }
    
    func warning(_ message: String, error: Error? = nil) {
        queue.async {
            let errorString: String = error?.localizedDescription ?? ""
            self.osLogger.warning("\(message) \(errorString)")
        }
    }
    
    func error(_ message: String, error: Error) {
        queue.async {
            let errorString: String = error.localizedDescription
            self.osLogger.error("\(message) \(errorString)")
        }
    }
    
    private func formatMetadata(_ metadata: [String: String]) -> String {
        guard !metadata.isEmpty else { return "" }
        let pairs: [String] = metadata.map { "\($0.key)=\($0.value)" }
        return "[\(pairs.joined(separator: ", "))]"
    }
}