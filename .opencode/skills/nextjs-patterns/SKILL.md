---
name: nextjs-patterns
description: Next.js 14/15 App Router patterns including Server Components, caching strategies, Server Actions, and deployment optimization
license: Apache-2.0
compatibility: opencode
---

# Next.js Patterns Skill

Patterns and best practices for building production Next.js applications using the App Router, Server Components, and the full rendering/caching stack.

## When to Use

Use this skill when:
- Building full-stack React applications with Next.js 14 or 15
- Designing data fetching and caching strategies
- Choosing between Server and Client Components
- Implementing authentication, middleware, or API routes
- Optimizing performance with streaming, ISR, and static generation
- Deploying to Vercel or self-hosted environments

## Project Structure

```
app/
  (marketing)/            # Route group (no URL segment)
    page.tsx
    layout.tsx
  (dashboard)/
    layout.tsx            # Dashboard-specific layout
    dashboard/
      page.tsx
      loading.tsx         # Streaming fallback
      error.tsx           # Error boundary
    settings/
      page.tsx
  api/
    webhooks/
      route.ts            # Route handler
  globals.css
  layout.tsx              # Root layout
  not-found.tsx           # Custom 404
components/
  ui/                     # Shared UI primitives
  features/               # Feature components
lib/
  db.ts                   # Database client
  auth.ts                 # Auth utilities
  actions/                # Server Actions
  validators/             # Zod schemas
public/
middleware.ts             # Edge middleware
next.config.ts
```

## Key Patterns

### Server Components vs Client Components

```
Server Component (default)        Client Component ("use client")
- Fetch data directly              - useState, useEffect, hooks
- Access backend resources          - Event handlers (onClick, onChange)
- Keep secrets server-side          - Browser APIs (window, localStorage)
- Reduce client JS bundle           - Third-party client libraries
- Cannot use hooks or events        - Interactive UI (forms, modals)
```

Push `"use client"` boundaries as low as possible. Wrap only the interactive leaf, not the entire page.

### Server Actions

```tsx
// lib/actions/post.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});

export async function createPost(formData: FormData) {
  const parsed = CreatePostSchema.safeParse({
    title: formData.get("title"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }
  await db.post.create({ data: parsed.data });
  revalidatePath("/posts");
}
```

```tsx
// app/posts/new/page.tsx
import { createPost } from "@/lib/actions/post";

export default function NewPost() {
  return (
    <form action={createPost}>
      <input name="title" required />
      <textarea name="body" required />
      <button type="submit">Publish</button>
    </form>
  );
}
```

### Data Fetching

```tsx
// Server Component — direct async fetch
async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await db.product.findUnique({ where: { id } });
  if (!product) notFound();
  return <ProductDetail product={product} />;
}

// With fetch and caching
async function getPosts() {
  const res = await fetch("https://api.example.com/posts", {
    next: { revalidate: 60 }, // ISR: revalidate every 60s
  });
  return res.json();
}
```

### Streaming with Suspense

```tsx
import { Suspense } from "react";

export default function Dashboard() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<ChartSkeleton />}>
        <RevenueChart />
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <RecentOrders />
      </Suspense>
    </div>
  );
}
```

### Parallel Routes

```
app/
  @analytics/
    page.tsx
    loading.tsx
  @team/
    page.tsx
  layout.tsx              # Receives both as props
```

```tsx
// app/layout.tsx
export default function Layout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode;
  analytics: React.ReactNode;
  team: React.ReactNode;
}) {
  return (
    <div>
      {children}
      <div className="grid grid-cols-2">
        {analytics}
        {team}
      </div>
    </div>
  );
}
```

### Middleware

```tsx
// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*"],
};
```

### Metadata API

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My App",
  description: "Production Next.js application",
  openGraph: { title: "My App", type: "website" },
};

// Dynamic metadata
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  return { title: product.name, description: product.summary };
}
```

## Caching Strategy

| Layer | What | Default | Opt Out |
|-------|------|---------|---------|
| Fetch Cache | Individual fetch responses | Cached (GET) | `cache: "no-store"` |
| Data Cache | Persistent fetch cache across requests | Cached | `revalidate: 0` |
| Full Route Cache | Static HTML + RSC payload | Static routes cached | `export const dynamic = "force-dynamic"` |
| Router Cache | Client-side RSC payload cache | 30s dynamic, 5min static | `router.refresh()` |

### Revalidation Patterns

```tsx
// Time-based
fetch(url, { next: { revalidate: 3600 } }); // Every hour

// On-demand
import { revalidatePath, revalidateTag } from "next/cache";
revalidatePath("/products");
revalidateTag("products");

// Tag-based fetch
fetch(url, { next: { tags: ["products"] } });
```

## State Management

- **Server state**: Fetch directly in Server Components; no client cache needed
- **Client interactivity**: `useState`, `useReducer` for local state
- **Shared client state**: Zustand or Jotai (lightweight, no providers needed with Zustand)
- **Server mutations**: Server Actions with `useActionState` for form state
- **URL state**: `useSearchParams`, `usePathname` for filter/sort/pagination state

Avoid duplicating server data in client state. Fetch on the server, pass as props.

## Performance Best Practices

- Use Server Components by default; add `"use client"` only where required
- Leverage `loading.tsx` and Suspense for instant perceived performance
- Use `next/image` for automatic optimization, lazy loading, and responsive sizes
- Use `next/font` to self-host fonts with zero layout shift
- Enable PPR (Partial Prerendering) in Next.js 15 for hybrid static/dynamic pages
- Use `generateStaticParams` for pre-rendering dynamic routes at build time
- Minimize client-side JavaScript: audit with `@next/bundle-analyzer`
- Use Route Handlers for webhook endpoints and non-UI APIs
- Set appropriate `revalidate` intervals -- not everything needs real-time data

## Anti-Patterns to Avoid

- **Fetching in Client Components via useEffect** -- fetch in Server Components or use Server Actions
- **"use client" on layout or page level** -- push it down to the smallest interactive component
- **Ignoring caching defaults** -- understand what is cached automatically and opt out deliberately
- **Large client bundles from barrel exports** -- import from specific paths, not index files
- **Not using loading.tsx** -- every data-heavy route should have a loading state
- **Storing server data in client state** -- let Server Components own the data
- **Overusing Route Handlers** -- prefer Server Actions for mutations from the UI
- **Ignoring middleware matcher** -- always scope middleware to avoid running on static assets

## Technology Recommendations

| Category | Recommended | Notes |
|----------|-------------|-------|
| Auth | NextAuth.js v5 / Clerk | Built-in Next.js integration |
| Database ORM | Prisma / Drizzle | Type-safe, migration support |
| Validation | Zod | Schema validation for Actions |
| Styling | Tailwind CSS | Works with Server Components |
| Component lib | shadcn/ui | Copy-paste, customizable |
| Monitoring | Vercel Analytics / Sentry | Web Vitals, error tracking |
| Testing | Vitest + Playwright | Unit + E2E |
| Deployment | Vercel | Zero-config, edge support |
| Self-hosted | Docker + Node adapter | `output: "standalone"` |
| Email | React Email + Resend | JSX-based email templates |
