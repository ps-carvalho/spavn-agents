---
name: svelte-patterns
description: Svelte 5 patterns including Runes reactivity, snippet blocks, component composition, and performance optimization
license: Apache-2.0
compatibility: opencode
---

# Svelte Patterns Skill

Patterns and best practices for building production Svelte 5 applications with Runes, snippet blocks, and the compile-time reactivity model.

## When to Use

Use this skill when:
- Building new Svelte 5 applications or migrating from Svelte 4
- Designing component architecture with Runes ($state, $derived, $effect)
- Implementing shared reactive logic and state management
- Optimizing performance with Svelte's compile-time approach
- Writing tests for Svelte components
- Choosing between Svelte stores (legacy) and Runes

## Project Structure

```
src/
  lib/
    components/ui/        # Base components (Button, Input, Modal)
    components/features/  # Feature-specific components
    state/                # Shared state (Runes-based .svelte.ts modules)
    utils/                # Utility functions
    services/             # API clients
    types/                # TypeScript types
  routes/                 # SvelteKit pages (if using SvelteKit)
  app.html
```

## Key Patterns

### Runes: $state

```svelte
<script lang="ts">
  let count = $state(0);
  let items = $state<string[]>([]);

  function increment() {
    count++;
  }

  function addItem(item: string) {
    items.push(item); // Fine -- $state uses proxies for deep reactivity
  }
</script>

<button onclick={increment}>Count: {count}</button>

{#each items as item}
  <p>{item}</p>
{/each}
```

### Runes: $derived

```svelte
<script lang="ts">
  let items = $state<{ price: number; qty: number }[]>([]);

  // Simple derived
  let total = $derived(items.reduce((sum, i) => sum + i.price * i.qty, 0));

  // Complex derived with $derived.by
  let summary = $derived.by(() => {
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const tax = subtotal * 0.1;
    return { subtotal, tax, total: subtotal + tax };
  });
</script>

<p>Total: ${summary.total.toFixed(2)}</p>
```

### Runes: $effect

```svelte
<script lang="ts">
  let query = $state("");
  let results = $state<SearchResult[]>([]);

  // Runs when dependencies change (automatic tracking)
  $effect(() => {
    if (query.length < 2) {
      results = [];
      return;
    }

    const controller = new AbortController();
    fetch(`/api/search?q=${query}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => { results = data; });

    // Cleanup function
    return () => controller.abort();
  });
</script>

<input bind:value={query} placeholder="Search..." />
```

### Runes: $props and $bindable

```svelte
<!-- Button.svelte -->
<script lang="ts">
  interface Props {
    variant?: "primary" | "secondary";
    disabled?: boolean;
    onclick?: () => void;
    children: import("svelte").Snippet;
  }

  let { variant = "primary", disabled = false, onclick, children }: Props = $props();
</script>

<button class={variant} {disabled} {onclick}>
  {@render children()}
</button>
```

```svelte
<!-- TextInput.svelte — two-way binding -->
<script lang="ts">
  let { value = $bindable("") }: { value: string } = $props();
</script>

<input bind:value />

<!-- Parent usage -->
<TextInput bind:value={name} />
```

### Snippet Blocks

Snippets replace slots in Svelte 5, providing typed, composable template fragments.

```svelte
<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    header: Snippet;
    children: Snippet;
    footer?: Snippet;
  }

  let { header, children, footer }: Props = $props();
</script>

<div class="card">
  <div class="card-header">{@render header()}</div>
  <div class="card-body">{@render children()}</div>
  {#if footer}
    <div class="card-footer">{@render footer()}</div>
  {/if}
</div>

<!-- Parent usage -->
<Card>
  {#snippet header()}
    <h2>Title</h2>
  {/snippet}
  <p>Card body content</p>
  {#snippet footer()}
    <button>Save</button>
  {/snippet}
</Card>
```

### Snippets with Parameters (Generic Components)

```svelte
<!-- List.svelte — use generics="T" for type-safe reusable lists -->
<script lang="ts" generics="T">
  let { items, row, empty }: { items: T[]; row: Snippet<[T, number]>; empty?: Snippet } = $props();
</script>

{#each items as item, index}{@render row(item, index)}{:else}{#if empty}{@render empty()}{/if}{/each}
```

### Context API

```typescript
// lib/state/theme.svelte.ts
import { setContext, getContext } from "svelte";

const THEME_KEY = Symbol("theme");

export function setThemeContext() {
  let theme = $state<"light" | "dark">("light");

  function toggle() {
    theme = theme === "light" ? "dark" : "light";
  }

  const ctx = { get theme() { return theme; }, toggle };
  setContext(THEME_KEY, ctx);
  return ctx;
}

export function getThemeContext() {
  return getContext<ReturnType<typeof setThemeContext>>(THEME_KEY);
}
```

### Actions

```typescript
// Actions attach reusable behavior to DOM elements
export function clickOutside(node: HTMLElement, callback: () => void) {
  const handleClick = (e: MouseEvent) => { if (!node.contains(e.target as Node)) callback(); };
  document.addEventListener("click", handleClick, true);
  return { destroy() { document.removeEventListener("click", handleClick, true); } };
}
// Usage: <div use:clickOutside={() => { isOpen = false; }}>
```

### Transitions and Animations

```svelte
<!-- Built-in transition directives -->
{#if visible}
  <div transition:fade={{ duration: 200 }}>Fades in/out</div>
  <div in:fly={{ y: -20 }} out:fade>Flies in, fades out</div>
{/if}
<!-- animate:flip for list reordering -->
{#each items as item (item)}<div animate:flip transition:slide>{item}</div>{/each}
```

## State Management

| Approach | Use Case | Svelte 5 Pattern |
|----------|----------|------------------|
| $state in component | Local component state | `let x = $state(0)` |
| $state in module | Shared state across components | Export from .svelte.ts |
| Context API | Component subtree state | setContext + getContext |
| Svelte stores (legacy) | Backward compatibility | writable/readable |
| URL params | Filter/sort/pagination | SvelteKit searchParams |

### Shared State Module

```typescript
// lib/state/cart.svelte.ts — class-based reactive state
class CartState {
  items = $state<CartItem[]>([]);
  get total() { return this.items.reduce((sum, i) => sum + i.price * i.qty, 0); }
  get count() { return this.items.length; }
  add(item: CartItem) { this.items.push({ ...item, qty: 1 }); }
  remove(id: string) { this.items = this.items.filter((i) => i.id !== id); }
}
export const cart = new CartState();
```

## Performance Best Practices

- Svelte compiles away the framework -- no virtual DOM diffing overhead
- Use `$state` with primitives for the most efficient updates
- Use `$derived` instead of `$effect` for computed values -- avoids unnecessary side effects
- Avoid `$effect` for synchronizing state -- prefer `$derived` or event handlers
- Use `{#key expression}` to force re-creation of components when data changes
- Lazy-load heavy components with `{#await import(...)}` or SvelteKit route-level splitting
- Use `onMount` for browser-only setup (not `$effect` which also runs on update)
- Minimize deep reactive objects -- flat state shapes update more efficiently

## Anti-Patterns to Avoid

- **$effect for derived values** -- use `$derived` or `$derived.by` instead
- **$effect to synchronize two pieces of state** -- restructure to single source of truth
- **Mutating $props directly** -- use `$bindable` or emit events via callback props
- **Overusing context for global state** -- use module-level `$state` for app-wide state
- **Nested $effect calls** -- effects should be flat; compose with $derived
- **Not cleaning up in $effect** -- return a cleanup function for subscriptions and timers
- **Using stores when Runes suffice** -- Svelte 5 Runes are simpler and more performant
- **Ignoring TypeScript generics** -- use `generics="T"` on script tags for reusable components

## Testing

```typescript
import { render, screen } from "@testing-library/svelte";
import { userEvent } from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import Counter from "./Counter.svelte";

describe("Counter", () => {
  it("increments on click", async () => {
    const user = userEvent.setup();
    render(Counter, { props: { initial: 0 } });

    const button = screen.getByRole("button");
    await user.click(button);

    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
```

## Technology Recommendations

| Category | Recommended | Notes |
|----------|-------------|-------|
| Meta-framework | SvelteKit | Official, file-based routing |
| Build tool | Vite | Built into SvelteKit |
| Styling | Tailwind CSS | Scoped styles also built-in |
| Component lib | Bits UI / Melt UI | Headless, accessible |
| Forms | Superforms | SvelteKit form handling + validation |
| Testing | Vitest + Testing Library | Svelte Testing Library |
| Animation | svelte/transition | Built-in, performant |
| Icons | Lucide Svelte / Phosphor | Tree-shakeable icon sets |
| API mocking | MSW | Network-level mocking |
| State (complex) | Module $state / TanStack Query | Class-based or server state |
