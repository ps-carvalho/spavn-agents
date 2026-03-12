---
name: database-design
description: Schema design, normalization, indexing, SQL and NoSQL patterns, ORM strategies, migrations, and caching layers
license: Apache-2.0
compatibility: opencode
---

# Database Design Skill

This skill provides patterns and best practices for designing, optimizing, and managing databases.

## When to Use

Use this skill when:
- Designing database schemas for new applications
- Optimizing slow queries or improving performance
- Choosing between SQL and NoSQL databases
- Setting up ORM patterns and migration strategies
- Implementing caching layers

## Database Selection Guide

| Database | Type | Best For |
|----------|------|----------|
| PostgreSQL | Relational | Complex queries, ACID, JSON support, full-text search |
| MySQL | Relational | Web applications, read-heavy workloads |
| SQLite | Relational | Embedded, mobile, local development, single-writer |
| MongoDB | Document | Flexible schemas, rapid prototyping, content management |
| Redis | Key-Value | Caching, sessions, rate limiting, pub/sub, leaderboards |
| Cassandra | Wide-Column | High write throughput, time-series, globally distributed |
| Neo4j | Graph | Social networks, recommendations, knowledge graphs |
| Elasticsearch | Search | Full-text search, log analytics, geo-spatial queries |
| DynamoDB | Key-Value/Doc | Serverless, predictable performance, AWS-native |
| ClickHouse | Columnar | Analytics, OLAP, real-time reporting |

## Relational Design

### Normalization

| Form | Rule | Example |
|------|------|---------|
| 1NF | Atomic values, no repeating groups | Split `tags: "a,b,c"` into separate rows |
| 2NF | 1NF + no partial dependencies | Move non-key attributes that depend only on part of composite key |
| 3NF | 2NF + no transitive dependencies | Move `city → state` to a separate table |

### When to Denormalize
- Read-heavy workloads where joins are expensive
- Reporting/analytics tables (materialized views)
- Caching computed values that change infrequently
- Always measure first — premature denormalization adds complexity

### Schema Design Best Practices
```sql
-- Good: clear naming, constraints, timestamps
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) NOT NULL UNIQUE,
    name        VARCHAR(100) NOT NULL,
    role        VARCHAR(20) NOT NULL DEFAULT 'user'
                CHECK (role IN ('user', 'admin', 'moderator')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for common queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role) WHERE role != 'user';
```

### Naming Conventions
- Tables: plural, snake_case (`order_items`, `user_roles`)
- Columns: snake_case, descriptive (`created_at`, not `ca`)
- Primary keys: `id` (or `{table}_id` for clarity)
- Foreign keys: `{referenced_table}_id` (`user_id`, `order_id`)
- Indexes: `idx_{table}_{columns}` (`idx_users_email`)
- Constraints: `chk_{table}_{column}`, `uq_{table}_{column}`

## Indexing

### Index Types (PostgreSQL)
| Type | Use Case |
|------|----------|
| B-tree (default) | Equality, range, sorting, LIKE 'prefix%' |
| Hash | Equality only (rarely needed, B-tree covers this) |
| GIN | Arrays, JSONB, full-text search |
| GiST | Geometry, ranges, full-text search |
| BRIN | Large sequential tables (time-series, logs) |

### Indexing Best Practices
- Index columns used in WHERE, JOIN, ORDER BY
- Composite indexes: put high-selectivity columns first
- Partial indexes to index only relevant rows
- Covering indexes to avoid table lookups
- Don't over-index — each index slows writes and uses storage

```sql
-- Composite index for common query pattern
CREATE INDEX idx_orders_user_status
    ON orders(user_id, status);

-- Partial index for active records only
CREATE INDEX idx_users_active_email
    ON users(email) WHERE deleted_at IS NULL;

-- Covering index (includes all needed columns)
CREATE INDEX idx_products_category_price
    ON products(category_id, price)
    INCLUDE (name, image_url);
```

### Index Analysis
```sql
-- Check if queries use indexes
EXPLAIN ANALYZE SELECT * FROM users WHERE email = 'test@example.com';

-- Find unused indexes
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelname NOT LIKE 'pg_%';
```

## Query Optimization

### Common Performance Issues
| Issue | Symptom | Solution |
|-------|---------|----------|
| Missing index | Sequential scan on large table | Add appropriate index |
| N+1 queries | Hundreds of queries for one page | Eager load relations |
| SELECT * | Fetching unused columns | Select only needed columns |
| Large offset | Slow pagination (`OFFSET 10000`) | Use cursor-based pagination |
| Cartesian join | Exploding row count | Check JOIN conditions |
| Missing WHERE | Full table scan | Add filter conditions |

### Query Patterns
```sql
-- Cursor-based pagination (fast, stable)
SELECT * FROM orders
WHERE created_at < :last_cursor
ORDER BY created_at DESC
LIMIT 25;

-- Avoiding N+1 with JOIN
SELECT u.*, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id;

-- Upsert (INSERT or UPDATE)
INSERT INTO user_settings (user_id, key, value)
VALUES (:user_id, :key, :value)
ON CONFLICT (user_id, key)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

## NoSQL Patterns

### MongoDB (Document)
- **Embed** when data is accessed together and doesn't grow unbounded
- **Reference** when data is accessed independently or is large
- Schema validation with JSON Schema for data integrity
- Use compound indexes for common query patterns
```javascript
// Embed: address always accessed with user
{
  _id: ObjectId("..."),
  name: "John",
  address: { street: "123 Main", city: "NYC" }  // embedded
}

// Reference: orders queried independently
{
  _id: ObjectId("..."),
  user_id: ObjectId("..."),  // reference to users collection
  items: [...]
}
```

### Redis Patterns
| Pattern | Structure | Use Case |
|---------|-----------|----------|
| Cache | `cache:user:{id}` → JSON | Query result caching |
| Session | `session:{token}` → hash | User session data |
| Rate limit | `ratelimit:{ip}:{window}` → counter | API rate limiting |
| Queue | List with LPUSH/BRPOP | Simple job queue |
| Leaderboard | Sorted set | Rankings, top-N queries |
| Pub/Sub | Channel subscription | Real-time notifications |

### Redis Best Practices
- Set TTL on all cache keys — avoid stale data and memory bloat
- Use pipelining for multiple operations — reduce round trips
- Choose data structures wisely — sorted sets for ranking, hashes for objects
- Monitor memory usage — configure maxmemory and eviction policy

## ORM Patterns

### Active Record vs Data Mapper

| Pattern | How It Works | Best For |
|---------|-------------|----------|
| Active Record | Model class handles its own persistence | Simple CRUD, rapid development |
| Data Mapper | Separate mapper handles persistence | Complex domains, testability |

### ORM Best Practices
- Define relations explicitly — avoid lazy loading in production
- Use eager loading for known access patterns
- Raw queries for complex analytics — ORMs aren't for everything
- Database-level constraints — don't rely solely on ORM validation

### Recommended ORMs
| Language | ORM | Style |
|----------|-----|-------|
| PHP | Eloquent | Active Record, expressive API, Laravel-native |
| PHP | Doctrine | Data Mapper, enterprise, Symfony-native |
| TypeScript | Prisma | Schema-first, generated client |
| TypeScript | Drizzle | SQL-like, lightweight, type-safe |
| TypeScript | TypeORM | Decorator-based, Active Record/Data Mapper |
| Python | SQLAlchemy | Data Mapper (or Active Record with ORM) |
| Python | Django ORM | Active Record, tightly integrated |
| Go | GORM | Convention-based, struct tags |
| Go | sqlc | SQL-first, generates Go code |
| Rust | Diesel | Compile-time checked queries |
| Rust | SQLx | Async, compile-time checked SQL |

### Eloquent ORM Patterns (Laravel)
```php
// Expressive relationships
class User extends Model {
    public function orders(): HasMany {
        return $this->hasMany(Order::class);
    }

    public function roles(): BelongsToMany {
        return $this->belongsToMany(Role::class);
    }

    // Scopes for reusable query logic
    public function scopeActive(Builder $query): Builder {
        return $query->where('status', 'active');
    }
}

// Eager loading to prevent N+1
$users = User::with(['orders', 'roles'])->active()->paginate(25);

// Query scopes, accessors, casts for clean models
```

- Use `with()` for eager loading — always avoid N+1
- Use scopes for reusable query constraints
- Use casts for attribute type conversion (JSON, dates, enums)
- Use observers or model events for side effects
- Use `chunk()` or `lazy()` for large dataset processing

## Migration Strategies

### Best Practices
- One migration per change — small, focused, reversible
- Never edit a deployed migration — create a new one
- Test migrations against production-like data
- Separate schema changes from data migrations

### Zero-Downtime Migrations
```
1. ADD new column (nullable or with default)
2. DEPLOY code that writes to both old and new columns
3. BACKFILL data from old column to new column
4. DEPLOY code that reads from new column only
5. DROP old column

Never: Rename column, change type, or drop column in one step
```

### Migration Tools
| Tool | Language | Features |
|------|----------|----------|
| Laravel Migrations | PHP | Schema builder, rollback, seeding, `artisan migrate` |
| Doctrine Migrations | PHP | Diff-based, Symfony integration |
| Prisma Migrate | TypeScript | Schema-diff based, auto-generated |
| Drizzle Kit | TypeScript | Schema-diff, push/pull |
| Alembic | Python | Revision-based, auto-detect |
| golang-migrate | Go | SQL files, multiple DB drivers |
| Diesel CLI | Rust | Schema-diff, reversible |
| Flyway | Java/Any | SQL-based, versioned, widely used |

## Caching Layer

### Caching Strategies
| Strategy | Description | Consistency |
|----------|-------------|-------------|
| Cache-aside | App checks cache, loads from DB on miss | Application-managed |
| Read-through | Cache loads from DB transparently | Cache-managed |
| Write-through | Write to cache and DB simultaneously | Strong |
| Write-behind | Write to cache, async write to DB | Eventual |

### Cache Invalidation
```typescript
// Pattern: Cache-aside with TTL + event invalidation
async function getUser(id: string): Promise<User> {
  const cacheKey = `user:${id}`;

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Load from DB
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new NotFoundError("User");

  // Cache with TTL
  await redis.set(cacheKey, JSON.stringify(user), "EX", 3600);
  return user;
}

// Invalidate on write
async function updateUser(id: string, data: UpdateUserDTO) {
  const user = await db.user.update({ where: { id }, data });
  await redis.del(`user:${id}`);  // Invalidate cache
  return user;
}
```

### Cache Key Design
- Include version: `v1:user:{id}`
- Include context: `user:{id}:orders:page:{page}`
- Use hash tags for Redis Cluster: `{user:123}:profile`
- Set appropriate TTL based on data freshness requirements

## Connection Management

### Connection Pooling
- Always use connection pools — never open/close per query
- Size pool based on: `pool_size = (core_count * 2) + spindle_count`
- Monitor active/idle connections
- Set connection timeout and idle timeout

### Connection Pool Configuration
```typescript
// Prisma — connection pool in connection string
// postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=10

// Node.js pg pool
const pool = new Pool({
  max: 20,              // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```
