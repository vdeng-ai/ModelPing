# Documentation screenshot review

[Documentation](./README.md) · [Capture instructions](./development.md#updating-readme-screenshots)

## Source and scope

README images are browser captures of the current production bundle, not generated mockups or edited composites. The capture script interacts with the existing UI; it does not inject replacement text, rearrange components or override application CSS.

The reviewed views cover the four-item top navigation, side-by-side credential decoding/API testing, searchable model selection, visible model actions, catalog and parameter dialogs, session history, manual Status checks, provider editing and stacked mobile layout. English and Chinese READMEs use their corresponding language captures.

## Capture matrix

| File stem      | State                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| `workbench`    | Decoded example URL beside a successful simulated model test and expanded response |
| `model-search` | Open picker containing both configured and catalog candidates                      |
| `catalog`      | Native catalog dialog with a model selected for explicit import                    |
| `parameters`   | Native advanced-parameters dialog with all request fields visible                  |
| `history`      | Session tests including an expanded simulated authentication error                 |
| `status`       | Manual endpoint results, including a simulated unavailable endpoint                |
| `providers`    | Saved provider endpoint and model editing form                                     |
| `mobile`       | Real responsive Test layout with the connection disclosure opened                  |

Each stem has `-en.png` and `-zh.png` versions in [screenshots](./screenshots/). Desktop width is 1440 pixels; mobile width is 390 pixels. Captures use light theme, reduced motion, loaded fonts and a fixed clock for reproducibility. Dialog captures use the viewport; page captures include the full page.

## Safety and validation

The local fixture server returns synthetic `.example.com` endpoints, `sk-demo-not-a-real-key`, demo responses and fixed timings. Browser requests to any other origin are blocked and treated as failures. Unmocked APIs and browser errors also fail capture. A seeded catalog demonstrates the UI without contacting or synchronizing Models.dev.

`npm run docs:screenshots` builds first and asserts that every captured page has no document-level horizontal overflow. `npm run docs:check` validates local links/anchors, PNG headers/dimensions and matching image sets in both READMEs. Review images directly for legibility, labels, clipping, stale UI, sensitive values and missing content; these automated checks alone are insufficient.

## Boundaries

These are usage illustrations, not live-provider results or performance benchmarks. They cover the documented light-theme states, not every menu, theme or viewport. The separate browser suites exercise both themes and additional widths. No claim is made of pixel-perfect equivalence to earlier mockups, comprehensive screen-reader conformance, or production-provider compatibility.
