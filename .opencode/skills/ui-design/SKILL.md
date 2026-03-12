---
name: ui-design
description: Visual design principles, UI patterns, spacing systems, typography, color, motion, and professional polish for web interfaces. Emphasizes distinctive, non-generic aesthetics that avoid "AI slop" through bold creative choices.
license: Apache-2.0
compatibility: opencode
---

# UI Design Skill

This skill provides visual design patterns and aesthetic guidelines for building professionally designed web interfaces. It complements the `frontend-development` skill which covers engineering implementation.

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## When to Use

Use this skill when:
- Building new pages, layouts, or UI components from scratch
- Improving the visual quality or polish of an existing interface
- Implementing a design system or component library
- Making aesthetic decisions (colors, typography, spacing, motion)
- Creating landing pages, dashboards, or marketing pages

> For accessibility (WCAG, ARIA, keyboard navigation), see `frontend-development`.
> For component implementation patterns (React, Vue, Svelte), see `frontend-development`.

## Design Spec (MANDATORY — before ANY UI work)

**Every project with a UI MUST have a design spec.** Before making any visual or layout changes, you must check for and use the project's design spec. All UI work must be consistent with this spec.

### Step 1: Check for Existing Spec

Look for `.spavn/design-spec.md` in the project root. If it exists, **read it and follow it** — every color, font, spacing value, and component pattern you use must align with the spec.

### Step 2: Create Spec if Missing

If `.spavn/design-spec.md` does NOT exist, you **MUST create one before writing any UI code**:

1. **Analyze the existing app** — scan all frontend files (components, pages, layouts, stylesheets, Tailwind config, theme files, CSS variables) to extract the current visual identity
2. **Identify existing patterns** — colors in use, font families, spacing conventions, border radii, shadow usage, component styles
3. **Synthesize into a spec** — consolidate findings into a coherent design spec, resolving any inconsistencies by choosing the dominant or best pattern
4. **Save to `.spavn/design-spec.md`** using the template below

If the project has no existing UI (greenfield), generate a design spec based on the project type (SaaS, marketing, developer tool, etc.) and ask the user to confirm key branding choices (primary color, font family, overall feel) before proceeding.

### Step 3: Reference the Spec During Implementation

For every UI change:
- Use **only** the colors defined in the spec
- Use **only** the typography scale from the spec
- Follow the spacing system in the spec
- Match the component patterns (border radius, shadows, button styles) from the spec
- Maintain the overall look & feel described in the spec

If a task requires something not covered by the spec (e.g., a new component type, a new color for a new feature), **extend the spec first**, then implement.

### Design Spec Template

```markdown
# Design Spec — [Project Name]

> Auto-generated from codebase analysis. Keep this file updated as the design evolves.
> Location: `.spavn/design-spec.md`

## Brand Identity

### Brand Personality
- **Tone**: [e.g., Professional & approachable / Bold & playful / Minimal & technical]
- **Feel**: [e.g., Modern SaaS / Enterprise / Developer tool / Consumer app]
- **Keywords**: [3-5 adjectives, e.g., clean, trustworthy, fast, friendly]

### Logo & Assets
- Logo location: [path or "not yet defined"]
- Favicon: [path or "not yet defined"]
- Brand mark usage notes: [any constraints]

## Color Palette

### Primary
- **Primary**: [hex] — [Tailwind class, e.g., `blue-600`]
- **Primary hover**: [hex] — [Tailwind class]
- **Primary light** (backgrounds): [hex] — [Tailwind class]
- **Primary dark** (text on light): [hex] — [Tailwind class]

### Accent (if applicable)
- **Accent**: [hex] — [Tailwind class]

### Neutrals
- **Background**: [hex] — [Tailwind class]
- **Surface** (cards, panels): [hex] — [Tailwind class]
- **Border**: [hex] — [Tailwind class]
- **Text primary**: [hex] — [Tailwind class]
- **Text secondary**: [hex] — [Tailwind class]
- **Text muted**: [hex] — [Tailwind class]

### Semantic Colors
- **Success**: [hex] — [Tailwind class]
- **Warning**: [hex] — [Tailwind class]
- **Error**: [hex] — [Tailwind class]
- **Info**: [hex] — [Tailwind class]

### Dark Mode (if applicable)
[Repeat the above structure for dark mode overrides, or note "N/A"]

## Typography

### Font Families
- **Headings**: [font name] — [source, e.g., Google Fonts / system / @fontsource]
- **Body**: [font name] — [source]
- **Monospace** (code): [font name] — [source]

### Type Scale
| Level | Size | Weight | Line Height | Tailwind |
|-------|------|--------|-------------|----------|
| Display | [px] | [weight] | [lh] | [classes] |
| H1 | [px] | [weight] | [lh] | [classes] |
| H2 | [px] | [weight] | [lh] | [classes] |
| H3 | [px] | [weight] | [lh] | [classes] |
| H4 | [px] | [weight] | [lh] | [classes] |
| Body | [px] | [weight] | [lh] | [classes] |
| Small | [px] | [weight] | [lh] | [classes] |
| Caption | [px] | [weight] | [lh] | [classes] |

## Spacing & Layout

### Base Unit
- **Base**: [e.g., 8px / 4px]
- **Scale**: [list the spacing scale used, e.g., 4, 8, 12, 16, 24, 32, 48, 64]

### Container
- **Max width**: [e.g., max-w-7xl / 1280px]
- **Page padding**: [e.g., px-4 sm:px-6 lg:px-8]

### Content Density
- **Target**: [Spacious / Balanced / Dense]

## Component Patterns

### Border Radius
- **Cards / Modals**: [e.g., rounded-xl / 12px]
- **Buttons / Inputs**: [e.g., rounded-lg / 8px]
- **Badges / Pills**: [e.g., rounded-full]

### Shadows
- **Cards**: [e.g., shadow-sm]
- **Dropdowns**: [e.g., shadow-md]
- **Modals**: [e.g., shadow-lg]

### Buttons
| Variant | Classes |
|---------|---------|
| Primary | [full Tailwind classes] |
| Secondary | [full Tailwind classes] |
| Ghost | [full Tailwind classes] |
| Destructive | [full Tailwind classes] |

### Inputs
- **Height**: [e.g., h-10 / 40px]
- **Border**: [e.g., border border-gray-300]
- **Focus**: [e.g., ring-2 ring-primary-500]
- **Error**: [e.g., border-red-500 + text-sm text-red-600 message below]

### Navigation Pattern
- **Type**: [Top navbar / Sidebar / Bottom tabs]
- **Active state**: [classes for active nav item]

## Look & Feel

### Overall Aesthetic
[1-2 sentences describing the visual identity, e.g., "Clean, minimal interface with generous whitespace, subtle shadows, and a blue-primary palette that conveys trust and professionalism."]

### Motion
- **Hover transitions**: [e.g., transition-colors duration-150]
- **Panel animations**: [e.g., transition-all duration-200 ease-in-out]
- **Respect reduced motion**: [yes/no]

### Iconography
- **Icon library**: [e.g., Lucide / Heroicons / Phosphor]
- **Default size**: [e.g., w-5 h-5 / 20px]
- **Style**: [e.g., outline / solid / duotone]

### Imagery
- **Style**: [e.g., illustrations / photos / abstract]
- **Source**: [e.g., in-house / Unsplash / none yet]

## Do's and Don'ts

### Do
- [e.g., Use the primary color for all main CTAs]
- [e.g., Maintain consistent padding inside cards (p-6)]
- [e.g., Use skeleton loaders for async content]

### Don't
- [e.g., Don't use arbitrary hex colors outside the palette]
- [e.g., Don't mix border radius values within the same context]
- [e.g., Don't skip hover/focus states on interactive elements]
```

### Updating the Spec

When you make intentional design changes (new component patterns, color additions, etc.), **update `.spavn/design-spec.md`** to reflect them. The spec is a living document that must stay in sync with the codebase.

## Visual Hierarchy & Layout

### Scanning Patterns
- **F-pattern** — users scan left-to-right, then down the left edge. Place key content in the first two lines and along the left margin.
- **Z-pattern** — for minimal content pages (landing, hero). Place logo top-left, CTA top-right, key info bottom-left, action bottom-right.

### Visual Weight
Elements draw attention through: **size** > **color/contrast** > **whitespace** > **position**. Use this hierarchy deliberately.

| Element | Size | Weight | Tailwind Example |
|---------|------|--------|-----------------|
| Page title (h1) | 36-48px | Bold (700-800) | `text-4xl font-bold` |
| Section heading (h2) | 24-30px | Semibold (600) | `text-2xl font-semibold` |
| Card title (h3) | 18-20px | Medium (500) | `text-lg font-medium` |
| Body text | 16px | Regular (400) | `text-base` |
| Caption / helper | 12-14px | Regular (400) | `text-sm text-gray-500` |
| Label / overline | 12px | Medium, uppercase | `text-xs font-medium uppercase tracking-wide` |

### Content Density
- **Spacious** (marketing, landing pages) — generous whitespace, large type, one idea per section
- **Balanced** (SaaS apps, settings) — moderate padding, clear grouping
- **Dense** (dashboards, data tables, admin panels) — compact spacing, smaller type, more info per viewport

> **When to deviate:** Dense layouts are fine for power-user tools. Spacious layouts hurt productivity in data-heavy interfaces.

## Spacing System

### Default: 8px Base Unit

All spacing derives from an 8px base. This creates visual rhythm and alignment.

| Token | Value | Use For | Tailwind |
|-------|-------|---------|----------|
| `space-0.5` | 4px | Icon padding, tight inline gaps | `p-1`, `gap-1` |
| `space-1` | 8px | Inline element gaps, input padding | `p-2`, `gap-2` |
| `space-2` | 16px | Card inner padding, form field gaps | `p-4`, `gap-4` |
| `space-3` | 24px | Card padding, group spacing | `p-6`, `gap-6` |
| `space-4` | 32px | Section inner padding | `p-8`, `gap-8` |
| `space-5` | 48px | Section gaps | `py-12`, `gap-12` |
| `space-6` | 64px | Major section separation | `py-16`, `gap-16` |
| `space-7` | 96px | Hero/page section padding | `py-24` |

### Container Widths
- **Prose content** — `max-w-prose` (65ch) for readable line lengths
- **Form content** — `max-w-lg` (512px) or `max-w-xl` (576px)
- **Dashboard content** — `max-w-7xl` (1280px) with side padding
- **Full-bleed sections** — no max-width, content inside a centered container

### The Whitespace Rule
Generous whitespace signals professionalism. Cramped layouts signal amateur work. When in doubt, add more space between sections, not less.

> **When to deviate:** Data-dense UIs (spreadsheets, trading platforms, IDEs) intentionally minimize whitespace. Follow the density level appropriate for the use case.

## Typography

### Default Type Scale (1.25 ratio)

| Level | Size | Line Height | Weight | Tailwind |
|-------|------|-------------|--------|----------|
| Display | 48-60px | 1.1 | Bold (700) | `text-5xl font-bold leading-tight` |
| H1 | 36px | 1.2 | Bold (700) | `text-4xl font-bold leading-tight` |
| H2 | 30px | 1.25 | Semibold (600) | `text-3xl font-semibold` |
| H3 | 24px | 1.3 | Semibold (600) | `text-2xl font-semibold` |
| H4 | 20px | 1.4 | Medium (500) | `text-xl font-medium` |
| Body | 16px | 1.5-1.75 | Regular (400) | `text-base leading-relaxed` |
| Small | 14px | 1.5 | Regular (400) | `text-sm` |
| Caption | 12px | 1.5 | Regular (400) | `text-xs text-gray-500` |

### Font Recommendations

| Project Type | Font | Tailwind Config |
|-------------|------|----------------|
| SaaS / Dashboard | Inter | `font-sans` with Inter loaded via Google Fonts or `@fontsource/inter` |
| Developer tools | Geist Sans + Geist Mono | Load via `@fontsource/geist-sans` |
| Marketing / Brand | System font stack | `font-sans` (default Tailwind) |
| Editorial / Blog | Serif pairing (e.g., Lora + Inter) | Custom `font-serif` in Tailwind config |

### Font Selection Philosophy

Choose distinctive, unexpected, characterful fonts that elevate the interface beyond generic defaults. The font is often the single most impactful aesthetic decision — treat it as a creative choice, not a checkbox.

- **Avoid generic fonts** (Inter, Roboto, Arial, system fonts) unless the project specifically requires them or the design spec mandates them
- **Pair a distinctive display font with a refined body font** — the contrast between an expressive heading typeface and a clean reading typeface creates visual interest and hierarchy
- **Seek out characterful options** — explore foundries, Google Fonts beyond page 1, and variable fonts that offer expressive range
- **Match the font to the tone** — a brutalist interface demands a different typeface than a luxury brand; let the Design Thinking direction guide your choice

> The Font Recommendations table above provides safe defaults for common project types. When the design direction calls for something bolder, use those as a starting point and explore beyond them.

### Rules
- **Max 2 font families** — one for headings (optional), one for body
- **Max 3 weights** — Regular (400), Medium (500), Bold (700)
- **Body line length** — 45-75 characters per line (`max-w-prose`)
- **Body line height** — 1.5 minimum for body text, 1.2-1.3 for headings

> **When to deviate:** Branding may require specific fonts. Always test readability at 16px body size. Never go below 14px for body text.

## Aesthetic Philosophy

This section provides creative direction for building interfaces that feel genuinely designed — not generated. Use these guidelines alongside the systematic design spec to create UIs with a clear point-of-view.

### Typography as Identity

Typography is the most powerful tool for establishing visual identity. Choose fonts that are beautiful, unique, and interesting — fonts that someone would notice and remember.

- **Distinctive over safe** — opt for characterful choices that elevate the interface's aesthetics; unexpected, memorable font pairings
- **Pair intentionally** — a distinctive display font with a refined body font creates contrast and hierarchy
- **Vary across projects** — NEVER converge on the same "safe" choices (e.g., Space Grotesk) across different designs. Each project deserves its own typographic identity

### Color & Theme

Commit to a cohesive aesthetic rather than a timid, evenly-distributed palette.

- **Use CSS variables** for consistency across the entire interface
- **Dominant colors with sharp accents** outperform safe, evenly-balanced palettes — pick a strong primary and let accents punctuate, not compete
- **Dark vs. light is a creative choice** — vary between light and dark themes based on the design direction, not habit
- **Color should reinforce tone** — a luxury interface uses restrained, rich tones; a playful interface uses saturated, energetic ones

### Motion & Micro-Interactions

Use animations to create delight and communicate state, not to fill space.

- **Prioritize CSS-only solutions** for HTML/vanilla projects
- **Use Motion library** (Framer Motion) for React when available
- **Focus on high-impact moments** — one well-orchestrated page load with staggered reveals (`animation-delay`) creates more delight than scattered micro-interactions
- **Scroll-triggered animations** and hover states that surprise add personality
- **Entrance choreography** — stagger elements on page load to create a sense of intentional reveal rather than everything appearing at once

### Spatial Composition

Break free from predictable grid layouts when the design direction calls for it.

- **Unexpected layouts** — asymmetry, overlap, diagonal flow, grid-breaking elements
- **Generous negative space OR controlled density** — both are valid, but choose deliberately
- **Overlap and layering** — elements that break out of their containers create depth and visual interest
- **Diagonal and non-linear flow** — guide the eye through unexpected paths when appropriate
- **Scale contrast** — pair very large elements with very small ones for dramatic hierarchy

### Backgrounds & Visual Details

Create atmosphere and depth rather than defaulting to solid colors.

- **Gradient meshes** — multi-point gradients that create organic, flowing color transitions
- **Noise textures** — subtle grain overlays that add tactile quality to flat surfaces
- **Geometric patterns** — repeating shapes that create rhythm and visual texture
- **Layered transparencies** — overlapping semi-transparent elements for depth
- **Dramatic shadows** — shadows as a design element, not just elevation
- **Decorative borders** — borders that contribute to the aesthetic, not just separate content
- **Custom cursors** — cursor changes that reinforce the interface's personality
- **Grain overlays** — film-grain effects that add warmth and analog character

### Anti-AI-Slop Guidelines

NEVER produce generic AI-generated aesthetics. Specifically avoid:

- **Overused font families** — Inter, Roboto, Arial, system fonts as a default choice (they're fine when the design spec requires them, but never as a lazy default)
- **Cliché color schemes** — particularly purple gradients on white backgrounds, the "AI startup" palette
- **Predictable layouts** — cookie-cutter hero + 3-column features + testimonials without any creative interpretation
- **Component patterns without character** — every card, button, and section looking like a UI kit demo
- **Sameness across projects** — if two different projects look like they could be the same site, something went wrong

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No two designs should look the same.

### Execution Complexity

Match implementation complexity to the aesthetic vision:

- **Maximalist designs** need elaborate code with extensive animations, layered effects, rich textures, and detailed interactions. Don't hold back — commit fully to the vision with the code to back it up.
- **Minimalist or refined designs** need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from what you leave out and how perfectly you execute what remains.
- **The key is intentionality** — every CSS property, every animation, every color choice should serve the design direction. Random complexity is worse than simplicity.

> Remember: extraordinary creative work is possible. Don't default to safe choices — commit fully to a distinctive vision and execute it with precision.

## Color System

### Default Palette Structure

```
Primary    → Brand color, CTAs, active states (1 hue, 50-950 scale)
Accent     → Secondary actions, highlights (1 hue, optional)
Neutral    → Text, backgrounds, borders (gray scale, 50-950)
Success    → Confirmations, positive states (green)
Warning    → Caution, attention needed (amber/yellow)
Error      → Destructive actions, validation errors (red)
Info       → Informational, neutral callouts (blue)
```

### Shade Scale Convention

Generate 50-950 shades for each color. Use the middle ranges (400-600) as the base, lighter shades for backgrounds, darker for text.

| Shade | Light Mode Use | Dark Mode Use |
|-------|---------------|---------------|
| 50 | Tinted backgrounds | — |
| 100 | Hover backgrounds | — |
| 200 | Borders, dividers | Text (muted) |
| 300 | — | Borders |
| 400 | — | Secondary text |
| 500 | Icons, secondary text | Icons |
| 600 | Primary text, buttons | Buttons, links |
| 700 | Headings | Body text |
| 800 | — | Headings |
| 900 | — | Primary text |
| 950 | — | Backgrounds (surface) |

### Contrast Requirements
- **Normal text** — 4.5:1 minimum (WCAG AA)
- **Large text** (18px+ or 14px bold) — 3:1 minimum
- **UI components** (borders, icons, focus rings) — 3:1 minimum

### Dark Mode
- Invert the neutral scale (light text on dark backgrounds)
- Reduce saturation by 10-20% — vivid colors are harsh on dark backgrounds
- Never use pure white (`#fff`) on pure black (`#000`) — use `gray-100` on `gray-900`
- Semantic colors: slightly lighter variants than light mode (e.g., `green-400` instead of `green-600`)

> **When to deviate:** Brand guidelines may dictate specific colors. Always verify contrast ratios. Use tools like Realtime Colors or Tailwind's built-in dark mode utilities.

## Component Design Patterns

### Cards

```html
<!-- Standard card -->
<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
  <h3 class="text-lg font-semibold text-gray-900">Title</h3>
  <p class="mt-2 text-sm leading-relaxed text-gray-600">Description</p>
</div>

<!-- Interactive card (clickable) -->
<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm
            transition-shadow duration-200 hover:shadow-md cursor-pointer">
  <!-- content -->
</div>
```

**Defaults:** `rounded-xl` (12px), `border-gray-200`, `shadow-sm`, `p-6` (24px padding).

### Buttons

| Variant | Classes | Use For |
|---------|---------|---------|
| Primary | `bg-primary-600 text-white hover:bg-primary-700 rounded-lg px-4 py-2.5 font-medium text-sm` | Main actions |
| Secondary | `border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 rounded-lg px-4 py-2.5 font-medium text-sm` | Secondary actions |
| Ghost | `text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg px-4 py-2.5 font-medium text-sm` | Tertiary actions |
| Destructive | `bg-red-600 text-white hover:bg-red-700 rounded-lg px-4 py-2.5 font-medium text-sm` | Delete, remove |

**States:** Always implement `disabled:opacity-50 disabled:cursor-not-allowed`. Loading state: replace text with a spinner + "Loading..." or keep the button width stable with a spinner replacing the icon.

### Forms

- Labels **above** inputs (not inline, not floating)
- Consistent input height: `h-10` (40px) for default, `h-9` (36px) for compact
- Focus ring: `focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:outline-none`
- Validation: inline error message below the field in `text-sm text-red-600`
- Group related fields with spacing `space-y-4` inside a section, `space-y-6` between sections

### Navigation

| Pattern | When | Key Classes |
|---------|------|-------------|
| Top navbar | Marketing, simple apps | `sticky top-0 z-50 border-b bg-white/80 backdrop-blur` |
| Sidebar | Dashboards, admin, complex apps | `fixed inset-y-0 left-0 w-64 border-r bg-white` |
| Bottom tabs | Mobile-first apps | `fixed bottom-0 inset-x-0 border-t bg-white` |

**Active state:** Use `bg-primary-50 text-primary-700 font-medium` for sidebar items, `border-b-2 border-primary-600` for top nav tabs.

### Tables

- Header: `bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500`
- Rows: alternate `bg-white` / `bg-gray-50` or use `divide-y divide-gray-200`
- Sticky header: `sticky top-0 z-10`
- Mobile: horizontal scroll with `overflow-x-auto` or collapse to card layout below `md:`

### Empty States

Always provide: illustration or icon + descriptive message + primary action CTA.

```html
<div class="flex flex-col items-center justify-center py-12 text-center">
  <div class="text-gray-400"><!-- icon or illustration --></div>
  <h3 class="mt-4 text-lg font-medium text-gray-900">No projects yet</h3>
  <p class="mt-2 text-sm text-gray-500">Get started by creating your first project.</p>
  <button class="mt-6 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700">
    Create Project
  </button>
</div>
```

### Loading States

Prefer **skeleton loaders** over spinners — they communicate layout and reduce perceived wait time.

```html
<!-- Skeleton card -->
<div class="animate-pulse rounded-xl border border-gray-200 bg-white p-6">
  <div class="h-5 w-2/3 rounded bg-gray-200"></div>
  <div class="mt-3 h-4 w-full rounded bg-gray-200"></div>
  <div class="mt-2 h-4 w-4/5 rounded bg-gray-200"></div>
</div>
```

Use spinners only for inline actions (button loading, saving indicator).

## Shadows, Borders & Depth

### Elevation Model

| Level | Use | Tailwind | When |
|-------|-----|----------|------|
| Base | Page background, inset content | — (no shadow) | Default state |
| Raised | Cards, panels | `shadow-sm` | Resting content containers |
| Floating | Dropdowns, popovers | `shadow-md` | Overlays triggered by interaction |
| Overlay | Modals, dialogs | `shadow-lg` | Full-screen overlays |
| Toast | Notifications, toasts | `shadow-xl` | Highest priority, topmost layer |

### Defaults
- **Border radius** — `rounded-xl` (12px) for cards/modals, `rounded-lg` (8px) for buttons/inputs, `rounded-full` for avatars/pills
- **Borders** — `border border-gray-200` for separation, `border-2 border-primary-500` for emphasis/focus
- **Dividers** — `divide-y divide-gray-200` between list items

> **When to deviate:** Sharper radius (`rounded-md` or `rounded-lg`) suits enterprise/data-heavy UIs. Softer radius (`rounded-2xl`, `rounded-3xl`) suits consumer/playful products.

## Responsive Design

### Mobile-First Approach

Write styles for mobile first, then layer on complexity at larger breakpoints.

| Breakpoint | Tailwind | Target |
|-----------|----------|--------|
| Default | — | Mobile (320-639px) |
| `sm:` | 640px | Large phones / small tablets |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Laptops |
| `xl:` | 1280px | Desktops |
| `2xl:` | 1536px | Large monitors |

### Fluid Typography

Use `clamp()` for font sizes that scale smoothly without breakpoints:

```html
<!-- Fluid heading: 24px at 320px viewport → 48px at 1280px viewport -->
<h1 class="text-[clamp(1.5rem,1rem+2.5vw,3rem)] font-bold">Heading</h1>
```

### Responsive Patterns

| Mobile | Desktop | Pattern |
|--------|---------|---------|
| Stacked cards | Grid `md:grid-cols-2 lg:grid-cols-3` | Card layout |
| Hamburger menu | Full navbar | Navigation |
| Bottom sheet | Sidebar | Secondary nav |
| Full-width table scroll | Standard table | Data display |
| Tabs (horizontal scroll) | Sidebar tabs | Settings/filters |

### Touch Targets
- Minimum **44x44px** for all interactive elements on mobile
- Use `min-h-[44px] min-w-[44px]` or adequate padding

## Motion & Animation

### Purpose
Motion should **communicate**, not decorate. Use it for: feedback (click/hover), relationships (parent-child), and state transitions (loading → loaded).

### Duration Scale

| Type | Duration | Easing | Use For |
|------|----------|--------|---------|
| Micro | 100-150ms | `ease-out` | Hover, focus, toggle, color change |
| Standard | 200-300ms | `ease-in-out` | Panel open/close, accordion, tab switch |
| Emphasis | 300-500ms | `ease-out` | Page transition, modal enter, hero animation |

### Common Patterns

```html
<!-- Fade in on mount -->
<div class="animate-in fade-in duration-300">Content</div>

<!-- Hover scale for interactive cards -->
<div class="transition-transform duration-200 hover:scale-[1.02]">Card</div>

<!-- Smooth color transitions (always add to interactive elements) -->
<button class="transition-colors duration-150">Button</button>

<!-- Skeleton shimmer -->
<div class="animate-pulse bg-gray-200 rounded">Loading...</div>
```

### Reduced Motion (MANDATORY)

Always respect user preferences:

```html
<div class="motion-safe:animate-in motion-safe:fade-in motion-reduce:opacity-100">
  Content
</div>
```

Or in CSS: `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition-duration: 0.01ms !important; } }`

> **When to deviate:** Skip animations entirely for data-heavy apps where performance matters more than polish. Loading indicators (spinners, progress bars) should always animate regardless of preference.

## Page Composition Templates

### Landing Page
```
Hero (headline + subheadline + CTA + visual)     → py-24, text-center or split layout
Social proof (logos, "trusted by" bar)            → py-8, grayscale logos, border-y
Features grid (3-4 cards or icon + text blocks)   → py-16, grid-cols-3
Detailed feature (alternating text + image)       → py-16, repeat 2-3x
Testimonials (quotes in cards or carousel)        → py-16, bg-gray-50
CTA repeat (same CTA as hero)                     → py-16, text-center
Footer (links, legal, social)                     → py-8, border-t, text-sm
```

### Dashboard
```
Sidebar (w-64, fixed left, logo + nav links)
Top bar (sticky, breadcrumb + search + user menu)
Main content:
  KPI row (grid-cols-4, stat cards)               → gap-6
  Primary content (charts, tables, activity)      → grid-cols-1 or grid-cols-2
```

### Settings / Admin
```
Sidebar nav (vertical tabs or grouped links)
Content area:
  Section heading + description                   → border-b, pb-6
  Form group (labeled inputs)                     → space-y-4
  Action buttons (right-aligned Save/Cancel)      → pt-6, flex justify-end gap-3
```

### Blog / Article
```
Header (title + meta + author)                    → max-w-prose, mx-auto
Body (prose content)                              → max-w-prose, prose class
TOC sidebar (sticky, lg:block hidden)             → fixed right, top-24
```

### Authentication
```
Centered card on subtle background                → min-h-screen, flex items-center justify-center
Card (max-w-sm, logo + form + links)              → rounded-xl, shadow-lg, p-8
Minimal distractions (no nav, no footer)
```

## Professional Polish Checklist

Before shipping any UI, verify:

- [ ] **Spacing** — all spacing uses the defined scale (no arbitrary pixel values)
- [ ] **Typography** — max 3 visible text sizes per view, consistent weight usage
- [ ] **Color** — all colors from the defined palette, no one-off hex values
- [ ] **Interactive states** — hover, focus, active, disabled on every clickable element
- [ ] **Loading states** — skeleton or spinner for all async content
- [ ] **Empty states** — message + action for every zero-data view
- [ ] **Error states** — inline validation, toast/alert for API errors, error pages (404, 500)
- [ ] **Responsive** — tested at mobile (375px), tablet (768px), desktop (1280px)
- [ ] **Motion** — subtle transitions on interactive elements, `prefers-reduced-motion` respected
- [ ] **Contrast** — all text passes WCAG AA (4.5:1 normal, 3:1 large)
- [ ] **Border radius** — consistent across all components (same family of values)
- [ ] **Shadows** — used consistently per the elevation model
- [ ] **Favicon & metadata** — page titles, favicon, OG tags set
- [ ] **Content** — no Lorem Ipsum in production, realistic placeholder data
