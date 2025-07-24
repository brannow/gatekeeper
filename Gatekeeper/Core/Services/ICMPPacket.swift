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
}

extension ICMPHeader {
    static let echoRequest: UInt8 = 8
    static let echoReply: UInt8 = 0
    static let headerSize = MemoryLayout<ICMPHeader>.size
    
    init(type: UInt8, code: UInt8, identifier: UInt16) {
        self.type = type
        self.code = code
        self.checksum = 0
        self.identifier = identifier.bigEndian
    }
    
    mutating func calculateChecksum(data: Data? = nil) {
        self.checksum = 0
        
        var packetData = Data()
        withUnsafeBytes(of: self) { bytes in
            packetData.append(contentsOf: bytes)
        }
        
        if let data = data {
            packetData.append(data)
        }
        
        self.checksum = ICMPChecksum.calculate(data: packetData).bigEndian
    }
}

struct ICMPChecksum {
    /// Calculate Internet checksum (RFC 1071) for ICMP packets
    /// Uses proper network byte order handling and overflow-safe arithmetic
    static func calculate(data: Data) -> UInt16 {
        guard !data.isEmpty else { return 0xFFFF }
        
        var sum: UInt32 = 0
        let count = data.count
        
        // Process data as 16-bit words in network byte order
        data.withUnsafeBytes { bytes in
            let uint8Pointer = bytes.bindMemory(to: UInt8.self)
            
            var i = 0
            // Process pairs of bytes as 16-bit words
            while i < count - 1 {
                // Combine two bytes in network byte order (big-endian)
                let word = (UInt16(uint8Pointer[i]) << 8) | UInt16(uint8Pointer[i + 1])
                sum = sum &+ UInt32(word) // Use overflow-safe addition
                i += 2
            }
            
            // Handle odd byte if present
            if i < count {
                // Pad with zero and treat as network byte order
                let word = UInt16(uint8Pointer[i]) << 8
                sum = sum &+ UInt32(word)
            }
        }
        
        // Add carry bits until no more carries (RFC 1071)
        while (sum >> 16) != 0 {
            sum = (sum & 0xFFFF) &+ (sum >> 16)
        }
        
        // At this point, sum should be 16 bits max
        // Convert to UInt16 first, then complement
        let sum16 = UInt16(sum & 0xFFFF)
        return ~sum16
    }
    
    /// Verify checksum is correct (should return 0 when calculated over data including checksum)
    static func verify(data: Data) -> Bool {
        return calculate(data: data) == 0
    }
}

struct ICMPPacket {
    let header: ICMPHeader
    let data: Data
    
    /// Create new ICMP packet for sending (calculates checksum)
    init(type: UInt8, code: UInt8, identifier: UInt16, data: Data = Data()) {
        var header = ICMPHeader(type: type, code: code, identifier: identifier)
        header.calculateChecksum(data: data)
        
        self.header = header
        self.data = data
    }
    
    /// Create ICMP packet from parsed data (preserves header as-is)
    private init(header: ICMPHeader, data: Data) {
        self.header = header
        self.data = data
    }
    
    func toData() -> Data {
        var packetData = Data()
        withUnsafeBytes(of: header) { bytes in
            packetData.append(contentsOf: bytes)
        }
        packetData.append(data)
        return packetData
    }
    
    static func fromData(_ data: Data) -> ICMPPacket? {
        guard data.count >= ICMPHeader.headerSize else { return nil }
        
        // Safe aligned load of header
        let header = data.withUnsafeBytes { ptr -> ICMPHeader in
            ptr.load(as: ICMPHeader.self)
        }
        
        let payloadData = data.dropFirst(ICMPHeader.headerSize)
        
        // This is a parser - keep header exactly as received, don't recalculate checksum
        return ICMPPacket(
            header: header,
            data: Data(payloadData)
        )
    }
}
