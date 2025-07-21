//
//  MQTTNetworkAdapter.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 21.07.25.
//

import Foundation
import CocoaMQTT

final class MQTTNetworkAdapter: NSObject, GateNetworkInterface {
    let method: NetworkMethod = .mqtt
    weak var delegate: NetworkAdapterDelegate?
    private let cfg: MQTTConfig
    private let logger: LoggerProtocol
    private var mqtt: CocoaMQTT?

    init(cfg: MQTTConfig, logger: LoggerProtocol) {
        self.cfg = cfg
        self.logger = logger
        super.init()
        buildClient()
    }
    
    func requireWifi() -> Bool {
        return false
    }

    private func buildClient() {
        mqtt = CocoaMQTT(clientID: "gate-\(UUID().uuidString.prefix(8))",
                         host: cfg.host,
                         port: UInt16(cfg.port))
        mqtt?.username   = cfg.username
        mqtt?.password   = cfg.password
        mqtt?.keepAlive  = 60
        mqtt?.cleanSession = true
        mqtt?.autoReconnect = false
        mqtt?.enableSSL = true
        mqtt?.delegate = self
    }

    func start() {
        if ((mqtt?.connect()) == nil) {
            logger.error("MQTT connection failed")
        }
    }

    func stop() {
        mqtt?.disconnect()
    }

    private func publishTrigger() {
        let msg = CocoaMQTTMessage(topic: "iot/house/gate/esp32/trigger",
                                   string: String(Int(Date().timeIntervalSince1970)), qos: .qos0)
        mqtt?.publish(msg)
    }
}

extension MQTTNetworkAdapter: CocoaMQTTDelegate {

    func mqtt(_ mqtt: CocoaMQTT, didConnectAck ack: CocoaMQTTConnAck) {
        guard ack == .accept else { delegate?.adapterDidFail(self, .mqttConnectionFailed); return }
        delegate?.adapterDidConnect(self)
        mqtt.subscribe("iot/house/gate/esp32/status", qos: .qos0)
    }

    func mqtt(_ mqtt: CocoaMQTT, didSubscribeTopics success: NSDictionary, failed: [String]) {
        publishTrigger()
    }

    func mqtt(_ mqtt: CocoaMQTT, didReceiveMessage message: CocoaMQTTMessage, id: UInt16) {
        guard message.topic == "iot/house/gate/esp32/status",
              let str = message.string else { return }
        switch str {
        case "1": delegate?.adapterDidReceive(self, .activated)
        case "0": delegate?.adapterDidReceive(self, .released); delegate?.adapterDidComplete(self)
        default: break
        }
    }

    func mqttDidDisconnect(_ mqtt: CocoaMQTT, withError err: Error?) {
        delegate?.adapterDidFail(self, .connectionFailed)
    }

    // Unused protocol stubs
    func mqtt(_ mqtt: CocoaMQTT, didPublishMessage message: CocoaMQTTMessage, id: UInt16) {}
    func mqtt(_ mqtt: CocoaMQTT, didPublishAck id: UInt16) {}
    func mqtt(_ mqtt: CocoaMQTT, didUnsubscribeTopics topics: [String]) {}
    func mqttDidPing(_ mqtt: CocoaMQTT) {}
    func mqttDidReceivePong(_ mqtt: CocoaMQTT) {}
}
