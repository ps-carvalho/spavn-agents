---
name: data-engineering
description: ETL pipelines, data validation, streaming patterns, message queues, and data partitioning strategies
license: Apache-2.0
compatibility: opencode
---

# Data Engineering Skill

This skill provides patterns for building reliable data pipelines, processing large datasets, and managing data infrastructure.

## When to Use

Use this skill when:
- Designing ETL/ELT pipelines
- Implementing data validation and schema enforcement
- Working with message queues (Kafka, RabbitMQ, SQS)
- Building streaming data processing systems
- Designing data partitioning and sharding strategies
- Handling batch vs real-time data processing

## ETL Pipeline Design

### Batch vs Streaming

| Aspect | Batch Processing | Stream Processing |
|--------|-----------------|-------------------|
| **Latency** | Minutes to hours | Milliseconds to seconds |
| **Data volume** | Large datasets at once | Continuous flow |
| **Complexity** | Simpler error handling | Complex state management |
| **Use cases** | Reports, analytics, migrations | Real-time dashboards, alerts, events |
| **Tools** | Airflow, dbt, Spark | Kafka Streams, Flink, Pulsar |

### ETL vs ELT

| Pattern | When to Use |
|---------|-------------|
| **ETL** (Extract → Transform → Load) | Data warehouse with strict schema, transform before loading |
| **ELT** (Extract → Load → Transform) | Cloud data lakes, transform after loading using SQL/Spark |

### Pipeline Design Principles
- **Idempotency** — Running the same pipeline twice produces the same result
- **Incremental processing** — Process only new/changed data, not full reloads
- **Schema evolution** — Handle schema changes gracefully (add columns, not remove)
- **Backfill capability** — Ability to reprocess historical data
- **Monitoring** — Track pipeline health, data quality, processing lag

### Pipeline Architecture

```
Source → Extract → Validate → Transform → Load → Verify
                      ↓
              Dead Letter Queue (failed records)
```

### Error Handling Strategies
- **Skip and log** — Log bad records, continue processing (good for analytics)
- **Dead letter queue** — Route failures to a separate queue for manual review
- **Fail fast** — Stop pipeline on first error (good for critical data)
- **Retry with backoff** — Retry transient errors with exponential backoff

## Data Validation

### Schema Enforcement
- Validate data types, required fields, and constraints at ingestion
- Use schema registries (Avro, Protobuf, JSON Schema) for contract enforcement
- Version schemas — never break backward compatibility

### Validation Layers

| Layer | What to Check | Example |
|-------|---------------|---------|
| **Structural** | Schema conformance, types, required fields | Missing `email` field, wrong type |
| **Semantic** | Business rules, value ranges, relationships | Age < 0, end_date before start_date |
| **Referential** | Foreign key integrity, cross-dataset consistency | Order references non-existent customer |
| **Statistical** | Distribution anomalies, volume checks | 10x fewer records than yesterday |

### Data Quality Dimensions
- **Completeness** — Are all required fields populated?
- **Accuracy** — Do values reflect reality?
- **Consistency** — Are the same facts represented the same way?
- **Timeliness** — Is data available when needed?
- **Uniqueness** — Are there duplicate records?

## Idempotency Patterns

### Why Idempotency Matters
Pipelines fail and retry. Without idempotency, retries cause:
- Duplicate records in the target
- Incorrect aggregations (double-counting)
- Inconsistent state

### Patterns

| Pattern | How It Works | Trade-off |
|---------|-------------|-----------|
| **Upsert (MERGE)** | Insert or update based on key | Requires natural/business key |
| **Delete + Insert** | Delete partition, then insert | Simple but risky window of missing data |
| **Deduplication** | Assign unique IDs, deduplicate at read or write | Extra storage for IDs |
| **Exactly-once semantics** | Transactional writes with offset tracking | Complex, framework-dependent |
| **Tombstone + Compact** | Write delete markers, compact later | Kafka log compaction pattern |

### Idempotency Keys
- Use deterministic IDs: `hash(source + key + timestamp)`
- Store processing watermarks: "last processed offset/timestamp"
- Use database transactions: read offset + write data atomically

## Message Queue Patterns

### When to Use Which

| Queue | Best For | Key Feature |
|-------|----------|-------------|
| **Kafka** | High-throughput event streaming, log-based | Durable, ordered, replayable |
| **RabbitMQ** | Task queues, RPC, complex routing | Flexible routing, acknowledgments |
| **SQS** | Simple cloud-native queuing | Managed, auto-scaling, no ops |
| **Redis Streams** | Lightweight streaming with existing Redis | Low latency, familiar API |
| **NATS** | High-performance pub/sub | Ultra-low latency, cloud-native |

### Consumer Patterns

| Pattern | Description | Use Case |
|---------|-------------|----------|
| **Competing consumers** | Multiple consumers share a queue | Parallel task processing |
| **Fan-out** | One message delivered to all consumers | Event notifications |
| **Consumer groups** | Partitioned consumption across group members | Kafka-style parallel processing |
| **Request-reply** | Send request, await response on reply queue | Async RPC |

### Delivery Guarantees

| Guarantee | Meaning | Trade-off |
|-----------|---------|-----------|
| **At-most-once** | Message may be lost, never duplicated | Fastest, lossy |
| **At-least-once** | Message never lost, may be duplicated | Requires idempotent consumers |
| **Exactly-once** | Message processed exactly once | Complex, performance overhead |

### Backpressure Handling
- **Bounded queues** — Reject/block producers when queue is full
- **Rate limiting** — Limit consumer processing rate
- **Circuit breaker** — Stop consuming when downstream is unhealthy
- **Autoscaling** — Add consumers when queue depth exceeds threshold

## Streaming Patterns

### Windowing

| Window Type | Description | Use Case |
|-------------|-------------|----------|
| **Tumbling** | Fixed-size, non-overlapping | Hourly aggregation |
| **Sliding** | Fixed-size, overlapping | Moving average |
| **Session** | Gap-based, variable size | User session activity |
| **Global** | All events in one window | Running totals |

### Event Time vs Processing Time
- **Event time** — When the event actually occurred (embedded in data)
- **Processing time** — When the system processes the event
- **Watermarks** — Track progress through event time, handle late arrivals
- Always prefer event time for correctness; use processing time only for real-time approximation

### Stateful Stream Processing
- **State stores** — Local key-value stores for aggregations, joins
- **Changelog topics** — Back up state to Kafka for fault tolerance
- **State checkpointing** — Periodic snapshots for recovery (Flink pattern)

## Data Partitioning & Sharding

### Partitioning Strategies

| Strategy | How | Best For |
|----------|-----|----------|
| **Range partitioning** | Partition by value range (date, ID range) | Time-series data, sequential access |
| **Hash partitioning** | Hash key modulo partition count | Even distribution, point lookups |
| **List partitioning** | Partition by discrete values (country, region) | Known categories, geographic data |
| **Composite** | Combine strategies (hash + range) | Multi-tenant time-series |

### Partition Key Selection
- Choose keys with **high cardinality** (many distinct values)
- Avoid **hot partitions** (one key getting disproportionate traffic)
- Consider **query patterns** — partition by how data is most often read
- Plan for **partition growth** — avoid partition count that requires redistribution

### Sharding Considerations
- **Shard key immutability** — Changing a shard key requires data migration
- **Cross-shard queries** — Avoid joins across shards (denormalize instead)
- **Rebalancing** — Use consistent hashing to minimize data movement
- **Shard splitting** — Plan for splitting hot shards without downtime

## Data Pipeline Tools

### Orchestration
- **Airflow** — DAG-based workflow orchestration (Python)
- **Dagster** — Software-defined assets, strong typing
- **Prefect** — Python-native, dynamic workflows
- **Temporal** — Durable execution for long-running pipelines

### Transformation
- **dbt** — SQL-based transformations in the warehouse
- **Spark** — Distributed processing for large datasets
- **Pandas/Polars** — Single-machine data transformation
- **Flink** — Stream and batch processing (JVM)

### Storage
- **Data Lake** — Raw, unstructured (S3, GCS, ADLS)
- **Data Warehouse** — Structured, optimized for analytics (BigQuery, Snowflake, Redshift)
- **Data Lakehouse** — Combines both (Delta Lake, Iceberg, Hudi)

## Checklist

When building a data pipeline:
- [ ] Idempotent operations — safe to retry without side effects
- [ ] Schema validation at ingestion boundary
- [ ] Dead letter queue for failed records
- [ ] Monitoring: processing lag, error rate, throughput
- [ ] Backfill capability — can reprocess historical data
- [ ] Incremental processing — not full reloads on every run
- [ ] Data quality checks after transformation
- [ ] Partition strategy aligned with query patterns
- [ ] Exactly-once or at-least-once with idempotent consumers
- [ ] Schema evolution plan (backward compatible changes)
- [ ] Alerting on pipeline failures and data quality anomalies
- [ ] Documentation of data lineage and transformation logic
