---
name: frontend-development
description: Component architecture, state management, rendering strategies, styling, and accessibility for modern frontend applications
license: Apache-2.0
compatibility: opencode
---

# Frontend Development Skill

This skill provides patterns and best practices for building modern frontend applications across frameworks.

## When to Use

Use this skill when:
- Starting a new frontend project or choosing a framework
- Designing component architecture and state management
- Implementing routing, SSR/SSG, or rendering strategies
- Making styling and accessibility decisions
- Optimizing frontend performance and build tooling

## Component Architecture

### Design Principles
- Single Responsibility — one component, one purpose
- Composition over inheritance — combine small components into complex UIs
- Controlled vs uncontrolled — explicit state vs DOM-managed state
- Container/Presentational — separate data logic from rendering
- Compound components — related components that share implicit state

### Component Patterns

```typescript
// Composition pattern — flexible, reusable
interface CardProps {
  children: React.ReactNode;
}

function Card({ children }: CardProps) {
  return <div className="card">{children}</div>;
}

Card.Header = ({ children }: CardProps) => (
  <div className="card-header">{children}</div>
);
Card.Body = ({ children }: CardProps) => (
  <div className="card-body">{children}</div>
);
```

### Custom Hooks / Composables
- Extract reusable logic into hooks (React) or composables (Vue)
- Keep hooks focused — one concern per hook
- Prefix with `use` (React/Vue) for convention
- Return minimal API surface — only what consumers need

## Framework Patterns

### React
- Hooks for all state and effects (useState, useEffect, useReducer)
- Context for cross-cutting concerns (theme, auth, locale)
- Suspense + lazy() for code splitting
- Server Components (RSC) for reduced client bundle
- Error Boundaries for graceful failure handling

### Vue 3
- Composition API with `<script setup>` for concise components
- Composables for reusable logic (equivalent to React hooks)
- Provide/Inject for dependency injection
- Teleport for portal rendering
- Keep Options API for simple components if team prefers

### Angular
- Standalone components (preferred over NgModules)
- Signals for reactive state management
- Services with dependency injection for shared logic
- RxJS for complex async flows
- Structural directives for template logic

### Svelte
- Runes ($state, $derived, $effect) for reactivity (Svelte 5)
- Stores for shared state across components
- Actions for reusable DOM behavior
- Transitions and animations built-in
- Minimal boilerplate — write less, do more

### Laravel Frontend (Blade, Livewire, Inertia.js)
- **Blade** — Server-rendered templates with `@directives`, layouts, and components
- **Livewire** — Reactive components without writing JavaScript (server-driven SPA feel)
- **Inertia.js** — SPA experience using React/Vue/Svelte with Laravel backend (no API needed)
- **Vite integration** — Built-in Vite support for asset bundling (`@vite` directive)
- Use Livewire for CRUD-heavy admin panels and dashboards
- Use Inertia.js for full SPA behavior with Laravel routing and auth

## State Management

### State Categories
| Type | Scope | Tools |
|------|-------|-------|
| Local state | Single component | useState, ref(), signal |
| Shared state | Component subtree | Context, provide/inject, props |
| Global state | Entire app | Redux/Zustand, Pinia, NgRx, Svelte stores |
| Server state | Remote data cache | TanStack Query, SWR, Apollo Client |
| URL state | Browser URL | React Router, Vue Router, route params |
| Form state | Form inputs | React Hook Form, Formik, VeeValidate |

### Best Practices
- Keep state as local as possible — lift only when needed
- Normalize nested data in global stores
- Use server state libraries for API data — avoid duplicating cache
- Derive state instead of storing computed values
- Use optimistic updates for responsive UIs

## Routing & Navigation

- File-based routing (Next.js, SvelteKit, Nuxt) — convention over configuration
- Nested routes for layout composition
- Route guards / middleware for auth protection
- Code splitting by route for optimal loading
- Parallel routes for simultaneous views (Next.js App Router)
- Preserve scroll position on navigation

## Rendering Strategies

| Strategy | When to Use | Examples |
|----------|-------------|---------|
| CSR (Client-Side) | Interactive apps, auth-gated content | SPAs, dashboards |
| SSR (Server-Side) | SEO-critical, dynamic content | E-commerce, news sites |
| SSG (Static Generation) | Content that rarely changes | Blogs, docs, marketing |
| ISR (Incremental Static) | Static + periodic updates | Product catalogs |
| Streaming SSR | Large pages, progressive loading | Next.js App Router, SvelteKit |

### Meta-Framework Recommendations
- **Next.js** — React, hybrid rendering, App Router for RSC
- **Nuxt 3** — Vue 3, auto-imports, hybrid rendering
- **SvelteKit** — Svelte, file-based routing, adapters for any platform
- **Astro** — Content-focused, island architecture, multi-framework

## Styling Approaches

| Approach | Pros | Cons | Best For |
|----------|------|------|----------|
| Tailwind CSS | Fast, consistent, small bundle | Verbose markup | Most projects |
| CSS Modules | Scoped, standard CSS | No dynamic styles | Component libraries |
| CSS-in-JS | Dynamic, co-located | Runtime overhead | Theme-heavy apps |
| SCSS/Sass | Powerful, familiar | Global scope risk | Large legacy projects |

### Design Tokens
- Use CSS custom properties for theming
- Define tokens for colors, spacing, typography, shadows
- Support dark mode with `prefers-color-scheme` and class toggle
- Use design system tools (Style Dictionary, Tailwind config)

## Accessibility

### Core Requirements
- Semantic HTML first — use `<button>`, `<nav>`, `<main>`, `<article>`
- Keyboard navigation — all interactive elements focusable and operable
- ARIA attributes — use only when semantic HTML is insufficient
- Color contrast — minimum 4.5:1 for normal text (WCAG AA)
- Screen reader testing — test with VoiceOver, NVDA, or JAWS

### Common Patterns
- Skip navigation links for keyboard users
- Focus management on route changes (SPAs)
- Live regions (`aria-live`) for dynamic content updates
- Form labels — every input needs an associated label
- Alt text — descriptive for content images, empty for decorative

## Performance

### Core Web Vitals
- **LCP** (Largest Contentful Paint) < 2.5s — optimize hero images, fonts
- **INP** (Interaction to Next Paint) < 200ms — reduce JS execution
- **CLS** (Cumulative Layout Shift) < 0.1 — reserve space for dynamic content

### Optimization Techniques
- Memoization (useMemo, useCallback, React.memo, computed)
- Lazy loading for below-fold content and heavy components
- Virtualization for long lists (TanStack Virtual, react-window)
- Image optimization (next/image, responsive srcset, WebP/AVIF)
- Bundle analysis and tree shaking

## Build Tooling

### Recommended Tools
- **Vite** — Fast dev server, optimized production builds (recommended for most projects)
- **Turbopack** — Next.js incremental bundler
- **Webpack** — Mature, extensive plugin ecosystem
- **esbuild** — Ultra-fast bundling for libraries

### Best Practices
- Enable tree shaking — use ES modules, avoid side effects
- Configure code splitting — route-based and component-based
- Analyze bundle size regularly (rollup-plugin-visualizer, webpack-bundle-analyzer)
- Use import aliases for clean paths
- Configure path aliases in tsconfig and bundler

## Technology Recommendations

### By Project Type
| Project | Recommended Stack |
|---------|-------------------|
| SPA / Dashboard | React + Vite + Zustand + Tailwind |
| SEO + Dynamic | Next.js (App Router) + TanStack Query |
| Content Site | Astro + any UI framework + MDX |
| Enterprise App | Angular + NgRx + Material |
| Rapid Prototyping | SvelteKit + Tailwind |
| Vue Ecosystem | Nuxt 3 + Pinia + VueUse + Tailwind |
| Laravel Full-Stack | Laravel + Inertia.js + Vue/React + Tailwind |
| Laravel Server-Driven | Laravel + Livewire + Alpine.js + Tailwind (TALL stack) |
