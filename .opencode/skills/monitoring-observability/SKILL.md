---
name: monitoring-observability
description: Structured logging, metrics instrumentation, distributed tracing, health checks, and alerting patterns
license: Apache-2.0
compatibility: opencode
---

# Monitoring & Observability Skill

This skill provides patterns for making applications observable in production through logging, metrics, tracing, and alerting.

## When to Use

Use this skill when:
- Adding logging to new features or services
- Instrumenting code with metrics (counters, histograms, gauges)
- Implementing distributed tracing across services
- Designing health check endpoints
- Setting up alerting and SLO definitions
- Debugging production issues through observability data

## The Three Pillars of Observability

### 1. Logs — What Happened
Structured, contextual records of discrete events.

### 2. Metrics — How Much / How Fast
Numeric measurements aggregated over time.

### 3. Traces — The Journey
End-to-end request paths across service boundaries.

## Structured Logging

### Principles
- **Always use structured logging** (JSON) — never unstructured `console.log` in production
- **Log levels matter**: ERROR (action needed), WARN (degraded), INFO (business events), DEBUG (development)
- **Include context**: correlation IDs, user IDs, request IDs, operation names
- **Never log secrets**: passwords, tokens, PII, credit card numbers

### Log Levels Guide

| Level | When to Use | Example |
|-------|-------------|---------|
| **ERROR** | Something failed and needs attention | Database connection lost, payment failed |
| **WARN** | Degraded but still functioning | Cache miss fallback, retry attempt, rate limit approaching |
| **INFO** | Significant business events | User signed up, order placed, deployment completed |
| **DEBUG** | Development/troubleshooting detail | SQL query executed, cache hit/miss, function entry/exit |

### Structured Log Format

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Order placed successfully",
  "service": "order-service",
  "traceId": "abc123",
  "spanId": "def456",
  "userId": "user_789",
  "orderId": "order_012",
  "amount": 99.99,
  "currency": "USD",
  "duration_ms": 145
}
```

### Correlation IDs
- Generate a unique request ID at the entry point (API gateway, load balancer)
- Propagate it through all downstream calls via headers (`X-Request-ID`, `traceparent`)
- Include it in every log line for cross-service correlation

### What to Log

**DO log:**
- Request/response boundaries (method, path, status, duration)
- Business events (user actions, state transitions, transactions)
- Error details with stack traces and context
- Performance-relevant data (query times, cache hit rates)
- Security events (auth failures, permission denials, rate limits)

**DO NOT log:**
- Passwords, tokens, API keys, secrets
- Full credit card numbers, SSNs, or PII without masking
- High-frequency debug data in production (use sampling)
- Request/response bodies containing sensitive data

## Metrics Instrumentation

### Metric Types

| Type | Use Case | Example |
|------|----------|---------|
| **Counter** | Monotonically increasing value | Total requests, errors, orders placed |
| **Gauge** | Value that goes up and down | Active connections, queue depth, memory usage |
| **Histogram** | Distribution of values | Request latency, response size, batch processing time |
| **Summary** | Pre-calculated quantiles | P50/P95/P99 latency (client-side) |

### Naming Conventions
- Use snake_case: `http_requests_total`, `request_duration_seconds`
- Include units in the name: `_seconds`, `_bytes`, `_total`
- Use `_total` suffix for counters
- Prefix with service/subsystem: `api_http_requests_total`

### Key Metrics to Track

**RED Method (Request-driven services):**
- **R**ate — Requests per second
- **E**rrors — Error rate (4xx, 5xx)
- **D**uration — Request latency distribution

**USE Method (Resource-oriented):**
- **U**tilization — % of resource capacity used
- **S**aturation — Queue depth, backpressure
- **E**rrors — Error count per resource

### Cardinality Warning
- Avoid high-cardinality labels (user IDs, request IDs, URLs with path params)
- Keep label combinations < 1000 per metric
- Use bounded values: HTTP methods (GET, POST), status codes (2xx, 4xx, 5xx), endpoints (normalized)

## Distributed Tracing

### OpenTelemetry Patterns
- **Span** — A single operation within a trace (e.g., HTTP request, DB query, function call)
- **Trace** — A tree of spans representing an end-to-end request
- **Context Propagation** — Passing trace context across service boundaries via headers

### What to Trace
- HTTP requests (client and server)
- Database queries
- Cache operations
- Message queue publish/consume
- External API calls
- Significant business operations

### Span Attributes
```
http.method: GET
http.url: /api/users/123
http.status_code: 200
db.system: postgresql
db.statement: SELECT * FROM users WHERE id = $1
messaging.system: kafka
messaging.destination: orders
```

### Sampling Strategies
- **Head-based sampling**: Decide at trace start (e.g., sample 10% of requests)
- **Tail-based sampling**: Decide after trace completes (keep errors, slow requests, sample normal)
- **Priority sampling**: Always sample errors, high-value transactions; sample routine requests

## Health Check Endpoints

### Liveness vs Readiness

| Check | Purpose | Failure Action |
|-------|---------|----------------|
| **Liveness** (`/healthz`) | Is the process alive? | Restart the container |
| **Readiness** (`/readyz`) | Can it serve traffic? | Remove from load balancer |
| **Startup** (`/startupz`) | Has it finished initializing? | Wait before liveness checks |

### Health Check Response Format
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "healthy", "latency_ms": 5 },
    "cache": { "status": "healthy", "latency_ms": 1 },
    "external_api": { "status": "degraded", "latency_ms": 2500, "message": "Slow response" }
  },
  "version": "1.2.3",
  "uptime_seconds": 86400
}
```

### Best Practices
- Health checks should be **fast** (< 1 second)
- Liveness should check the process only — NOT external dependencies
- Readiness should check critical dependencies (database, cache)
- Return appropriate HTTP status: 200 (healthy), 503 (unhealthy)
- Include dependency health in readiness but not liveness

## Alerting & SLOs

### SLO Definitions
- **SLI** (Service Level Indicator): The metric you measure (e.g., request latency P99)
- **SLO** (Service Level Objective): The target (e.g., P99 latency < 500ms for 99.9% of requests)
- **Error Budget**: Allowable failures (e.g., 0.1% of requests can exceed 500ms)

### Alert Design Principles
- **Alert on symptoms, not causes** — Alert on "users can't log in", not "CPU is high"
- **Alert on SLO burn rate** — Alert when error budget is being consumed too fast
- **Avoid alert fatigue** — Every alert should require human action
- **Include runbook links** — Every alert should link to resolution steps

### Severity Levels

| Severity | Response Time | Example |
|----------|--------------|---------|
| **P1 — Critical** | Immediate (< 5 min) | Service down, data loss, security breach |
| **P2 — High** | Within 1 hour | Degraded performance, partial outage |
| **P3 — Medium** | Within 1 business day | Non-critical feature broken, elevated error rate |
| **P4 — Low** | Next sprint | Performance degradation, tech debt alert |

### Useful Alert Patterns
- Error rate exceeds N% for M minutes
- Latency P99 exceeds threshold for M minutes
- Error budget burn rate > 1x for 1 hour (fast burn)
- Error budget burn rate > 0.1x for 6 hours (slow burn)
- Queue depth exceeds threshold (backpressure)
- Certificate expiry within N days
- Disk usage exceeds N%

## Technology Selection

### Logging
- **Node.js**: pino, winston, bunyan
- **Python**: structlog, python-json-logger
- **Go**: zerolog, zap, slog (stdlib)
- **Rust**: tracing, log + env_logger

### Metrics
- **Prometheus** — Pull-based, widely adopted, great with Kubernetes
- **StatsD/Datadog** — Push-based, hosted
- **OpenTelemetry Metrics** — Vendor-neutral, emerging standard

### Tracing
- **OpenTelemetry** — Vendor-neutral standard (recommended)
- **Jaeger** — Open-source trace backend
- **Zipkin** — Lightweight trace backend

### Dashboards
- **Grafana** — Open-source, works with Prometheus/Loki/Tempo
- **Datadog** — Hosted all-in-one
- **New Relic** — Hosted APM

## Checklist

When adding observability to a feature:
- [ ] Structured logging with correlation IDs at request boundaries
- [ ] Error logging with stack traces and context
- [ ] Business event logging (significant state changes)
- [ ] RED metrics for request-driven endpoints
- [ ] Histogram for latency-sensitive operations
- [ ] Trace spans for cross-service calls and database queries
- [ ] Health check endpoint updated if new dependency added
- [ ] No secrets or PII in logs
- [ ] Appropriate log levels (not everything is INFO)
- [ ] Dashboard updated with new metrics
- [ ] Alerts defined for SLO violations
