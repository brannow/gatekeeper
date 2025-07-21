//
//  MQTTNetworkAdapter.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import CocoaMQTT

final class MQTTNetworkAdapter: NSObject, GateNetworkInterface {

    private let config: MQTTConfig
    private let logger: LoggerProtocol
    private var mqttClient: CocoaMQTT?
    private var operationContinuation: CheckedContinuation<Void, Error>?
    private var stateContinuation: AsyncStream<RelayState>.Continuation?
    private var isConnected: Bool = false
    private var hasReceivedResponse: Bool = false

    private enum Topics {
        static let trigger = "iot/house/gate/esp32/trigger"
        static let status  = "iot/house/gate/esp32/status"
    }

    init(config: ConfigManagerProtocol, logger: LoggerProtocol) throws {
        guard let cfg = config.getMQTTConfig() else {
            throw GateKeeperError.configurationMissing
        }
        self.config = cfg
        self.logger = logger
        super.init()
        setupMQTTClient()
    }

    deinit {
        mqttClient?.disconnect()
    }

    private func setupMQTTClient() {
        let clientID = "mqtt-\(UUID().uuidString.prefix(8))"
        let client   = CocoaMQTT(clientID: clientID,
                                 host: config.host,
                                 port: UInt16(config.port))
        client.username   = config.username
        client.password   = config.password
        client.keepAlive  = 60
        client.cleanSession = true
        client.autoReconnect = false
        client.delegate = self
        client.enableSSL = true
        mqttClient = client

        logger.info("MQTT client configured",
                    metadata: ["host": config.host,
                               "port": String(config.port),
                               "clientID": clientID])
    }
    
    func run() async throws -> NetworkOperationResult {
        logger.info("Starting MQTT gate trigger",
                    metadata: ["host": config.host])

        let (stream, continuation) = AsyncStream<RelayState>.makeStream()
        stateContinuation = continuation

        let operationTask = Task {
            try await withCheckedThrowingContinuation { (operationCont: CheckedContinuation<Void, Error>) in
                operationContinuation = operationCont
                isConnected           = false
                hasReceivedResponse   = false

                guard let client = mqttClient else {
                    operationCont.resume(throwing: GateKeeperError.connectionFailed)
                    return
                }
                guard client.connect() else {
                    operationCont.resume(throwing: GateKeeperError.connectionFailed)
                    return
                }
            }
        }

        do {
            try await operationTask.value
            return NetworkOperationResult(success: true, stateUpdates: stream)
        } catch {
            stateContinuation?.finish()
            throw error
        }
    }

    private func publishTriggerMessage() {
        guard let client = mqttClient else { return }
        guard isConnected, client.connState == .connected else {
            operationContinuation?.resume(throwing: GateKeeperError.connectionFailed)
            operationContinuation = nil
            return
        }

        let payload = String(Int(Date().timeIntervalSince1970))
        let message = CocoaMQTTMessage(topic: Topics.trigger,
                                       string: payload,
                                       qos: .qos0)
        let id = client.publish(message)
        if id < 0 {
            operationContinuation?.resume(throwing: GateKeeperError.publishFailed)
            operationContinuation = nil
        }
    }

    private func handleStatusMessage(_ message: String) {
        if message == "1" {
            logger.info("Relay activated")
            stateContinuation?.yield(.activated)
        } else if message == "0" {
            hasReceivedResponse = true
            stateContinuation?.yield(.released)
            stateContinuation?.finish()
            
            operationContinuation?.resume()
            operationContinuation = nil
            stateContinuation = nil
            mqttClient?.disconnect()
            logger.info("Relay released")
        }
    }
}

// MARK: - CocoaMQTTDelegate
extension MQTTNetworkAdapter: CocoaMQTTDelegate {

    func mqtt(_ mqtt: CocoaMQTT, didConnectAck ack: CocoaMQTTConnAck) {
        if ack == .accept {
            isConnected = true
            logger.info("MQTT connected", metadata: ["config": config.host])
            mqtt.subscribe(Topics.status, qos: .qos0)
        } else {
            operationContinuation?.resume(throwing: GateKeeperError.connectionFailed)
            operationContinuation = nil
        }
    }

    func mqtt(_ mqtt: CocoaMQTT, didReceiveMessage message: CocoaMQTTMessage, id: UInt16) {
        if message.topic == Topics.status {
            handleStatusMessage(message.string ?? "")
        }
    }

    func mqttDidDisconnect(_ mqtt: CocoaMQTT, withError err: Error?) {
        isConnected = false
        logger.warning("MQTT disconnect", error: err)
        if let err = err, !hasReceivedResponse {
            operationContinuation?.resume(throwing: err)
            operationContinuation = nil
        }
    }

    // Stubbed methods the compiler requires
    func mqtt(_ mqtt: CocoaMQTT, didPublishMessage message: CocoaMQTTMessage, id: UInt16) {
        logger.info("MQTT didPublishMessage", metadata: ["message": message.string, "id": String(id)])
    }
    
    func mqtt(_ mqtt: CocoaMQTT, didPublishAck id: UInt16) { }
    func mqtt(_ mqtt: CocoaMQTT, didSubscribeTopics success: NSDictionary, failed: [String]) {
        // Always log first
        if let successDict = success as? [String: Int16] {
            for (key, value) in successDict {
                logger.info("MQTT didSubscribeTopic",
                            metadata: ["topic": key, "status": String(value)])
            }
        } else {
            logger.error("Failed to cast NSDictionary to [String: Int16]")
        }

        // Only publish if the status topic succeeded
        guard let statusCode = success[Topics.status] as? Int16, statusCode == 0 else {
            logger.warning("Status subscription failed or missing", error: nil)
            return
        }

        publishTriggerMessage()
    }
    
    func mqtt(_ mqtt: CocoaMQTT, didUnsubscribeTopics topics: [String]) { }
    func mqttDidPing(_ mqtt: CocoaMQTT) { }
    func mqttDidReceivePong(_ mqtt: CocoaMQTT) { }
}
