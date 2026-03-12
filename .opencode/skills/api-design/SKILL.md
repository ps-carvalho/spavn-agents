---
name: api-design
description: REST, GraphQL, gRPC, and WebSocket API design patterns, versioning, documentation, and industry guidelines
license: Apache-2.0
compatibility: opencode
---

# API Design Skill

This skill provides patterns and best practices for designing consistent, scalable, and developer-friendly APIs.

## When to Use

Use this skill when:
- Designing new APIs or refactoring existing ones
- Choosing between REST, GraphQL, gRPC, or WebSocket
- Implementing versioning, pagination, or error handling
- Writing API documentation with OpenAPI/Swagger
- Applying industry API design guidelines

## API Paradigm Selection

| Paradigm | Best For | Trade-offs |
|----------|----------|------------|
| REST | CRUD APIs, public APIs, broad client support | Over/under-fetching, multiple roundtrips |
| GraphQL | Complex data graphs, mobile clients, BFF | Complexity, caching difficulty, N+1 risk |
| gRPC | Service-to-service, high performance, streaming | Browser support limited, harder debugging |
| WebSocket | Real-time bidirectional communication | Connection management, no built-in request/response |

## REST API Design

### Resource Naming
- Use nouns, not verbs — `/users`, not `/getUsers`
- Plural for collections — `/users`, `/orders`
- Nested for relationships — `/users/{id}/orders`
- Kebab-case for multi-word — `/order-items`
- Maximum 3 levels of nesting — flatten beyond that

### HTTP Methods
| Method | Purpose | Idempotent | Safe |
|--------|---------|:----------:|:----:|
| GET | Retrieve resource(s) | Yes | Yes |
| POST | Create resource | No | No |
| PUT | Full update (replace) | Yes | No |
| PATCH | Partial update | No* | No |
| DELETE | Remove resource | Yes | No |

### Response Status Codes
```
Success:
  200 OK           — Successful GET, PUT, PATCH, DELETE
  201 Created      — Successful POST (include Location header)
  204 No Content   — Successful DELETE with no body

Client Errors:
  400 Bad Request  — Malformed syntax, invalid parameters
  401 Unauthorized — Missing/invalid authentication
  403 Forbidden    — Valid auth, insufficient permissions
  404 Not Found    — Resource doesn't exist
  409 Conflict     — Resource conflict (duplicate, version)
  422 Unprocessable — Semantic validation failure
  429 Too Many     — Rate limit exceeded

Server Errors:
  500 Internal     — Unexpected server failure
  502 Bad Gateway  — Upstream service failure
  503 Unavailable  — Temporarily overloaded or in maintenance
```

### HATEOAS (Hypermedia)
- Include links to related resources and actions
- Use `_links` or `links` object in responses
- Enables discoverability — clients follow links, not hardcode URLs
- Optional but valuable for public APIs

## GraphQL

### Schema Design
```graphql
type Query {
  user(id: ID!): User
  users(filter: UserFilter, first: Int, after: String): UserConnection!
}

type User {
  id: ID!
  name: String!
  email: String!
  orders(first: Int): OrderConnection!
}

# Relay-style pagination
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
}
```

### Best Practices
- Design schema from client needs, not database structure
- Use input types for mutations — clear separation of concerns
- Implement Relay-style cursor pagination for lists
- Use DataLoader to batch and deduplicate database queries (N+1 prevention)
- Set query complexity limits to prevent abuse
- Use persisted queries for production — security and performance

### When to Use Mutations vs Queries
- Queries for all read operations — cacheable, safe
- Mutations for writes — clearly express intent with verb naming
- Subscriptions for real-time — push updates to connected clients

## gRPC

### Service Definition
```protobuf
syntax = "proto3";

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc StreamUpdates(StreamRequest) returns (stream UserEvent);
}

message User {
  string id = 1;
  string name = 2;
  string email = 3;
  google.protobuf.Timestamp created_at = 4;
}
```

### Streaming Patterns
| Pattern | Description | Use Case |
|---------|-------------|----------|
| Unary | Single request, single response | Standard RPC calls |
| Server streaming | Single request, stream of responses | Real-time feeds, logs |
| Client streaming | Stream of requests, single response | File uploads, bulk data |
| Bidirectional | Stream both directions | Chat, collaborative editing |

### Best Practices
- Use Protocol Buffers for schema evolution (field numbers are stable)
- Implement deadlines/timeouts on every call
- Use interceptors for logging, auth, and metrics (like middleware)
- Prefer gRPC for internal service-to-service communication
- Use gRPC-Web or Connect for browser clients

## WebSocket

### Connection Lifecycle
```
Client                    Server
  |--- HTTP Upgrade ------->|
  |<-- 101 Switching -------|
  |                         |
  |<== Bidirectional ==>    |
  |    messages             |
  |                         |
  |--- Close frame -------->|
  |<-- Close frame ---------|
```

### Message Patterns
- **Pub/Sub** — Clients subscribe to topics, server broadcasts
- **Request/Response** — Client sends request with ID, server responds with matching ID
- **Event streaming** — Server pushes events as they occur

### Best Practices
- Implement heartbeat/ping-pong for connection health
- Handle reconnection with exponential backoff
- Use message framing — JSON or binary with type field
- Authenticate on connection (token in query or first message)
- Consider Server-Sent Events (SSE) for server-to-client only

## API Versioning

| Strategy | Example | Pros | Cons |
|----------|---------|------|------|
| URL path | `/v1/users` | Simple, explicit | URL proliferation |
| Header | `Accept: application/vnd.api+json;v=2` | Clean URLs | Less discoverable |
| Query param | `/users?version=2` | Easy to test | Clutters params |

### Versioning Best Practices
- Version from day one — even if only `v1`
- Use URL path versioning for public APIs (most common)
- Use header versioning for internal APIs
- Support at most 2 major versions simultaneously
- Deprecation timeline — announce 6+ months before sunset
- Non-breaking changes don't require new version (additive fields)

## Pagination

### Cursor-Based (Recommended)
```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTAwfQ==",
    "has_more": true
  }
}
```
- Stable under inserts/deletes
- Efficient with indexed columns
- Best for infinite scroll, real-time data

### Offset-Based
```json
{
  "data": [...],
  "pagination": {
    "total": 250,
    "page": 2,
    "per_page": 25
  }
}
```
- Simpler to implement
- Supports "jump to page"
- Inconsistent under concurrent writes

## Filtering & Sorting

### Filtering Patterns
```
GET /users?status=active&role=admin         # Simple equality
GET /users?created_after=2024-01-01         # Range filters
GET /users?search=john                       # Full-text search
GET /users?filter[status]=active             # JSON:API style
```

### Sorting
```
GET /users?sort=name                # Ascending (default)
GET /users?sort=-created_at         # Descending (prefix -)
GET /users?sort=status,-created_at  # Multi-field sort
```

## Error Responses

### RFC 7807 Problem Details
```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "The email field is not a valid email address.",
  "instance": "/users",
  "errors": [
    {
      "field": "email",
      "message": "Must be a valid email address",
      "code": "INVALID_FORMAT"
    }
  ]
}
```

### Error Design Principles
- Use consistent error format across all endpoints
- Include machine-readable error codes
- Provide human-readable messages
- Include field-level details for validation errors
- Never expose stack traces or internal details in production

## Rate Limiting

### Algorithms
| Algorithm | How It Works | Best For |
|-----------|-------------|----------|
| Token bucket | Tokens added at fixed rate, consumed per request | Burst-tolerant APIs |
| Sliding window | Count requests in rolling time window | Strict rate enforcement |
| Fixed window | Count resets at interval boundaries | Simple implementation |

### Response Headers
```
X-RateLimit-Limit: 100          # Max requests per window
X-RateLimit-Remaining: 45       # Requests left
X-RateLimit-Reset: 1640000000   # Window reset time (Unix)
Retry-After: 30                 # Seconds to wait (on 429)
```

## Laravel API Patterns

### API Resources (Response Transformation)
```php
// Transform Eloquent models into consistent JSON responses
class UserResource extends JsonResource {
    public function toArray(Request $request): array {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'orders_count' => $this->when($this->orders_count !== null, $this->orders_count),
            'created_at' => $this->created_at->toISOString(),
        ];
    }
}

// Collection with pagination
return UserResource::collection(User::paginate(25));
```

### Laravel API Best Practices
- **API Resources** — Never return Eloquent models directly; use Resources for consistent shape
- **Form Requests** — Validate and authorize in dedicated request classes
- **Sanctum** — Token-based auth for SPAs and mobile (lightweight alternative to Passport)
- **Passport** — Full OAuth2 server for third-party API access
- **API versioning** — Use route prefixes (`/api/v1/`) or header-based
- **Rate limiting** — Built-in via `RateLimiter` facade and `throttle` middleware
- **Scribe / Scramble** — Auto-generate API docs from code annotations

## Documentation

### OpenAPI / Swagger
- Design API-first — write spec before code
- Include request/response examples for every endpoint
- Document all error responses, not just success
- Use `$ref` for reusable schemas
- Generate client SDKs from spec (openapi-generator)

### Documentation Best Practices
- Interactive docs (Swagger UI, Stoplight, Redoc)
- Include authentication setup and getting started guide
- Provide runnable examples (cURL, SDK snippets)
- Changelog for API changes
- Status page for API health

## Industry Guidelines Summary

### Microsoft REST API Guidelines
- Use JSON as default format
- Collections return `{ value: [...] }` wrapper
- Support `$filter`, `$orderby`, `$top`, `$skip` OData conventions
- Long-running operations return `202 Accepted` with status URL

### Google API Design Guide
- Resource-oriented design
- Standard methods: List, Get, Create, Update, Delete
- Custom methods via `:verb` suffix — `POST /users/{id}:activate`
- Use field masks for partial updates
- Consistent naming: camelCase for fields, kebab-case for URLs

### Zalando RESTful Guidelines
- Must use lowercase with hyphens for path segments
- Must use snake_case for query parameters and JSON fields
- Must support pagination for collection resources
- Must use problem JSON (RFC 7807) for errors
