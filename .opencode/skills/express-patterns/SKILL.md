---
name: express-patterns
description: Express.js middleware architecture, routing patterns, request lifecycle, security, validation, and TypeScript integration
license: Apache-2.0
compatibility: opencode
---

# Express Patterns Skill

This skill provides patterns and best practices for building production-grade Express.js applications with TypeScript.

## When to Use

Use this skill when:
- Building REST APIs or server-rendered apps with Express.js
- Designing middleware pipelines for authentication, validation, or logging
- Structuring Express projects with layered architecture
- Integrating security middleware (helmet, cors, rate-limit)
- Adding file uploads, streaming responses, or session management
- Writing tests for Express routes and middleware

## Project Structure

```
src/
  app.ts                 # Express app setup, global middleware
  server.ts              # HTTP server startup, graceful shutdown
  config/
    index.ts             # Environment-based configuration
    database.ts          # Database connection setup
  routes/
    index.ts             # Route aggregator
    users.router.ts      # User routes (Router instance)
    orders.router.ts     # Order routes
  controllers/
    users.controller.ts  # Request handling, delegates to services
    orders.controller.ts
  services/
    users.service.ts     # Business logic
    orders.service.ts
  repositories/
    users.repository.ts  # Database queries
    orders.repository.ts
  middleware/
    auth.ts              # JWT/session verification
    validate.ts          # Schema validation middleware factory
    error-handler.ts     # Global error handler
    rate-limit.ts        # Rate limiting configuration
    request-id.ts        # Attach unique ID to each request
  models/
    user.model.ts        # Type definitions, Zod schemas
    order.model.ts
  utils/
    app-error.ts         # Custom error classes
    logger.ts            # Logging setup (pino/winston)
  __tests__/
    routes/              # Integration tests per route
    services/            # Unit tests for business logic
```

## Middleware Architecture

### Middleware Types

```typescript
// 1. App-level middleware — applies to all routes
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") }));
app.use(express.json({ limit: "10kb" }));
app.use(requestId());

// 2. Router-level middleware — applies to a specific router
const usersRouter = Router();
usersRouter.use(authenticate);
usersRouter.get("/", listUsers);
usersRouter.get("/:id", getUser);

// 3. Error-handling middleware — 4 parameters, must be last
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: err.statusCode,
      code: err.code,
      message: err.message,
    });
  }
  logger.error({ err, requestId: req.id }, "Unhandled error");
  res.status(500).json({ status: 500, code: "INTERNAL_ERROR", message: "Something went wrong" });
});
```

### Recommended Middleware Order

```typescript
// 1. Request tracking
app.use(requestId());
app.use(requestLogger());

// 2. Security
app.use(helmet());
app.use(cors(corsOptions));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// 3. Body parsing
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));

// 4. Session (if using)
app.use(session(sessionConfig));

// 5. Routes
app.use("/api/v1", apiRouter);

// 6. 404 handler
app.use((_req, res) => res.status(404).json({ message: "Not found" }));

// 7. Error handler (must be last, must have 4 params)
app.use(errorHandler);
```

## Routing Patterns

### Nested Routers

```typescript
// routes/index.ts
const apiRouter = Router();
apiRouter.use("/users", usersRouter);
apiRouter.use("/orders", ordersRouter);
app.use("/api/v1", apiRouter);

// routes/users.router.ts
const usersRouter = Router();
usersRouter.get("/", validate(listUsersSchema), usersController.list);
usersRouter.get("/:id", validate(userIdSchema), usersController.getById);
usersRouter.post("/", validate(createUserSchema), usersController.create);
usersRouter.patch("/:id", validate(updateUserSchema), usersController.update);
usersRouter.delete("/:id", validate(userIdSchema), usersController.remove);
```

### Validation Middleware Factory (Zod)

```typescript
import { z, ZodSchema } from "zod";

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params) as any;
      if (schemas.query) req.query = schemas.query.parse(req.query) as any;
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(422).json({
          status: 422,
          code: "VALIDATION_ERROR",
          details: err.errors,
        });
      }
      next(err);
    }
  };
}
```

### Async Handler Wrapper (TypeScript)

```typescript
// Extend Express types for custom request properties
declare global {
  namespace Express {
    interface Request { id: string; user?: { id: string; role: string } }
  }
}

// Eliminates try/catch in every handler
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => fn(req, res, next).catch(next);
}

router.get("/users", asyncHandler(async (req, res) => {
  const users = await usersService.list();
  res.json(users);
}));
```

### File Uploads (Multer) and Streaming

```typescript
// File upload with validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ["image/jpeg", "image/png"].includes(file.mimetype)),
});
router.post("/avatar", authenticate, upload.single("avatar"), handler);

// Streaming large responses
router.get("/export", authenticate, asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  const stream = await exportService.createCsvStream(req.query);
  stream.pipe(res);
}));
```

## Testing Patterns

```typescript
import request from "supertest";
import { app } from "../app";

describe("GET /api/v1/users", () => {
  it("returns paginated users", async () => {
    const res = await request(app)
      .get("/api/v1/users?page=1&limit=10")
      .set("Authorization", `Bearer ${testToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(10);
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  it("returns 401 without auth", async () => {
    await request(app).get("/api/v1/users").expect(401);
  });

  it("returns 422 for invalid query params", async () => {
    await request(app)
      .get("/api/v1/users?page=-1")
      .set("Authorization", `Bearer ${testToken}`)
      .expect(422);
  });
});
```

## Performance Best Practices

- Enable gzip/brotli compression with `compression` middleware
- Use `express.json({ limit: "10kb" })` to reject oversized payloads early
- Implement response caching with `Cache-Control` headers or Redis
- Use connection pooling for database clients (pg Pool, Prisma connection pool)
- Avoid synchronous operations in handlers -- always use async I/O
- Stream large responses instead of buffering entire payloads in memory
- Use `cluster` module or PM2 to run multiple worker processes
- Set appropriate `keep-alive` timeouts on the HTTP server

## Anti-Patterns to Avoid

- **Business logic in routes** -- routes should only parse input and call services
- **Missing error handler** -- always add a 4-param error-handling middleware as the last middleware
- **Swallowing errors** -- never use empty `catch` blocks; always call `next(err)` or respond
- **Hardcoded CORS origins** -- use environment variables for allowed origins
- **No request validation** -- validate all inputs at the boundary with Zod or Joi
- **Blocking the event loop** -- avoid CPU-heavy operations; offload to worker threads
- **Mutable shared state** -- do not store request-scoped data in module-level variables
- **Ignoring graceful shutdown** -- handle SIGTERM to close connections before exiting

## Technology Recommendations

| Concern | Recommended Library |
|---------|-------------------|
| Validation | Zod, express-validator |
| Authentication | passport, jsonwebtoken, express-jwt |
| Security headers | helmet |
| CORS | cors |
| Rate limiting | express-rate-limit |
| Logging | pino + pino-http, winston |
| File uploads | multer |
| Session management | express-session + connect-redis |
| API docs | swagger-jsdoc + swagger-ui-express |
| Testing | supertest + vitest/jest |
| ORM/query builder | Prisma, Drizzle, Knex |
| Process manager | PM2, node --cluster |
