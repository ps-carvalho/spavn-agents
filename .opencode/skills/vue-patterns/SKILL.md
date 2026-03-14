---
name: vue-patterns
description: Vue 3.4+ Composition API patterns including script setup, composables, reactivity system, and TypeScript integration
license: Apache-2.0
compatibility: opencode
---

# Vue Patterns Skill

Patterns and best practices for building production Vue 3.4+ applications with the Composition API, TypeScript, and modern tooling.

## When to Use

Use this skill when:
- Building new Vue 3 applications or migrating from Vue 2
- Designing composable architecture and shared logic
- Working with the Vue reactivity system (ref, reactive, computed)
- Implementing component patterns (compound, renderless, recursive)
- Optimizing rendering performance and bundle size
- Writing tests for Vue components and composables

## Project Structure

```
src/
  app/                    # App bootstrap (App.vue, router, plugins)
  components/
    ui/                   # Base components (BaseButton, BaseInput)
    features/             # Feature-specific components
    layouts/              # Layout shells
  composables/            # Shared composables (useAuth, useFetch)
  lib/                    # Utilities, constants, helpers
  services/               # API clients, external integrations
  stores/                 # Pinia stores
  types/                  # Shared TypeScript types/interfaces
  pages/                  # Route-level page components
  assets/                 # Static assets (images, fonts)
```

## Key Patterns

### Script Setup with TypeScript

```vue
<script setup lang="ts">
import { ref, computed } from "vue";

interface Props {
  title: string;
  count?: number;
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
});

const emit = defineEmits<{
  update: [value: number];
  close: [];
}>();

const doubled = computed(() => props.count * 2);

function handleClick() {
  emit("update", doubled.value);
}
</script>

<template>
  <div>
    <h2>{{ title }}</h2>
    <p>{{ doubled }}</p>
    <button @click="handleClick">Update</button>
  </div>
</template>
```

### defineModel (Vue 3.4+)

```vue
<!-- ToggleSwitch.vue -->
<script setup lang="ts">
const enabled = defineModel<boolean>("enabled", { required: true });
</script>

<template>
  <button @click="enabled = !enabled" :aria-pressed="enabled">
    {{ enabled ? "On" : "Off" }}
  </button>
</template>

<!-- Parent usage -->
<ToggleSwitch v-model:enabled="isActive" />
```

### Composables

```typescript
// composables/useFetch.ts — reusable data fetching
export function useFetch<T>(url: Ref<string> | string) {
  const data = ref<T | null>(null);
  const error = ref<Error | null>(null);
  const isLoading = ref(false);

  async function execute() {
    isLoading.value = true;
    error.value = null;
    try { data.value = await fetch(typeof url === "string" ? url : url.value).then(r => r.json()); }
    catch (e) { error.value = e as Error; }
    finally { isLoading.value = false; }
  }
  watchEffect(() => { execute(); });
  return { data, error, isLoading, refetch: execute };
}
```

### Provide / Inject (Dependency Injection)

```typescript
// keys.ts
import type { InjectionKey } from "vue";
export const ThemeKey: InjectionKey<Ref<"light" | "dark">> = Symbol("theme");

// Provider component
import { provide, ref } from "vue";
const theme = ref<"light" | "dark">("light");
provide(ThemeKey, theme);

// Consumer component
import { inject } from "vue";
const theme = inject(ThemeKey);
// theme is Ref<"light" | "dark"> | undefined
```

### Compound Components with Provide/Inject

```vue
<!-- Accordion.vue — parent provides shared state -->
<script setup lang="ts">
const AccordionKey: InjectionKey<{ activeId: Ref<string | null>; toggle: (id: string) => void }> = Symbol();
const activeId = ref<string | null>(null);
function toggle(id: string) { activeId.value = activeId.value === id ? null : id; }
provide(AccordionKey, { activeId, toggle });
</script>

<!-- AccordionItem.vue — child injects and reacts -->
<script setup lang="ts">
const props = defineProps<{ id: string }>();
const { activeId, toggle } = inject(AccordionKey)!;
const isOpen = computed(() => activeId.value === props.id);
</script>
<template>
  <button @click="toggle(id)" :aria-expanded="isOpen"><slot name="header" /></button>
  <div v-show="isOpen"><slot /></div>
</template>
```

### Teleport and Suspense

```vue
<!-- Modal rendered at document body -->
<Teleport to="body">
  <div v-if="isOpen" class="modal-overlay">
    <div class="modal" role="dialog" aria-modal="true">
      <slot />
    </div>
  </div>
</Teleport>

<!-- Async component with Suspense -->
<Suspense>
  <template #default>
    <AsyncDashboard />
  </template>
  <template #fallback>
    <LoadingSpinner />
  </template>
</Suspense>
```

### Template Refs

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";

const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  inputRef.value?.focus();
});
</script>

<template>
  <input ref="inputRef" />
</template>
```

## State Management

| Library | Best For | Paradigm |
|---------|----------|----------|
| Pinia | Most Vue apps | Official store, devtools support |
| VueUse | Utility composables | 200+ composables, browser/sensor APIs |
| Composables | Shared logic | Custom hooks, local to feature |
| Provide/Inject | Component subtree | DI without prop drilling |

### Pinia Store

```typescript
export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const token = ref<string | null>(null);
  const isAuthenticated = computed(() => !!token.value);
  async function login(creds: Credentials) {
    const res = await api.login(creds);
    user.value = res.user; token.value = res.token;
  }
  function logout() { user.value = null; token.value = null; }
  return { user, token, isAuthenticated, login, logout };
}, { persist: true });
```

## Performance Best Practices

- Use `shallowRef` / `shallowReactive` for large objects that change by reference
- Use `markRaw` for objects that should never be reactive (class instances, third-party objects)
- Use `v-once` for content that never changes after initial render
- Use `v-memo` to memoize template sub-trees based on dependency values
- Virtual scroll large lists with `vue-virtual-scroller` or VueUse `useVirtualList`
- Lazy-load routes with `defineAsyncComponent` or dynamic `import()`
- Avoid deep reactive objects when only top-level properties change
- Use `computed` instead of methods in templates for automatic caching

```typescript
// shallowRef for large datasets
const rows = shallowRef<Row[]>([]);
function updateRows(newRows: Row[]) {
  rows.value = newRows; // triggers reactivity only on reassignment
}

// markRaw for non-reactive objects
import { markRaw } from "vue";
const map = markRaw(new Map());
```

## Anti-Patterns to Avoid

- **Using reactive() for primitives** -- use `ref()` for primitives, `reactive()` for objects
- **Destructuring reactive objects** -- loses reactivity; use `toRefs()` or access via dot notation
- **Mutating props directly** -- emit events or use `defineModel` for two-way binding
- **Watchers for derived state** -- use `computed` instead of `watch` + manual state
- **Large monolithic components** -- extract composables and child components
- **Not using TypeScript generics with defineProps** -- always prefer `defineProps<T>()` over runtime props
- **Side effects in computed** -- computed should be pure; use `watchEffect` for side effects
- **Registering global components** -- prefer local imports for tree-shaking

## Testing

```typescript
import { mount } from "@vue/test-utils";
import { describe, it, expect } from "vitest";
import Counter from "./Counter.vue";

describe("Counter", () => {
  it("increments when clicked", async () => {
    const wrapper = mount(Counter, { props: { initial: 0 } });
    await wrapper.find("button").trigger("click");
    expect(wrapper.text()).toContain("1");
  });

  it("emits update event", async () => {
    const wrapper = mount(Counter);
    await wrapper.find("button").trigger("click");
    expect(wrapper.emitted("update")).toHaveLength(1);
  });
});
```

## Technology Recommendations

| Category | Recommended | Notes |
|----------|-------------|-------|
| Meta-framework | Nuxt 3 | SSR, auto-imports, file routing |
| State | Pinia | Official, devtools, persist plugin |
| Utilities | VueUse | 200+ composables |
| Build tool | Vite | Created by Vue author, native support |
| Styling | Tailwind CSS / UnoCSS | Utility-first |
| Component lib | Radix Vue / PrimeVue | Accessible, headless or themed |
| Forms | VeeValidate + Zod | Composition API forms |
| Testing | Vitest + Vue Test Utils | Fast, official test utils |
| Routing | Vue Router 4 | Official, typed routes |
| API layer | TanStack Query Vue | Server state caching |
