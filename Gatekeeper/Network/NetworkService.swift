import Foundation
import Network

final class NetworkService {

    // MARK: - Timeout
    private var timeout: TimeoutTask?
    private let timeoutSeconds: TimeInterval = 10
    
    // MARK: - Public API
    @MainActor weak var delegate: NetworkServiceDelegate?

    // MARK: - Dependencies
    private let config : ConfigManagerProtocol
    public let logger : LoggerProtocol
    
    // MARK: - Adapter chain
    public var currentIndex = 0
    public var currentAdapter: GateNetworkInterface?
    public var isRunning = false
    private lazy var bridge = AdapterBridge(service: self)

    /// Ordered list of adapter *factories*.
    /// Add / reorder / remove entries at runtime if you wish.
    private lazy var adapterFactories: [() -> GateNetworkInterface?] = {
        [
            { [config, logger] in
                config.getESP32Config().map { SocketAdapter(cfg: $0, logger: logger) }
            },
            { [config, logger] in
                config.getMQTTConfig().map { MQTTNetworkAdapter(cfg: $0, logger: logger) }
            }
        ]
    }()

    init(config: ConfigManagerProtocol, logger: LoggerProtocol) {
        self.config = config
        self.logger = logger
    }

    // MARK: - Entry point
    func triggerGate() {
        guard !isRunning else {
            logger.warning("triggerGate ignored – already running")
            return
        }
        isRunning = true
        currentIndex = 0
        tryNext()
    }

    public func tryNext() {
        // 1. Tear down whatever is running right now
        cleanupAfterAdapter()

        // 2. Exhausted? → tell delegate, release resources, stop flag
        guard currentIndex < adapterFactories.count else {
            isRunning = false
            logger.warning( "No more adapters available, network service stopping.")
            Task { @MainActor in
                delegate?.serviceDidFail(.noAdapterAvailable)
            }
            return
        }

        // 3. Skip factories that return nil (missing config)
        guard let adapter = adapterFactories[currentIndex]() else {
            currentIndex += 1
            tryNext()
            return
        }

        // 4. Wire up and start
        adapter.delegate = bridge
        currentAdapter = adapter
        timeout?.cancel()
        timeout = TimeoutTask(after: timeoutSeconds) { [weak self] in
            Task { @MainActor in
                self?.adapterDidTimeout()
            }
        }
        adapter.start()
        logger.info("try ", metadata: ["adapter": String(describing: type(of: adapter)), "index": "\(currentIndex)"])
    }
    
    private func adapterDidTimeout() {
        logger.warning("Adapter timed-out after \(timeoutSeconds)s", error: nil, metadata: ["adapter": String(describing: type(of: currentAdapter)), "index": "\(currentIndex)"])
        currentAdapter?.stop()
        currentIndex += 1
        tryNext()
    }
    
    func cleanupAfterAdapter(_ adapter: GateNetworkInterface? = nil) {
        logger.info("stop adapter", metadata: ["adapter": String(describing: type(of: currentAdapter)), "index": "\(currentIndex)"])
        timeout?.cancel()
        timeout = nil
        adapter?.stop()
        currentAdapter?.stop()
        currentAdapter = nil
    }
}

// MARK: - Bridge (unchanged except forwarding stop flag)
private final class AdapterBridge: NetworkAdapterDelegate {
    private weak var service: NetworkService?
    init(service: NetworkService) { self.service = service }

    func adapterDidConnect(_ adapter: GateNetworkInterface) {
        Task { @MainActor [weak self] in
            guard let self, let service else { return }
            service.logger.info("adapterDidConnect ", metadata: ["adapter": String(describing: type(of: adapter))])
        }
    }

    func adapterDidFail(_ adapter: GateNetworkInterface,_ error: GateKeeperError) {
        Task { @MainActor [weak self] in
            guard let self, let service else { return }
            service.logger.warning("adapterDidFail ", error: nil, metadata: ["adapter": String(describing: type(of: adapter))])
            service.currentIndex += 1
            service.tryNext()
        }
    }

    func adapterDidReceive(_ adapter: GateNetworkInterface,_ state: RelayState) {
        Task { @MainActor [weak self] in
            guard let self, let service else { return }
            service.logger.info("adapterDidReceive ", metadata: ["adapter": String(describing: type(of: adapter)), "state": String(describing: state)])
            service.delegate?.serviceDidReceive(state)
        }
    }

    func adapterDidComplete(_ adapter: GateNetworkInterface) {
        Task { @MainActor [weak self] in
            guard let self, let service else { return }
            service.logger.info("adapterDidComplete ", metadata: ["adapter": String(describing: type(of: adapter))])
            service.cleanupAfterAdapter(adapter)
            service.isRunning = false
            service.delegate?.serviceDidComplete()
        }
    }
}

private final class TimeoutTask {
    private var task: Task<Void, Never>?
    init(after seconds: TimeInterval, onTimeout: @escaping () -> Void) {
        task = Task {
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            onTimeout()
        }
    }
    func cancel() { task?.cancel() }
}
