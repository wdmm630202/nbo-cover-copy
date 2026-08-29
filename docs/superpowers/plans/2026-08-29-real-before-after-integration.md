# Real Before After Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only real before/after comparison mode to the existing NBO cover studio while preserving the current single-photo workflow.

**Architecture:** Extend the existing canvas renderer and settings model instead of embedding the newer page. Keep React/Sites and standalone static implementations behaviorally equivalent, with pure layout functions tested at 3:4 and 9:16 sizes before UI wiring.

**Tech Stack:** React 19, TypeScript, Canvas 2D, standalone HTML/CSS/JavaScript, Node test runner, vinext/Vite.

**Spec:** `docs/superpowers/specs/2026-08-29-real-before-after-integration-design.md`

## Global Constraints

- Existing single-photo behavior remains the default and must not change visually.
- All comparison elements stay inside the centered 3:4 safe area on Douyin 9:16.
- Customer photos remain browser-local and are never persisted.
- `app/cover/` and `docs/cover.*` must remain behaviorally equivalent.
- `apps-script/Code.gs` and `apps-script/Index.html` are frozen.
- Do not delete `nbo-smart-system/apps/xhs-cover`, push, publish, or merge without final user approval.

---

### Task 1: Comparison layout contract

**Files:**
- Create: `app/cover/compare-layout.ts`
- Create: `docs/compare-layout.js`
- Create: `tests/compare-layout.test.mjs`

**Interfaces:**
- Produces: `getComparisonSafeRect(canvas)`, `getComparisonEvidenceLayout(canvas)`, `getComparisonLabelLayout(canvas)`, `getComparisonFadeStops()`.
- Coordinates are canvas pixels; `canvas` is `{ width: number, height: number }`.

- [ ] Write tests with literal expected 1080×1440 and 1080×1920 safe rectangles, evidence frames, label positions, and fade stops for both implementations.
- [ ] Run `node --test tests/compare-layout.test.mjs` and verify failure because helpers do not exist.
- [ ] Implement the TypeScript and static helpers with the same calculations.
- [ ] Run the comparison layout test and verify all cases pass.

### Task 2: React/Sites comparison state and rendering

**Files:**
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/globals.css`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes the layout helpers from Task 1.
- Adds settings: `compareEnabled`, `beforeZoom`, `beforeOffsetX`, `beforeOffsetY`.
- Adds component state for the in-memory before image and filename.

- [ ] Add failing rendered/behavior assertions for the mode switch, second upload, independent controls, local-only copy, and export validation.
- [ ] Run the focused tests and verify they fail for missing comparison UI.
- [ ] Add backward-compatible settings defaults and memory serialization.
- [ ] Add the second image picker and independent adjustment controls that appear only in comparison mode.
- [ ] Render the inset photo, four-edge fade, dashed frame, gray Chinese capsules, eyebrow, and accent using Canvas 2D.
- [ ] Block design export with the required Chinese message when comparison mode lacks a before photo; keep original-photo export unchanged.
- [ ] Add responsive styling without altering the default single-photo layout.
- [ ] Run focused tests and build, then verify they pass.

### Task 3: Static page parity

**Files:**
- Modify: `docs/cover.html`
- Modify: `docs/cover.css`
- Modify: `docs/cover.js`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes `window.NBOCompareLayout` from `docs/compare-layout.js`.
- Uses matching DOM ids and matching state field names from Task 2.

- [ ] Add failing assertions that the standalone page loads the layout helper and exposes equivalent controls and messages.
- [ ] Run the focused tests and verify the static parity assertions fail.
- [ ] Load `compare-layout.js` before `cover.js` and add the comparison switch/upload/controls.
- [ ] Mirror React state normalization, canvas drawing, export validation, and local-only behavior in the static script.
- [ ] Mirror responsive styles in `docs/cover.css`.
- [ ] Run focused layout and rendered-page tests and verify they pass.

### Task 4: Regression and visual verification

**Files:**
- Modify only if a failing verification reveals an in-scope defect.

**Interfaces:**
- Validates all outputs from Tasks 1–3.

- [ ] Run `node --test tests/compare-layout.test.mjs tests/rendered-html.test.mjs tests/chinese-errors.test.mjs`.
- [ ] Run `vinext build` with the bundled Node runtime and verify exit code 0.
- [ ] Run ESLint and fix only errors introduced by this feature.
- [ ] Start a local server from the isolated worktree and preview single-photo plus compare mode at 1080×1440 and 1080×1920.
- [ ] Verify PNG and JPG design export, original-photo export, missing-before error, and hidden safe-area guide in exports.
- [ ] Present the local preview to the user; do not delete, merge, push, or publish.
