---
name: backend-development
description: Server architecture, framework patterns, data access, caching, authentication, and error handling for backend applications
license: Apache-2.0
compatibility: opencode
---

# Backend Development Skill

This skill provides patterns and best practices for building robust backend applications and services.

## When to Use

Use this skill when:
- Building APIs or server-side applications
- Choosing a backend framework or architecture
- Implementing data access layers, caching, or auth
- Setting up middleware, error handling, or background processing
- Designing server architecture for scalability

## Server Architecture

### Layered Architecture
```
┌──────────────────────────┐
│   Routes / Controllers   │  ← HTTP handling, validation
├──────────────────────────┤
│   Services / Use Cases   │  ← Business logic
├──────────────────────────┤
│   Repositories / DAL     │  ← Data access
├──────────────────────────┤
│   Database / External    │  ← Persistence, third-party
└──────────────────────────┘
```

### Key Principles
- Separate concerns — routes, business logic, data access in distinct layers
- Dependency injection — invert dependencies for testability
- Single responsibility — each module handles one concern
- Fail fast — validate inputs at the boundary
- Configuration via environment — never hardcode secrets or URLs

## Framework Patterns

### Node.js

**Express** — Minimal, middleware-based
```typescript
// Layered Express app structure
src/
  routes/        // Route definitions, input validation
  middleware/    // Auth, logging, error handling
  services/     // Business logic
  repositories/ // Database queries
  models/       // Type definitions, schemas
  utils/        // Shared utilities
  app.ts        // Express app setup
  server.ts     // Server startup
```

**Fastify** — Performance-focused, schema-based validation
- Use JSON Schema for request/response validation (built-in)
- Plugin system for encapsulated modules
- Decorators for extending request/reply

**NestJS** — Opinionated, Angular-inspired
- Modules for feature encapsulation
- Decorators for routing, validation, guards
- Built-in DI container
- Pipes, Guards, Interceptors for request pipeline

### Python

**FastAPI** — Modern, async, type-driven
- Pydantic models for validation and serialization
- Dependency injection via `Depends()`
- Auto-generated OpenAPI docs
- Background tasks with `BackgroundTasks`
- Async database with SQLAlchemy + asyncpg

**Django** — Batteries-included, ORM-centric
- Models define schema and business rules
- Class-based views for CRUD operations
- Django REST Framework for API endpoints
- Admin interface for quick data management
- Middleware pipeline for cross-cutting concerns

### Go

**Gin/Echo** — Fast, minimal HTTP frameworks
- Handler functions with context
- Middleware chains for cross-cutting concerns
- Struct tags for binding and validation
- Goroutines for concurrent processing

```go
// Clean handler pattern in Go
func (h *UserHandler) GetUser(c *gin.Context) {
    id := c.Param("id")
    user, err := h.service.FindByID(c.Request.Context(), id)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
        return
    }
    c.JSON(http.StatusOK, user)
}
```

### PHP

**Laravel** — Full-featured, elegant, batteries-included
```php
// Layered Laravel app structure
app/
  Http/
    Controllers/   // Route handlers, form requests
    Middleware/     // Auth, CORS, rate limiting
    Requests/       // Form request validation
    Resources/      // API resource transformations
  Models/           // Eloquent models
  Services/         // Business logic
  Repositories/     // Data access abstraction (optional)
  Jobs/             // Queued background jobs
  Events/           // Domain events
  Listeners/        // Event handlers
  Policies/         // Authorization logic
routes/
  api.php           // API routes
  web.php           // Web routes
```

- Service container for dependency injection (auto-resolving)
- Middleware pipeline (global, route groups, per-route)
- Eloquent ORM with expressive Active Record pattern
- Artisan CLI for code generation, migrations, and tasks
- Built-in auth scaffolding (Breeze, Jetstream, Fortify)

**Symfony** — Enterprise-grade, component-based
- Bundle architecture for modular features
- Doctrine ORM (Data Mapper pattern)
- Flex for automated package configuration
- Powerful DI container and event dispatcher
- Strong enterprise and long-term support tradition

### Rust

**Actix Web / Axum** — Type-safe, async, performant
- Extractors for type-safe request parsing
- Tower middleware (Axum) for composable layers
- Strong type system prevents runtime errors
- Shared state via Arc<AppState>

## Middleware & Request Pipeline

### Common Middleware Stack (in order)
1. **Request ID** — Generate unique ID for tracing
2. **Logging** — Log request method, path, duration
3. **CORS** — Configure allowed origins, methods, headers
4. **Rate limiting** — Protect against abuse (token bucket, sliding window)
5. **Authentication** — Verify JWT/session/API key
6. **Authorization** — Check permissions for resource
7. **Validation** — Validate request body, params, query
8. **Handler** — Execute business logic
9. **Error handler** — Catch and format errors consistently

### Middleware Best Practices
- Keep middleware focused — one concern each
- Order matters — auth before authorization, logging first
- Short-circuit early — return 401/403 before processing
- Use async middleware for I/O-bound operations

## Data Access

### Repository Pattern
```typescript
// Abstract data access behind interfaces
interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserDTO): Promise<User>;
  update(id: string, data: UpdateUserDTO): Promise<User>;
  delete(id: string): Promise<void>;
}

// Implement with your ORM of choice
class PrismaUserRepository implements UserRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
  // ...
}
```

### ORM Selection Guide
| ORM | Language | Style | Best For |
|-----|----------|-------|----------|
| Prisma | TypeScript | Schema-first, type-safe | New Node.js projects |
| Drizzle | TypeScript | SQL-like, lightweight | Performance-critical |
| SQLAlchemy | Python | Flexible, powerful | Complex queries |
| Django ORM | Python | Active Record | Django projects |
| Eloquent | PHP | Active Record, expressive | Laravel projects |
| Doctrine | PHP | Data Mapper, enterprise | Symfony projects |
| GORM | Go | Convention-based | Go web apps |
| Diesel | Rust | Compile-time checked | Rust applications |

### Query Best Practices
- Use parameterized queries — never string concatenation
- Eager load relations to avoid N+1 queries
- Paginate large result sets — cursor or offset-based
- Use transactions for multi-step writes
- Index frequently queried columns

## Caching Strategies

| Strategy | How It Works | Use Case |
|----------|-------------|----------|
| Cache-aside | App checks cache, falls back to DB | General purpose |
| Read-through | Cache loads from DB on miss | Transparent caching |
| Write-through | Write to cache and DB simultaneously | Consistency-critical |
| Write-behind | Write to cache, async write to DB | High write throughput |

### Implementation Patterns
- **Redis** for distributed cache — sessions, rate limiting, computed results
- **In-memory** (Map/LRU) for hot local data — config, feature flags
- **CDN** for static assets and API responses with proper Cache-Control
- **HTTP caching** — ETag, Last-Modified, Cache-Control headers

### Cache Invalidation
- TTL-based — set reasonable expiry times
- Event-based — invalidate on write operations
- Version-based — include version in cache key
- Pattern: `cache:${entity}:${id}:${version}`

## Authentication & Authorization

### Authentication Methods
| Method | Stateless | Best For |
|--------|-----------|----------|
| JWT (access + refresh) | Yes | SPAs, mobile apps |
| Session cookies | No | Traditional web apps |
| API keys | Yes | Service-to-service |
| OAuth 2.0 / OIDC | Yes | Third-party login |

### JWT Best Practices
- Short-lived access tokens (15 min) + long-lived refresh tokens
- Use RS256 or ES256 (asymmetric) over HS256 for distributed systems
- Store refresh tokens in httpOnly cookies (not localStorage)
- Implement token rotation on refresh
- Include minimal claims — don't put sensitive data in payload

### Authorization Patterns
- **RBAC** (Role-Based) — user has roles, roles have permissions
- **ABAC** (Attribute-Based) — policies based on user/resource attributes
- **Resource-based** — check ownership before access
- Centralize authorization logic — use middleware or decorators

## Error Handling

### Consistent Error Response
```typescript
// Standardized error response (RFC 7807 inspired)
interface ErrorResponse {
  status: number;       // HTTP status code
  code: string;         // Machine-readable error code
  message: string;      // Human-readable description
  details?: unknown;    // Validation errors, context
  requestId?: string;   // For support/debugging
}
```

### HTTP Status Code Guide
| Code | Meaning | Use When |
|------|---------|----------|
| 400 | Bad Request | Validation failure, malformed input |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate, version conflict |
| 422 | Unprocessable | Semantic validation failure |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Unexpected server failure |

### Error Handling Best Practices
- Catch errors at the boundary — global error handler middleware
- Log errors with context (request ID, user, stack trace)
- Never expose internal details to clients in production
- Use custom error classes for business logic errors
- Return actionable error messages when possible

## Background Processing

### Job Queue Patterns
- **Laravel Queues** (PHP) — Redis/SQS/database drivers, retries, rate limiting, Horizon dashboard
- **BullMQ** (Node.js) — Redis-based, reliable, with retry and scheduling
- **Celery** (Python) — Distributed task queue with multiple brokers
- **Temporal** — Durable workflow orchestration (any language)
- **Asynq** (Go) — Simple Redis-based task queue

### Common Use Cases
- Email sending and notifications
- Image/video processing
- Report generation
- Data imports/exports
- Webhook delivery with retry

### Best Practices
- Idempotent jobs — safe to retry on failure
- Dead letter queue for permanently failed jobs
- Monitor queue depth and processing latency
- Set appropriate timeouts and retry limits
- Log job lifecycle (enqueued, started, completed, failed)

## Technology Recommendations

### By Use Case
| Use Case | Recommended Stack |
|----------|-------------------|
| REST API (TypeScript) | Fastify + Prisma + Redis |
| REST API (Python) | FastAPI + SQLAlchemy + Redis |
| REST API (PHP) | Laravel + Eloquent + Redis |
| Full-stack web (PHP) | Laravel + Livewire or Inertia.js |
| GraphQL API | NestJS + Apollo + Prisma |
| Microservice | Go + Gin + gRPC + NATS |
| Full-stack web (JS) | Next.js API routes or Django |
| High-performance | Rust + Axum + SQLx |
| Enterprise (PHP) | Laravel + Horizon + Octane |
| Enterprise (TS) | NestJS + TypeORM + BullMQ |
