# ModelPing Workbench Design System

A restrained, local-first developer workspace. Dense data stays readable; navigation,
editing and running a network test are visibly separate operations.

## Source of truth

| File                                       | Responsibility                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `tokens.css`                               | Primitive palette/type/spacing, light and dark semantic aliases, component contracts.                   |
| `../styles.css`                            | Base elements, controls, fields, empty states, native dialogs, notifications, accessibility and motion. |
| `layout.css`                               | Application rail/mobile dock, page headings and connection/request setup.                               |
| `workbench.css`                            | Model groups, responsive result tables, status checks and provider editing.                             |
| `../components/ToolboxPanel.css`           | Lazy-loaded, local-only toolbox layout.                                                                 |
| `../components/design-system/Controls.tsx` | Small segmented-control primitives.                                                                     |
| `../components/Modal.tsx`                  | Native modal lifecycle, outside dismissal and focus restoration.                                        |

`main.tsx` imports tokens, base, layout and workbench in that order. The former glass,
optical-filter and successive override layers have been removed, not hidden underneath
another stylesheet. Do not reintroduce `backdrop-filter`, external fonts or an animation
library for routine controls. Use semantic `--ds-*` variables instead of feature-specific
colors. `--row-padding` is the density contract; density changes never enter private state.

## Interaction contract

- One navigation tree with real hash links and `aria-current`. Desktop rail becomes a
  five-item mobile dock; browser back/forward and guarded unsaved changes remain intact.
- `Ctrl/Cmd+K` opens a native command dialog. Arrow keys choose a page, Enter opens it,
  Escape closes it. `/` focuses the current visible search outside editable fields.
- Filtering and sorting are browser-only views. Sorting does not reorder the test queue,
  mutate results or lose selection. Tests and model discovery always require explicit action.
- Native `<dialog>.showModal()` provides top-layer placement, background inertness and
  focus containment. Do not add a second custom focus trap. The shared component restores
  the trigger and body scroll state on dismissal.
- Destructive actions remain confirmed; unsaved provider edits remain guarded.
- Status is manual on every mount. Opt-in automatic refresh keeps batching, single-tab
  leadership, visibility pausing and the existing local budget cap. Offline pauses new
  automatic work; `navigator.onLine` is a hint, not an active connectivity probe.
- History is session-only. Routine export applies the visible filter and removes the
  explicit API-key field; response bodies/logs must still be reviewed before sharing.

## Responsive and accessible behavior

Model cards adapt to their container width; status/history retain captions, scoped table
headers and keyboard-focusable overflow regions. At narrow widths their visible metadata
labels remain attached to each value. All pages have one main heading. Inputs have names,
controls retain visible focus, coarse pointers get larger targets, and reduced-motion
preferences disable animation. This is not a claim of a full screen-reader/WCAG audit.

Use short, specific copy. Do not add simulated live metrics, fabricated charts, passive
polling, background synchronization or telemetry to make the UI appear active.

## Validation

```sh
npm run verify
npm run test:workbench:browser
npm run test:toolbox:browser
```

Browser suites serve the production bundle locally, mock every API and reject external
requests. Screenshots and logs are generated under `node_modules/.cache/`; they contain
fixture data only. The workbench suite asserts zero extra API calls for navigation,
filtering, sorting and density; batching; hidden/offline pausing; cross-tab leadership;
native-dialog focus; guarded edits; exports; and five views at 320/390/768/1440 px.
