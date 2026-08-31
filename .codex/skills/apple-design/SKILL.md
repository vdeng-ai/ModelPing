---
name: apple-design
description: Project-local Apple web design skill based on bowen31337/apple-design. Use for Apple iOS 26 / macOS Tahoe visual systems, Liquid Glass materials, optical typography, physically grounded motion, and Apple-quality web UI polish.
---

# Apple Design for ModelPing

Upstream source: https://github.com/bowen31337/apple-design

This project-local skill mirrors the upstream design intent while keeping the repository lean. When network access is available, consult the upstream `SKILL.md` and its `references/` directory for the full recipes. The rules below are mandatory for this project.

## Core model

Apple-style UI should behave like physical content under a material layer. Content stays primary and readable; chrome is restrained. Liquid Glass is not generic glassmorphism and not `blur()` everywhere.

A believable glass surface combines:
- translucency
- backdrop blur plus saturation/vibrancy
- directional specular highlight, strongest on the lit edge
- a subtle hairline rim
- physically believable layered shadow
- optional local refraction/lensing for only a few important surfaces

Never apply heavy optical glass to data tables, body content, form content, or every card.

## Material hierarchy

Use material by role, not decoration.

1. **Content surface** — opaque/near-opaque, crisp, quiet. No backdrop blur.
2. **Standard Glass** — navigation, toolbar, ordinary floating controls, segmented controls, search, light popovers. Thin-to-regular material with restrained tint.
3. **Optical Glass** — only a few key surfaces such as the main floating navigation shell, important dialog/popover, or a focal floating toolbar. May use SVG displacement/refraction and very subtle chromatic dispersion as progressive enhancement.

Larger glass surfaces should appear optically thicker: more separation, slightly more opacity/blur, deeper environmental shadow, stronger but still restrained edge refraction.

Never stack translucent glass directly on translucent glass when it muddies content.

## Color and Amethyst Quartz direction

ModelPing uses an Amethyst Quartz interpretation:
- cyan/blue is the surrounding environmental light
- amethyst is a material/refraction accent, not a full-page purple tint
- default glass is close to neutral
- selected/primary surfaces may carry a small amount of brand/amethyst tint
- semantic success/warning/error colors stay semantic; do not turn the entire glass green/yellow/red

## Typography

Prefer the Apple system stack first:
`-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", "Segoe UI", system-ui, sans-serif`.

Do not ship SF font files.

Use optical hierarchy, not one global tracking value:
- large display/title text: tighter tracking and tighter leading
- body UI text: neutral tracking, comfortable leading
- captions/labels: slightly more open tracking
- mostly regular/medium/semibold; reserve bold for major titles
- enable `font-optical-sizing: auto`
- use rem/em for scalable type

## Motion

Motion must explain feedback, hierarchy, state, or spatial relationship.

- press feedback begins on pointer-down; subtle `scale(0.97)` is a good baseline
- never use `scale(0)` for UI entrance
- simple hover/fire-and-forget state changes may use CSS transitions
- use strong ease-out/custom curves for UI entrance/exit; never `ease-in` for direct UI feedback
- user-draggable/reversible/gesture-controlled motion must be spring-based, interruptible, velocity-aware, and start from the current presentation value
- default spring: critically damped, roughly `bounce: 0`, `visualDuration: 0.3–0.4`
- gesture momentum may use restrained `bounce: 0.15–0.25`
- avoid loading Motion or GSAP unless the product has an interaction that actually needs them
- animate transform and opacity whenever possible

## Accessibility and performance

Mandatory:
- `prefers-reduced-motion: reduce`: remove large/springy movement but keep immediate feedback
- `prefers-reduced-transparency: reduce`: replace glass with solid surfaces
- `prefers-contrast: more`: strengthen real boundaries/rims
- `-webkit-backdrop-filter` alongside `backdrop-filter`
- body text contrast remains readable through glass
- touch targets target at least 44px where practical
- `focus-visible` on all interactive controls
- heavy refraction is progressive enhancement only

## ModelPing-specific constraints

Preserve existing routes, information architecture, fields, API behavior, workflow, persistence, and Cloudflare request cadence. This is Apple Design Language adapted for a dense desktop web tool, not an enlarged iPhone screenshot.

Do not introduce new Worker endpoints, polling, analytics, remote visual assets, or server-side rendering solely for the design.

## Verification

Do not declare visual work complete from a successful build. Render real desktop and mobile views, light and dark, and compare screenshots against the approved concept. Verify reduced motion/transparency/contrast paths, hover/active/focus/keyboard states, overflow, scrolling, and glass readability.
