//
//  LoggerProtocol.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation

protocol LoggerProtocol {
    func info(_ message: String, metadata: [String: String])
    func warning(_ message: String, error: Error?)
    func error(_ message: String, error: Error)
}