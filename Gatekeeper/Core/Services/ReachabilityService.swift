//
//  ReachabilityService.swift
//  Gatekeeper
//
//  Created by Benjamin Rannow on 24.07.25.
//

import Foundation
import Network

final class ReachabilityService: ReachabilityServiceProtocol {
    @MainActor weak var delegate: ReachabilityServiceDelegate?
    
    private let logger: LoggerProtocol
    private let identifier: UInt16
    private let timeout: TimeInterval = 3.0
    private let pathMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "reachability.monitor")
    
    init(logger: LoggerProtocol) {
        self.logger = logger
        self.identifier = UInt16.random(in: 1...UInt16.max)
        
        pathMonitor.pathUpdateHandler = { [weak self] path in
            self?.logger.info("Network path status: \(path.status)")
        }
        pathMonitor.start(queue: monitorQueue)
    }
    
    func checkTarget(_ target: PingTarget) {
        checkTargets([target])
    }
    
    func checkTargets(_ targets: [PingTarget]) {
        for target in targets {
            Task { [weak self] in
                await self?.startAsyncPing(target)
            }
        }
    }
    
    func cancelAllChecks() {
        // Task cancellation is handled automatically when the async context is cancelled
    }
    
    private func startAsyncPing(_ target: PingTarget) async {
        logger.info("Starting ping to \(target.host)")
        
        guard let ipAddress = await resolveHostname(target.host) else {
            logger.warning("Failed to resolve hostname: \(target.host)")
            await notifyDelegate(target: target, isReachable: false)
            return
        }
        
        await performAsyncICMPPing(to: ipAddress, target: target)
    }
    
    private func performAsyncICMPPing(to ipAddress: String, target: PingTarget) async {
        let socketFD = socket(AF_INET, SOCK_DGRAM, IPPROTO_ICMP)
        guard socketFD != -1 else {
            logger.error("Failed to create ICMP socket", error: nil)
            await notifyDelegate(target: target, isReachable: false)
            return
        }
        
        defer {
            close(socketFD)
        }
        
        var timeoutVal = timeval(tv_sec: Int(timeout), tv_usec: 0)
        setsockopt(socketFD, SOL_SOCKET, SO_RCVTIMEO, &timeoutVal, socklen_t(MemoryLayout<timeval>.size))
        
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        inet_pton(AF_INET, ipAddress, &addr.sin_addr)
        
        let packet = ICMPPacket(
            type: ICMPHeader.echoRequest,
            code: 0,
            identifier: identifier,
            data: Data("Gatekeeper".utf8)
        )
        
        let packetData = packet.toData()
        let sent = withUnsafeBytes(of: &addr) { addrBytes in
            packetData.withUnsafeBytes { packetBytes in
                sendto(
                    socketFD,
                    packetBytes.baseAddress,
                    packetData.count,
                    0,
                    addrBytes.baseAddress?.assumingMemoryBound(to: sockaddr.self),
                    socklen_t(MemoryLayout<sockaddr_in>.size)
                )
            }
        }
        
        guard sent == packetData.count else {
            logger.warning("Failed to send ICMP packet to \(target.host)")
            await notifyDelegate(target: target, isReachable: false)
            return
        }
        
        var buffer = [UInt8](repeating: 0, count: 1024)
        var fromAddr = sockaddr_in()
        var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)
        
        let received = withUnsafeMutableBytes(of: &fromAddr) { fromAddrBytes in
            recvfrom(
                socketFD,
                &buffer,
                buffer.count,
                0,
                fromAddrBytes.baseAddress?.assumingMemoryBound(to: sockaddr.self),
                &fromLen
            )
        }
        
        guard received > 0 else {
            logger.info("ICMP timeout for \(target.host)")
            await notifyDelegate(target: target, isReachable: false)
            return
        }
        
        let responseData = Data(buffer.prefix(received))
        
        if let replyPacket = parseICMPReply(responseData),
           replyPacket.header.type == ICMPHeader.echoReply,
           UInt16(bigEndian: replyPacket.header.identifier) == identifier {
            logger.info("ICMP ping successful for \(target.host)")
            await notifyDelegate(target: target, isReachable: true)
        } else {
            logger.info("Invalid ICMP reply from \(target.host)")
            await notifyDelegate(target: target, isReachable: false)
        }
    }
    
    private func parseICMPReply(_ data: Data) -> ICMPPacket? {
        guard data.count >= 20 + ICMPHeader.headerSize else { return nil }
        
        let ipHeaderLength = Int(data[0] & 0x0F) * 4
        let icmpData = data.subdata(in: ipHeaderLength..<data.count)
        
        return ICMPPacket.fromData(icmpData)
    }
    
    private func resolveHostname(_ hostname: String) async -> String? {
        return await withCheckedContinuation { (continuation: CheckedContinuation<String?, Never>) in
            var hints = addrinfo()
            hints.ai_family = AF_INET
            hints.ai_socktype = SOCK_DGRAM
            
            var result: UnsafeMutablePointer<addrinfo>?
            let status = getaddrinfo(hostname, nil, &hints, &result)
            
            defer {
                if let result = result {
                    freeaddrinfo(result)
                }
            }
            
            guard status == 0, let info = result else {
                continuation.resume(returning: nil)
                return
            }
            
            let addr = UnsafeRawPointer(info.pointee.ai_addr).assumingMemoryBound(to: sockaddr_in.self)
            var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
            var sinAddr = addr.pointee.sin_addr
            
            guard inet_ntop(AF_INET, &sinAddr, &buffer, socklen_t(INET_ADDRSTRLEN)) != nil else {
                continuation.resume(returning: nil)
                return
            }
            
            let ipString = String(cString: buffer)
            continuation.resume(returning: ipString)
        }
    }
    
    private func notifyDelegate(target: PingTarget, isReachable: Bool) async {
        await MainActor.run { [weak self] in
            guard let self = self else { return }
            self.delegate?.reachabilityService(self, target: target, isReachable: isReachable)
        }
    }
}
