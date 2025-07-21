# CLAUDE.md - Senior Developer Coding Standards

## Core Principles

You are working with a senior developer with 20+ years of experience who demands enterprise-grade code quality. Apply these standards rigorously to ALL code generation.

## Architecture & Design Standards

### SOLID Principles (Non-Negotiable)
- **Single Responsibility**: Each class and method does ONE thing only
- **Open/Closed**: Open for extension, closed for modification
- **Liskov Substitution**: Derived classes must be substitutable for base classes
- **Interface Segregation**: Many specific interfaces better than one general-purpose interface
- **Dependency Inversion**: Depend on abstractions, not concretions

### Design Patterns
- **Protocol-Oriented Programming**: Prefer protocols over inheritance
- **Dependency Injection**: Constructor injection, avoid singletons
- **Repository Pattern**: Abstract data access behind protocols
- **Clean Architecture**: Separate business logic from UI and infrastructure

## Code Quality Standards

### Method & Class Design
- **Single Responsibility**: Each method does ONE thing only
- **Method Length**: Maximum 20 lines per method, prefer 5-10 lines
- **Class Size**: Maximum 200 lines per class, prefer smaller focused classes
- **Cyclomatic Complexity**: Maximum complexity of 5 per method
- **Pure Functions**: Prefer functions with no side effects where possible

### Type Safety & Declarations
- **Explicit Type Declarations**: Always declare types explicitly, avoid type inference
- **No Force Unwrapping**: Use guard statements, optional binding, nil coalescing
- **Immutability**: Use `let` over `var`, prefer value types over reference types
- **Comprehensive Error Types**: Create specific error enums for each domain

### Threading & Concurrency
- **Main Thread Protection**: NEVER block the main thread with networking or heavy operations
- **Structured Concurrency**: Use async/await exclusively, avoid completion handlers
- **Actor Isolation**: Use `@MainActor` for UI updates, background actors for business logic
- **Thread-Safe State**: Use `@Published` properties with proper MainActor isolation

## iOS/SwiftUI Specific Standards

### SwiftUI Best Practices
- **MVVM Pattern**: Clear separation between View, ViewModel, and Business Logic
- **Property Wrappers**: Use `@StateObject`, `@ObservedObject`, `@EnvironmentObject` appropriately
- **ViewModels**: Business logic belongs in ViewModels, not in Views
- **Accessibility**: All UI elements must have proper accessibility labels

### Networking Standards
- **Protocol Abstraction**: Abstract all networking behind protocols for testability
- **Background Operations**: All networking operations must run on background queues
- **Proper Error Handling**: Use `Result<Success, Failure>` for operations that can fail
- **Timeout Management**: Implement appropriate timeouts for all network operations

## Security & Storage
- **Input Validation**: Validate all inputs at boundary layers
- **Secure Storage**: Use Keychain for sensitive credentials
- **Local Network Security**: Understand security implications of different protocols

## Code Organization & Quality
- **Naming Conventions**: Clear, descriptive names that explain intent
- **No Magic Numbers**: Centralized configuration and constants
- **Documentation**: Swift DocC comments for public APIs
- **File Structure**: Group by feature, not by type

## Testing Standards
- **Critical Path Testing**: Test core business logic and state transitions
- **Mock External Dependencies**: Mock all network and external services
- **Error Case Testing**: Test timeout scenarios and failure cases

## Code Review Checklist

Before providing any code, ensure:
- [ ] SOLID principles are followed
- [ ] No force unwrapping or unsafe operations
- [ ] Proper error handling with specific error types
- [ ] Critical business logic is testable
- [ ] No retain cycles or memory leaks
- [ ] Thread-safe operations where needed
- [ ] Proper separation of concerns
- [ ] Clear and descriptive naming with explicit types
- [ ] No magic numbers or hardcoded strings
- [ ] Essential documentation for public APIs

## Rejection Criteria

Automatically reject and refactor code that contains:
- Force unwrapping (`!`) without justification
- Massive classes/methods (>200 lines/20 lines respectively)
- Mixed concerns (UI logic in models, business logic in views)
- Hardcoded strings or magic numbers
- Incomplete error handling
- Blocking operations on main thread
- Retain cycles
- Poor naming (single letters, abbreviations, unclear purpose)

## Example: Clean Architecture Pattern

```swift
// ❌ BAD - Violates multiple principles
class GateController {
    var mqttClient: MQTTClient!
    
    func openGate() {
        mqttClient.publish("trigger", "open")
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
            self.isLoading = false
        }
    }
}

// ✅ GOOD - Follows all standards
protocol NetworkServiceProtocol {
    func triggerAction() async throws -> ActionResult
}

protocol NetworkServiceDelegate: AnyObject {
    func serviceDidReceiveResponse(_ response: ServiceResponse)
}

@MainActor
final class BusinessController: ObservableObject {
    @Published private(set) var state: ControllerState = .ready
    
    private let networkService: NetworkServiceProtocol
    private let logger: LoggerProtocol
    
    init(networkService: NetworkServiceProtocol, logger: LoggerProtocol) {
        self.networkService = networkService
        self.logger = logger
    }
    
    func performAction() async {
        state = .processing
        
        do {
            let result: ActionResult = try await networkService.triggerAction()
            state = .completed
            logger.info("Action completed successfully")
        } catch {
            state = .error
            logger.error("Action failed", error: error)
        }
    }
}
```

## Remember
- "It just works" is not acceptable
- Code must be maintainable, testable, secure, and performant
- Clean code is a reflection of professional standards
- Every line should have clear intent and purpose