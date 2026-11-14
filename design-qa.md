# Design QA — ModelPing unified workspace

**Source visual truth:** The selected ModelPing visual direction in the conversation (no-sidebar top navigation; credential decoding and API testing side by side; separate history, status, and provider/model pages). The generated source images are conversation attachments and are not mounted as readable files in this workspace.

**Implementation screenshot paths:** `node_modules/.cache/workbench-browser/测试-light-1440.png`, `测试-light-390.png`, `历史记录-light-1440.png`, `状态-light-1440.png`, and `供应商与模型-light-1440.png` are expected capture targets; the current browser suite confirms its screenshots under `node_modules/.cache/workbench-browser/`.

**Viewport/state:** Browser suite covers 320, 390, 768, and 1440 CSS-pixel widths, light and dark themes, with mocked API fixtures. The screenshot artifacts could not be opened in the current execution surface for pixel-level comparison.

**Full-view and focused-region comparison:** Blocked. The conversation source image and the browser-rendered implementation screenshot could not be opened together in a visual comparison tool. Therefore typography, spacing/layout rhythm, colors/tokens, image/icon fidelity, and exact app copy cannot be certified against the source mock.

**Functional evidence:** `npm run verify` passed (409 unit tests, lint, typecheck, production build). `npm run test:workbench:browser` passed (11 browser checks, including all four viewport widths and both themes). `npm run test:toolbox:browser` passed (15 browser checks, including local-only conversion, offline use, responsive layout, and password-gate behavior).

**Findings / blockers:**
- [P2] Visual fidelity review is incomplete. The rendered screenshots exist, but the comparison surface cannot open them alongside the source visual. Do not treat build/test success as visual QA.

**Implementation checklist:**
- [x] Replace the permanent side rail with a top navigation bar.
- [x] Integrate credential decoding and API testing in one continuous desktop workspace.
- [x] Remove the separate toolbox tab; keep all decoder tools visible in the same workspace.
- [x] Keep global model discovery inside API testing and only load the catalog when the panel is expanded; upstream sync remains manual.
- [x] Keep history, status, and provider/model management as separate low-frequency pages.
- [x] Preserve existing API, KV, status-budget, and user configuration behavior.
- [ ] Open source and implementation captures together and complete pixel-level design QA.

**Follow-up polish:** Recheck dense table column balance, provider editor proportions, and mobile top-navigation wrapping after visual comparison.

**final result: blocked**
