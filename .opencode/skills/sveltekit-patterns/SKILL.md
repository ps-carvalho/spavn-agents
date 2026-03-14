---
name: sveltekit-patterns
description: SvelteKit patterns including file-based routing, load functions, form actions, hooks, streaming, and multi-platform deployment
license: Apache-2.0
compatibility: opencode
---

# SvelteKit Patterns Skill

Patterns and best practices for building production SvelteKit applications with file-based routing, server/universal load functions, form actions, and multi-platform deployment.

## When to Use

Use this skill when:
- Building full-stack Svelte applications with SvelteKit
- Designing data loading and mutation strategies
- Implementing authentication, authorization, and middleware
- Choosing rendering strategies (SSR, SSG, SPA, streaming)
- Deploying to Vercel, Netlify, Cloudflare, Node.js, or static hosting
- Implementing form handling and progressive enhancement

## Project Structure

```
src/
  lib/
    components/ui/        # Shared UI components
    components/features/  # Feature components
    server/               # Server-only ($lib/server): db.ts, auth.ts
    state/                # Shared state (.svelte.ts modules)
    utils/                # Utilities
  routes/
    (marketing)/          # Route group (no URL segment)
    (app)/dashboard/      # +page.svelte, +page.server.ts, +error.svelte
    api/posts/+server.ts  # API endpoints
    +layout.svelte        # Root layout
  hooks.server.ts         # Server hooks (auth, logging)
  hooks.client.ts         # Client hooks
```

## Key Patterns

### Load Functions

```typescript
// Universal load (runs on server AND client)
// src/routes/posts/+page.ts
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ fetch, params, url }) => {
  const page = url.searchParams.get("page") ?? "1";
  const res = await fetch(`/api/posts?page=${page}`);
  const posts = await res.json();
  return { posts, page: Number(page) };
};
```

```typescript
// Server load (runs ONLY on server -- access DB, secrets)
// src/routes/posts/[id]/+page.server.ts
import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";

export const load: PageServerLoad = async ({ params, locals }) => {
  const post = await db.post.findUnique({
    where: { id: params.id },
  });
  if (!post) error(404, "Post not found");
  if (post.authorId !== locals.user?.id) error(403, "Forbidden");
  return { post };
};
```

```svelte
<!-- src/routes/posts/[id]/+page.svelte -->
<script lang="ts">
  import type { PageData } from "./$types";
  let { data }: { data: PageData } = $props();
</script>

<h1>{data.post.title}</h1>
<p>{data.post.body}</p>
```

### Layout Data

```typescript
// src/routes/(app)/+layout.server.ts
import type { LayoutServerLoad } from "./$types";
import { redirect } from "@sveltejs/kit";

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, "/login");
  return { user: locals.user };
};
```

Data from layouts is available to all child routes via `data.user`.

### Form Actions

```typescript
// src/routes/posts/new/+page.server.ts
import type { Actions, PageServerLoad } from "./$types";
import { fail, redirect } from "@sveltejs/kit";
import { z } from "zod";

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});

export const load: PageServerLoad = async () => {
  return { categories: await db.category.findMany() };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const formData = await request.formData();
    const parsed = PostSchema.safeParse({
      title: formData.get("title"),
      body: formData.get("body"),
    });

    if (!parsed.success) {
      return fail(400, {
        errors: parsed.error.flatten().fieldErrors,
        title: formData.get("title") as string,
        body: formData.get("body") as string,
      });
    }

    const post = await db.post.create({
      data: { ...parsed.data, authorId: locals.user.id },
    });

    redirect(303, `/posts/${post.id}`);
  },

  draft: async ({ request, locals }) => {
    // Named action for saving as draft
    const formData = await request.formData();
    await db.draft.upsert({ /* ... */ });
    return { success: true };
  },
};
```

```svelte
<!-- src/routes/posts/new/+page.svelte -->
<script lang="ts">
  import type { ActionData, PageData } from "./$types";
  import { enhance } from "$app/forms";

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<form method="POST" action="?/create" use:enhance>
  <label>
    Title
    <input name="title" value={form?.title ?? ""} />
    {#if form?.errors?.title}
      <span class="error">{form.errors.title[0]}</span>
    {/if}
  </label>

  <label>
    Body
    <textarea name="body">{form?.body ?? ""}</textarea>
  </label>

  <button type="submit">Publish</button>
  <button type="submit" formaction="?/draft">Save Draft</button>
</form>
```

### Server Hooks

```typescript
// src/hooks.server.ts
import { sequence } from "@sveltejs/kit/hooks";

const auth: Handle = async ({ event, resolve }) => {
  const session = event.cookies.get("session");
  if (session) event.locals.user = await getUserFromSession(session);
  return resolve(event);
};

export const handle = sequence(auth);

export const handleError: HandleServerError = async ({ error }) => {
  const errorId = crypto.randomUUID();
  console.error(`Error ${errorId}:`, error);
  return { message: "An unexpected error occurred", errorId };
};
```

### API Routes

```typescript
// src/routes/api/posts/+server.ts
export const GET: RequestHandler = async ({ url }) => {
  const posts = await db.post.findMany({ take: Number(url.searchParams.get("limit")) || 20 });
  return json(posts);
};
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) error(401, "Unauthorized");
  return json(await db.post.create({ data: await request.json() }), { status: 201 });
};
```

### Streaming

```typescript
// +page.server.ts
export const load: PageServerLoad = async () => {
  return {
    quick: await getQuickData(),
    // Streamed -- resolves after initial page render
    slow: getSlowData(), // Note: no await
  };
};
```

```svelte
<h1>{data.quick.title}</h1>

{#await data.slow}
  <p>Loading details...</p>
{:then details}
  <Details {details} />
{:catch error}
  <p>Failed to load: {error.message}</p>
{/await}
```

### Environment Variables

```typescript
// Server-only (secrets)
import { SECRET_API_KEY } from "$env/static/private";
import { env } from "$env/dynamic/private";
const key = env.SECRET_API_KEY;

// Client-safe (prefixed with PUBLIC_)
import { PUBLIC_APP_URL } from "$env/static/public";
import { env } from "$env/dynamic/public";
```

### Prerendering and SSG

```typescript
export const prerender = true;  // Static page at build time
export const ssr = false;       // SPA mode (disable SSR)

// Generate static params for dynamic routes
export async function entries() {
  return (await db.post.findMany({ select: { slug: true } })).map((p) => ({ slug: p.slug }));
}
```

## State Management

| Approach | Scope | Pattern |
|----------|-------|---------|
| Load function data | Route-level | Server/universal load returns |
| $state in .svelte.ts | Shared client state | Module-level exports |
| Context API | Component subtree | setContext / getContext |
| URL searchParams | Filters, pagination | $page.url.searchParams |
| Cookies | Persistent, server-readable | event.cookies / $app/stores |
| Form action data | Mutation results | ActionData in $props |

## Performance Best Practices

- Use `+page.server.ts` for database queries to keep secrets and heavy logic server-side
- Stream non-critical data by returning promises without `await` from load functions
- Prerender static pages with `export const prerender = true`
- Use `use:enhance` on forms for progressive enhancement without full page reloads
- Invalidate selectively with `invalidate("app:posts")` and `depends("app:posts")`
- Lazy-load heavy components with dynamic `import()` in `onMount`
- Use `+layout.ts` for data shared across multiple routes (fetched once)
- Set appropriate cache headers in hooks or load functions

## Anti-Patterns to Avoid

- **Fetching data in onMount instead of load functions** -- loses SSR and streaming benefits
- **Using +server.ts when form actions suffice** -- form actions are simpler for mutations
- **Not using use:enhance** -- without it, form submissions trigger full page reloads
- **Putting secrets in universal load (+page.ts)** -- use +page.server.ts for secrets and DB access
- **Ignoring type safety** -- always use $types imports for load/action type inference
- **Returning too much data from load** -- only return what the page needs, filter on the server
- **Large +layout.server.ts loads** -- heavy layout data blocks all child route rendering
- **Not handling error/loading states** -- use +error.svelte and {#await} for streamed data

## Technology Recommendations

| Category | Recommended | Notes |
|----------|-------------|-------|
| Forms | Superforms + Zod | Validation, progressive enhancement |
| Auth | Lucia / SvelteKit Auth | Session-based, OAuth providers |
| Database | Prisma / Drizzle | Type-safe ORM with migrations |
| Styling | Tailwind CSS | Works with scoped styles |
| Component lib | Bits UI / Skeleton | Accessible headless or themed |
| Testing | Vitest + Playwright | Unit + E2E |
| Adapter (Vercel) | @sveltejs/adapter-vercel | Edge and serverless |
| Adapter (Node) | @sveltejs/adapter-node | Self-hosted |
| Adapter (static) | @sveltejs/adapter-static | JAMstack / CDN |
| Adapter (CF) | @sveltejs/adapter-cloudflare | Workers / Pages |
| Monitoring | Sentry | Error tracking with source maps |
