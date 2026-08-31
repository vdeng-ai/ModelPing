---
name: review-animations
description: Project-local animation review skill based on emilkowalski/skills/skills/review-animations. Reviews motion code against a high craft bar; approval is earned.
disable-model-invocation: true
---

# Review Animations

Upstream source: https://github.com/emilkowalski/skills/tree/main/skills/review-animations

This skill reviews motion only. It does not invent product features or review unrelated business logic.

## Non-negotiable standards

1. **Justified motion** — every animation must explain feedback, state, hierarchy, or spatial relationship.
2. **Frequency appropriate** — high-frequency/keyboard actions should not animate; frequent hover/navigation should be drastically restrained.
3. **Responsive easing** — entering/exiting UI uses a strong ease-out/custom curve. `ease-in` on direct UI is a block.
4. **Short UI timing** — most UI animation should remain below 300ms unless clearly justified.
5. **Physical origin** — anchored popovers/menus originate from the trigger; modals remain centered; never enter from `scale(0)`.
6. **Interruptible** — dynamic/repeatedly triggered motion should retarget from the current state; prefer transitions/springs over restart-from-zero keyframes.
7. **Performance** — animate transform/opacity whenever possible; do not animate layout dimensions/position for routine UI.
8. **Accessibility** — honor reduced motion; gate hover motion behind fine-pointer hover capability.
9. **Asymmetric timing** — deliberate arrival/press may settle; system response/exit should usually snap faster.
10. **Cohesion** — ModelPing is a crisp professional tool, so bounce/delight must be extremely restrained.

## Escalation triggers

Flag immediately:
- `transition: all`
- `scale(0)` UI entrance
- `ease-in` on UI interaction
- unreasonably long UI duration
- centered transform origin on trigger-anchored popovers
- keyframes on frequently retargeted toast/toggle interaction
- animated width/height/margin/padding/top/left where transform is viable
- motion on keyboard/high-frequency actions
- missing reduced-motion path
- ungated hover movement

## Remedial order

Prefer, in order:
1. delete unnecessary motion
2. reduce duration/distance
3. fix easing
4. fix transform origin/physicality
5. make it interruptible
6. move animation to transform/opacity
7. make enter/exit timing asymmetric
8. add small polish only after the basics pass
9. verify accessibility and product personality

## Required output

Part 1 — findings table:

| Before | After | Why |
| --- | --- | --- |

One row per finding, with exact file/selector/component evidence.

Part 2 — verdict grouped by impact:
- Feel-breaking regressions
- Missed simplifications
- Performance
- Interruptibility & timing
- Origin / physicality / cohesion
- Accessibility

Close with **Block** or **Approve** and the reason.

## ModelPing review focus

Pay special attention to:
- navigation/segmented selected indicator
- modal/prompt/confirm entrance and exit
- History failure popover origin
- toast replacement/retrigger behavior
- button press feedback
- progress/testing state
- theme/language segmented controls
- reduced-motion behavior

Do not approve based on build success alone. Motion must be rendered and feel-checked in browser.
