# High-Level Design (HLD) Guide for AI Code-Generation Agents

This guide defines how an AI code-generation agent must approach high-level system design problems. Every section contains binding constraints. When designing or generating architecture for any HLD task, follow this document top-to-bottom as a checklist.

**Scope:** This guide addresses *distributed systems architecture* — how components are organized, how they communicate, how data flows, and how the system scales. It is the complement to `LLD.md`, which addresses object-level design within a single service.

---

## Table of Contents

1. [Design Process Protocol](#1-design-process-protocol)
2. [Foundational Trade-Offs](#2-foundational-trade-offs)
3. [Core Building Blocks](#3-core-building-blocks)
4. [Data Storage](#4-data-storage)
5. [Caching](#5-caching)
6. [Asynchronous Processing](#6-asynchronous-processing)
7. [Communication Protocols](#7-communication-protocols)
8. [Scaling Patterns](#8-scaling-patterns)
9. [Security](#9-security)
10. [HLD Problem-Solving Framework](#10-hld-problem-solving-framework)
11. [Common HLD Problem Archetypes](#11-common-hld-problem-archetypes)
12. [Back-of-the-Envelope Estimation](#12-back-of-the-envelope-estimation)
13. [Architecture Generation Constraints](#13-architecture-generation-constraints)
14. [Anti-Patterns and Red Flags](#14-anti-patterns-and-red-flags)
15. [Quality Checklist](#15-quality-checklist)

---

## 1. Design Process Protocol

**Never jump to architecture first.** Every HLD task must pass through these phases in order. Skipping a phase produces systems that are over-engineered, under-specified, or both.

### Phase 1: Requirements and Scope

Before drawing any boxes or arrows, extract and categorize every requirement.

| Category | What to Extract | Example |
|----------|----------------|---------|
| **Functional** | What the system must do from the user's perspective | "User posts a tweet and followers see it" |
| **Non-Functional** | Performance, availability, consistency, latency, durability targets | "99.99% uptime", "< 200ms read latency" |
| **Scale** | Number of users, requests per second, data volume, growth rate | "10M users, 500M tweets/day" |
| **Constraints** | Hard limits, regulatory requirements, technology mandates | "Data must reside in EU", "Must use existing auth system" |
| **Out of Scope** | What the system explicitly does NOT need to handle | "Analytics are handled by a separate team" |

**Rules:**
- Explicitly state what is in scope and out of scope. An unbounded problem produces an unbounded (and therefore useless) design.
- If a requirement is ambiguous, state your interpretation before proceeding.
- Never assume scale. If the problem does not state how many users or requests, ask or state your assumption explicitly with justification.
- Separate read-heavy from write-heavy requirements — this fundamentally changes the architecture.

### Phase 2: Back-of-the-Envelope Estimation

Quantify the problem before designing for it. See [Section 12](#12-back-of-the-envelope-estimation) for the full method. The output of this phase is:

- Requests per second (read and write, average and peak)
- Storage requirements (per month, per year, total)
- Bandwidth requirements
- Read-to-write ratio

### Phase 3: High-Level Architecture

Draw the system as components and arrows. Every component must have a clear reason to exist. Every arrow must represent a defined communication protocol (HTTP, RPC, message queue, etc.).

**Rules:**
- Start simple. Begin with the minimum components needed to satisfy the functional requirements, then iterate.
- Every component must serve at least one requirement. If you cannot trace a component back to a requirement, remove it.
- Identify the data flow for each use case explicitly. Walk through the request path from client to response.

### Phase 4: Core Component Deep Dive

For each major component, specify:
- What it does (responsibility)
- What data it stores or processes
- What protocol it exposes
- What it depends on

### Phase 5: Scaling and Bottleneck Resolution

Identify bottlenecks in the Phase 3 design. For each bottleneck:
1. State what breaks and at what scale.
2. Propose a solution from [Section 8](#8-scaling-patterns).
3. State the trade-off introduced by the solution.

**Rules:**
- Scaling is iterative. Do not jump from a single-server design to a fully distributed architecture in one step. Show the progression.
- Every scaling decision must state its trade-off. "Add a cache" is incomplete. "Add a cache — reduces read latency from 50ms to 5ms, introduces stale data risk mitigated by TTL of 60 seconds" is complete.

---

## 2. Foundational Trade-Offs

Every architecture decision involves trade-offs. The agent must understand and explicitly state these when making decisions.

### 2.1 Performance vs. Scalability

| Condition | Meaning |
|-----------|---------|
| **Performance problem** | The system is slow for a single user |
| **Scalability problem** | The system is fast for one user but degrades under load |

A scalable system maintains proportional performance as resources are added.

### 2.2 Latency vs. Throughput

| Term | Definition |
|------|-----------|
| **Latency** | Time to complete a single operation |
| **Throughput** | Number of operations per unit of time |

**Rule:** Aim for maximum throughput with acceptable latency. State the acceptable latency target for every read and write path.

### 2.3 Availability vs. Consistency (CAP Theorem)

In a distributed system experiencing a network partition, you must choose between:

| Choice | Behavior | Use When |
|--------|----------|----------|
| **CP** (Consistency + Partition Tolerance) | Returns an error or timeout rather than stale data | Financial transactions, inventory counts, anything where correctness is non-negotiable |
| **AP** (Availability + Partition Tolerance) | Returns the most recent available data, which may be stale | Social feeds, analytics, caching, anything where eventual correctness is acceptable |

**Rules:**
- Always state which side of CAP the system leans toward, and why.
- Different parts of the same system may make different choices. A user's account balance (CP) and their activity feed (AP) can coexist.
- "Partition tolerance" is not optional in real distributed systems — networks fail. The choice is always between C and A when a partition occurs.

### 2.4 Consistency Patterns

| Pattern | Behavior | Example Use |
|---------|----------|-------------|
| **Strong Consistency** | Reads always return the latest write | Banking, inventory |
| **Eventual Consistency** | Reads will *eventually* reflect the latest write (milliseconds to seconds) | DNS, social feeds, search indices |
| **Weak Consistency** | No guarantee that reads will ever see a particular write | VoIP, live video, real-time gaming (dropped data is acceptable) |

### 2.5 Availability Patterns

| Pattern | How It Works | Trade-Off |
|---------|-------------|-----------|
| **Active-Passive Failover** | Standby takes over when primary fails via heartbeat | Downtime during failover, potential data loss |
| **Active-Active Failover** | Both nodes serve traffic, load-balanced | Requires conflict resolution, more complex |
| **Replication** | Data copied across nodes (master-slave or master-master) | Replication lag, conflict resolution |

**Availability targets:**

| Level | Annual Downtime | Monthly Downtime |
|-------|----------------|-----------------|
| 99.9% (three 9s) | 8h 45m | 43m 50s |
| 99.99% (four 9s) | 52m 36s | 4m 23s |
| 99.999% (five 9s) | 5m 16s | 26s |

**Rule:** Always state the availability target. It directly determines the complexity (and cost) of redundancy, failover, and replication needed.

---

## 3. Core Building Blocks

These are the standard components that appear in most distributed systems. Understand what each does, when to use it, and what it costs.

### 3.1 DNS (Domain Name System)

**What it does:** Translates domain names to IP addresses.

**Key records:**

| Record Type | Purpose |
|------------|---------|
| **A** | Maps name to IP address |
| **CNAME** | Maps name to another name |
| **MX** | Specifies mail servers |
| **NS** | Specifies DNS servers for the domain |

**Routing strategies:** Weighted round robin, latency-based, geolocation-based.

**Trade-offs:** Slight latency (mitigated by caching), results can be stale during propagation, management complexity.

### 3.2 CDN (Content Delivery Network)

**What it does:** Serves static (and some dynamic) content from edge servers geographically close to users.

| Type | Behavior | Best For |
|------|----------|----------|
| **Push CDN** | Content uploaded to CDN when changed | Low-traffic sites, infrequently updated content |
| **Pull CDN** | CDN fetches from origin on first request, caches it | High-traffic sites, frequently requested content |

**Trade-offs:** Cost scales with traffic, content can be stale until TTL expires, requires URL rewriting for static assets.

**Rule:** Use a CDN for any system serving static content (images, CSS, JS, videos) to users across multiple geographic regions.

### 3.3 Load Balancer

**What it does:** Distributes incoming requests across multiple servers.

| Type | How It Decides | Pros | Cons |
|------|---------------|------|------|
| **Layer 4** (Transport) | Source/dest IP and port | Fast, low overhead | Cannot inspect content |
| **Layer 7** (Application) | HTTP headers, cookies, URL path | Content-aware routing | Higher overhead |

**Routing methods:** Random, round robin, weighted round robin, least connections, IP hash, URL hash.

**Benefits:**
- Prevents overloading single servers
- Enables horizontal scaling
- SSL termination offloads crypto from backend
- Session persistence via cookies

**Trade-offs:** Single point of failure (mitigate with active-passive or active-active LB pairs), adds latency, increases complexity.

**Rule:** Any system with more than one server of the same type requires a load balancer in front of it.

### 3.4 Reverse Proxy

**What it does:** Sits between clients and backend servers, forwarding requests and returning responses.

**Benefits beyond load balancing:**
- Hides backend topology from clients
- Compression
- Static content serving
- SSL termination
- Caching
- Security (IP blacklisting, rate limiting)

**Rule:** A reverse proxy is useful even with a single backend server. A load balancer is useful only with multiple servers. Use both when you have multiple servers.

### 3.5 Application Layer (Service Tier)

**What it does:** Separates web-serving concerns from business logic, allowing independent scaling.

**Key principle:** Separate the **web layer** (handles HTTP, serves responses) from the **application layer** (executes business logic, processes data). This allows:
- Scaling each independently
- Adding new APIs without affecting the web layer
- Service specialization (read API servers vs. write API servers)

**Microservices consideration:** A suite of independently deployable, small services, each running its own process and communicating via well-defined protocols.

| Advantage | Disadvantage |
|-----------|-------------|
| Independent deployment and scaling | Operational complexity (deployment, monitoring) |
| Technology diversity per service | Distributed system challenges (network failures, consistency) |
| Fault isolation | Debugging across service boundaries |
| Team autonomy | Service discovery and orchestration overhead |

**Rule:** Start monolithic unless there is a clear, stated requirement for independent scaling or independent deployment of components. Premature microservice decomposition is an anti-pattern.

---

## 4. Data Storage

Choosing the right storage is the most consequential decision in most system designs. The choice determines consistency guarantees, query patterns, scaling strategy, and cost.

### 4.1 Relational Databases (RDBMS)

**Properties (ACID):**

| Property | Meaning |
|----------|---------|
| **Atomicity** | Each transaction is all-or-nothing |
| **Consistency** | Every transaction moves the database from one valid state to another |
| **Isolation** | Concurrent transactions produce the same result as serial execution |
| **Durability** | Committed transactions survive system failures |

**When to use:**
- Structured, well-defined data with relationships
- Need for complex joins
- Need for strong consistency and transactions
- Clear schema that does not change frequently

**Scaling patterns for RDBMS:**

| Pattern | What It Does | Trade-Off |
|---------|-------------|-----------|
| **Master-Slave Replication** | Writes go to master, reads go to slaves | Replication lag, complexity in promoting slave |
| **Master-Master Replication** | Both nodes accept reads and writes | Conflict resolution, loosely consistent or higher write latency |
| **Federation** | Split databases by function (users DB, products DB, orders DB) | Cannot join across databases, application must route |
| **Sharding** | Split data across databases by key (user ID, geography) | Complex queries across shards, rebalancing difficulty |
| **Denormalization** | Duplicate data to reduce joins | Data duplication, write complexity |

### 4.2 NoSQL Databases

**Properties (BASE):**

| Property | Meaning |
|----------|---------|
| **Basically Available** | System guarantees availability |
| **Soft State** | State may change over time even without input |
| **Eventual Consistency** | System will become consistent given enough time |

**Types:**

| Type | Abstraction | Example Use | Example Systems |
|------|------------|-------------|-----------------|
| **Key-Value Store** | Hash table | Caching, sessions, simple lookups | Redis, Memcached, DynamoDB |
| **Document Store** | Key-value with structured values (JSON, XML) | Content management, user profiles, catalogs | MongoDB, CouchDB, DynamoDB |
| **Wide Column Store** | Nested map `ColumnFamily<RowKey, Columns<ColKey, Value, Timestamp>>` | Time series, IoT data, very large datasets | Cassandra, HBase, BigTable |
| **Graph Database** | Nodes and edges | Social networks, recommendation engines, fraud detection | Neo4j, FlockDB |

### 4.3 SQL vs. NoSQL Decision Table

| Factor | Favors SQL | Favors NoSQL |
|--------|-----------|-------------|
| Data structure | Well-defined, relational | Semi-structured, flexible schema |
| Query complexity | Complex joins needed | Simple key-based lookups |
| Consistency | Strong consistency required | Eventual consistency acceptable |
| Scale | Moderate (can shard, but complex) | Horizontal scaling is native |
| Data volume | Moderate (TB) | Very large (TB to PB) |
| Write patterns | Moderate write throughput | Very high write throughput needed |
| Maturity | More established tooling | Rapidly evolving |

**Rule:** Default to SQL unless there is a specific reason to choose NoSQL. "NoSQL scales better" is not a sufficient reason — state the exact scaling problem SQL cannot solve.

### 4.4 Object Storage

**What it does:** Stores unstructured binary data (images, videos, files, backups) at scale.

**When to use:** Any time the system handles user-uploaded files, media, static assets, or large blobs.

**Rule:** Never store binary blobs in a relational database. Store the blob in object storage and store a reference (URL/path) in the database.

---

## 5. Caching

Caching reduces latency and load on downstream systems by storing frequently accessed data in fast storage (typically memory).

### 5.1 Where to Cache

| Location | What It Caches | Managed By |
|----------|---------------|-----------|
| **Client** | DNS, static assets, API responses | Browser, OS, mobile SDK |
| **CDN** | Static content (images, CSS, JS, videos) | CDN provider |
| **Web Server** | Full page responses | Reverse proxy (e.g., Varnish) |
| **Application** | Business objects, query results, sessions | In-memory store (Redis, Memcached) |
| **Database** | Query results, indexes | Database engine built-in cache |

### 5.2 What to Cache

| Level | Description |
|-------|-------------|
| **Query-level** | Hash the database query as key, store result as value |
| **Object-level** | Assemble data into business objects, cache the object |

**Rule:** Prefer object-level caching. Query-level caching is brittle — any change to underlying data requires invalidating all queries that might include it.

### 5.3 Cache Update Strategies

| Strategy | How It Works | Pros | Cons |
|----------|-------------|------|------|
| **Cache-Aside** | App checks cache → miss → reads DB → writes to cache | Only requested data is cached, simple | Three trips on miss, data can go stale |
| **Write-Through** | App writes to cache → cache writes to DB synchronously | Cache always has latest data | Slow writes, most cached data may never be read |
| **Write-Behind (Write-Back)** | App writes to cache → cache writes to DB asynchronously | Fast writes | Risk of data loss if cache fails before DB write |
| **Refresh-Ahead** | Cache auto-refreshes entries before expiration | Reduced latency for hot data | Wasted work if prediction is wrong |

### 5.4 Cache Decision Rules

| Situation | Strategy |
|-----------|----------|
| Read-heavy, tolerance for stale data | Cache-Aside with TTL |
| Read-heavy, no tolerance for stale data | Write-Through |
| Write-heavy, can tolerate brief inconsistency | Write-Behind |
| Hot data with predictable access patterns | Refresh-Ahead |

**Rules:**
- Always define a TTL. Caches without TTL grow unbounded and serve stale data indefinitely.
- Always plan for cache failure. The system must function (degraded, not broken) when the cache is unavailable.
- Size the cache based on the working set, not the total dataset.

---

## 6. Asynchronous Processing

Asynchronous processing decouples the request from the work, improving response time and system resilience.

### 6.1 Message Queues

**What they do:** Receive, hold, and deliver messages between producers and consumers.

**Flow:**
1. Producer publishes a message (job) to the queue.
2. Consumer pulls the message, processes it, acknowledges completion.
3. If processing fails, the message is retried or sent to a dead-letter queue.

**When to use:**
- Any operation too slow to perform synchronously in the request path.
- Decoupling services so they can fail independently.
- Buffering writes to absorb traffic spikes.

**Rule:** Any operation that takes more than the acceptable response latency must be moved to an asynchronous path.

### 6.2 Task Queues

**What they do:** Receive tasks with associated data, execute them, and deliver results.

**When to use:**
- CPU-intensive background processing (image resizing, video transcoding, report generation).
- Scheduled/deferred work.

### 6.3 Back Pressure

**What it is:** When a queue grows faster than consumers can drain it, back pressure limits the intake rate to prevent system collapse.

**Implementation:** When the queue reaches a threshold, return HTTP 503 (Service Unavailable) to clients with a retry-after header. Clients retry with exponential backoff.

**Rule:** Every queue must have a bounded size. Unbounded queues convert a latency problem into a memory problem.

### 6.4 Event-Driven Architecture

**What it is:** Services communicate by emitting and reacting to events rather than direct calls.

**Patterns:**

| Pattern | Description | Use When |
|---------|-------------|----------|
| **Pub/Sub** | Producers publish to topics, consumers subscribe | One-to-many notifications, decoupled fan-out |
| **Event Sourcing** | Store events as the source of truth, derive state by replaying | Audit trails, financial systems, undo/redo |
| **CQRS** (Command Query Responsibility Segregation) | Separate write model from read model | Systems with very different read and write patterns |

---

## 7. Communication Protocols

The choice of protocol determines latency, coupling, reliability, and debugging ease.

### 7.1 HTTP/REST

**Model:** Client sends request, server returns response. Stateless.

| Verb | Purpose | Idempotent | Safe |
|------|---------|-----------|------|
| **GET** | Read a resource | Yes | Yes |
| **POST** | Create a resource or trigger an action | No | No |
| **PUT** | Replace a resource entirely | Yes | No |
| **PATCH** | Partially update a resource | No | No |
| **DELETE** | Remove a resource | Yes | No |

**When to use:** External-facing APIs, public APIs, browser communication.

**Pros:** Universal, cacheable, self-descriptive, tooling-rich.

**Cons:** Multiple round trips for nested resources, verb constraints can be awkward, payload bloat for simple operations.

### 7.2 RPC (Remote Procedure Call)

**Model:** Client calls a procedure on a remote server as if it were local.

**When to use:** Internal service-to-service communication where performance matters.

**Pros:** Lower latency, strongly typed contracts, efficient binary serialization.

**Cons:** Tight coupling to service implementation, harder to cache, debugging is more complex.

### 7.3 Protocol Selection Rules

| Context | Protocol |
|---------|----------|
| External clients (browsers, mobile apps, third parties) | REST over HTTP |
| Internal service-to-service, performance-critical | RPC (gRPC, Thrift, Protobuf) |
| One-to-many async notification | Message queue / Pub-Sub |
| Real-time bidirectional communication | WebSockets |
| Streaming data | Server-Sent Events (SSE) or WebSockets |

**Rule:** Never use RPC for external APIs. Never use REST for high-throughput internal communication where latency matters.

### 7.4 TCP vs. UDP

| Protocol | Guarantees | Use When |
|----------|-----------|----------|
| **TCP** | Ordered, reliable delivery with retransmission | All data must arrive intact (web, database, file transfer) |
| **UDP** | Unreliable, unordered, no retransmission | Low latency matters more than completeness (video, VoIP, gaming) |

---

## 8. Scaling Patterns

Scaling is always iterative: benchmark → profile → fix bottleneck → repeat. Never over-engineer the initial design.

### 8.1 Vertical vs. Horizontal Scaling

| Approach | What It Means | Pros | Cons |
|----------|--------------|------|------|
| **Vertical** | Bigger machine (more CPU, RAM, disk) | Simple, no code changes | Expensive, hardware ceiling, single point of failure |
| **Horizontal** | More machines of the same size | Cost-efficient, no ceiling, higher availability | Requires stateless services, adds complexity |

**Rule:** Start vertical until you hit a ceiling or need fault tolerance. Then go horizontal.

### 8.2 Database Scaling Progression

Follow this progression in order. Each step introduces complexity — do not skip ahead.

```
1. Optimize queries (indexes, query tuning)
       ↓
2. Add read replicas (master-slave)
       ↓
3. Add application-level caching (Redis/Memcached)
       ↓
4. Federation (split by function)
       ↓
5. Sharding (split by key)
       ↓
6. Denormalization (reduce joins at cost of duplication)
       ↓
7. Move appropriate data to NoSQL
```

### 8.3 Stateless Services

**Requirement for horizontal scaling.** A service is stateless if any instance can handle any request without relying on data from a previous request.

**What to externalize:**
- Session data → centralized cache (Redis) or client-side tokens (JWT)
- User uploads → object storage
- Configuration → configuration service or environment variables

**Rule:** If a service stores request-dependent state in memory, it cannot be horizontally scaled. Identify and externalize all in-process state.

### 8.4 Autoscaling

**What it does:** Automatically adds or removes instances based on metrics (CPU, memory, request rate, queue depth, custom metrics).

**When to use:** Predictable load patterns (time-of-day), unpredictable traffic spikes, cost optimization.

**Rule:** Autoscaling requires stateless services. It also requires health checks — never scale up instances that cannot serve traffic.

### 8.5 Data Partitioning (Sharding)

| Strategy | How Data Is Split | Pros | Cons |
|----------|------------------|------|------|
| **Range-based** | By key range (A-M, N-Z) | Simple, range queries work | Uneven distribution (hot partitions) |
| **Hash-based** | Hash of key mod N shards | Even distribution | Range queries broken, rebalancing is hard |
| **Consistent Hashing** | Keys and nodes on a hash ring | Minimal redistribution when nodes added/removed | More complex implementation |
| **Directory-based** | Lookup table maps key → shard | Flexible, can rebalance easily | Lookup table is single point of failure |

**Rule:** Always state the partition key and justify why it distributes data evenly. An uneven partition creates a hot shard that negates the benefit of sharding.

---

## 9. Security

Security is a constraint on every component, not a separate component. The agent must apply these rules to every element of the design.

### 9.1 Non-Negotiable Rules

1. **Encrypt in transit.** All communication between components must use TLS. No exceptions.
2. **Encrypt at rest.** All stored data (databases, object stores, caches with sensitive data) must be encrypted.
3. **Sanitize all input.** Every piece of external input must be validated for type, length, format, and range before processing.
4. **Use parameterized queries.** Prevent SQL injection by never concatenating user input into queries.
5. **Principle of least privilege.** Every component, service account, and user gets the minimum permissions necessary.
6. **Never expose internal details.** Error messages to clients must not contain stack traces, internal IPs, database names, or implementation details.

### 9.2 Authentication and Authorization

| Concept | What It Answers |
|---------|----------------|
| **Authentication** | *Who are you?* (Verifying identity) |
| **Authorization** | *What can you do?* (Verifying permissions) |

**Rule:** Authentication and authorization must be enforced at the API gateway or service layer, never only at the client. Client-side checks are a UX convenience, not a security control.

### 9.3 Network Security

- Use **Virtual Private Clouds (VPCs)** to isolate backend components from the public internet.
- Place only load balancers and reverse proxies in public subnets.
- All databases, caches, application servers, and internal services go in private subnets.
- Open only the ports necessary for each component. Default deny all.
- Use security groups or firewall rules to whitelist communication between specific components.

### 9.4 Rate Limiting

**What it does:** Limits the number of requests a client can make within a time window.

**When to use:** Every external-facing API.

**Implementation options:** Token bucket, leaky bucket, fixed window, sliding window.

**Rule:** Rate limiting is not optional for public APIs. State the rate limit strategy and the response code (HTTP 429) for exceeded limits.

---

## 10. HLD Problem-Solving Framework

When given any HLD problem, follow this structured approach. Each step produces a concrete artifact.

### Step 1: Clarify Requirements → Produce a Requirements Document

Extract functional requirements, non-functional requirements, and explicit scope boundaries.

```
Example (Twitter-like Service):
  FUNCTIONAL:
    F1: User posts a tweet (text, max 280 chars).
    F2: User views their own timeline (their posts).
    F3: User views home timeline (posts from followed users).
    F4: User searches tweets by keyword.
    F5: User follows/unfollows other users.

  NON-FUNCTIONAL:
    NF1: High availability (99.99%).
    NF2: Home timeline read latency < 200ms.
    NF3: Eventual consistency on home timeline is acceptable.
    NF4: Post should be visible to followers within 5 seconds.

  OUT OF SCOPE:
    - Direct messaging
    - Media upload (images, video)
    - Analytics dashboard
```

### Step 2: Estimate Scale → Produce a Capacity Plan

Use [Section 12](#12-back-of-the-envelope-estimation) to quantify:

```
Example (Twitter-like Service):
  Users: 100M active
  Tweets/day: 500M
  Read:Write ratio: 500:1
  Tweet size: ~10 KB (text + metadata)

  Writes: 500M / 86400s ≈ 6,000 writes/sec
  Reads: 6,000 × 500 = 3,000,000 reads/sec (peak: 5x = 15M)
  Storage: 10 KB × 500M × 30 days = 150 TB/month
  Bandwidth: 10 KB × 3M reads/sec = 30 GB/sec read bandwidth
```

### Step 3: Define API → Produce an API Contract

For each functional requirement, define the external-facing API.

```
Example (Twitter-like Service):
  POST   /api/v1/tweets          { "text": "...", "media_ids": [...] }
  GET    /api/v1/timeline/home   ?user_id=123&cursor=abc&limit=20
  GET    /api/v1/timeline/user   ?user_id=123&cursor=abc&limit=20
  GET    /api/v1/search          ?query=hello+world&limit=20
  POST   /api/v1/follow          { "target_user_id": "456" }
  DELETE /api/v1/follow/456
```

**Rule:** Define the API before the architecture. The API represents the contract with the outside world. The architecture exists to serve the API, not the other way around.

### Step 4: Define Data Model → Produce a Schema

For each entity, define the storage schema and the storage technology.

```
Example (Twitter-like Service):
  USERS table (SQL):
    user_id     BIGINT PRIMARY KEY
    username    VARCHAR(64) UNIQUE
    email       VARCHAR(256)
    created_at  TIMESTAMP

  TWEETS table (SQL):
    tweet_id    BIGINT PRIMARY KEY
    user_id     BIGINT FOREIGN KEY
    text        VARCHAR(280)
    created_at  TIMESTAMP
    INDEX(user_id, created_at)

  HOME_TIMELINE (Redis sorted set):
    Key: home_timeline:{user_id}
    Value: sorted set of tweet_ids, scored by timestamp

  FOLLOWERS (SQL or Graph):
    follower_id  BIGINT
    followee_id  BIGINT
    PRIMARY KEY(follower_id, followee_id)
    INDEX(followee_id)

  MEDIA (Object Store):
    Path: /{user_id}/{tweet_id}/{media_id}
```

### Step 5: Draw Architecture → Produce a Component Diagram

List every component and the connections between them. Walk through each use case end-to-end.

```
Example (Twitter-like Service — Post a Tweet):
  Client
    → Load Balancer
      → Web Server (reverse proxy)
        → Write API Server
          → SQL Database (store tweet)
          → Fan-Out Service
            → User Graph Service (get followers from cache)
            → Home Timeline Cache (prepend tweet to each follower's timeline)
            → Search Index Service (index tweet for search)
            → Notification Service → Queue → Push notifications
```

### Step 6: Identify Bottlenecks → Produce a Scaling Plan

For the architecture in Step 5, identify what breaks under the estimated load from Step 2.

```
Example (Twitter-like Service):
  BOTTLENECK 1: Fan-out for users with millions of followers
    - Problem: Fan-out to 10M followers = 10M writes per tweet.
    - Solution: Hybrid approach. Fan-out on write for normal users,
      fan-out on read for celebrity users (merge at read time).
    - Trade-off: Read latency increases slightly for celebrity tweets.

  BOTTLENECK 2: 3M reads/sec on home timeline
    - Problem: SQL cannot handle this read volume.
    - Solution: Serve home timeline from Redis cache. SQL is fallback.
    - Trade-off: Cache miss path is slower (~500ms vs 50ms).

  BOTTLENECK 3: 150 TB/month storage growth
    - Problem: Single database cannot hold this.
    - Solution: Shard tweets by user_id hash. Archive tweets older
      than 30 days to cold storage (S3 + data warehouse).
    - Trade-off: Cross-shard queries are expensive.
```

### Step 7: Address Cross-Cutting Concerns

For the final architecture, verify:
- **Security:** Auth, encryption, rate limiting, input validation.
- **Monitoring:** Metrics, logging, alerting, health checks.
- **Fault tolerance:** What happens when each component fails?

---

## 11. Common HLD Problem Archetypes

### 11.1 URL Shortener / Paste Service

**Key challenges:** Unique ID generation, fast redirect (read-heavy), expiration cleanup.

**Core components:** Write API, Read API, SQL/NoSQL database, object store (for paste content), cache for hot URLs.

**Key decisions:**
- ID generation: MD5/Base62 hash vs. auto-increment + encode vs. distributed ID generator.
- Read optimization: Cache hot URLs, CDN for popular redirects.
- Expiration: Background job scans for expired entries, or TTL on cache + lazy deletion.

### 11.2 Social Media Feed / Timeline

**Key challenges:** Fan-out (delivering posts to followers), read-heavy, personalization/ranking.

**Core components:** Write API, Fan-Out Service, User Graph Service, Timeline Cache (Redis), Search Index, Notification Service.

**Key decisions:**
- Fan-out on write vs. fan-out on read vs. hybrid.
- Timeline storage: pre-computed (cache) vs. computed on demand.
- Celebrity problem: users with millions of followers break fan-out-on-write.

### 11.3 Chat / Messaging System

**Key challenges:** Real-time delivery, message ordering, online presence, group messaging.

**Core components:** WebSocket servers, Message Queue, Chat Service, Presence Service, User Service, Object Store (for media).

**Key decisions:**
- Connection protocol: WebSockets for real-time, with HTTP fallback.
- Message ordering: Timestamp + sequence number per conversation.
- Delivery guarantee: At-least-once with client-side deduplication.
- Group scaling: Small groups (fan-out to all) vs. large groups (pub-sub topic).

### 11.4 File Storage / Sync (Dropbox-like)

**Key challenges:** Large file handling, sync conflicts, bandwidth efficiency.

**Core components:** Block Server (chunking), Metadata Service, Sync Service, Object Store, Notification Service.

**Key decisions:**
- Chunking: Split files into blocks, sync only changed blocks (delta sync).
- Conflict resolution: Last-write-wins vs. branching (save both versions).
- Deduplication: Hash each block, store only unique blocks.

### 11.5 Search Engine

**Key challenges:** Indexing speed, query latency, relevance ranking.

**Core components:** Crawler, Indexer, Index Store (inverted index), Query Service, Ranking Service.

**Key decisions:**
- Index structure: Inverted index (term → list of documents).
- Index partitioning: By document (each shard has full terms for a subset of docs) vs. by term (each shard has all docs for a subset of terms).
- Ranking: TF-IDF, PageRank, ML-based relevance scoring.

### 11.6 E-Commerce / Marketplace

**Key challenges:** Inventory consistency, payment reliability, search, recommendation.

**Core components:** Product Catalog Service, Inventory Service, Cart Service, Order Service, Payment Service, Search Service, Recommendation Service.

**Key decisions:**
- Inventory: Strong consistency required. Use transactions or optimistic locking.
- Payment: Idempotent operations, distributed transaction handling (Saga pattern).
- Search: Separate search index (Elasticsearch), eventual consistency with catalog.

### 11.7 Notification System

**Key challenges:** Multi-channel delivery (push, SMS, email), priority, rate limiting, user preferences.

**Core components:** Notification Service, Channel Adapters (push, SMS, email), Template Service, User Preferences Service, Queue per channel.

**Key decisions:**
- Priority queues: Urgent notifications skip the queue.
- Deduplication: Prevent sending the same notification twice.
- Rate limiting: Per-user, per-channel limits to prevent spam.

### 11.8 Rate Limiter / API Gateway

**Key challenges:** Distributed counting, low latency, accuracy.

**Core components:** API Gateway, Rate Limiter (Redis-backed), Rules Service.

**Key decisions:**
- Algorithm: Token bucket (burst-friendly), leaky bucket (smooth), sliding window (accurate).
- Distributed counting: Use Redis INCR with TTL, or local counters synced periodically.
- Failure mode: If rate limiter is unavailable, fail open (allow all) or fail closed (deny all).

### 11.9 Video / Media Streaming

**Key challenges:** Large file upload, transcoding, adaptive streaming, global delivery.

**Core components:** Upload Service, Transcoding Pipeline (queue + workers), CDN, Metadata Service, Recommendation Service.

**Key decisions:**
- Upload: Chunked upload with resume capability.
- Transcoding: Asynchronous pipeline (queue → workers → multiple resolutions/formats).
- Delivery: Adaptive bitrate streaming (HLS/DASH), CDN for edge delivery.

### 11.10 Distributed Cache

**Key challenges:** Consistency across nodes, eviction, hot key handling.

**Core components:** Cache nodes (Redis/Memcached), Consistent hash ring, Client library.

**Key decisions:**
- Partitioning: Consistent hashing to minimize redistribution.
- Replication: Each key stored on N nodes for fault tolerance.
- Eviction: LRU, LFU, or TTL-based.
- Hot keys: Replicate hot keys across more nodes, or use local caching.

---

## 12. Back-of-the-Envelope Estimation

Every HLD design must include quantitative reasoning. These reference numbers enable quick estimation.

### 12.1 Conversion Constants

```
Seconds in a day:    86,400     ≈ 10^5
Seconds in a month:  2,500,000  ≈ 2.5 × 10^6
Seconds in a year:   31,500,000 ≈ 3 × 10^7

1 request/sec  ≈   2.5 million requests/month
40 req/sec     ≈ 100 million requests/month
400 req/sec    ≈   1 billion requests/month
```

### 12.2 Powers of Two

```
Power   Approx Value      Bytes
-----   -----------       -----
10      1 thousand        1 KB
20      1 million         1 MB
30      1 billion         1 GB
40      1 trillion        1 TB
50      1 quadrillion     1 PB
```

### 12.3 Latency Reference Numbers

```
L1 cache reference .................. 0.5 ns
Branch mispredict ...................   5 ns
L2 cache reference ..................   7 ns
Mutex lock/unlock ...................  25 ns
Main memory reference .............. 100 ns
Compress 1 KB with Zippy .......... 10 μs    (10,000 ns)
Send 1 KB over 1 Gbps network ..... 10 μs
Read 4 KB randomly from SSD ....... 150 μs
Read 1 MB sequentially from memory  250 μs
Round trip within same datacenter .. 500 μs
Read 1 MB sequentially from SSD ...   1 ms
HDD seek ........................... 10 ms
Read 1 MB sequentially from HDD ... 30 ms
Send packet CA → Netherlands → CA . 150 ms
```

**Key takeaways for architecture decisions:**
- Memory is 4x faster than SSD, 80x faster than HDD.
- Network round trip within a datacenter is 0.5ms — cheap but not free.
- Cross-continent round trip is 150ms — expensive, use CDN and local replicas.

### 12.4 Estimation Protocol

For every HLD problem, compute the following:

1. **Daily active users (DAU)** — State or derive from requirements.
2. **Read and write operations per second** — DAU × actions per user per day / 86,400.
3. **Peak multiplier** — Typically 2x-5x average. State your assumption.
4. **Storage per record** — Sum the fields. Include metadata overhead (~20%).
5. **Total storage** — Records per day × record size × retention period.
6. **Bandwidth** — Requests per second × response size.

**Rule:** Show your work. A final number without the derivation is useless. The derivation reveals whether the architecture makes sense.

---

## 13. Architecture Generation Constraints

These are hard rules the agent must follow when producing any HLD artifact.

### 13.1 Diagrams and Descriptions

- Every component must have a **one-sentence description** of its responsibility.
- Every connection between components must state the **protocol** (HTTP, RPC, queue, etc.).
- Every data store must state the **technology category** (SQL, NoSQL/KV, NoSQL/document, cache, object store) and the **reason for the choice**.
- Every asynchronous boundary must be **explicitly marked** (queue icon, dashed line, or label).

### 13.2 Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Services | PascalCase or kebab-case, descriptive | `UserService`, `fan-out-service` |
| APIs | RESTful paths with versioning | `/api/v1/tweets` |
| Databases | Named by domain, not by technology | `users-db`, not `mysql-1` |
| Queues/Topics | Named by event or purpose | `tweet-created`, `notification-queue` |
| Cache keys | Namespaced with colons | `user:123:profile`, `timeline:456` |

### 13.3 Trade-Off Documentation

For every design decision, state:
1. **What** the decision is.
2. **Why** this option was chosen over alternatives.
3. **What is sacrificed** by this choice.

Bad: "Use Redis for caching."
Good: "Use Redis as the timeline cache. Chosen over Memcached because sorted sets enable efficient timeline ordering. Trade-off: Redis is single-threaded, which limits per-node throughput to ~100K ops/sec — mitigated by sharding across multiple Redis instances."

### 13.4 Failure Mode Analysis

For every critical component, state:
1. **What happens when it fails.**
2. **How the failure is detected** (health checks, timeouts, circuit breakers).
3. **How the system recovers** (failover, retry, degraded mode).

**Rule:** If a single component's failure causes total system failure, the design has a single point of failure. Eliminate it or explicitly justify why it is acceptable.

### 13.5 Cost Awareness

- Never propose a solution without considering its cost implications.
- "Shard the database across 100 nodes" is not free. State approximate resource requirements.
- Prefer managed services for operational complexity reduction, but acknowledge vendor lock-in trade-off.

---

## 14. Anti-Patterns and Red Flags

If the agent detects itself producing any of the following, it must stop and redesign.

### 14.1 Premature Scaling

**Symptom:** The initial design includes sharding, multiple caches, CDN, and microservices for a system that serves 1,000 users.

**Fix:** Start with the simplest architecture that satisfies functional requirements. Scale iteratively when bottlenecks are identified.

### 14.2 Missing Capacity Estimation

**Symptom:** The design includes components (caches, queues, multiple databases) without any calculation showing they are needed.

**Fix:** Always estimate load before choosing components. Every component must be justified by the numbers.

### 14.3 Unbounded Growth

**Symptom:** No discussion of data retention, archival, or cleanup. Storage grows forever.

**Fix:** State retention policy for every data store. Hot data in fast storage, cold data in cheap storage, expired data deleted.

### 14.4 Single Point of Failure (Unacknowledged)

**Symptom:** A single database, a single cache, or a single service with no failover, and no discussion of what happens when it dies.

**Fix:** For every component, either add redundancy or explicitly state the impact of its failure and why redundancy is not warranted at current scale.

### 14.5 Monolithic Database at Scale

**Symptom:** A single SQL database handling millions of writes per second with no scaling strategy discussed.

**Fix:** Follow the [database scaling progression](#82-database-scaling-progression).

### 14.6 Synchronous Everything

**Symptom:** Every operation is synchronous request-response, including email sending, image processing, analytics recording.

**Fix:** Any operation that is not on the user's critical path must be asynchronous.

### 14.7 Cache Without Invalidation Strategy

**Symptom:** A cache is introduced but there is no discussion of TTL, invalidation, or what happens when cached data becomes stale.

**Fix:** Every cache entry must have a defined TTL and a stated invalidation strategy.

### 14.8 Technology Name-Dropping Without Justification

**Symptom:** "Use Kafka, Redis, Elasticsearch, and Cassandra" with no explanation of why each is chosen over alternatives.

**Fix:** Every technology choice must state: what problem it solves, why it was chosen over alternatives, and what trade-off it introduces.

### 14.9 Ignoring the Read/Write Ratio

**Symptom:** The same architecture is used for a 1000:1 read-heavy system and a 1:1 balanced system.

**Fix:** Read-heavy and write-heavy systems have fundamentally different architectures. State the ratio and design accordingly.

### 14.10 No API Definition

**Symptom:** Architecture diagram exists but there is no definition of what the system's external interface looks like.

**Fix:** Define the API first. The architecture exists to serve the API.

---

## 15. Quality Checklist

Before finalizing any HLD output, verify every item.

### Requirements Coverage

- [ ] Every functional requirement has a clear request path through the architecture.
- [ ] Every non-functional requirement (latency, availability, consistency) has an architectural element addressing it.
- [ ] Scope boundaries are explicitly stated — what is in and out.
- [ ] Read and write paths are separately defined and optimized.

### Capacity and Scale

- [ ] Back-of-the-envelope estimation is complete (requests/sec, storage, bandwidth).
- [ ] Peak load is estimated (not just average).
- [ ] Every scaling decision is justified by the numbers.
- [ ] Data retention and archival policy is stated.

### Architecture Completeness

- [ ] Every component has a stated responsibility.
- [ ] Every connection states its protocol.
- [ ] Every data store states its technology choice with justification.
- [ ] API is defined before architecture.
- [ ] Data model / schema is defined.
- [ ] At least one use case is walked through end-to-end (request to response).

### Trade-Offs

- [ ] CAP position is stated for each data store.
- [ ] Consistency model is stated (strong, eventual, weak).
- [ ] Availability target is stated with corresponding redundancy strategy.
- [ ] Every design decision states what is sacrificed.

### Scaling

- [ ] Architecture starts simple and scales iteratively (not fully distributed from step one).
- [ ] Bottlenecks are identified and addressed with specific solutions.
- [ ] Database scaling follows the progression (optimize → replicate → cache → federate → shard).
- [ ] All services that need horizontal scaling are stateless.

### Caching

- [ ] Cache location is specified (client, CDN, app, DB).
- [ ] Cache update strategy is specified (cache-aside, write-through, etc.).
- [ ] TTL is defined for every cache.
- [ ] Cache failure mode is addressed.

### Asynchronous Processing

- [ ] Any operation outside the critical path is asynchronous.
- [ ] Queues have bounded sizes with back pressure defined.
- [ ] Failure handling is defined (dead-letter queues, retries).

### Security

- [ ] Encryption in transit (TLS) for all communication.
- [ ] Encryption at rest for all data stores.
- [ ] Input validation at the API boundary.
- [ ] Authentication and authorization enforced server-side.
- [ ] Rate limiting on all public APIs.
- [ ] Network isolation (VPC, private subnets for internal components).

### Fault Tolerance

- [ ] Every critical component has a failover strategy or accepted failure impact.
- [ ] No unacknowledged single points of failure.
- [ ] Health checks and monitoring are mentioned.
- [ ] Circuit breakers or timeouts on all inter-service calls.

### Documentation Quality

- [ ] All trade-offs are explicit (not just "use X").
- [ ] All technology choices have justification.
- [ ] Estimation shows derivation, not just final numbers.
- [ ] The design is iterative — starts simple, adds complexity with justification.

---

## References

- [System Design Primer — donnemartin](https://github.com/donnemartin/system-design-primer)
- [Scalability Lecture — Harvard CS75](https://www.youtube.com/watch?v=UF9Imi6A-PE)
- [CAP Theorem Revisited](https://robertgreiner.com/cap-theorem-revisited/)
- [Latency Numbers Every Programmer Should Know](https://gist.github.com/jboner/2841832)
- [High Scalability](http://highscalability.com/)
- [AWS Architecture Center](https://aws.amazon.com/architecture/)
- [Google Cloud Architecture Framework](https://cloud.google.com/architecture/framework)
- [Martin Fowler — Patterns of Distributed Systems](https://martinfowler.com/articles/patterns-of-distributed-systems/)
- [Designing Data-Intensive Applications — Martin Kleppmann](https://dataintensive.net/)

---

*This guide is designed to be consumed by AI code-generation agents as a pre-processing step before any HLD task. It is language-agnostic, cloud-agnostic, and project-agnostic. When in conflict with a task-specific instruction, the task-specific instruction takes precedence.*
