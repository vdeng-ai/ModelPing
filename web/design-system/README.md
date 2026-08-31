# ModelPing Apple Web Design System

This design system adapts Apple iOS 26 / macOS Tahoe Liquid Glass principles to a dense desktop-first web tool without changing ModelPing's business logic, routes, fields, workflows, API behavior, or Cloudflare request cadence.

## Core hierarchy

1. **Content plane** — crisp, quiet, opaque data and form surfaces. No `backdrop-filter`.
2. **Standard Glass** — navigation, segmented controls, compact toolbars and common controls.
3. **Optical Glass** — rare floating/hero chrome only: app header, dialogs, popovers, password gate. Progressive SVG displacement/refraction is optional and falls back cleanly.

Glass is never the default container for content.

## Material levels

| Level | Use | Tint / depth |
| --- | --- | --- |
| Thin Standard Glass | ordinary controls, segmented shells, filters | near-colorless, light shadow |
| Regular Standard Glass | navigation, selected controls, toolbars | restrained amethyst accent only when active |
| Thick Optical Glass | modal, toast, popover, password gate | strongest specular rim, refraction, cyan/blue environment shadow |

Amethyst is treated as a **material property**, not a page-wide purple theme. Cyan/blue represents environmental transmission. Status colors remain semantic and do not become colored glass cards.

## Files

- `tokens.css` — semantic color, type, spacing, radius, material, elevation and motion tokens.
- `materials.css` — Standard Glass and Optical Glass primitives + accessibility fallbacks.
- `motion.css` — short dashboard motion policy, pointer-down feedback, reduced motion.
- `components.css` — mapping from current ModelPing UI classes to design-system roles.
- `../components/design-system/GlassControls.tsx` — reusable `GlassSegmentedControl` and `GlassButton`.
- `../components/design-system/GlassSurfaces.tsx` — reusable `GlassSurface`, `GlassNav`, `GlassToolbar`, `GlassDialog`, `GlassPopover`, `GlassSheet`.

## Typography

Apple platforms receive the system SF family through `-apple-system` / `BlinkMacSystemFont`. Inter remains a non-Apple fallback. Typography is role-based with size-specific tracking and leading:

- large/title text: tighter tracking, tighter leading
- body: neutral tracking
- captions/labels: slightly wider tracking
- UI weights: regular / medium / semibold; bold reserved for large titles

All new type tokens use relative units.

## Motion policy

ModelPing is a high-frequency technical dashboard, so restraint wins:

- pointer-down feedback is immediate
- common buttons use short CSS transitions
- recurring keyboard/high-frequency actions do not get ornamental entrance motion
- dialogs/toasts/popovers use transform + opacity only
- direct-manipulation surfaces (future draggable sheet/drawer only) should use a real spring with velocity handoff
- no GSAP/Motion dependency is added unless an actual gesture-driven interaction requires it

## Accessibility

The system includes:

- `prefers-reduced-motion`
- `prefers-reduced-transparency`
- `prefers-contrast: more`
- focus-visible rings
- touch targets around 44px
- solid/no-filter fallbacks
- content text stays on crisp surfaces whenever possible

## Responsive policy

This is Apple design language adapted for the web, not an iPhone screenshot copied into a browser.

- desktop keeps the professional two-column Test workbench
- navigation remains top chrome
- tablet stacks the setup panels above content
- mobile keeps all workflows and fields
- History keeps TTFT/Tokens/URL/Key/Time and becomes a horizontally scrollable data plane rather than deleting columns
- theme control remains accessible on mobile

## Cloudflare constraint

All visual effects are browser-local CSS/SVG. The design system adds no Worker endpoint, no polling, no persistence write, no analytics call, and no remote visual asset. Static assets remain static; `/api/*` behavior is unchanged.
