---
name: nuxt-patterns
description: Nuxt 3 patterns including auto-imports, Nitro server routes, universal rendering, composables, and hybrid deployment
license: Apache-2.0
compatibility: opencode
---

# Nuxt Patterns Skill

Patterns and best practices for building production Nuxt 3 applications with auto-imports, Nitro server engine, hybrid rendering, and the Vue 3 Composition API.

## When to Use

Use this skill when:
- Building full-stack Vue applications with Nuxt 3
- Designing data fetching strategies with composables
- Implementing server routes and API endpoints with Nitro
- Choosing rendering modes (SSR, SSG, SPA, hybrid)
- Configuring middleware, plugins, and modules
- Deploying to Vercel, Netlify, Cloudflare, or Node.js

## Project Structure

```
app/
  components/             # Auto-imported (ui/, features/)
  composables/            # Auto-imported composables
  layouts/                # default.vue, dashboard.vue
  middleware/              # Route middleware (auth.ts)
  pages/                  # File-based routing (index.vue, posts/[id].vue)
  plugins/                # Nuxt plugins (api.ts)
  utils/                  # Auto-imported utilities
  app.vue                 # App entry
  error.vue               # Global error page
server/
  api/                    # API routes: posts/[id].get.ts, index.post.ts
  middleware/              # Server middleware
  utils/                  # Server-only utilities
nuxt.config.ts
```

## Key Patterns

### Auto-Imports

Nuxt auto-imports Vue APIs, composables, and utilities. No manual imports needed.

```vue
<script setup lang="ts">
// ref, computed, watch are auto-imported from vue
const count = ref(0);
const doubled = computed(() => count.value * 2);

// useRoute, useRouter, navigateTo are auto-imported from vue-router / nuxt
const route = useRoute();

// Custom composables from composables/ are auto-imported
const { user } = useAuth();
</script>
```

### Data Fetching

```vue
<script setup lang="ts">
// useAsyncData — wraps any async function with SSR support
const { data: posts, status, refresh } = await useAsyncData(
  "posts",
  () => $fetch("/api/posts")
);

// useFetch — shorthand for useAsyncData + $fetch
const { data: user } = await useFetch("/api/user", {
  query: { id: route.params.id },
  pick: ["name", "email"],   // Only serialize these fields
});

// useLazyFetch — non-blocking, loads after navigation
const { data: comments, pending } = useLazyFetch(
  `/api/posts/${route.params.id}/comments`
);
</script>

<template>
  <div>
    <div v-if="pending">Loading comments...</div>
    <div v-else>
      <Comment v-for="c in comments" :key="c.id" :comment="c" />
    </div>
  </div>
</template>
```

### Server Routes (Nitro)

```typescript
// server/api/posts/index.get.ts
export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  return db.post.findMany({ take: Number(query.limit) || 20 });
});

// server/api/posts/index.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const parsed = CreatePostSchema.safeParse(body);
  if (!parsed.success) throw createError({ statusCode: 400, data: parsed.error.flatten() });
  return db.post.create({ data: parsed.data });
});

// server/api/posts/[id].get.ts
export default defineEventHandler(async (event) => {
  const post = await db.post.findUnique({ where: { id: getRouterParam(event, "id") } });
  if (!post) throw createError({ statusCode: 404, message: "Post not found" });
  return post;
});
```

### useState (SSR-Safe Shared State)

```typescript
// composables/useCounter.ts
export function useCounter() {
  const count = useState<number>("counter", () => 0);
  function increment() { count.value++; }
  function decrement() { count.value--; }
  return { count, increment, decrement };
}
```

`useState` is SSR-safe and shared across components. It serializes state from server to client during hydration.

### Route Middleware

```typescript
// middleware/auth.ts
export default defineNuxtRouteMiddleware((to, from) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated.value && to.path !== "/login") {
    return navigateTo("/login");
  }
});

// Applied in page
definePageMeta({
  middleware: "auth",
});

// Or globally
// middleware/auth.global.ts
```

### Plugins

```typescript
// plugins/api.ts
export default defineNuxtPlugin(() => {
  const api = $fetch.create({
    baseURL: "/api",
    onRequest({ options }) {
      const token = useCookie("auth-token");
      if (token.value) options.headers.set("Authorization", `Bearer ${token.value}`);
    },
    onResponseError({ response }) { if (response.status === 401) navigateTo("/login"); },
  });
  return { provide: { api } };
});
// Usage: const { $api } = useNuxtApp();
```

### Layouts

```vue
<!-- layouts/dashboard.vue -->
<template>
  <div class="flex">
    <Sidebar />
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>

<!-- pages/dashboard.vue -->
<script setup lang="ts">
definePageMeta({ layout: "dashboard" });
</script>
```

### Error Handling

```vue
<!-- NuxtErrorBoundary for component-level errors -->
<template>
  <NuxtErrorBoundary>
    <template #error="{ error, clearError }">
      <div class="error">
        <p>{{ error.message }}</p>
        <button @click="clearError">Retry</button>
      </div>
    </template>
    <DangerousComponent />
  </NuxtErrorBoundary>
</template>
```

```typescript
// Throwing errors in server routes
throw createError({
  statusCode: 422,
  statusMessage: "Validation failed",
  data: { fields: errors },
});

// Global error handler
// error.vue at project root
```

### SEO

```vue
<script setup lang="ts">
useSeoMeta({
  title: "My Page",
  description: "Page description for search engines",
  ogTitle: "My Page",
  ogDescription: "Page description for social sharing",
  ogImage: "/og-image.png",
  twitterCard: "summary_large_image",
});

// Or with useHead for full control
useHead({
  title: "My Page",
  link: [{ rel: "canonical", href: "https://example.com/page" }],
  script: [{ type: "application/ld+json", innerHTML: jsonLd }],
});
</script>
```

## State Management

| Approach | Scope | Use Case |
|----------|-------|----------|
| useState | SSR-safe shared | Cross-component state with hydration |
| Pinia | Global store | Complex state, devtools, persistence |
| useAsyncData | Server state | API data with caching and refresh |
| Composables | Feature-local | Encapsulated reusable logic |
| useCookie | Persistent | Auth tokens, preferences |

## Rendering Modes (Hybrid Rendering)

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    "/":            { prerender: true },           // SSG at build time
    "/blog/**":     { isr: 3600 },                 // ISR: revalidate hourly
    "/dashboard/**": { ssr: false },               // SPA mode
    "/api/**":      { cors: true },                // CORS headers
    "/admin/**":    { redirect: "/dashboard" },    // Redirect
  },
});
```

## Performance Best Practices

- Use `useLazyFetch` / `useLazyAsyncData` for non-critical data to avoid blocking navigation
- Use `pick` option in `useFetch` to minimize serialized payload
- Leverage `routeRules` for per-route caching and rendering strategy
- Use `<NuxtImg>` (from `@nuxt/image`) for optimized images
- Prefetch routes with `<NuxtLink prefetch>`
- Use `useState` instead of Pinia for simple shared state to reduce bundle size
- Split server utilities into `server/utils/` for auto-import and tree-shaking
- Use `getCachedData` option in `useAsyncData` for client-side cache control
- Analyze bundle with `npx nuxt analyze`

## Anti-Patterns to Avoid

- **Using $fetch in components without useAsyncData** -- causes double fetch (server + client) during SSR
- **Importing Vue APIs manually** -- Nuxt auto-imports ref, computed, watch, etc.
- **Using localStorage directly** -- not SSR-safe; use `useCookie` or `useState`
- **Large plugins that run on every request** -- use lazy plugins or middleware scoping
- **Not handling pending/error states** -- always check `status` or `pending` from data fetching
- **Putting business logic in pages** -- extract to composables and server utils
- **Using process.env directly** -- use `useRuntimeConfig()` for environment variables
- **Ignoring Nitro route caching** -- use `routeRules` for static and ISR routes

## Technology Recommendations

| Category | Recommended | Notes |
|----------|-------------|-------|
| State | Pinia / useState | Pinia for complex, useState for simple |
| Content | Nuxt Content v2 | Markdown/MDC with query API |
| Images | @nuxt/image | IPX, Cloudinary, Imgix providers |
| Auth | nuxt-auth-utils / Sidebase Auth | Session-based or OAuth |
| UI | Nuxt UI / Radix Vue | Official or headless components |
| Styling | Tailwind CSS / UnoCSS | @nuxtjs/tailwindcss module |
| Forms | VeeValidate + Zod | Validation with schema |
| Testing | Vitest + @nuxt/test-utils | SSR-aware testing |
| Deployment | Vercel / Netlify / Cloudflare | Preset-based adapters |
| Monitoring | Sentry / Nuxt DevTools | Error tracking, debugging |
