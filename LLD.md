# Low-Level Design (LLD) Guide for AI Code-Generation Agents

This guide defines how an AI code-generation agent must approach low-level design problems. Every section contains binding constraints. When generating code for any LLD task, follow this document top-to-bottom as a checklist.

---

## Table of Contents

1. [Design Process Protocol](#1-design-process-protocol)
2. [OOP Fundamentals](#2-oop-fundamentals)
3. [SOLID Principles](#3-solid-principles)
4. [Class Relationships](#4-class-relationships)
5. [Design Patterns](#5-design-patterns)
6. [Concurrency and Thread Safety](#6-concurrency-and-thread-safety)
7. [LLD Problem-Solving Framework](#7-lld-problem-solving-framework)
8. [Common LLD Problem Archetypes](#8-common-lld-problem-archetypes)
9. [Code Generation Constraints](#9-code-generation-constraints)
10. [Anti-Patterns and Red Flags](#10-anti-patterns-and-red-flags)
11. [Quality Checklist](#11-quality-checklist)

---

## 1. Design Process Protocol

**Never write code first.** Every LLD task must pass through these phases in order. Skipping a phase produces brittle, unmaintainable output.

### Phase 1: Requirement Extraction

Before designing anything, extract and categorize every requirement from the task description.

| Category | What to Extract | Example |
|----------|----------------|---------|
| **Functional** | What the system must do | "Users can borrow and return books" |
| **Non-Functional** | Performance, scale, safety constraints | "Handle concurrent access", "O(1) lookup" |
| **Entities** | Nouns that represent real-world objects or concepts | User, Book, Order, Payment |
| **Actions** | Verbs that represent operations on entities | borrow, return, search, checkout |
| **Constraints** | Limits, rules, invariants the system must enforce | "Max 5 books per member", "Capacity limit" |
| **Edge Cases** | Boundary conditions and failure modes | Full capacity, duplicate entries, invalid input |

**Rules:**
- If a requirement is ambiguous, state your interpretation explicitly before proceeding.
- If a requirement is missing (e.g., no mention of error handling), assume it is required and document the assumption.
- Never invent requirements that are not stated or logically implied.

### Phase 2: Entity Identification

From the extracted requirements, identify:

1. **Core entities** — Objects that have identity, state, and behavior (e.g., `User`, `Vehicle`, `Order`).
2. **Value objects** — Objects defined by their attributes, not identity (e.g., `Address`, `Money`, `DateRange`).
3. **Enumerations** — Fixed sets of named constants (e.g., `VehicleType`, `OrderStatus`, `Direction`).
4. **Interfaces/Abstractions** — Contracts that define behavior without implementation (e.g., `PaymentMethod`, `Subscriber`).
5. **Services/Managers** — Orchestrators that coordinate entities but hold no domain state of their own (e.g., `ElevatorController`, `LibraryManager`).

### Phase 3: Relationship Mapping

For every pair of related entities, determine:
- **What type of relationship** exists (see [Section 4](#4-class-relationships)).
- **What is the cardinality** (one-to-one, one-to-many, many-to-many).
- **Who owns whom** (which side controls the lifecycle).

### Phase 4: Pattern Selection

Identify which design patterns (see [Section 5](#5-design-patterns)) solve specific structural or behavioral problems in the design. Every pattern used must be justified by a concrete requirement — never apply a pattern "for good practice."

### Phase 5: Implementation

Only now write code. Implementation must satisfy:
- All functional requirements are covered.
- All constraints are enforced in code (not just documented).
- All edge cases have explicit handling.
- The code is testable without modification.

---

## 2. OOP Fundamentals

These are not suggestions. Every class the agent produces must satisfy these rules.

### 2.1 Classes and Objects

- Every class must have a **single, clear reason to exist**. If you cannot state it in one sentence, the class is doing too much.
- Constructors must establish a **valid object state**. An object must never exist in a half-initialized, unusable condition.
- Prefer **immutability** by default. Only make fields mutable when mutation is an explicit requirement.

### 2.2 Encapsulation

- **All internal state must be private.** No public fields. Ever.
- Expose state only through methods that enforce invariants.
- Getters are acceptable. Setters require justification — ask: "Does external code genuinely need to change this field, or should the object manage its own state?"

**Violation example (what NOT to generate):**
```
class Account:
    balance = 0          # Public field, no protection
    overdraft_limit = -500  # Public field, anyone can change the rules
```

**Correct approach:**
```
class Account:
    _balance: private
    _overdraft_limit: private

    method withdraw(amount):
        if _balance - amount < _overdraft_limit:
            raise InsufficientFunds
        _balance -= amount
```

### 2.3 Abstraction

- Hide **how** something works. Expose **what** it does.
- Method names must describe the business operation, not the implementation mechanism.
  - Bad: `updateHashMapAndRebalanceTree()`
  - Good: `addProduct(product)`
- Internal data structures are implementation details. Never expose them in the public interface.

### 2.4 Inheritance

- Use inheritance **only** when there is a genuine "is-a" relationship.
- Prefer composition over inheritance in every case where both are viable.
- Never use inheritance solely to reuse code. Extract the shared logic into a separate class and compose.
- Limit inheritance depth to **2 levels maximum** (base → concrete). If you need a third level, redesign.

**Decision rule:**
```
Is B genuinely a specialized version of A?
  YES → B can extend A (if Liskov Substitution holds, see Section 3)
  NO  → B should contain A as a field (composition)
```

### 2.5 Polymorphism

- Use polymorphism to **eliminate conditional branching** on type.
- If you see `if type == X ... else if type == Y ...`, that is a signal to introduce polymorphism.
- The caller should never need to know the concrete type of the object it is working with.

**Violation example (what NOT to generate):**
```
method calculateArea(shape):
    if shape.type == "circle":
        return pi * shape.radius^2
    else if shape.type == "rectangle":
        return shape.width * shape.height
```

**Correct approach:**
```
interface Shape:
    method area() -> number

class Circle implements Shape:
    method area() -> number:
        return pi * radius^2

class Rectangle implements Shape:
    method area() -> number:
        return width * height
```

### 2.6 Enumerations

- Use enums for any fixed, known set of values (statuses, types, directions, categories).
- Never use raw strings or integers to represent a fixed set. Enums prevent typos, enable auto-completion, and make invalid states unrepresentable.
- Enums may carry associated data or behavior when appropriate.

---

## 3. SOLID Principles

Every class, method, and module the agent generates must satisfy all five principles. These are non-negotiable constraints, not aspirational goals.

### 3.1 Single Responsibility Principle (SRP)

> A class should have one, and only one, reason to change.

**Enforcement rules:**
- If a class has methods that serve different stakeholders (e.g., UI formatting and database persistence), split it.
- If a class name contains "And" or "Manager" with more than one domain concept, split it.
- A method should do one thing. If a method has sections separated by blank lines or comments ("// Step 1", "// Step 2"), each section is a candidate for its own method.

**Test:** Can you describe the class's responsibility without using the word "and"? If not, it violates SRP.

### 3.2 Open/Closed Principle (OCP)

> Software entities should be open for extension, closed for modification.

**Enforcement rules:**
- New behavior must be addable by creating new classes/implementations, not by modifying existing ones.
- Use interfaces and abstract classes to define extension points.
- Switch statements or if-else chains on type are a violation. Use polymorphism instead.

**Test:** Can you add a new variant (new vehicle type, new payment method, new notification channel) without touching existing code? If not, it violates OCP.

### 3.3 Liskov Substitution Principle (LSP)

> Subtypes must be substitutable for their base types without altering program correctness.

**Enforcement rules:**
- A subclass must honor every contract (preconditions, postconditions, invariants) of its parent.
- A subclass must never throw an exception that the parent does not declare.
- A subclass must never refuse to perform an operation that the parent supports.
- If a subclass needs to override a method to do nothing or throw "not supported," that is an LSP violation. Redesign the hierarchy.

**Classic violation:** A `Square` class extending `Rectangle` and breaking when `setWidth()` and `setHeight()` are called independently. Do not generate this pattern.

**Test:** Can every instance of the subclass be passed to code expecting the base type without surprise behavior? If not, it violates LSP.

### 3.4 Interface Segregation Principle (ISP)

> No client should be forced to depend on methods it does not use.

**Enforcement rules:**
- Prefer small, focused interfaces over large, general-purpose ones.
- If an implementing class has to leave methods empty or throw "not implemented," the interface is too broad. Split it.
- Group methods by which clients actually use them, not by which entity they describe.

**Test:** Does every implementer of this interface use every method in it? If not, split the interface.

### 3.5 Dependency Inversion Principle (DIP)

> High-level modules should not depend on low-level modules. Both should depend on abstractions.

**Enforcement rules:**
- Classes should depend on interfaces or abstract classes, not on concrete implementations.
- Constructors should receive their dependencies as parameters (dependency injection), not instantiate them internally.
- Never import a concrete class in a high-level module when an interface exists.

**Test:** Can you swap out the concrete dependency (e.g., replace in-memory storage with a database, or replace a real payment processor with a mock) without modifying the high-level class? If not, it violates DIP.

---

## 4. Class Relationships

Choose the correct relationship for every pair of connected entities. The wrong choice creates coupling that makes the system rigid and fragile.

### 4.1 Association

**What it is:** Object A knows about Object B. Neither owns the other. Both can exist independently.

**When to use:** Two entities interact but have independent lifecycles.

**Example:** A `Driver` is associated with a `Car` they are currently driving. The driver can exist without the car and vice versa.

**Implementation:** One class holds a reference to another, typically set via a method or constructor parameter.

### 4.2 Aggregation (Weak "Has-A")

**What it is:** Object A contains Object B, but B can exist without A. A does not control B's lifecycle.

**When to use:** A collection-member relationship where members have independent existence.

**Example:** A `Department` aggregates `Employee` objects. If the department is dissolved, the employees still exist.

**Implementation:** A class holds a collection of references to other objects, but does not create or destroy them.

### 4.3 Composition (Strong "Has-A")

**What it is:** Object A contains Object B, and B cannot exist without A. A controls B's lifecycle.

**When to use:** A whole-part relationship where parts are meaningless outside the whole.

**Example:** A `House` is composed of `Room` objects. If the house is destroyed, the rooms cease to exist.

**Implementation:** A class creates its parts internally (typically in the constructor) and destroys them when it is destroyed.

### 4.4 Dependency (Uses-A)

**What it is:** Object A uses Object B temporarily, but does not hold a persistent reference.

**When to use:** One class calls a method on another class, typically received as a parameter.

**Example:** An `OrderProcessor` depends on a `PaymentGateway` to process a payment, but does not store it as a field.

**Implementation:** A class receives another class as a method parameter, uses it within the method scope, and does not retain a reference.

### Relationship Decision Table

| Question | If Yes → |
|----------|----------|
| Does A create and destroy B? | **Composition** |
| Does A contain B, but B exists independently? | **Aggregation** |
| Does A know about B persistently (field/property)? | **Association** |
| Does A use B only temporarily (method parameter)? | **Dependency** |

---

## 5. Design Patterns

Use patterns to solve specific, recurring structural or behavioral problems. Never apply a pattern without a concrete justification tied to a requirement.

### 5.1 Creational Patterns

These control how and when objects are created.

#### Singleton

**Problem it solves:** Exactly one instance of a class must exist system-wide, with a global access point.

**When to use:**
- Central registries, configuration managers, connection pools.
- System-wide coordinators (e.g., a single `ParkingLotManager`, `ElevatorController`).

**When NOT to use:**
- Just because a class "feels" like it should be unique. If the requirement does not explicitly demand a single instance, do not use Singleton.
- When testability matters more — Singletons make unit testing harder. Prefer dependency injection if possible.

**Implementation requirements:**
- Thread-safe initialization (lazy or eager, depending on context).
- Private constructor.
- Static access method that returns the single instance.

#### Factory Method

**Problem it solves:** The exact class to instantiate is not known until runtime, or the creation logic is complex enough to warrant separation from the consumer.

**When to use:**
- Creating objects based on a type parameter (e.g., create a `Vehicle` based on `VehicleType`).
- When construction requires multiple steps or conditional logic.

**When NOT to use:**
- When the concrete class is always known at compile time.
- When a simple constructor call suffices.

#### Abstract Factory

**Problem it solves:** Creating families of related objects that must be used together, without specifying concrete classes.

**When to use:**
- Cross-platform UI components (button + checkbox + dialog for a specific OS).
- Related object families where mixing types would be invalid.

**When NOT to use:**
- When there is only one family of objects.
- When objects in the "family" are not actually related.

#### Builder

**Problem it solves:** Constructing complex objects step by step, especially when the object has many optional parameters.

**When to use:**
- Objects with more than 3-4 constructor parameters.
- Objects where some configurations are optional.
- Objects that require validation before construction.

**When NOT to use:**
- Simple objects with 1-3 required fields.
- When a constructor or factory method is sufficient.

#### Prototype

**Problem it solves:** Creating new objects by cloning existing ones, avoiding costly initialization.

**When to use:**
- When object creation is expensive (e.g., deep database queries, complex computation).
- When you need many similar objects with slight variations.

**When NOT to use:**
- When objects are simple to construct.
- When objects contain circular references (cloning becomes complex).

### 5.2 Structural Patterns

These define how classes and objects are composed into larger structures.

#### Adapter

**Problem it solves:** Making incompatible interfaces work together.

**When to use:**
- Integrating third-party libraries or legacy code with a different interface.
- Wrapping an existing class to match an expected interface.

#### Composite

**Problem it solves:** Treating individual objects and groups of objects uniformly.

**When to use:**
- Tree structures (file systems, organizational hierarchies, UI component trees).
- When clients should treat single items and collections identically.

#### Decorator

**Problem it solves:** Adding behavior to individual objects dynamically, without affecting other objects of the same class.

**When to use:**
- When you need to add responsibilities to objects at runtime.
- When subclassing would create an explosion of classes for every combination.

**When NOT to use:**
- When the additional behavior is always needed (just put it in the class).
- When there is only one variant (no combination explosion).

#### Facade

**Problem it solves:** Providing a simplified interface to a complex subsystem.

**When to use:**
- When a subsystem has many classes and the client only needs a subset of functionality.
- When you want to decouple clients from subsystem internals.

#### Proxy

**Problem it solves:** Controlling access to an object.

**When to use:**
- Lazy initialization (virtual proxy) — defer expensive creation until first use.
- Access control (protection proxy) — check permissions before delegating.
- Logging, caching, or rate limiting around an existing object.

#### Flyweight

**Problem it solves:** Reducing memory usage by sharing common state across many objects.

**When to use:**
- Large numbers of similar objects where most state is shared (intrinsic) and little state is unique (extrinsic).
- When memory is a constraint.

#### Bridge

**Problem it solves:** Decoupling an abstraction from its implementation so both can vary independently.

**When to use:**
- When you have multiple dimensions of variation (e.g., shape × rendering engine, device × remote control).
- When a class hierarchy is growing in two orthogonal directions.

### 5.3 Behavioral Patterns

These define how objects interact and distribute responsibility.

#### Observer

**Problem it solves:** One-to-many dependency where changes in one object must be broadcast to dependents.

**When to use:**
- Event systems, notification services, pub-sub messaging.
- When the number and type of dependents is unknown at design time.

**Implementation requirements:**
- Subject maintains a list of observers.
- Subject notifies all observers when state changes.
- Observers register/unregister themselves.

#### Strategy

**Problem it solves:** Making an algorithm interchangeable at runtime.

**When to use:**
- Multiple algorithms for the same task (sorting, pricing, routing).
- When the algorithm choice depends on context or configuration.

**Key signal:** If you see a family of algorithms that differ in implementation but share the same purpose, use Strategy.

#### State

**Problem it solves:** An object's behavior changes based on its internal state, effectively appearing to change class.

**When to use:**
- Objects with well-defined states and transitions (e.g., order processing: Pending → Confirmed → Shipped → Delivered).
- Traffic lights, vending machines, game characters.

**Key signal:** If you see a large switch/if-else on a `status` field that determines behavior, use State pattern.

#### Command

**Problem it solves:** Encapsulating a request as an object, allowing parameterization, queuing, logging, and undo.

**When to use:**
- Undo/redo functionality.
- Transaction logging.
- Task queues and scheduling.

#### Iterator

**Problem it solves:** Providing sequential access to elements of a collection without exposing its internal structure.

**When to use:**
- Custom collections that need traversal.
- When you need multiple traversal strategies over the same collection.

#### Template Method

**Problem it solves:** Defining the skeleton of an algorithm in a base class, letting subclasses override specific steps.

**When to use:**
- When multiple classes share the same algorithm structure but differ in specific steps.
- Frameworks where the framework controls the flow but users customize steps.

#### Chain of Responsibility

**Problem it solves:** Passing a request along a chain of handlers until one handles it.

**When to use:**
- Request processing pipelines (middleware, validation chains, approval workflows).
- When the handler for a request is not known in advance.

#### Mediator

**Problem it solves:** Reducing direct dependencies between objects by centralizing communication through a mediator.

**When to use:**
- Complex interactions between many objects (chat rooms, air traffic control, UI component coordination).
- When direct object-to-object references create a tangled web.

#### Memento

**Problem it solves:** Capturing and restoring an object's state without violating encapsulation.

**When to use:**
- Undo/redo, snapshots, save/load game state.
- When state restoration must not expose internal structure.

#### Visitor

**Problem it solves:** Adding new operations to a class hierarchy without modifying the classes.

**When to use:**
- When you need to perform many unrelated operations on a stable class hierarchy.
- Compilers, document processors, serializers.

**When NOT to use:**
- When the class hierarchy changes frequently (every new class requires updating all visitors).

### 5.4 Pattern Decision Flowchart

Use this flowchart when you are unsure which pattern to apply:

```
START: What problem are you solving?
│
├─ "I need to control object creation"
│   ├─ Only one instance? → Singleton
│   ├─ Create based on type/config at runtime? → Factory Method
│   ├─ Create families of related objects? → Abstract Factory
│   ├─ Complex object with many optional parts? → Builder
│   └─ Clone existing objects? → Prototype
│
├─ "I need to organize structure/composition"
│   ├─ Incompatible interfaces? → Adapter
│   ├─ Tree/hierarchical structure? → Composite
│   ├─ Add behavior dynamically? → Decorator
│   ├─ Simplify a complex subsystem? → Facade
│   ├─ Control access to an object? → Proxy
│   ├─ Reduce memory with shared state? → Flyweight
│   └─ Two independent dimensions of variation? → Bridge
│
├─ "I need to manage behavior/communication"
│   ├─ Notify dependents of changes? → Observer
│   ├─ Swap algorithms at runtime? → Strategy
│   ├─ Behavior changes with state? → State
│   ├─ Encapsulate requests as objects? → Command
│   ├─ Sequential access to a collection? → Iterator
│   ├─ Same algorithm, different steps? → Template Method
│   ├─ Pass request through a chain? → Chain of Responsibility
│   ├─ Reduce object-to-object coupling? → Mediator
│   ├─ Save and restore state? → Memento
│   └─ Add operations without modifying classes? → Visitor
│
└─ None of the above → Do not force a pattern. Simple, direct code is correct.
```

---

## 6. Concurrency and Thread Safety

If the requirements mention concurrent access, multiple users, real-time updates, or shared resources, the design **must** address thread safety. If the requirements do not mention concurrency, do not introduce it unnecessarily.

### 6.1 Core Concepts the Agent Must Apply

| Concept | What It Means | When It Matters |
|---------|--------------|-----------------|
| **Race Condition** | Two threads read-modify-write shared data simultaneously, producing incorrect results | Any shared mutable state |
| **Critical Section** | A code block that accesses shared resources and must not be executed by more than one thread at a time | Methods that modify shared collections, counters, or state |
| **Deadlock** | Two or more threads wait for each other indefinitely, each holding a lock the other needs | Any design with multiple locks |
| **Starvation** | A thread is perpetually denied access to a resource | Priority-based scheduling, unfair locks |

### 6.2 Thread Safety Rules

1. **Identify shared mutable state.** List every field that can be read and written by multiple threads.
2. **Minimize shared mutable state.** The less shared state exists, the fewer concurrency problems arise. Prefer immutable objects.
3. **Protect critical sections.** Use synchronization mechanisms (mutexes, locks, synchronized blocks) around all reads and writes to shared mutable state.
4. **Use thread-safe data structures** where available (concurrent hash maps, blocking queues, atomic variables).
5. **Avoid holding multiple locks simultaneously.** If unavoidable, always acquire locks in a consistent, documented order to prevent deadlock.
6. **Keep critical sections small.** Lock only the minimum code necessary. Never perform I/O, network calls, or long computations while holding a lock.

### 6.3 Concurrency Patterns

#### Thread Pool

**When to use:** When the system processes many short-lived, independent tasks (handling user requests, processing messages).

**Rules:**
- Use a fixed-size pool with a bounded task queue.
- Handle rejected tasks explicitly (do not silently drop them).

#### Producer-Consumer

**When to use:** When one part of the system generates work items and another part processes them, potentially at different rates.

**Rules:**
- Use a bounded blocking queue between producer and consumer.
- Handle queue-full and queue-empty conditions explicitly.

#### Reader-Writer

**When to use:** When many threads read shared data frequently but write to it rarely.

**Rules:**
- Allow multiple concurrent readers.
- Ensure writers have exclusive access.
- Decide on reader-preference vs. writer-preference based on requirements.

---

## 7. LLD Problem-Solving Framework

When given any LLD problem, follow this structured approach. Each step produces a concrete artifact.

### Step 1: Gather Requirements → Produce a Requirements List

Read the problem statement. Extract every requirement as a numbered list. Categorize each as functional, non-functional, or constraint.

```
Example (Parking Lot):
  F1: Multiple levels, each with a set number of spots.
  F2: Support cars, motorcycles, trucks.
  F3: Each spot accommodates a specific vehicle type.
  F4: Assign spot on entry, release on exit.
  F5: Track availability in real time.
  NF1: Handle concurrent access.
  NF2: Support multiple entry/exit points.
```

### Step 2: Identify Entities → Produce an Entity List

Extract nouns from requirements. Determine which are classes, enums, interfaces, or value objects.

```
Example (Parking Lot):
  Classes: ParkingLot, Level, ParkingSpot, Vehicle
  Subclasses: Car, Motorcycle, Truck (extend Vehicle)
  Enums: VehicleType (CAR, MOTORCYCLE, TRUCK)
  Interfaces: (none needed for this problem)
```

### Step 3: Define Relationships → Produce a Relationship Map

For each pair of related entities, state the relationship type and cardinality.

```
Example (Parking Lot):
  ParkingLot —[composition, 1:many]→ Level
  Level —[composition, 1:many]→ ParkingSpot
  ParkingSpot —[association, 0..1:1]→ Vehicle
  Car, Motorcycle, Truck —[inheritance]→ Vehicle
```

### Step 4: Assign Responsibilities → Produce a Method List

For each class, list its public methods. Each method must trace back to a requirement.

```
Example (Parking Lot):
  ParkingLot:
    + parkVehicle(vehicle) → boolean       [F4]
    + unparkVehicle(vehicle) → boolean     [F4]
    + getAvailableSpots() → count          [F5]

  Level:
    + parkVehicle(vehicle) → boolean       [F4]
    + unparkVehicle(vehicle) → boolean     [F4]
    + getAvailableSpots() → count          [F5]

  ParkingSpot:
    + isAvailable() → boolean              [F5]
    + canFitVehicle(vehicle) → boolean     [F3]
    + park(vehicle) → void                 [F4]
    + unpark() → void                      [F4]
```

### Step 5: Select Patterns → Produce a Pattern Justification

For each pattern used, state which requirement it addresses and why the simpler alternative is insufficient.

```
Example (Parking Lot):
  Singleton for ParkingLot:
    Justification: "The parking lot should have..." implies a single system-wide
    instance. All entry/exit points must reference the same lot.
```

### Step 6: Handle Edge Cases → Produce an Edge Case List

For every operation, identify what can go wrong and how the system responds.

```
Example (Parking Lot):
  - Vehicle tries to park, but lot is full → return failure, do not assign spot.
  - Vehicle tries to park, but no spot matches its type → return failure.
  - Vehicle tries to unpark, but is not parked → return failure or no-op.
  - Concurrent park requests for last spot → only one succeeds (thread safety).
  - null/invalid vehicle passed → reject with clear error.
```

### Step 7: Implement → Write Code

Only after Steps 1-6 are complete, write the implementation. The code must:
- Implement every method from Step 4.
- Apply every pattern from Step 5.
- Handle every edge case from Step 6.
- Satisfy every requirement from Step 1.

---

## 8. Common LLD Problem Archetypes

Most LLD problems fall into recurring categories. Recognizing the archetype accelerates design.

### 8.1 Management/CRUD Systems

**Examples:** Library management, hotel management, restaurant management, airline management.

**Common entities:** Item (book/room/table/flight), User (member/guest/customer), Transaction (borrow/reservation/booking), Catalog/Inventory.

**Common patterns:**
- Singleton for the central manager.
- Observer for availability notifications.
- Strategy for search/filter algorithms.

**Key design decisions:**
- How is availability tracked and updated atomically?
- What are the borrowing/booking rules and limits?
- How are conflicts resolved (double-booking)?

### 8.2 E-Commerce/Marketplace Systems

**Examples:** Online shopping, auction systems, food delivery.

**Common entities:** User, Product, Cart, Order, Payment, Inventory.

**Common patterns:**
- Strategy for payment methods.
- Observer for order status updates.
- State for order lifecycle (Pending → Processing → Shipped → Delivered).
- Factory for creating different product types.

**Key design decisions:**
- How is inventory decremented atomically (concurrent purchases)?
- How are payments processed and failures handled?
- How is the cart-to-order transition managed?

### 8.3 Booking/Reservation Systems

**Examples:** Movie tickets, concert tickets, car rental, parking lots.

**Common entities:** Venue/Resource (theater/car/spot), Booking/Reservation, User, Schedule/TimeSlot.

**Common patterns:**
- Singleton for the booking service.
- State for booking lifecycle.
- Strategy for seat/resource selection algorithms.
- Observer for availability updates.

**Key design decisions:**
- How are race conditions on the same resource handled (two users booking the last seat)?
- What is the cancellation/refund policy and its state transitions?
- How are time-based constraints enforced (expiry, overlapping reservations)?

### 8.4 Real-Time/Event-Driven Systems

**Examples:** Pub-sub messaging, elevator systems, traffic signals, notification services.

**Common entities:** Event/Message, Publisher/Producer, Subscriber/Consumer, Channel/Topic, Controller.

**Common patterns:**
- Observer for event propagation.
- Command for encapsulating requests.
- State for system modes (elevator direction, traffic light phase).
- Strategy for scheduling/dispatch algorithms.
- Chain of Responsibility for request routing.

**Key design decisions:**
- How are events delivered reliably?
- What is the ordering guarantee?
- How is backpressure handled (slow consumers)?

### 8.5 Game Systems

**Examples:** Chess, Tic-tac-toe, Snake and Ladder.

**Common entities:** Board, Player, Piece/Token, Move, Game (orchestrator).

**Common patterns:**
- State for game phases (setup, in-progress, checkmate, draw).
- Strategy for AI/move-selection algorithms.
- Command for moves (enables undo/redo).
- Template Method for turn execution flow.

**Key design decisions:**
- How are legal moves validated?
- How are win/loss/draw conditions detected?
- How is turn management enforced?

### 8.6 Data Structure Implementations

**Examples:** LRU Cache, HashMap, concurrent data structures.

**Common entities:** Node, Entry, Container/Cache.

**Common patterns:**
- Proxy for lazy initialization or access control.
- Flyweight for memory optimization.
- Iterator for traversal.

**Key design decisions:**
- What is the time complexity requirement for each operation?
- How is eviction handled (LRU, LFU, TTL)?
- How is thread safety achieved without sacrificing performance?

### 8.7 Social/Communication Platforms

**Examples:** Social networks, LinkedIn, Stack Overflow.

**Common entities:** User/Profile, Post/Question/Answer, Connection/Friendship, Feed, Notification.

**Common patterns:**
- Observer for feed updates and notifications.
- Strategy for feed ranking algorithms.
- Composite for threaded comments/replies.
- Mediator for chat/messaging between users.

**Key design decisions:**
- How are connections/relationships modeled (directed vs. undirected)?
- How is the feed generated and ranked?
- How are privacy controls enforced?

### 8.8 Financial/Transaction Systems

**Examples:** Splitwise, digital wallets, stock brokerage, ATMs.

**Common entities:** Account, Transaction, Ledger, User, Balance.

**Common patterns:**
- Command for transactions (enables audit trail).
- State for transaction lifecycle.
- Strategy for split algorithms (equal, percentage, exact).
- Observer for balance change notifications.

**Key design decisions:**
- How is atomicity guaranteed for financial operations?
- How are floating-point precision issues avoided (use integer cents, not decimal dollars)?
- How are concurrent transactions on the same account serialized?

---

## 9. Code Generation Constraints

These are hard rules the agent must follow when producing any code.

### 9.1 Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Classes | PascalCase, noun, singular | `ParkingSpot`, `OrderItem` |
| Interfaces | PascalCase, adjective or capability | `Searchable`, `PaymentMethod` |
| Methods | camelCase (or snake_case per language), verb phrase | `parkVehicle()`, `calculateTotal()` |
| Variables | camelCase (or snake_case per language), descriptive | `availableSpots`, `currentLevel` |
| Constants | UPPER_SNAKE_CASE | `MAX_CAPACITY`, `DEFAULT_TIMEOUT` |
| Enums | PascalCase type, UPPER_SNAKE_CASE values | `VehicleType.MOTORCYCLE` |
| Booleans | Prefixed with is/has/can/should | `isAvailable`, `hasExpired` |

- Names must be self-documenting. If a name requires a comment to explain it, the name is wrong.
- No abbreviations unless universally understood (e.g., `id`, `url`, `http`).
- No single-letter variables outside of loop indices.

### 9.2 Structure

- **One class per file.** Small enums or nested classes used exclusively by the outer class are exceptions.
- **Group files by feature/domain**, not by type. Put `ParkingSpot`, `ParkingLevel`, and `ParkingLot` together — not in separate `models/`, `services/`, `enums/` folders.
- **Order within a class:**
  1. Constants
  2. Fields (private)
  3. Constructor(s)
  4. Public methods
  5. Private/helper methods

### 9.3 Error Handling

- **Never silently swallow errors.** Every caught exception must be logged, re-thrown, or translated into a meaningful response.
- **Use specific exception types**, not generic catch-all exceptions.
- **Validate all inputs at the public boundary** (public methods, constructors, API endpoints). Internal private methods may assume valid inputs if the public boundary guarantees them.
- **Fail fast.** Check preconditions at the start of a method, not in the middle of business logic.
- **Never return null to indicate failure.** Use optionals, result types, or throw exceptions — whichever is idiomatic for the target language.

### 9.4 Documentation

- **Every class** must have a documentation comment stating its single responsibility.
- **Every public method** must have a documentation comment stating:
  - What it does (one sentence).
  - What its parameters mean.
  - What it returns.
  - What exceptions it can throw and under what conditions.
- **Do not document the obvious.** `getBalance()` does not need a comment saying "gets the balance." But `getBalance()` that returns a value in cents (not dollars) absolutely does.
- **Inline comments** are for explaining *why*, never *what*. The code should be clear enough to explain *what*.

### 9.5 Testability

- Every class must be testable in isolation without a running system, database, network, or file system.
- Dependencies must be injectable (constructor parameters, not hard-coded instantiation).
- No static state unless the class is explicitly a Singleton (and even then, provide a reset mechanism for testing).
- Side effects (I/O, network, randomness, time) must be behind interfaces that can be mocked.

### 9.6 Security (Assume Hostile Input)

- **All external input is untrusted.** Validate type, range, length, and format.
- **Never expose internal identifiers or stack traces** in error messages returned to users.
- **Enforce access control at the service layer**, not just the UI layer.
- **Never store sensitive data in plain text** (passwords, tokens, keys).
- **Sanitize any input** that will be used in queries, file paths, or shell commands.
- **Apply the principle of least privilege.** Every component should have the minimum access necessary.

---

## 10. Anti-Patterns and Red Flags

If the agent detects itself producing any of the following, it must stop and redesign.

### 10.1 God Class

**Symptom:** A class with dozens of methods spanning multiple responsibilities, hundreds of lines, or a name like `SystemManager` or `ApplicationController`.

**Fix:** Split into focused classes, each with a single responsibility.

### 10.2 Anemic Domain Model

**Symptom:** Entity classes that are nothing but fields with getters and setters, while all logic lives in external "service" classes.

**Fix:** Move behavior into the entity that owns the data. An `Account` should know how to `withdraw()`, not have an `AccountService` that reaches into its fields.

### 10.3 Premature Optimization

**Symptom:** Complex caching, lazy loading, or custom data structures without a performance requirement justifying them.

**Fix:** Write correct, clear code first. Optimize only when a requirement demands it.

### 10.4 Hardcoded Values

**Symptom:** Magic numbers or strings embedded in logic (`if spots > 100`, `price * 0.08`).

**Fix:** Extract to named constants with clear semantic meaning (`MAX_SPOTS_PER_LEVEL`, `TAX_RATE`).

### 10.5 Feature Envy

**Symptom:** A method that accesses more fields from another class than from its own.

**Fix:** Move the method to the class whose data it uses.

### 10.6 Shotgun Surgery

**Symptom:** A single conceptual change requires modifications in many different classes.

**Fix:** Consolidate the scattered logic into a single class or module.

### 10.7 Inappropriate Intimacy

**Symptom:** Two classes that access each other's private internals or are so tightly coupled that neither can change independently.

**Fix:** Introduce an interface between them, or merge them if they are really one concept.

### 10.8 Speculative Generality

**Symptom:** Abstract classes, interfaces, or hooks for "future requirements" that do not exist in the current problem.

**Fix:** Remove them. Build what is needed now. YAGNI — You Aren't Gonna Need It.

### 10.9 Circular Dependencies

**Symptom:** Class A depends on Class B, which depends on Class A.

**Fix:** Extract the shared concept into a third class/interface that both depend on.

---

## 11. Quality Checklist

Before finalizing any LLD output, verify every item.

### Requirements Coverage

- [ ] Every functional requirement has at least one method that implements it.
- [ ] Every constraint is enforced in code, not just documented.
- [ ] Every edge case has explicit handling (not just a comment saying "handle this").

### OOP Compliance

- [ ] Every class has a single, stated responsibility.
- [ ] All fields are private with controlled access.
- [ ] Inheritance is used only for genuine "is-a" relationships.
- [ ] Polymorphism replaces all type-checking conditionals.

### SOLID Compliance

- [ ] SRP: No class has more than one reason to change.
- [ ] OCP: New variants can be added without modifying existing code.
- [ ] LSP: All subtypes are substitutable for their base types.
- [ ] ISP: No implementer has unused interface methods.
- [ ] DIP: High-level classes depend on abstractions, not concretions.

### Pattern Usage

- [ ] Every pattern used has a documented justification tied to a requirement.
- [ ] No pattern is applied speculatively or "for best practice."
- [ ] Pattern implementation is complete (e.g., Singleton is thread-safe, Observer handles unsubscription).

### Concurrency (if applicable)

- [ ] All shared mutable state is identified and protected.
- [ ] No deadlock potential (consistent lock ordering documented).
- [ ] Critical sections are minimal in scope.
- [ ] Thread-safe data structures are used where appropriate.

### Code Quality

- [ ] All names are self-documenting — no abbreviations, no single letters.
- [ ] All public classes and methods have documentation comments.
- [ ] All inputs are validated at the public boundary.
- [ ] No null returns for failure cases.
- [ ] No hardcoded magic values.
- [ ] No empty catch blocks or swallowed exceptions.
- [ ] No circular dependencies.

### Security

- [ ] All external input is validated for type, range, and format.
- [ ] No sensitive data in error messages or logs.
- [ ] Access control is enforced at the service layer.
- [ ] Principle of least privilege applied to all components.

### Testability

- [ ] All dependencies are injectable.
- [ ] No hidden dependencies on file system, network, or time.
- [ ] Every class can be instantiated in a unit test without external services.

---

## References

- [SOLID Principles Explained with Code](https://blog.algomaster.io/p/solid-principles-explained-with-code)
- [SOLID Principles in Pictures](https://medium.com/backticks-tildes/the-s-o-l-i-d-principles-in-pictures-b34ce2f1e898)
- [UML Class Diagram Explained](https://blog.algomaster.io/p/uml-class-diagram-explained-with-examples)
- [Head First Design Patterns](https://www.amazon.in/dp/9385889753)
- [Clean Code by Robert C. Martin](https://www.amazon.in/dp/B001GSTOAM)
- [Refactoring by Martin Fowler](https://www.amazon.in/dp/0134757599)
- [awesome-low-level-design Repository](https://github.com/ashishps1/awesome-low-level-design)
- [AlgoMaster LLD Course](https://algomaster.io/learn/lld/course-introduction)

---

*This guide is designed to be consumed by AI code-generation agents as a pre-processing step before any LLD task. It is language-agnostic and project-agnostic. When in conflict with a task-specific instruction, the task-specific instruction takes precedence.*
