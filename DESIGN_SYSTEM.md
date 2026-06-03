# Design System — Lawstronaut Landing Page

> Derived from Figma file `CwGwvjktJPSZc2o1TezSa3` (prototype, node `196:50462`).
> Scope: marketing landing page for **Lawstronaut** (AI / legal-compliance product).
> NOTE: This is unrelated to the Duck Hunt game in `CLAUDE.md`. Do **not** apply
> these rules inside `src/` (game source). They apply to web/landing-page work only.

---

## 1. Theme & Visual Language

- **Mode:** Dark-first. Background defaults to near-black.
- **Motif:** Space / astronaut. Decorative layers include animated stars (`star loop`,
  `Moving Star`, `Star Animate`) and orbital lines (`planet line`).
- **Tone:** Editorial, high-contrast, generous whitespace, single bright accent.
- **No light mode in scope.** Do not invent a light theme without a design source.

---

## 2. Design Tokens

All tokens come straight from the Figma variables payload. **Never hardcode.**

### Colors

```ts
// src/styles/tokens.ts (or tailwind.config.ts theme.extend.colors)
export const colors = {
  // Surfaces
  bg:               "#212121",  // Gray 800 — page background
  surface:          "#ffffff",  // constant-colors/white — inverted cards / chips

  // Text
  textPrimary:      "#ffffff",  // Gray/Default, Gray/Dark
  textSecondary:    "#71717a",  // text/secondary
  textMuted:        "#B0B5C9",  // Typography/300

  // Accent (single accent — do not introduce more without design sign-off)
  accent:           "#1f5eff",  // accent/default — primary CTA
  accentAlt:        "#005CFA",  // Gray/Light — hover / pressed variant

  // Stroke
  strokeSecondary:  "#18181b0f", // stroke/secondary — 6% black hairlines
} as const;
```

- IMPORTANT: Use `accent` for primary CTAs only. Body links use `textPrimary` with an underline, not the accent color, unless the source design shows otherwise.
- IMPORTANT: `strokeSecondary` is intentionally translucent — do not substitute with a solid grey.

### Spacing

Figma exposes a discrete scale, not a linear ramp. Stick to these values; do not interpolate.

```
space-4   = 4px
space-6   = 6px
space-8   = 8px
space-10  = 10px
space-20  = 20px
space-24  = 24px
```

- For larger gaps (section padding, hero offsets) Figma uses raw pixels via Tailwind annotations (e.g. `Div [p-8]`, `Div [mt-4]`). Map those to Tailwind's default scale (`p-8` → 32px, `mt-4` → 16px). Do not invent intermediate values.

### Radius

```
radius-8  = 8px   // buttons, inputs, chips
radius-14 = 14px  // cards, feature tiles, media frames
```

### Typography

- **Family:** `Fira Sans` (Regular 400 confirmed; load weights 400/500/700 from Google Fonts).
- **Base paragraph:** `14px / 1.5 / 0` letter-spacing, weight 400.
- **Heading scale:** Only `H2 [text-5xl]` is explicitly named in Figma → ~`48px`. Other heading sizes are not specified — match adjacent type and confirm against the screenshot before shipping a new size.
- **Body color:** `textPrimary` on dark; `textSecondary` for supporting copy; `textMuted` for captions and form helper text.

```ts
export const typography = {
  fontFamily: '"Fira Sans", system-ui, sans-serif',
  body:   { size: 14, lineHeight: 1.5, weight: 400 },
  h2:     { size: 48, lineHeight: 1.1, weight: 700 },
} as const;
```

---

## 3. Components

Figma uses **flat lowercase names** (e.g. `button`) and **Tailwind-bracket annotations** on frames (`Div [flex]`, `Div [col-span-12]`). When implementing:

### Inventory (verbatim Figma names)

| Figma name                       | Code component        | Notes                                              |
|----------------------------------|-----------------------|----------------------------------------------------|
| `button`                         | `<Button>`            | Single variant in file — primary, accent-filled.   |
| `Input / Text field / Vue JS`    | `<TextField>`         | Slash-namespaced. Treat as the canonical input.    |
| `Component 6/8/9/10`             | Nav / chip elements   | Unnamed in source — confirm purpose before reuse.  |
| `star loop`, `planet line`, `Moving Star`, `Star Animate` | `<BgDecor>` | Decorative-only. Must be `aria-hidden` + `pointer-events: none`. |

### Button

- One variant only: filled, `accent` background, white label, `radius-8`.
- Hover/pressed: swap background to `accentAlt`.
- Disabled: 40% opacity, `cursor: not-allowed`.
- Min hit area 44×44; horizontal padding ≥ 20px (`space-20`).
- IMPORTANT: Do not add secondary/ghost/outline button variants until they appear in a future Figma update.

### TextField

- 1px stroke = `strokeSecondary`.
- `radius-8`.
- Label sits above; helper text uses `textMuted` 12–14px.
- Focus ring uses `accent` (2px, offset 2px).

### Decorative background

- Stars and planet lines are heavy in the source (110+ instances). Implement as a **single SVG/Canvas layer** behind the page, not as individual DOM nodes.
- Respect `prefers-reduced-motion`: disable `Moving Star` / `Star Animate` loops.

---

## 4. Layout

- **Desktop canvas:** 1425px (Figma). Translate to a `max-w-screen-xl` (1280) or custom 1425 container — pick one and stay consistent.
- **Grid:** 12 columns. Figma uses `Div [col-span-12]` heavily; expect full-width rows with nested splits.
- **Mobile mirrors:** breakpoint variants exist at ~922px tall narrow frames. Build mobile-first; desktop is the upper bound.
- **Section rhythm:** large vertical padding between sections (~`py-24` / 96px); within a section use `space-20` / `space-24` for stacks.

---

## 5. Naming Conventions

- Components: `PascalCase` (`Button`, `TextField`, `BgDecor`).
- Token keys: `camelCase` (`textPrimary`, `accentAlt`).
- File layout (suggested):
  ```
  src/
    components/
      ui/              # Button, TextField, Card
      decor/           # BgDecor, StarField
      sections/        # Hero, Features, Pricing, AboutUs, ContactUs, PlayThis
    styles/
      tokens.ts
      globals.css
  ```
- One component per file, named export matches filename.

---

## 6. Figma MCP Integration Rules

Required flow for every Figma-driven change:

1. Call `get_design_context` on the exact `nodeId`.
2. If the response is truncated, call `get_metadata` first to locate the right sub-node, then re-call `get_design_context` on it.
3. Call `get_screenshot` for visual reference.
4. Call `get_variable_defs` for tokens before writing any color/spacing/typography values.
5. Implement using the tokens in §2 — do not paste raw hex values from the MCP code output.
6. Validate against the screenshot for 1:1 parity before marking the task done.

### Translation rules

- Treat MCP-emitted React/Tailwind as a **reference**, not final code.
- Replace inline hex with `colors.*` tokens from `src/styles/tokens.ts`.
- Replace ad-hoc pixel values with the `space-*` / `radius-*` scale where they map; otherwise use Tailwind's default scale and document the mapping.
- Reuse existing components in `src/components/ui/` before creating new ones.
- Strip Figma auto-generated names (`Group 47`, `Frame 1116…`) — name elements semantically.

---

## 7. Asset Handling

- IMPORTANT: When Figma MCP returns a `localhost:*` source for an image or SVG, use it directly. Do not substitute placeholders.
- IMPORTANT: Do not install new icon packages — all icons in this design ship inside the Figma payload.
- Store downloaded raster assets in `public/assets/`. Store inline SVGs as `.tsx` components in `src/components/icons/`.
- Star / planet decor: prefer a single hand-authored SVG over 100+ individual exports.

---

## 8. Accessibility

- Color contrast: `textPrimary` (#fff) on `bg` (#212121) = 16.1:1 ✓. `textSecondary` (#71717a) on `bg` = 4.7:1 ✓ AA. `textMuted` (#B0B5C9) on `bg` = 8.6:1 ✓.
- Accent button: white on `#1f5eff` = 4.9:1 ✓ AA for normal text.
- All decorative layers (`BgDecor`, animated stars) must be `aria-hidden="true"`.
- Honor `prefers-reduced-motion` for every looping animation.
- Min interactive size 44×44.

---

## 9. What's Explicitly Out of Scope

- Light theme.
- Additional button variants (secondary / ghost / outline / destructive).
- Additional typography sizes beyond what appears in the Figma file.
- New accent colors. The palette is one accent + neutrals — keep it that way.

Update this document when the Figma file changes; do not drift the code ahead of the design source.
