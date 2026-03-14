---
name: nestjs-patterns
description: NestJS modules, dependency injection, guards, interceptors, pipes, microservices, GraphQL, CQRS, and testing patterns
license: Apache-2.0
compatibility: opencode
---

# NestJS Patterns Skill

This skill provides patterns and best practices for building scalable, maintainable server-side applications with NestJS.

## When to Use

Use this skill when:
- Building enterprise-grade Node.js applications with strong architectural conventions
- Needing dependency injection and modular architecture out of the box
- Building microservices with multiple transport layers (TCP, Redis, Kafka, gRPC)
- Creating GraphQL APIs (code-first or schema-first)
- Needing a structured request pipeline with guards, interceptors, and pipes
- Working on teams that benefit from opinionated, Angular-inspired structure

## Project Structure

```
src/
  main.ts                      # Bootstrap, global pipes/filters/interceptors
  app.module.ts                # Root module
  app.controller.ts            # Root controller (health check)
  common/
    decorators/                # Custom decorators
      current-user.decorator.ts
      roles.decorator.ts
    filters/
      http-exception.filter.ts # Global exception filter
      all-exceptions.filter.ts
    guards/
      auth.guard.ts            # JWT authentication guard
      roles.guard.ts           # RBAC authorization guard
    interceptors/
      logging.interceptor.ts   # Request/response logging
      transform.interceptor.ts # Response transformation
      timeout.interceptor.ts
    pipes/
      parse-uuid.pipe.ts       # Custom validation pipe
    middleware/
      logger.middleware.ts
  config/
    config.module.ts           # Configuration with @nestjs/config
    database.config.ts
  modules/
    users/
      users.module.ts          # Feature module
      users.controller.ts      # HTTP route handlers
      users.service.ts         # Business logic
      users.repository.ts      # Data access
      dto/
        create-user.dto.ts     # Input validation with class-validator
        update-user.dto.ts
        user-response.dto.ts   # Output serialization
      entities/
        user.entity.ts         # TypeORM/Prisma entity
      users.controller.spec.ts # Unit tests
      users.service.spec.ts
    orders/
      orders.module.ts
      orders.controller.ts
      orders.service.ts
  prisma/
    prisma.module.ts           # Prisma service as NestJS provider
    prisma.service.ts
```

## Core Concepts

### Modules, Controllers, Providers

```typescript
// users.module.ts — feature module encapsulation
@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService], // make available to other modules
})
export class UsersModule {}

// users.controller.ts — HTTP layer
@Controller("users")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseInterceptors(CacheInterceptor)
  findAll(@Query() query: PaginationDto): Promise<PaginatedResponse<User>> {
    return this.usersService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string): Promise<User> {
    return this.usersService.findOne(id);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: AuthUser): Promise<User> {
    return this.usersService.create(dto, user);
  }

  @Patch(":id")
  @Roles("admin")
  @UseGuards(RolesGuard)
  update(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto): Promise<User> {
    return this.usersService.update(id, dto);
  }

  @Delete(":id")
  @Roles("admin")
  @UseGuards(RolesGuard)
  @HttpCode(204)
  remove(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.usersService.remove(id);
  }
}

// users.service.ts — business logic
@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateUserDto, authUser: AuthUser): Promise<User> {
    const existing = await this.usersRepo.findByEmail(dto.email);
    if (existing) throw new ConflictException("Email already in use");
    const user = await this.usersRepo.create(dto);
    this.eventEmitter.emit("user.created", new UserCreatedEvent(user));
    return user;
  }
}
```

### DTOs with class-validator

```typescript
import { IsEmail, IsString, IsOptional, MinLength, IsEnum } from "class-validator";
import { Transform } from "class-transformer";

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase())
  email: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
```

## Request Pipeline

```
Client Request
  |
  Middleware          (Express-compatible, runs first)
  |
  Guards              (authentication, authorization — can short-circuit)
  |
  Interceptors (pre)  (logging, caching, transformation — wraps handler)
  |
  Pipes               (validation, transformation of parameters)
  |
  Controller Handler  (route method)
  |
  Interceptors (post) (response mapping, caching)
  |
  Exception Filters   (catch and format errors)
  |
Response
```

### Decision Guide: Middleware vs Guards vs Interceptors

| Feature | Middleware | Guards | Interceptors |
|---------|-----------|--------|-------------|
| Access to ExecutionContext | No | Yes | Yes |
| Can short-circuit | Yes (no next()) | Yes (return false) | Yes (skip handler) |
| Wraps handler | No | No | Yes (before + after) |
| DI support | No (functional) | Yes | Yes |
| Best for | Logging, CORS, body parsing | Auth, RBAC, permissions | Caching, transformation, timing |

### Custom Decorators

```typescript
// Parameter decorator — extract current user from request
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

// Metadata decorator — set roles for RolesGuard
export const Roles = (...roles: string[]) => SetMetadata("roles", roles);

// Compose multiple decorators
export function Auth(...roles: string[]) {
  return applyDecorators(
    UseGuards(AuthGuard, RolesGuard),
    Roles(...roles),
    ApiBearerAuth(),
  );
}
```

### Guards and Interceptors

```typescript
// Auth guard — verifies JWT, attaches user to request
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new UnauthorizedException();
    request.user = await this.jwtService.verifyAsync(token);
    return true;
  }
}

// Roles guard — checks metadata set by @Roles() decorator
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>("roles", [context.getHandler(), context.getClass()]);
    if (!roles) return true;
    return roles.includes(context.switchToHttp().getRequest().user.role);
  }
}

// Logging interceptor — wraps handler with timing
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const now = Date.now();
    return next.handle().pipe(tap(() => Logger.log(`${Date.now() - now}ms`)));
  }
}
```

## Microservices

```typescript
// Hybrid app: HTTP + Redis microservice
const app = await NestFactory.create(AppModule);
app.connectMicroservice({ transport: Transport.REDIS, options: { host: "localhost", port: 6379 } });
await app.startAllMicroservices();
await app.listen(3000);

// Event and message patterns
@EventPattern("order.created")
handleOrderCreated(@Payload() data: OrderCreatedEvent) { /* ... */ }

@MessagePattern({ cmd: "get_order" })
getOrder(@Payload() data: { id: string }): Promise<Order> { return this.ordersService.findOne(data.id); }
```

## Testing Patterns

```typescript
// Unit test — mock providers via Test.createTestingModule
const module = await Test.createTestingModule({
  providers: [
    UsersService,
    { provide: UsersRepository, useValue: { findByEmail: jest.fn(), create: jest.fn() } },
  ],
}).compile();
const service = module.get(UsersService);

// E2E test
const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
const app = module.createNestApplication();
app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
await app.init();
await request(app.getHttpServer()).post("/users").send(data).expect(201);
```

## Performance Best Practices

- Enable Fastify adapter instead of Express for 2-3x throughput improvement
- Use `@nestjs/cache-manager` with Redis for response caching
- Implement pagination on all list endpoints with cursor-based pagination for large datasets
- Use `LazyModuleLoader` for modules that are rarely accessed
- Serialize responses with `class-transformer` `@Exclude()` to avoid sending unnecessary data
- Use connection pooling for all database connections
- Offload heavy work to BullMQ queues via `@nestjs/bull`
- Enable gzip compression in the platform adapter

## Anti-Patterns to Avoid

- **Circular dependencies** -- restructure with `forwardRef()` only as last resort; prefer event-based decoupling
- **Fat controllers** -- controllers should only validate input and delegate to services
- **Business logic in guards** -- guards check access; keep business rules in services
- **Skipping DTOs** -- always use DTOs with `class-validator`; never trust raw `req.body`
- **God modules** -- split large modules into focused feature modules
- **Importing entities across modules** -- export services, not repositories
- **Ignoring `whitelist: true`** -- always strip unknown properties in `ValidationPipe`
- **Sync operations in interceptors** -- use RxJS operators for async transformations

## Technology Recommendations

| Concern | Recommended Library |
|---------|-------------------|
| Validation | class-validator + class-transformer |
| ORM | Prisma, TypeORM, MikroORM |
| Authentication | @nestjs/passport, @nestjs/jwt |
| Authorization | CASL (@casl/ability) |
| Caching | @nestjs/cache-manager + Redis |
| Queues | @nestjs/bull (BullMQ) |
| GraphQL | @nestjs/graphql + Apollo or Mercurius |
| Microservices | @nestjs/microservices (TCP, Redis, Kafka, gRPC) |
| Config | @nestjs/config (dotenv + Joi validation) |
| API docs | @nestjs/swagger |
| Testing | jest + @nestjs/testing + supertest |
| Health checks | @nestjs/terminus |
