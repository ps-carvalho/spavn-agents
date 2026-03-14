---
name: laravel-patterns
description: Laravel 11+ service container, Eloquent ORM, middleware, queues, broadcasting, testing, and full-stack integration patterns
license: Apache-2.0
compatibility: opencode
---

# Laravel Patterns Skill

This skill provides patterns and best practices for building modern PHP applications with Laravel 11+.

## When to Use

Use this skill when:
- Building full-stack web applications or REST/JSON APIs with PHP
- Needing a batteries-included framework with ORM, queues, caching, and auth
- Working with Eloquent ORM for database operations
- Building real-time features with broadcasting (Laravel Echo, Reverb)
- Needing background job processing with Horizon
- Creating APIs with Laravel Sanctum or Passport authentication
- Building full-stack apps with Inertia.js (React/Vue) or Livewire

## Project Structure

```
app/
  Http/
    Controllers/
      Api/
        UserController.php       # API resource controller
        OrderController.php
      Web/
        DashboardController.php  # Web controllers
    Middleware/
      EnsureApiVersion.php       # Custom middleware
    Requests/
      StoreUserRequest.php       # Form request validation
      UpdateUserRequest.php
    Resources/
      UserResource.php           # API resource transformation
      UserCollection.php
  Models/
    User.php                     # Eloquent model
    Order.php
    Scopes/
      ActiveScope.php            # Global/local query scopes
  Services/
    UserService.php              # Business logic layer
    PaymentService.php
  Repositories/                  # Optional repository layer
    UserRepository.php
  Jobs/
    ProcessPayment.php           # Queued jobs
    SendWelcomeEmail.php
  Events/
    OrderPlaced.php              # Domain events
  Listeners/
    SendOrderConfirmation.php    # Event listeners
  Notifications/
    OrderShipped.php             # Multi-channel notifications
  Policies/
    UserPolicy.php               # Authorization policies
  Observers/
    UserObserver.php             # Model lifecycle hooks
  Enums/
    OrderStatus.php              # PHP 8.1+ backed enums
  Actions/                       # Single-purpose action classes
    CreateUser.php
    ProcessRefund.php
routes/
  api.php                        # API routes
  web.php                        # Web routes
  channels.php                   # Broadcast channel auth
  console.php                    # Artisan commands
database/
  migrations/                    # Schema migrations
  seeders/                       # Data seeders
  factories/                     # Model factories for testing
tests/
  Feature/                       # HTTP/integration tests
    UserControllerTest.php
  Unit/                          # Isolated unit tests
    UserServiceTest.php
resources/
  views/                         # Blade templates or Inertia pages
  js/                            # Frontend assets
```

## Service Container and Dependency Injection

```php
// Auto-resolution — Laravel resolves constructor dependencies automatically
class UserController extends Controller {
    public function __construct(private readonly UserService $userService) {}
}

// Binding interfaces to implementations in AppServiceProvider
$this->app->bind(PaymentGateway::class, StripePaymentGateway::class);
$this->app->singleton(CacheService::class, fn ($app) => new CacheService($app->make('cache.store')));

// Contextual binding
$this->app->when(PhotoController::class)->needs(StorageDriver::class)->give(S3StorageDriver::class);
```

## Eloquent ORM Patterns

### Models, Relationships, Scopes, and Observers

```php
class User extends Model {
    protected $fillable = ['name', 'email', 'role'];
    protected function casts(): array {
        return ['email_verified_at' => 'datetime', 'role' => UserRole::class, 'preferences' => 'array'];
    }

    public function orders(): HasMany { return $this->hasMany(Order::class); }
    public function profile(): HasOne { return $this->hasOne(Profile::class); }
    public function roles(): BelongsToMany { return $this->belongsToMany(Role::class)->withTimestamps(); }

    // Accessor (Laravel 11 style)
    protected function fullName(): Attribute {
        return Attribute::make(get: fn () => "{$this->first_name} {$this->last_name}");
    }

    // Query scopes
    public function scopeActive(Builder $query): Builder { return $query->where('status', 'active'); }
    public function scopeRole(Builder $query, UserRole $role): Builder { return $query->where('role', $role); }
}

// Usage: User::active()->role(UserRole::Admin)->with('orders')->paginate(20);

// Observer — lifecycle hooks
class UserObserver {
    public function creating(User $user): void { $user->uuid = Str::uuid(); }
    public function created(User $user): void { SendWelcomeEmail::dispatch($user); }
}
```

## Routing Patterns

```php
// routes/api.php
Route::prefix('v1')->middleware(['auth:sanctum'])->group(function () {
    // Resource routes — auto-generates index, store, show, update, destroy
    Route::apiResource('users', UserController::class);

    // Nested resources
    Route::apiResource('users.orders', OrderController::class)->shallow();

    // Route model binding with scoping
    Route::get('users/{user}/orders/{order:uuid}', [OrderController::class, 'show'])
        ->scopeBindings();

    // Custom routes
    Route::post('users/{user}/suspend', [UserController::class, 'suspend']);
});

// Rate limiting in RouteServiceProvider or bootstrap/app.php
RateLimiter::for('api', function (Request $request) {
    return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
});
```

## Middleware Pipeline

```
Request
  |
  TrustProxies
  |
  HandleCors
  |
  PreventRequestsDuringMaintenance
  |
  ValidatePostSize
  |
  TrimStrings / ConvertEmptyStringsToNull
  |
  Route Middleware (auth, throttle, etc.)
  |
  Controller
  |
Response
```

```php
// Custom middleware
class EnsureUserIsSubscribed
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!$request->user()?->isSubscribed()) {
            return response()->json(['message' => 'Subscription required'], 403);
        }
        return $next($request);
    }
}

// Register in bootstrap/app.php (Laravel 11)
->withMiddleware(function (Middleware $middleware) {
    $middleware->alias([
        'subscribed' => EnsureUserIsSubscribed::class,
    ]);
})
```

## Validation, Resources, and Queues

```php
// Form Request — validates and authorizes in one class
class StoreUserRequest extends FormRequest {
    public function authorize(): bool { return $this->user()->can('create', User::class); }
    public function rules(): array {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
        ];
    }
}

// API Resource — controls JSON shape
class UserResource extends JsonResource {
    public function toArray(Request $request): array {
        return [
            'id' => $this->uuid, 'name' => $this->name, 'email' => $this->email,
            'orders_count' => $this->whenCounted('orders'),
            'orders' => OrderResource::collection($this->whenLoaded('orders')),
        ];
    }
}

// Queued job with retries
class ProcessPayment implements ShouldQueue {
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;
    public int $tries = 3;
    public function __construct(private readonly Order $order) {}
    public function handle(PaymentGateway $gateway): void {
        $gateway->charge($this->order->total, $this->order->payment_method);
    }
}
// Dispatch: ProcessPayment::dispatch($order)->onQueue('payments');

// Broadcasting event
class OrderPlaced implements ShouldBroadcast {
    public function __construct(public readonly Order $order) {}
    public function broadcastOn(): array { return [new PrivateChannel("user.{$this->order->user_id}")]; }
}
```

## Testing Patterns

```php
// Feature test
class UserControllerTest extends TestCase {
    use RefreshDatabase;

    public function test_can_create_user(): void {
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/users', ['name' => 'Alice', 'email' => 'alice@example.com',
                'password' => 'Pass123!', 'password_confirmation' => 'Pass123!'])
            ->assertCreated()
            ->assertJsonStructure(['data' => ['id', 'name', 'email']]);
        $this->assertDatabaseHas('users', ['email' => 'alice@example.com']);
    }

    public function test_dispatches_job(): void {
        Queue::fake();
        $this->actingAs(User::factory()->admin()->create(), 'sanctum')
            ->postJson('/api/v1/users', $this->validUserData());
        Queue::assertPushed(SendWelcomeEmail::class);
    }
}

// Pest unit test
test('full name', fn () => expect(
    User::factory()->make(['first_name' => 'Jane', 'last_name' => 'Doe'])->full_name
)->toBe('Jane Doe'));
```

## Performance Best Practices

- Use eager loading (`with()`) to prevent N+1 queries on every list endpoint
- Use `select()` to fetch only needed columns on large tables
- Cache expensive queries with `Cache::remember()` and appropriate TTL
- Use database indexes on columns used in `where`, `orderBy`, and `join`
- Use Laravel Octane (Swoole/RoadRunner) for persistent worker processes
- Queue all non-critical work (emails, webhooks, report generation)
- Use chunking (`chunk`, `lazy`, `cursor`) for processing large datasets
- Profile queries with `DB::listen()` or Laravel Debugbar in development

## Anti-Patterns to Avoid

- **Fat controllers** -- move business logic to services or action classes
- **N+1 queries** -- always eager load relationships; use `preventLazyLoading()` in development
- **Mass assignment vulnerabilities** -- always define `$fillable` or `$guarded`
- **Raw queries without bindings** -- always use parameter binding to prevent SQL injection
- **Storing secrets in config files** -- use `.env` and `config()` helper exclusively
- **Skipping form requests** -- never validate inline in controllers for non-trivial validation
- **Synchronous heavy operations** -- dispatch jobs for email, PDF generation, API calls
- **God models** -- split large models with traits, scopes, and service classes

## Technology Recommendations

| Concern | Recommended Library |
|---------|-------------------|
| Authentication (API) | Laravel Sanctum |
| Authentication (OAuth) | Laravel Passport |
| Authorization | Policies + Gates (built-in) |
| Queue monitoring | Laravel Horizon (Redis) |
| Real-time | Laravel Reverb + Echo |
| Admin panel | Filament, Nova |
| Testing | Pest (or PHPUnit) |
| Full-stack (SPA) | Inertia.js + React/Vue |
| Full-stack (server) | Livewire |
| Scaffolding | Laravel Breeze, Jetstream |
| Search | Laravel Scout + Meilisearch |
| File storage | Laravel Filesystem (S3/local) |
| Payments | Laravel Cashier (Stripe/Paddle) |
| ORM | Eloquent (built-in) |
| Debugging | Laravel Debugbar, Telescope |
