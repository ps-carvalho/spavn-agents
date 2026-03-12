---
name: design-patterns
description: Gang of Four patterns, enterprise patterns, functional patterns, domain-driven design, and anti-patterns
license: Apache-2.0
compatibility: opencode
---

# Design Patterns Skill

This skill provides guidance on applying proven software design patterns to solve recurring problems.

## When to Use

Use this skill when:
- Solving recurring design problems in code
- Refactoring code for better maintainability
- Reviewing code architecture and structure
- Implementing domain-driven design
- Identifying and eliminating anti-patterns

## Creational Patterns

### Singleton
- **Intent**: Ensure a class has only one instance with global access
- **Use when**: Database connections, configuration, logging
- **Avoid when**: It creates hidden global state or hinders testing
```typescript
class Database {
  private static instance: Database;
  private constructor(private connection: Connection) {}

  static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database(createConnection());
    }
    return Database.instance;
  }
}
```

### Factory Method
- **Intent**: Define an interface for creating objects, let subclasses decide which class
- **Use when**: Object creation logic varies by context
- **Example**: `createNotifier("email")` returns EmailNotifier, `createNotifier("sms")` returns SMSNotifier

### Abstract Factory
- **Intent**: Create families of related objects without specifying concrete classes
- **Use when**: Multiple related objects need consistent creation (e.g., UI themes)

### Builder
- **Intent**: Construct complex objects step by step
- **Use when**: Object has many optional parameters or complex construction
```typescript
const query = new QueryBuilder()
  .select("name", "email")
  .from("users")
  .where("active", true)
  .orderBy("name")
  .limit(10)
  .build();
```

### Prototype
- **Intent**: Create new objects by cloning existing ones
- **Use when**: Object creation is expensive, need copies with slight variations

## Structural Patterns

### Adapter
- **Intent**: Convert one interface to another that clients expect
- **Use when**: Integrating third-party libraries, legacy code migration
```typescript
// Adapt old payment API to new interface
class StripeAdapter implements PaymentGateway {
  constructor(private stripe: StripeSDK) {}

  async charge(amount: number, currency: string): Promise<PaymentResult> {
    const result = await this.stripe.paymentIntents.create({
      amount: amount * 100, // Stripe uses cents
      currency,
    });
    return { id: result.id, status: result.status };
  }
}
```

### Decorator
- **Intent**: Attach additional behavior dynamically without altering the class
- **Use when**: Adding logging, caching, validation to existing objects
- **Common in**: Middleware chains, TypeScript decorators, Python decorators

### Facade
- **Intent**: Provide a simplified interface to a complex subsystem
- **Use when**: Hiding complexity behind a clean API
- **Example**: A `PaymentService` that orchestrates cart, pricing, gateway, and receipt subsystems

### Proxy
- **Intent**: Control access to an object (lazy loading, access control, logging)
- **Use when**: Adding cross-cutting concerns transparently

### Composite
- **Intent**: Treat individual objects and compositions uniformly
- **Use when**: Tree structures (file systems, UI components, org charts)

## Behavioral Patterns

### Observer
- **Intent**: Define a one-to-many dependency — when one changes, dependents are notified
- **Use when**: Event systems, reactive state, pub/sub
```typescript
class EventEmitter<T extends Record<string, unknown[]>> {
  private listeners = new Map<keyof T, Set<Function>>();

  on<K extends keyof T>(event: K, handler: (...args: T[K]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof T>(event: K, ...args: T[K]) {
    this.listeners.get(event)?.forEach((handler) => handler(...args));
  }
}
```

### Strategy
- **Intent**: Define a family of algorithms, make them interchangeable
- **Use when**: Multiple ways to accomplish something (sorting, validation, pricing)
```typescript
interface CompressionStrategy {
  compress(data: Buffer): Buffer;
}

class FileProcessor {
  constructor(private strategy: CompressionStrategy) {}
  process(file: Buffer): Buffer {
    return this.strategy.compress(file);
  }
}
```

### Command
- **Intent**: Encapsulate a request as an object for queuing, logging, undo
- **Use when**: Undo/redo, task queues, macro recording

### State
- **Intent**: Object behavior changes based on internal state
- **Use when**: Complex state machines (order status, UI modes, workflows)

### Template Method
- **Intent**: Define skeleton of algorithm, let subclasses fill in steps
- **Use when**: Common workflow with varying steps (report generation, ETL)

### Chain of Responsibility
- **Intent**: Pass request along a chain of handlers until one processes it
- **Use when**: Middleware pipelines, event bubbling, validation chains

### Iterator
- **Intent**: Access elements sequentially without exposing representation
- **Use when**: Custom collections, lazy evaluation, streaming data

## Enterprise Patterns

### Repository
- **Intent**: Mediate between domain and data mapping layers
- **Use when**: Abstracting data access from business logic
- **Benefit**: Testable — swap real DB for in-memory implementation

### Unit of Work
- **Intent**: Track changes and coordinate writing to DB as a single transaction
- **Use when**: Complex operations that must succeed or fail together

### Service Layer
- **Intent**: Define application boundary with a layer of services
- **Use when**: Orchestrating business operations across multiple domain objects

### Domain Model
- **Intent**: Object model of the domain that incorporates behavior and data
- **Use when**: Complex business logic that belongs in domain objects, not services

### Data Mapper
- **Intent**: Move data between objects and database while keeping them independent
- **Use when**: Domain model should be free of persistence concerns

### Data Transfer Object (DTO)
- **Intent**: Carry data between processes to reduce number of method calls
- **Use when**: API request/response shapes differ from domain models

## Functional Patterns

### Pipe / Compose
```typescript
// Function composition — chain transformations
const pipe = <T>(...fns: ((arg: T) => T)[]) =>
  (value: T) => fns.reduce((acc, fn) => fn(acc), value);

const processUser = pipe(
  validateEmail,
  normalizeUsername,
  hashPassword,
  createUserRecord,
);
```

### Immutability
- Prefer `const`, `readonly`, `Object.freeze()`
- Return new objects instead of mutating — `{ ...obj, key: newValue }`
- Use immutable data structures for shared state

### Currying & Partial Application
- Transform multi-arg function into sequence of single-arg functions
- Create specialized functions from general ones

### Monads (Optional/Result)
- Wrap values in context (Maybe/Option for nullability, Result/Either for errors)
- Chain operations safely without null checks at each step
```typescript
// Result type for error handling without exceptions
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

## Domain-Driven Design (DDD)

### Core Concepts
| Concept | Description |
|---------|-------------|
| Bounded Context | Explicit boundary with a specific domain model |
| Aggregate | Cluster of objects treated as a single unit for data changes |
| Entity | Object with identity that persists over time |
| Value Object | Immutable object defined by its attributes, no identity |
| Domain Event | Something meaningful that happened in the domain |
| Repository | Interface for accessing aggregates |
| Domain Service | Logic that doesn't belong to any single entity |

### Strategic Design
- Identify bounded contexts by business capabilities
- Define context maps — relationships between contexts
- Use ubiquitous language — domain experts and developers share vocabulary
- Anti-corruption layer between contexts with different models

### Tactical Design
- Aggregates enforce invariants — validate rules at aggregate root
- Entities have identity — compare by ID, not attributes
- Value objects are immutable — compare by value, not reference
- Domain events for cross-aggregate communication

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| God Object | One class does everything | Split into focused classes (SRP) |
| Spaghetti Code | Tangled dependencies, no structure | Layer architecture, extract modules |
| Golden Hammer | Using one solution for everything | Choose tools based on problem |
| Premature Optimization | Optimizing before profiling | Measure first, optimize bottlenecks |
| Shotgun Surgery | One change requires editing many files | Consolidate related logic |
| Feature Envy | Method uses another class's data more than its own | Move method to the class it envies |
| Primitive Obsession | Using primitives instead of domain types | Create value objects (Email, Money) |
| Leaky Abstraction | Internal details exposed through interface | Design clean, minimal interfaces |

## Language-Specific Idioms

### PHP / Laravel
- **Facades** — Static-like access to services resolved from the container (`Cache::get()`, `Log::info()`)
- **Service Container** — Powerful DI container with auto-resolution, contextual binding
- **Service Providers** — Bootstrap and register application services (deferred loading)
- **Contracts** — Interfaces for framework services (swap implementations easily)
- **Pipelines** — Chain of responsibility pattern (`Pipeline::send($data)->through($pipes)`)
- **Observers** — Model lifecycle hooks (creating, updating, deleting events)
- **Policies** — Authorization logic encapsulated per model
- **Actions / Services** — Single-responsibility classes for business logic
- **Enums** — PHP 8.1+ backed enums for type-safe constants
- **Value Objects** — Use readonly classes (PHP 8.2+) or custom casts for domain types

### TypeScript/JavaScript
- Use interfaces for contracts, classes for implementation
- Prefer composition with mixins or higher-order functions
- Use discriminated unions for type-safe state variants

### Python
- Protocols and ABCs for interfaces
- Dataclasses and `__slots__` for value objects
- Context managers (`with`) for resource management
- Descriptors and metaclasses for advanced patterns

### Go
- Interfaces are implicit — define behavior, not structure
- Embed structs for composition (no inheritance)
- Accept interfaces, return structs
- Table-driven tests for pattern verification

### Rust
- Traits for polymorphism, generics for compile-time dispatch
- Enums with data for state machines (sum types)
- `Result<T, E>` for error handling (no exceptions)
- Ownership system enforces resource management patterns
