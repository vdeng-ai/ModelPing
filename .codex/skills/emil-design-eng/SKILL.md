---
name: emil-design-eng
description: Project-local UI polish and interaction craft skill based on emilkowalski/skills/skills/emil-design-eng. Use for final design-engineering polish, interaction details, easing, component feel, origin, responsive feedback, and perceived performance.
---

# Emil Design Engineering for ModelPing

Upstream source: https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng

Use this skill after the primary visual system is established. It does not change product strategy or invent features; it makes the existing interface feel deliberate.

## Craft principles

- Taste is trained through comparison and iteration; do not accept merely functional UI.
- Small invisible details compound: origin, timing, press response, spacing, icon alignment, typography, focus restoration, and perceived speed all matter.
- Prefer fewer stronger interactions over decorative motion.

## Animation decision framework

Before animating, decide whether motion is warranted.

Frequency guidance:
- keyboard/high-frequency actions: no animation or nearly instant feedback
- frequent navigation/hover: very restrained
- occasional modal/popover/toast: standard short animation
- rare/first-time flows: can carry more delight

Every animation needs a reason: feedback, state indication, spatial consistency, explanation, or avoiding a jarring change.

## Timing and easing

- never use `transition: all`
- never use `ease-in` for entering/direct UI feedback
- prefer strong custom ease-out for entrance/exit
- use ease-in-out for movement that visibly travels between two on-screen positions
- most UI animation should stay under 300ms
- button press feedback: roughly 100–160ms
- small popover/tooltip: roughly 125–200ms
- dropdown/select: roughly 150–250ms
- modal/drawer: roughly 200–500ms only when the interaction justifies it

Useful curves:
- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`
- `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)`
- `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`

## Component feel

- pressable controls respond immediately on `:active` / pointer-down; a subtle `scale(0.97)` is a good baseline
- never animate UI from `scale(0)`; use `scale(0.94–0.97)` plus opacity when appropriate
- trigger-anchored popovers grow from their trigger; modals remain centered
- use transitions rather than keyframes for rapidly retargeted UI so motion stays interruptible
- enter/exit can be asymmetric; system responses should usually leave faster than they arrive
- tooltips/popovers should feel faster after the first one is already open
- use transform/opacity first for performant motion

## ModelPing-specific posture

ModelPing is a dense professional tool, not a playful consumer app. Keep motion crisp, quiet, and fast. Tables, repetitive row hover, keyboard actions, model selection, and frequent toolbar use should not become animated showcases.

High-value polish surfaces:
- top navigation and segmented controls
- modal and prompt transitions
- failure popover origin and timing
- toast entrance/exit
- selection indicator movement
- progress state changes
- focus, hover, press, disabled, and loading feedback

Do not add new business logic or Cloudflare runtime work for polish.

## Review format

When reviewing a before/after implementation, use a markdown table:

| Before | After | Why |
| --- | --- | --- |

Be concrete. A visual or interaction mismatch should identify the exact component/property and the intended correction.
