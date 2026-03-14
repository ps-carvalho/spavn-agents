---
name: angular-patterns
description: Angular 17+ patterns including standalone components, signals, new control flow, dependency injection, and RxJS best practices
license: Apache-2.0
compatibility: opencode
---

# Angular Patterns Skill

Patterns and best practices for building production Angular 17+ applications with standalone components, signals, the new control flow syntax, and modern tooling.

## When to Use

Use this skill when:
- Building new Angular applications or upgrading to Angular 17+
- Designing component architecture with standalone components
- Implementing reactive state with signals
- Working with RxJS for complex async flows
- Setting up routing, guards, and resolvers
- Choosing form strategies (reactive vs template-driven)
- Testing with TestBed and component harnesses

## Project Structure

```
src/app/
  core/                   # Singleton services, guards, interceptors
    auth/                 # auth.service.ts, auth.guard.ts, auth.interceptor.ts
    api/                  # api.service.ts
  features/               # Feature modules (standalone components + routes)
    dashboard/            # dashboard.component.ts, dashboard.routes.ts
    posts/                # post-list.component.ts, post.service.ts, posts.routes.ts
  shared/                 # Shared components, directives, pipes
  layouts/                # Layout components
  app.component.ts
  app.config.ts           # provideRouter, provideHttpClient, etc.
  app.routes.ts           # Top-level routes
```

## Key Patterns

### Standalone Components

```typescript
@Component({
  selector: "app-post-list",
  standalone: true,
  imports: [CommonModule, RouterLink, PostCardComponent],
  template: `
    @if (loading()) {
      <app-skeleton />
    } @else {
      @for (post of posts(); track post.id) {
        <app-post-card [post]="post" />
      } @empty {
        <p>No posts found.</p>
      }
    }
  `,
})
export class PostListComponent {
  private postService = inject(PostService);
  posts = signal<Post[]>([]);
  loading = signal(true);
}
```

### Signals

```typescript
const count = signal(0);           // Writable signal
count.set(5);                      // Set value
count.update((v) => v + 1);       // Update from previous

const doubled = computed(() => count() * 2);  // Derived (read-only)
effect(() => console.log(count()));           // Side effect on change
```

### Signal Inputs and Outputs (Angular 17.1+)

```typescript
@Component({ /* ... */ })
export class CardComponent {
  title = input.required<string>();                    // Required input
  variant = input<"primary" | "secondary">("primary"); // Optional with default
  closed = output<void>();                             // Output event
  headerClass = computed(() => this.variant() === "primary" ? "bg-blue" : "bg-gray");
}
```

### New Control Flow

```html
<!-- @if / @else -->
@if (user()) {
  <p>Welcome, {{ user()!.name }}</p>
} @else if (loading()) {
  <app-spinner />
} @else {
  <a routerLink="/login">Sign in</a>
}

<!-- @for with track -->
@for (item of items(); track item.id) {
  <app-item [item]="item" />
} @empty {
  <p>No items available.</p>
}

<!-- @switch -->
@switch (status()) {
  @case ("loading") { <app-spinner /> }
  @case ("error") { <app-error [message]="errorMessage()" /> }
  @case ("success") { <app-content [data]="data()" /> }
}

<!-- @defer (lazy loading) -->
@defer (on viewport) {
  <app-heavy-chart [data]="chartData()" />
} @loading (minimum 200ms) {
  <app-skeleton />
} @placeholder {
  <div style="height: 400px"></div>
}
```

### Dependency Injection

```typescript
@Injectable({ providedIn: "root" })
export class PostService {
  private http = inject(HttpClient);
  getAll() { return this.http.get<Post[]>("/api/posts"); }
  getById(id: string) { return this.http.get<Post>(`/api/posts/${id}`); }
  create(data: CreatePostDto) { return this.http.post<Post>("/api/posts", data); }
}

// app.config.ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
```

### Routing with Lazy Loading

```typescript
export const routes: Routes = [
  { path: "", loadComponent: () => import("./features/home/home.component").then(m => m.HomeComponent) },
  { path: "dashboard", canActivate: [authGuard],
    loadChildren: () => import("./features/dashboard/dashboard.routes").then(m => m.DASHBOARD_ROUTES) },
  { path: "posts/:id", loadComponent: () => import("./features/posts/post-detail.component").then(m => m.PostDetailComponent), resolve: { post: postResolver } },
];

// Functional guard
export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  return auth.isAuthenticated() || inject(Router).createUrlTree(["/login"]);
};
```

### Reactive Forms

```typescript
@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <input formControlName="title" />
      @if (form.controls.title.errors?.["required"] && form.controls.title.touched) {
        <span class="error">Required</span>
      }
      <textarea formControlName="body"></textarea>
      <button type="submit" [disabled]="form.invalid">Save</button>
    </form>
  `,
})
export class PostFormComponent {
  private fb = inject(FormBuilder);
  form = this.fb.nonNullable.group({
    title: ["", [Validators.required, Validators.maxLength(200)]],
    body: ["", [Validators.required]],
  });
}
```

### RxJS Patterns

```typescript
// Search with debounce
searchTerm$ = new Subject<string>();
results$ = this.searchTerm$.pipe(
  debounceTime(300),
  distinctUntilChanged(),
  switchMap((term) => term.length < 2 ? EMPTY :
    this.searchService.search(term).pipe(catchError(() => EMPTY))
  )
);

// Combining streams
data$ = combineLatest({ user: this.authService.user$, posts: this.postService.posts$ }).pipe(
  map(({ user, posts }) => ({ posts, isAdmin: user.role === "admin" }))
);
```

### HTTP Interceptors (Functional)

```typescript
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  if (token) req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  return next(req).pipe(catchError((err) => { if (err.status === 401) inject(AuthService).logout(); throw err; }));
};
```

## State Management

| Approach | Best For | Notes |
|----------|----------|-------|
| Signals | Component/service state | Built-in, simple, synchronous |
| RxJS | Complex async flows | Streams, combining, timing |
| NgRx Signals Store | Medium-large apps | Structured, devtools |
| NgRx Store | Large enterprise apps | Redux pattern, effects |
| Services + signals | Most apps | Simple DI-based state |

### Signal-Based Service State

```typescript
@Injectable({ providedIn: "root" })
export class TodoStore {
  private _todos = signal<Todo[]>([]);
  readonly todos = this._todos.asReadonly();
  readonly count = computed(() => this._todos().length);
  add(title: string) { this._todos.update((t) => [...t, { id: crypto.randomUUID(), title, done: false }]); }
  toggle(id: string) { this._todos.update((t) => t.map((i) => i.id === id ? { ...i, done: !i.done } : i)); }
}
```

## Performance Best Practices

- Use `@defer` for lazy loading below-fold and heavy components
- Use `track` in `@for` for efficient list re-rendering
- Use `OnPush` change detection with signals for minimal checks
- Use `signal.asReadonly()` to prevent external mutation
- Avoid unnecessary subscriptions -- use the `async` pipe or `toSignal()`
- Lazy-load routes with `loadComponent` and `loadChildren`
- Use `trackBy` (or `track` in new syntax) in every list
- Profile with Angular DevTools to identify excessive change detection

```typescript
// Convert Observable to Signal
import { toSignal } from "@angular/core/rxjs-interop";

@Component({ changeDetection: ChangeDetectionStrategy.OnPush, /* ... */ })
export class DashboardComponent {
  private userService = inject(UserService);
  user = toSignal(this.userService.currentUser$);
}
```

## Anti-Patterns to Avoid

- **NgModules for new code** -- use standalone components, directives, and pipes
- **Manual subscribe in components** -- use `async` pipe, `toSignal()`, or `@defer`
- **Forgetting to unsubscribe** -- use `takeUntilDestroyed()` or `DestroyRef`
- **Overusing NgRx for simple state** -- signals + services suffice for most apps
- **Template-driven forms for complex forms** -- use reactive forms with validation
- **Large barrel files** -- import from specific paths to enable tree-shaking
- **Direct DOM manipulation** -- use Renderer2 or signals for template binding
- **Nested subscribes** -- use `switchMap`, `mergeMap`, or `concatMap`

## Testing

```typescript
describe("PostListComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostListComponent],
      providers: [provideHttpClientTesting(), { provide: PostService, useValue: mockPostService }],
    }).compileComponents();
  });

  it("should display posts", () => {
    const fixture = TestBed.createComponent(PostListComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll("app-post-card").length).toBeGreaterThan(0);
  });
});

// Component Harnesses (Angular Material)
const loader = TestbedHarnessEnvironment.loader(fixture);
const button = await loader.getHarness(MatButtonHarness.with({ text: "Save" }));
expect(await button.isDisabled()).toBe(true);
```

## Technology Recommendations

| Category | Recommended | Notes |
|----------|-------------|-------|
| UI library | Angular Material / PrimeNG | Official CDK or full-featured |
| State | Signals + Services / NgRx Signals | Built-in for most, NgRx for complex |
| Forms | Reactive Forms | Type-safe with `nonNullable` |
| HTTP | HttpClient + interceptors | Built-in, functional interceptors |
| Testing | Vitest / Jest + Playwright | Unit + E2E |
| Styling | Tailwind CSS / Angular Material | Utility or material design |
| SSR | Angular Universal / @angular/ssr | Built-in SSR support |
| Routing | Angular Router | Functional guards, lazy loading |
| Linting | ESLint + angular-eslint | Official lint rules |
| Build | esbuild (default in 17+) | Faster builds than webpack |
