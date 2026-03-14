---
name: fastify-patterns
description: Fastify plugin architecture, schema-based validation, lifecycle hooks, TypeBox type providers, and testing patterns
license: Apache-2.0
compatibility: opencode
---

# Fastify Patterns Skill

This skill provides patterns and best practices for building high-performance APIs with Fastify's plugin-based architecture.

## When to Use

Use this skill when:
- Building performance-critical Node.js APIs
- Needing schema-based request/response validation with automatic serialization
- Designing plugin-based modular architectures
- Wanting built-in structured logging with Pino
- Building APIs with auto-generated Swagger/OpenAPI documentation
- Needing strong TypeScript support with type providers

## Project Structure

```
src/
  app.ts                   # Fastify instance creation, plugin registration
  server.ts                # Server startup, graceful shutdown
  plugins/
    auth.ts                # Authentication plugin (decorator + hook)
    database.ts            # Database connection plugin
    swagger.ts             # Swagger/OpenAPI plugin config
    rate-limit.ts          # Rate limiting plugin
  modules/
    users/
      users.routes.ts      # Route definitions with schemas
      users.schemas.ts     # JSON Schema / TypeBox schemas
      users.service.ts     # Business logic
      users.repository.ts  # Database queries
      users.test.ts        # Tests using fastify.inject()
    orders/
      orders.routes.ts
      orders.schemas.ts
      orders.service.ts
      orders.repository.ts
      orders.test.ts
  hooks/
    on-request.ts          # Global onRequest hooks
    pre-handler.ts         # Global preHandler hooks
  types/
    index.d.ts             # Fastify type augmentation
  utils/
    errors.ts              # Custom error classes
```

## Plugin Architecture

### Encapsulation Model

```
Root context
  -> @fastify/cors         (registered at root, available everywhere)
  -> @fastify/helmet
  -> database plugin       (decorates fastify with db)
  -> auth plugin           (decorates fastify with authenticate)
  |
  -> /api/users module     (encapsulated, inherits root context)
  |    -> user-specific plugins
  |
  -> /api/orders module    (encapsulated, separate from users)
       -> order-specific plugins
```

### Creating Plugins

```typescript
import fp from "fastify-plugin";
import { FastifyPluginAsync } from "fastify";

// Encapsulated plugin — only visible to child context
const usersRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/", { schema: listUsersSchema }, async (request, reply) => {
    const users = await fastify.usersService.list(request.query);
    return users;
  });
};

// Shared plugin (fp wrapper) — visible to entire app
const databasePlugin: FastifyPluginAsync = async (fastify) => {
  const pool = createPool(fastify.config.DATABASE_URL);
  fastify.decorate("db", pool);
  fastify.addHook("onClose", async () => pool.end());
};

export default fp(databasePlugin, { name: "database" });
```

### Decorators

```typescript
// Add properties to the Fastify instance
fastify.decorate("db", databaseClient);
fastify.decorate("config", parsedConfig);

// Add properties to Request
fastify.decorateRequest("user", null);

// Add properties to Reply
fastify.decorateReply("sendSuccess", function (data: unknown) {
  return this.code(200).send({ success: true, data });
});

// TypeScript augmentation
declare module "fastify" {
  interface FastifyInstance {
    db: DatabaseClient;
    config: AppConfig;
  }
  interface FastifyRequest {
    user: { id: string; role: string } | null;
  }
}
```

## Schema-Based Validation

### TypeBox Type Provider

```typescript
import { Type, Static } from "@sinclair/typebox";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

const CreateUserSchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  email: Type.String({ format: "email" }),
  role: Type.Optional(Type.Union([Type.Literal("user"), Type.Literal("admin")])),
});

type CreateUserBody = Static<typeof CreateUserSchema>;

const UserResponseSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String(),
  email: Type.String(),
  role: Type.String(),
  createdAt: Type.String({ format: "date-time" }),
});

// Route with full schema
fastify.withTypeProvider<TypeBoxTypeProvider>().post("/users", {
  schema: {
    body: CreateUserSchema,
    response: {
      201: UserResponseSchema,
      409: Type.Object({ message: Type.String() }),
    },
  },
}, async (request, reply) => {
  // request.body is fully typed as CreateUserBody
  const user = await usersService.create(request.body);
  return reply.code(201).send(user); // response is validated and serialized
});
```

### Schema Benefits
- **Validation** -- request body, params, query, and headers validated automatically
- **Serialization** -- response schema enables fast JSON serialization (2-5x faster)
- **Documentation** -- schemas auto-generate Swagger/OpenAPI docs
- **Type safety** -- TypeBox schemas produce TypeScript types

## Lifecycle Hooks

```
Request                                             Response
  |                                                    ^
  v                                                    |
onRequest -> preParsing -> preValidation -> preHandler -> handler -> preSerialization -> onSend -> onResponse
```

```typescript
// Authentication hook
fastify.addHook("onRequest", async (request, reply) => {
  request.startTime = Date.now();
});

// Authorization as preHandler
fastify.addHook("preHandler", async (request, reply) => {
  if (request.routeOptions.config.requireAuth) {
    const token = request.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      reply.code(401).send({ message: "Unauthorized" });
      return;
    }
    request.user = await verifyToken(token);
  }
});

// Response timing
fastify.addHook("onResponse", async (request, reply) => {
  const duration = Date.now() - request.startTime;
  request.log.info({ duration, status: reply.statusCode }, "request completed");
});

// Route-level hooks
fastify.get("/admin", {
  preHandler: [authenticate, requireAdmin],
  schema: adminSchema,
}, adminHandler);
```

## Error Handling and Authentication

```typescript
// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  }
  if (error.validation) {
    return reply.code(422).send({ code: "VALIDATION_ERROR", details: error.validation });
  }
  request.log.error(error);
  reply.code(500).send({ code: "INTERNAL_ERROR", message: "Something went wrong" });
});

// JWT auth plugin (shared via fp)
export default fp(async (fastify) => {
  fastify.register(fastifyJwt, { secret: fastify.config.JWT_SECRET });
  fastify.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
    try { await request.jwtVerify(); }
    catch { reply.code(401).send({ message: "Unauthorized" }); }
  });
});

// Usage: fastify.get("/protected", { onRequest: [fastify.authenticate] }, handler);
```

## Fastify Autoload

```typescript
import autoLoad from "@fastify/autoload";
fastify.register(autoLoad, { dir: path.join(__dirname, "plugins") });
fastify.register(autoLoad, {
  dir: path.join(__dirname, "modules"),
  options: { prefix: "/api" },
  autoHooks: true,
  cascadeHooks: true,
});
```

## Testing with fastify.inject()

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp } from "../app";

describe("Users API", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST /users creates a user", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "Alice", email: "alice@example.com" },
      headers: { authorization: `Bearer ${testToken}` },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toHaveProperty("id");
    expect(body.name).toBe("Alice");
  });

  it("POST /users rejects invalid email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "Alice", email: "not-an-email" },
      headers: { authorization: `Bearer ${testToken}` },
    });

    expect(response.statusCode).toBe(422);
  });
});
```

## Performance Best Practices

- Always define `response` schemas -- enables fast serialization (up to 5x faster than JSON.stringify)
- Use `fastify-plugin` (`fp`) only for shared plugins; keep route plugins encapsulated
- Use Pino's built-in logging -- do not add extra logging middleware
- Enable `ajv` schema caching by reusing schema `$id` references
- Use `reply.send()` instead of `return` for streaming or manual control
- Connection pooling via the database plugin, shared across routes
- Use `@fastify/under-pressure` to add health checks with load shedding
- Set `trustProxy` appropriately behind reverse proxies

## Anti-Patterns to Avoid

- **Skipping response schemas** -- you lose Fastify's fast serialization advantage
- **Using `fp()` on everything** -- encapsulation is a feature; only share what is needed
- **Decorating in routes** -- decorators should be registered in plugins during boot
- **Ignoring encapsulation** -- do not access sibling plugin state; use shared parent plugins
- **Blocking hooks** -- avoid synchronous heavy work in lifecycle hooks
- **Not calling `await app.ready()`** -- always wait for plugin registration before handling requests
- **Large monolithic route files** -- split into modules with their own schemas and services

## Technology Recommendations

| Concern | Recommended Library |
|---------|-------------------|
| Schema validation | @sinclair/typebox, fluent-json-schema |
| Type provider | @fastify/type-provider-typebox |
| API docs | @fastify/swagger + @fastify/swagger-ui |
| Authentication | @fastify/jwt, @fastify/passport |
| Rate limiting | @fastify/rate-limit |
| CORS | @fastify/cors |
| Auto-loading | @fastify/autoload |
| Health checks | @fastify/under-pressure |
| WebSocket | @fastify/websocket |
| Database | Prisma, Drizzle, @fastify/postgres |
| Testing | vitest + fastify.inject() |
| Logging | Pino (built-in) |
