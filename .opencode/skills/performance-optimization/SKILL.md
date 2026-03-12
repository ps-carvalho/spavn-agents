---
name: performance-optimization
description: Profiling, caching strategies, algorithm optimization, memory management, web performance, and build optimization
license: Apache-2.0
compatibility: opencode
---

# Performance Optimization Skill

This skill provides patterns and techniques for identifying and resolving performance bottlenecks across the stack.

## When to Use

Use this skill when:
- Applications are slow or unresponsive
- Scaling to handle more users or data
- Optimizing resource consumption (CPU, memory, network)
- Improving web performance metrics (Core Web Vitals)
- Reducing build times or bundle sizes

## Performance Methodology

### The Optimization Process
1. **Measure** — Profile before optimizing (never guess)
2. **Identify** — Find the actual bottleneck (Pareto: 20% of code causes 80% of issues)
3. **Optimize** — Apply targeted fix to the bottleneck
4. **Verify** — Measure again to confirm improvement
5. **Repeat** — Move to the next bottleneck

### Key Principle
> "Premature optimization is the root of all evil" — Donald Knuth
>
> Optimize only what you've measured. Optimize the bottleneck, not the code that's "probably slow."

## Profiling

### CPU Profiling
- Identify functions consuming the most CPU time
- Look for hot loops, excessive computation, blocking operations
- Tools: Chrome DevTools Performance tab, Node.js `--prof`, Go `pprof`, Rust `perf`

### Memory Profiling
- Identify memory leaks, excessive allocations, large objects
- Monitor heap size over time — growing heap = likely leak
- Tools: Chrome DevTools Memory tab, Node.js `--inspect` + heap snapshot

### Flame Graphs
- Visual representation of call stacks over time
- Wide bars = functions consuming more time
- Read bottom-up: root at bottom, hot functions at top
- Tools: `0x` (Node.js), `pprof` (Go), `cargo flamegraph` (Rust)

### Benchmarking
```typescript
// Node.js — basic benchmarking
console.time("operation");
await performOperation();
console.timeEnd("operation"); // operation: 42.53ms

// Go — built-in benchmarking
func BenchmarkSort(b *testing.B) {
    for i := 0; i < b.N; i++ {
        sort(data)
    }
}
```

## Web Performance

### Core Web Vitals
| Metric | Target | Measures | Optimization |
|--------|--------|----------|-------------|
| LCP | < 2.5s | Largest content render time | Optimize images, fonts, critical CSS |
| INP | < 200ms | Interaction responsiveness | Reduce JS execution, use web workers |
| CLS | < 0.1 | Visual stability | Set dimensions on media, avoid dynamic injection |

### Critical Rendering Path
1. HTML parsing → DOM tree
2. CSS parsing → CSSOM tree
3. Combine → Render tree
4. Layout → Compute geometry
5. Paint → Render pixels

### Optimization Techniques
- **Critical CSS** — Inline above-the-fold CSS, defer the rest
- **Font optimization** — `font-display: swap`, preload critical fonts, subset fonts
- **Image optimization** — WebP/AVIF, responsive `srcset`, lazy loading, correct dimensions
- **JavaScript** — Defer non-critical scripts, code split, tree shake unused code
- **Preloading** — `<link rel="preload">` for critical resources
- **Prefetching** — `<link rel="prefetch">` for likely next navigation

## Caching Strategies

### HTTP Caching
```
Cache-Control: public, max-age=31536000, immutable  # Static assets (hashed filenames)
Cache-Control: private, no-cache                      # User-specific, validate every time
Cache-Control: no-store                                # Sensitive data, never cache
ETag: "abc123"                                         # Conditional requests
```

### Caching Layers (from fastest to slowest)
| Layer | Speed | Scope | Example |
|-------|-------|-------|---------|
| CPU cache | ~1ns | Single core | Hardware-managed |
| In-memory (app) | ~100ns | Single process | LRU cache, memoization |
| Distributed cache | ~1ms | All processes | Redis, Memcached |
| CDN | ~10ms | Global edge | Cloudflare, CloudFront |
| Database | ~10ms | Persistent | Query cache, materialized views |
| Disk | ~100ms | Persistent | File cache, SQLite |

### Memoization Pattern
```typescript
// Simple memoization for expensive computations
function memoize<T extends (...args: any[]) => any>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>();
  return ((...args: Parameters<T>) => {
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key)!;
    const result = fn(...args);
    cache.set(key, result);
    return result;
  }) as T;
}

// React memoization
const ExpensiveList = React.memo(({ items }) => (
  <ul>{items.map(item => <li key={item.id}>{item.name}</li>)}</ul>
));
```

## Algorithm Optimization

### Big-O Complexity Guide
| Complexity | Name | Example |
|-----------|------|---------|
| O(1) | Constant | Hash map lookup, array index |
| O(log n) | Logarithmic | Binary search, balanced BST |
| O(n) | Linear | Array scan, single loop |
| O(n log n) | Linearithmic | Merge sort, heap sort |
| O(n²) | Quadratic | Nested loops, bubble sort |
| O(2ⁿ) | Exponential | Brute-force subsets |

### Common Optimizations
| Problem | Slow Approach | Fast Approach |
|---------|---------------|---------------|
| Lookup in list | O(n) linear scan | O(1) hash map/set |
| Find duplicates | O(n²) nested loops | O(n) with Set |
| Sorted data search | O(n) scan | O(log n) binary search |
| String building | O(n²) concatenation | O(n) array join or StringBuilder |
| Frequent min/max | O(n) rescan | O(log n) heap/priority queue |

### Data Structure Selection
| Need | Use | Why |
|------|-----|-----|
| Fast lookup by key | HashMap/Object/Dict | O(1) average |
| Ordered unique values | TreeSet/BTreeSet | O(log n) sorted operations |
| Fast membership test | Set/HashSet | O(1) contains |
| FIFO processing | Queue/Deque | O(1) enqueue/dequeue |
| Priority processing | Heap/Priority Queue | O(log n) insert/extract |
| Frequent insert/delete middle | Linked List | O(1) with pointer |

## Memory Management

### Memory Leak Detection
- **Symptoms**: Increasing memory usage over time, eventual OOM
- **Common causes**:
  - Unclosed event listeners or subscriptions
  - Growing caches without eviction
  - Circular references preventing garbage collection
  - Closures capturing large scopes
  - Global variables accumulating data

### Prevention Strategies
```typescript
// Use WeakRef/WeakMap for caches that shouldn't prevent GC
const cache = new WeakMap<object, ComputedResult>();

// Always clean up subscriptions
useEffect(() => {
  const subscription = eventBus.subscribe("update", handler);
  return () => subscription.unsubscribe(); // Cleanup!
}, []);

// Set limits on in-memory caches
class LRUCache<K, V> {
  private maxSize: number;
  private cache = new Map<K, V>();

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value) {
      this.cache.delete(key);
      this.cache.set(key, value); // Move to end (most recent)
    }
    return value;
  }
}
```

### Object Pooling
- Reuse objects instead of allocating/deallocating
- Useful for: database connections, thread pools, game entities
- Reduces GC pressure in high-throughput scenarios

## Concurrency & Parallelism

### Async I/O
- Use async/await for all I/O operations — never block the event loop
- Run independent I/O in parallel with `Promise.all()`
- Use worker threads for CPU-intensive work (not the main thread)

```typescript
// Bad — sequential I/O (slow)
const users = await getUsers();
const orders = await getOrders();
const stats = await getStats();

// Good — parallel I/O (fast)
const [users, orders, stats] = await Promise.all([
  getUsers(),
  getOrders(),
  getStats(),
]);
```

### Web Workers / Worker Threads
- Offload CPU-intensive work to separate threads
- Communicate via message passing (structured clone)
- Use for: image processing, data transformation, crypto, parsing

### Concurrency Patterns
| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| Promise.all() | Parallel independent tasks | JS/TS |
| Promise.allSettled() | Parallel tasks, handle individual failures | JS/TS |
| asyncio.gather() | Parallel async tasks | Python |
| goroutines + channels | Concurrent processing pipeline | Go |
| rayon par_iter | Data parallelism | Rust |
| Worker pool | Limit concurrent work | Any language |

## Database Performance

### Query Optimization
- Index columns in WHERE, JOIN, ORDER BY clauses
- Use EXPLAIN ANALYZE to understand query plans
- Avoid SELECT * — fetch only needed columns
- Use cursor pagination instead of OFFSET for large datasets

### Connection Pooling
- Always use connection pools — never connect per query
- Size: `connections = (CPU cores * 2) + disk spindles`
- Monitor active, idle, and waiting connections
- Set timeouts: connection, idle, query

### Read Optimization
- Read replicas for read-heavy workloads
- Materialized views for complex aggregations
- Query result caching with Redis/Memcached
- Denormalize for read-heavy access patterns

## Network Optimization

### Reduce Payload
- Compression — gzip/Brotli for text, WebP/AVIF for images
- Sparse fieldsets — return only requested fields
- Pagination — never return unbounded results

### Reduce Round Trips
- Batch API calls where possible
- Use HTTP/2 for multiplexed connections
- Prefetch data for likely next actions
- Use CDN for static assets and cacheable API responses

### Connection Optimization
- HTTP/2 — multiplexed streams, header compression, server push
- Keep-alive connections — reuse TCP connections
- DNS prefetch — `<link rel="dns-prefetch" href="//api.example.com">`

## Build Optimization

### Bundle Size Reduction
- Tree shaking — eliminate unused exports (use ES modules)
- Code splitting — load code on demand (route-based, component-based)
- Dynamic imports — `import()` for heavy libraries used conditionally
- Analyze bundle — rollup-plugin-visualizer, webpack-bundle-analyzer
- Replace heavy deps — date-fns instead of moment, preact instead of react

### Build Speed
- Use fast bundlers — Vite (esbuild + Rollup), Turbopack, SWC
- Incremental builds — only rebuild what changed
- Cache build artifacts — Turborepo, nx, build caches
- Parallelize — run lint, type-check, test concurrently

## Language-Specific Tools

### PHP / Laravel
- **Laravel Telescope** — Debug assistant (queries, requests, jobs, mail, cache)
- **Laravel Debugbar** — In-browser debug toolbar (queries, memory, time)
- **Laravel Octane** — High-performance server (Swoole/RoadRunner, persistent workers)
- **OPcache** — Bytecode caching (essential for production PHP)
- **Xdebug / SPX** — CPU and memory profiling
- **Eager loading** — `with()` to prevent N+1 queries (most common Laravel perf issue)
- **Route caching** — `artisan route:cache` for production
- **Config/view caching** — `artisan config:cache`, `artisan view:cache`
- **Queue heavy work** — Dispatch jobs for emails, reports, imports

### JavaScript/TypeScript
- Chrome DevTools (Performance, Memory, Network tabs)
- Lighthouse for web performance auditing
- `perf_hooks` module for server-side timing
- Bundle analyzers for client-side optimization

### Python
- `cProfile` / `py-spy` for CPU profiling
- `tracemalloc` for memory tracking
- `asyncio` for concurrent I/O
- `uvloop` for faster event loop

### Go
- `pprof` for CPU and memory profiling (built-in)
- `go test -bench` for benchmarking (built-in)
- `go tool trace` for execution tracing
- Race detector: `go run -race`

### Rust
- `cargo bench` with `criterion` for benchmarking
- `cargo flamegraph` for flame graphs
- `perf` for low-level profiling
- Zero-cost abstractions — most patterns have no runtime overhead
