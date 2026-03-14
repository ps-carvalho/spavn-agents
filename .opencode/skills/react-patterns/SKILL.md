---
name: react-patterns
description: React 19+ patterns including Server Components, Actions, hooks architecture, state management, and performance optimization
license: Apache-2.0
compatibility: opencode
---

# React Patterns Skill

Patterns and best practices for building production React 19+ applications with modern APIs, hooks architecture, and performance-first design.

## When to Use

Use this skill when:
- Building new React applications or upgrading to React 19+
- Designing component architecture and hook composition
- Choosing state management strategies
- Optimizing rendering performance and bundle size
- Writing tests for React components and hooks
- Migrating from class components or legacy patterns

## Project Structure

```
src/
  app/                    # App config, providers, router
  components/ui/          # Primitives (Button, Input, Card)
  components/features/    # Feature-specific components
  components/layouts/     # Page layouts, shells
  hooks/                  # Shared custom hooks
  lib/                    # Utilities, constants, types
  stores/                 # Global state (Zustand/Jotai)
  types/                  # Shared TypeScript types
```

## Key Patterns

### Server Components (React 19)

Server Components run on the server and send serialized output to the client. They reduce bundle size and enable direct data access.

```tsx
// server component (default in App Router) — no "use client" directive
async function ProductList() {
  const products = await db.product.findMany();
  return (
    <ul>
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </ul>
  );
}
```

Rules for Server Components:
- Cannot use hooks (useState, useEffect, etc.)
- Cannot use browser APIs or event handlers
- Can directly access databases, file systems, environment variables
- Can import Client Components but not the reverse
- Pass serializable props only to Client Components

### The `use()` Hook (React 19)

```tsx
"use client";
import { use } from "react";

function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise);
  return comments.map((c) => <p key={c.id}>{c.body}</p>);
}

// Parent streams the promise via Suspense
function Page() {
  const commentsPromise = fetchComments();
  return (
    <Suspense fallback={<Skeleton />}>
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  );
}
```

### Actions (React 19)

```tsx
"use client";
import { useActionState } from "react";

function AddToCart({ productId }: { productId: string }) {
  const [state, action, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const result = await addToCartAction(productId);
      return result;
    },
    null
  );

  return (
    <form action={action}>
      <button disabled={isPending}>
        {isPending ? "Adding..." : "Add to Cart"}
      </button>
      {state?.error && <p className="error">{state.error}</p>}
    </form>
  );
}
```

### useOptimistic (React 19)

```tsx
"use client";
import { useOptimistic } from "react";

function MessageList({ messages, sendMessage }: Props) {
  const [optimistic, addOptimistic] = useOptimistic(
    messages,
    (state, newMsg: string) => [...state, { text: newMsg, pending: true }]
  );

  async function handleSubmit(formData: FormData) {
    const text = formData.get("text") as string;
    addOptimistic(text);
    await sendMessage(text);
  }

  return (
    <>
      {optimistic.map((m, i) => (
        <p key={i} style={{ opacity: m.pending ? 0.5 : 1 }}>{m.text}</p>
      ))}
      <form action={handleSubmit}>
        <input name="text" />
      </form>
    </>
  );
}
```

### Compound Components

```tsx
const TabsContext = createContext<TabsContextValue | null>(null);

function Tabs({ children, defaultTab }: TabsProps) {
  const [active, setActive] = useState(defaultTab);
  return (
    <TabsContext value={{ active, setActive }}>
      <div role="tablist">{children}</div>
    </TabsContext>
  );
}

Tabs.Tab = function Tab({ id, children }: TabProps) {
  const { active, setActive } = use(TabsContext)!;
  return (
    <button role="tab" aria-selected={active === id} onClick={() => setActive(id)}>
      {children}
    </button>
  );
};

Tabs.Panel = function Panel({ id, children }: PanelProps) {
  const { active } = use(TabsContext)!;
  return active === id ? <div role="tabpanel">{children}</div> : null;
};
```

### Error Boundaries

```tsx
import { ErrorBoundary } from "react-error-boundary";

function App() {
  return (
    <ErrorBoundary
      fallback={<p>Something went wrong</p>}
      onError={(error, info) => reportError(error, info)}
      onReset={() => window.location.reload()}
    >
      <Main />
    </ErrorBoundary>
  );
}
```

### Custom Hooks

```tsx
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
```

## State Management

| Library | Best For | Paradigm |
|---------|----------|----------|
| Zustand | Most apps, simple global state | Flux-like, minimal boilerplate |
| Jotai | Fine-grained atomic state | Bottom-up atoms |
| Redux Toolkit | Large teams, complex state machines | Predictable, middleware-rich |
| TanStack Query | Server/async state | Cache-first, auto-refetch |
| Valtio | Proxy-based mutable style | Mutable proxy |
| useReducer | Complex local component state | Built-in reducer |

### Zustand Example

```tsx
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface CartStore {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  total: () => number;
}

const useCartStore = create<CartStore>()(
  devtools(
    persist(
      (set, get) => ({
        items: [],
        add: (item) => set((s) => ({ items: [...s.items, item] })),
        remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
        total: () => get().items.reduce((sum, i) => sum + i.price, 0),
      }),
      { name: "cart-storage" }
    )
  )
);
```

## Performance Best Practices

- Use `React.memo` only for components with expensive renders and stable props
- Prefer `useMemo` / `useCallback` when passing callbacks to memoized children
- Use `useDeferredValue` for non-urgent UI updates (search results, filtered lists)
- Use `useTransition` to keep the UI responsive during expensive state updates
- Virtualize long lists with TanStack Virtual or react-window
- Lazy-load routes and heavy components with `React.lazy` + `Suspense`
- Avoid creating objects/arrays inline in JSX props (breaks referential equality)
- Use the React Compiler (React 19) to auto-memoize where possible

```tsx
function SearchResults({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);
  const isStale = query !== deferredQuery;

  return (
    <div style={{ opacity: isStale ? 0.7 : 1 }}>
      <Results query={deferredQuery} />
    </div>
  );
}
```

## Anti-Patterns to Avoid

- **useEffect for derived state** -- use `useMemo` or compute during render instead
- **Props drilling through many layers** -- use Context, Zustand, or component composition
- **Fetching in useEffect without cleanup** -- use TanStack Query or the `use()` hook
- **Massive components** -- extract hooks and sub-components when a file exceeds 200 lines
- **Index as key in dynamic lists** -- use stable unique IDs
- **Syncing state from props** -- derive it or lift state up
- **Wrapping everything in useCallback/useMemo** -- profile first, optimize where measured
- **Placing "use client" at the top of every file** -- push client boundaries as low as possible

## Testing

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";

describe("Counter", () => {
  it("increments on click", async () => {
    const user = userEvent.setup();
    render(<Counter />);
    await user.click(screen.getByRole("button", { name: /increment/i }));
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
```

Testing rules:
- Query by role, label, or text -- not by test ID or CSS class
- Use `userEvent` over `fireEvent` for realistic interactions
- Test behavior, not implementation details
- Mock API calls at the network layer (MSW) not at the module level

## Technology Recommendations

| Category | Recommended | Notes |
|----------|-------------|-------|
| Build tool | Vite | Fast HMR, optimized production builds |
| State (client) | Zustand | Minimal boilerplate, great DX |
| State (server) | TanStack Query | Cache, refetch, optimistic updates |
| Styling | Tailwind CSS | Utility-first, consistent design |
| Forms | React Hook Form | Performant, minimal re-renders |
| Routing (SPA) | TanStack Router | Type-safe, file-based option |
| Testing | Vitest + RTL | Fast, compatible with Vite |
| API mocking | MSW | Intercepts at network level |
| Animation | Framer Motion | Declarative, layout animations |
| Component lib | Radix UI + Tailwind | Accessible, unstyled primitives |
