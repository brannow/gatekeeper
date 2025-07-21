//
//  Logger.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import os.log

final class Logger: LoggerProtocol {
    
    private let osLogger = os.Logger(subsystem: "com.yourapp.Gatekeeper", category: "default")
    private let queue = DispatchQueue(label: "logger.queue", qos: .utility)

    // MARK: - Public API

    func info(_ message: String) {
        info(message, metadata: [:])
    }
    
    func info(_ message: String, metadata: [String: String?]) {
        queue.async {
            let meta = self.format(metadata: metadata)
            self.osLogger.info("[\(self.timestamp())] \(message)\(meta)")
        }
    }
    
    func warning(_ message: String, error: Error?) {
        warning(message, error: error, metadata: [:])
    }
    
    func error(_ message: String, error: Error?) {
        queue.async {
            let err = error.map { " – \($0)" } ?? ""
            self.osLogger.error("[\(self.timestamp())] \(message)\(err)")
        }
    }
    
    func warning(_ message: String) {
        warning(message, error: nil, metadata: [:])
    }

    func warning(_ message: String, error: Error? = nil, metadata: [String: String?] = [:]) {
        queue.async {
            let meta = self.format(metadata: metadata)
            let err = error.map { " – \($0)" } ?? ""
            self.osLogger.warning("[\(self.timestamp())] \(message)\(err)\(meta)")
        }
    }
    
    func error(_ message: String) {
        error(message, error: nil, metadata: [:])
    }

    func error(_ message: String, error: Error? = nil, metadata: [String: String?] = [:]) {
        queue.async {
            let meta = self.format(metadata: metadata)
            let err = error.map { " – \($0)" } ?? ""
            self.osLogger.error("[\(self.timestamp())] \(message)\(err)\(meta)")
        }
    }

    // MARK: - Helpers

    private func timestamp() -> String {
        let now = Date()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSSSSS"
        return formatter.string(from: now)
    }
    
    private func format(metadata: [String: String?]) -> String {
        let filtered = metadata.compactMapValues { $0 }
        guard !filtered.isEmpty else { return "" }
        return " [\(filtered.map { "\($0.key)=\($0.value)" }.joined(separator: " "))]"
    }
}
