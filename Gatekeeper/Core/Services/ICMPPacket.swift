//
//  ICMPPacket.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 24.07.25.
//

import Foundation

struct ICMPHeader {
    var type: UInt8
    var code: UInt8
    var checksum: UInt16
    var identifier: UInt16
    var sequenceNumber: UInt16
}

extension ICMPHeader {
    static let echoRequest: UInt8 = 8
    static let echoReply: UInt8 = 0
    static let headerSize = MemoryLayout<ICMPHeader>.size
    
    init(type: UInt8, code: UInt8, identifier: UInt16, sequenceNumber: UInt16) {
        self.type = type
        self.code = code
        self.checksum = 0
        self.identifier = identifier.bigEndian
        self.sequenceNumber = sequenceNumber.bigEndian
    }
    
    mutating func calculateChecksum(data: Data? = nil) {
        self.checksum = 0
        
        var packetData = Data()
        packetData.append(Data(bytes: &self, count: ICMPHeader.headerSize))
        
        if let data = data {
            packetData.append(data)
        }
        
        self.checksum = ICMPChecksum.calculate(data: packetData).bigEndian
    }
}

struct ICMPChecksum {
    static func calculate(data: Data) -> UInt16 {
        var sum: UInt32 = 0
        let bytes = data.withUnsafeBytes { $0.bindMemory(to: UInt8.self) }
        
        var i = 0
        while i < bytes.count - 1 {
            let word = UInt16(bytes[i]) << 8 + UInt16(bytes[i + 1])
            sum += UInt32(word)
            i += 2
        }
        
        if i < bytes.count {
            sum += UInt32(bytes[i]) << 8
        }
        
        while (sum >> 16) != 0 {
            sum = (sum & 0xFFFF) + (sum >> 16)
        }
        
        return UInt16(~sum)
    }
}

struct ICMPPacket {
    let header: ICMPHeader
    let data: Data
    
    init(type: UInt8, code: UInt8, identifier: UInt16, sequenceNumber: UInt16, data: Data = Data()) {
        var header = ICMPHeader(type: type, code: code, identifier: identifier, sequenceNumber: sequenceNumber)
        header.calculateChecksum(data: data)
        
        self.header = header
        self.data = data
    }
    
    func toData() -> Data {
        var packetData = Data()
        var headerCopy = header
        packetData.append(Data(bytes: &headerCopy, count: ICMPHeader.headerSize))
        packetData.append(data)
        return packetData
    }
    
    static func fromData(_ data: Data) -> ICMPPacket? {
        guard data.count >= ICMPHeader.headerSize else { return nil }
        
        let header = data.withUnsafeBytes { bytes in
            bytes.bindMemory(to: ICMPHeader.self).first!
        }
        
        let payloadData = data.subdata(in: ICMPHeader.headerSize..<data.count)
        
        return ICMPPacket(
            type: header.type,
            code: header.code,
            identifier: UInt16(bigEndian: header.identifier),
            sequenceNumber: UInt16(bigEndian: header.sequenceNumber),
            data: payloadData
        )
    }
}