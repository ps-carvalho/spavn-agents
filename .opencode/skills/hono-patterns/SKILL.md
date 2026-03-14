---
name: hono-patterns
description: Hono web framework patterns for edge/serverless with middleware, routing, adapters, RPC mode, and multi-runtime support
license: Apache-2.0
compatibility: opencode
---

# Hono Patterns Skill

This skill provides patterns and best practices for building lightweight, high-performance web applications with Hono across multiple runtimes.

## When to Use

Use this skill when:
- Building APIs for edge or serverless platforms (Cloudflare Workers, Deno Deploy, Vercel Edge)
- Creating lightweight, fast APIs on Bun or Node.js
- Needing a framework that works across multiple runtimes without modification
- Building type-safe API clients with Hono RPC mode
- Wanting minimal bundle size and fast cold starts
- Integrating OpenAPI documentation into route definitions

## Project Structure

```
src/
  index.ts               # App entry point, adapter binding
  app.ts                 # Hono app instance, global middleware
  routes/
    index.ts             # Route aggregator
    users.ts             # User route group
    orders.ts            # Order route group
  middleware/
    auth.ts              # Authentication middleware
    logger.ts            # Custom logging middleware
  services/
    users.service.ts     # Business logic
    orders.service.ts
  validators/
    users.schema.ts      # Zod schemas for validation
    orders.schema.ts
  db/
    client.ts            # Database client (D1, Turso, Drizzle)
    schema.ts            # Database schema
  types/
    env.ts               # Bindings type (Cloudflare env)
  __tests__/
    users.test.ts        # Tests using Hono test client
```

## Core Patterns

### App Setup and Routing

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { usersApp } from "./routes/users";
import { ordersApp } from "./routes/orders";

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Global middleware
app.use("*", logger());
app.use("*", secureHeaders());
app.use("/api/*", cors({ origin: ["https://example.com"] }));

// Route groups
app.route("/api/users", usersApp);
app.route("/api/orders", ordersApp);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// 404 fallback
app.notFound((c) => c.json({ message: "Not found" }, 404));

// Global error handler
app.onError((err, c) => {
  console.error(err);
  return c.json({ message: "Internal server error" }, 500);
});

export default app;
```

### Context Object

```typescript
c.json({ data })          // JSON response
c.text("pong")            // plain text
c.html("<h1>Hi</h1>")    // HTML response
c.redirect("/new", 301)   // redirect
c.req.param("id")         // path parameter
c.req.query("q")          // query parameter
c.env.DB                  // runtime bindings (Cloudflare D1, secrets)
c.header("X-Custom", "v") // set response header
c.get("userId")           // read typed variable set by middleware
```

### Validation with Zod

```typescript
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["user", "admin"]).default("user"),
});

const usersApp = new Hono()
  .post("/", zValidator("json", createUserSchema), async (c) => {
    const data = c.req.valid("json"); // fully typed
    const user = await usersService.create(data);
    return c.json(user, 201);
  })
  .get("/:id", zValidator("param", z.object({ id: z.string().uuid() })), async (c) => {
    const { id } = c.req.valid("param");
    const user = await usersService.findById(id);
    if (!user) return c.json({ message: "Not found" }, 404);
    return c.json(user);
  });
```

## Middleware Composition

```typescript
import { createMiddleware } from "hono/factory";
import { jwt } from "hono/jwt";
import { rateLimiter } from "hono-rate-limiter";

// Built-in JWT middleware
app.use("/api/*", jwt({ secret: "your-secret" }));

// Custom middleware with typed variables
const authMiddleware = createMiddleware<{
  Bindings: Bindings;
  Variables: { userId: string; role: string };
}>(async (c, next) => {
  const payload = c.get("jwtPayload");
  if (!payload?.sub) return c.json({ message: "Unauthorized" }, 401);
  c.set("userId", payload.sub);
  c.set("role", payload.role);
  await next();
});

// Guard middleware factory
function requireRole(role: string) {
  return createMiddleware(async (c, next) => {
    if (c.get("role") !== role) {
      return c.json({ message: "Forbidden" }, 403);
    }
    await next();
  });
}

// Apply per-route
app.delete("/api/users/:id", authMiddleware, requireRole("admin"), deleteUser);
```

### Middleware Pipeline Order

```
Request
  -> logger
  -> secureHeaders
  -> cors
  -> rateLimiter
  -> jwt / auth
  -> validator
  -> route handler
  -> onError (if error)
Response
```

## RPC Mode (Type-Safe Client)

```typescript
// server.ts — export the app type
const app = new Hono()
  .get("/users", async (c) => c.json(await getUsers()))
  .post("/users", zValidator("json", createUserSchema), async (c) => {
    const user = await createUser(c.req.valid("json"));
    return c.json(user, 201);
  });

export type AppType = typeof app;

// client.ts — fully typed API client
import { hc } from "hono/client";
import type { AppType } from "../server";

const client = hc<AppType>("http://localhost:3000");

// Fully typed — IDE autocomplete for paths, methods, request/response
const res = await client.users.$get();
const users = await res.json(); // typed as User[]

const newUser = await client.users.$post({
  json: { name: "Alice", email: "alice@example.com" },
});
```

## Runtime Adapters

```typescript
// Cloudflare Workers
export default app;

// Node.js
import { serve } from "@hono/node-server";
serve({ fetch: app.fetch, port: 3000 });

// Bun
export default { fetch: app.fetch, port: 3000 };

// Deno
Deno.serve(app.fetch);

// AWS Lambda
import { handle } from "hono/aws-lambda";
export const handler = handle(app);

// Vercel Edge
export const config = { runtime: "edge" };
export default app;
```

## Streaming, WebSockets, and OpenAPI

```typescript
// SSE streaming
import { streamSSE } from "hono/streaming";
app.get("/stream", (c) => streamSSE(c, async (stream) => {
  await stream.writeSSE({ data: JSON.stringify({ count: 1 }), event: "update" });
}));

// WebSocket (Cloudflare adapter)
import { upgradeWebSocket } from "hono/cloudflare-workers";
app.get("/ws", upgradeWebSocket(() => ({
  onMessage(event, ws) { ws.send(`Echo: ${event.data}`); },
})));

// OpenAPI with @hono/zod-openapi
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
const route = createRoute({
  method: "get", path: "/users/{id}",
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { content: { "application/json": { schema: UserSchema } }, description: "OK" } },
});
app.openapi(route, handler);
app.doc("/doc", { openapi: "3.0.0", info: { title: "API", version: "1.0.0" } });
```

## Testing with Hono Test Client

```typescript
import { describe, it, expect } from "vitest";
import app from "../app";

describe("Users API", () => {
  it("GET /api/users returns users", async () => {
    const res = await app.request("/api/users", {
      headers: { Authorization: `Bearer ${testToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("users");
  });

  it("POST /api/users validates input", async () => {
    const res = await app.request("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });
});
```

## Performance Best Practices

- Hono has near-zero overhead -- avoid adding unnecessary middleware globally
- Use `app.route()` to split into sub-apps for code splitting in serverless
- Leverage edge caching with `Cache-Control` headers and platform-specific cache APIs
- Use `c.executionCtx.waitUntil()` on Cloudflare for background tasks after response
- Keep bundle size small -- import only needed middleware (`hono/cors` not full `hono`)
- Use Drizzle ORM with D1 or Turso for lightweight edge-compatible database access
- Prefer streaming responses for large payloads to reduce memory pressure

## Anti-Patterns to Avoid

- **Fat handlers** -- move business logic into services; handlers should only parse input and return output
- **Global middleware overuse** -- apply auth/validation only where needed with `app.use("/path/*")`
- **Ignoring typed variables** -- always type your `Bindings` and `Variables` generics for type safety
- **Blocking operations in edge** -- avoid long-running sync tasks; use `waitUntil` for background work
- **Skipping validation** -- always validate with `zValidator` even for simple inputs
- **Hardcoding secrets** -- use runtime bindings (`c.env`) or environment variables
- **Not exporting app type** -- always export `AppType` to enable RPC client usage

## Technology Recommendations

| Concern | Recommended Library |
|---------|-------------------|
| Validation | @hono/zod-validator, @hono/valibot-validator |
| Authentication | hono/jwt, hono/bearer-auth, hono/basic-auth |
| OpenAPI | @hono/zod-openapi |
| Rate limiting | hono-rate-limiter |
| Database (edge) | Drizzle + D1, Drizzle + Turso, Prisma Accelerate |
| Database (Node/Bun) | Drizzle, Prisma |
| Testing | vitest + app.request() |
| Deployment | Cloudflare Workers, Vercel Edge, Deno Deploy |
| Monitoring | Cloudflare Analytics, Sentry |
| Type-safe client | hono/client (hc) |
