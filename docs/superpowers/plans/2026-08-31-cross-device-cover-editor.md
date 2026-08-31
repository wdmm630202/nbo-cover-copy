# 跨设备封面编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留电脑端三栏体验和全部现有功能的同时，让手机、平板与电脑共享同一编辑、涂抹、渲染和导出核心，并为触控设备提供预览始终可见的自适应编辑界面。

**Architecture:** 先把目前分散在 React 与静态发布页中的设置、涂抹、渲染和导出算法收敛到 `app/cover/core/`，用 Vite 生成 `docs/cover-core.js` 供 GitHub Pages 静态界面调用。随后用同一个编辑状态驱动 Desktop、Compact、Split 三种界面外壳；布局变化只重排界面，不重建照片、设置或笔迹。

**Tech Stack:** TypeScript 5.9、React 19、Next/vinext、Canvas 2D、Pointer Events、CSS `dvh`/安全区、Vite library build、Node `node:test`。

**Spec:** `docs/superpowers/specs/2026-08-31-cross-device-cover-editor-design.md`

## Global Constraints

- 不删除、合并或弱化任何现有功能。
- 电脑端保持现有三栏、鼠标拖动、滚轮缩放和键盘快捷操作。
- 手机、平板、电脑必须共用同一套涂抹、溶图、渲染和导出核心。
- 手机上传照片后进入全屏编辑；预览在调节任何参数时始终可见。
- 手机采用“照片、构图、文字、画面、涂抹、版式、更多”一级菜单和单项参数调节。
- 平板竖屏使用 CompactShell，平板横屏使用 SplitShell。
- 不使用 User-Agent 决定布局；只使用容器尺寸、横竖方向和指针能力。
- 暂不做原生 App、云同步、账号同步或跨设备接力。
- 高清导出继续按原始照片像素工作；保留当前手机内存保护与 JPG 19.9MB 规则。
- 任何正式发布必须先经过本地/临时网页验收并由用户确认。
- 本机命令使用捆绑运行时：`/Users/nanbosheyingimacpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm`。
- 每个任务的命令在新 shell 中执行；凡示例使用 `$NBO_PNPM`，先执行 Task 1 Step 2 中的同名变量赋值。

---

## File Structure

### Canonical shared core

- Create `app/cover/core/responsive-layout.ts` — Compact/Split/Desktop 模式选择。
- Create `app/cover/core/tool-registry.ts` — 一级、二级工具及参数元数据。
- Create `app/cover/core/editor-settings.ts` — `CoverSettings`、默认值和兼容迁移。
- Create `app/cover/core/retouch-core.ts` — 笔迹数据、羽化几何和遮罩擦除。
- Create `app/cover/core/render-core.ts` — 预览与导出共用的 Canvas 2D 绘制。
- Create `app/cover/core/export-core.ts` — 输出候选尺寸、编码、命名及 `ExportAsset`。
- Create `app/cover/core/interaction-core.ts` — 变换/涂抹模式、触控指针和布局切换时的状态规则。
- Create `app/cover/core/static-entry.ts` — 静态 IIFE 的唯一导出入口。

### React adaptive shells

- Create `app/cover/CoverCanvasSurface.tsx` — 三种外壳共享的预览画布与手势表面。
- Create `app/cover/CoverCompactShell.tsx` — 手机/平板竖屏全屏编辑。
- Create `app/cover/CoverSplitShell.tsx` — 手机/平板横屏左预览右工具。
- Create `app/cover/CoverMobileToolDock.tsx` — 一级、二级菜单和单项参数条。
- Create `app/cover/CoverExportSheet.tsx` — 四种导出选择。
- Modify `app/cover/CoverStudio.tsx` — 保留状态所有权，组合共享核心与三个外壳。
- Modify `app/globals.css` — 自适应外壳、触控目标、键盘和安全区样式。

### Static GitHub Pages shell

- Create `scripts/build-cover-core.mjs` — 将 `static-entry.ts` 构建为 IIFE。
- Generate `docs/cover-core.js` — `window.NBOCoverCore` 发布产物。
- Modify `docs/cover.html` — 增加移动顶栏、工具 Dock、导出 Sheet 与核心脚本。
- Modify `docs/cover.js` — 删除重复核心，只保留 DOM 绑定和界面外壳。
- Modify `docs/cover.css` — Compact/Split/Desktop 布局和安全区。

### Tests

- Create `tests/fixtures/cover-feature-inventory.json` — 现有功能基线清单。
- Create `tests/cover-feature-inventory.test.mjs` — 防止功能丢失。
- Create `tests/responsive-layout.test.mjs` — 设备尺寸到布局模式。
- Create `tests/tool-registry.test.mjs` — 菜单完整性与参数范围。
- Create `tests/editor-settings.test.mjs` — 默认值和旧设置迁移。
- Create `tests/retouch-core.test.mjs` — 羽化、坐标和主图/拍摄前隔离。
- Create `tests/static-core-parity.test.mjs` — TypeScript 与 `docs/cover-core.js` 同源一致。
- Create `tests/mobile-editor-layout.test.mjs` — 全屏、菜单、安全区和导出 Sheet。
- Create `tests/interaction-core.test.mjs` — 变换/涂抹状态和布局切换。
- Modify `tests/rendered-html.test.mjs` — 静态/React 功能入口和核心引用。
- Modify `tests/compare-panel-layout.test.mjs` — 三种外壳的滚动边界。

---

### Task 1: Freeze the current feature and desktop baseline

**Files:**
- Create: `tests/fixtures/cover-feature-inventory.json`
- Create: `tests/cover-feature-inventory.test.mjs`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: current `app/cover/CoverStudio.tsx`, `docs/cover.html`, `docs/cover.js`.
- Produces: a fixed `requiredTokens` inventory used by every later task to prevent feature removal.

- [ ] **Step 1: Write the failing feature-inventory test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixtureUrl = new URL("./fixtures/cover-feature-inventory.json", import.meta.url);
const sources = [
  new URL("../app/cover/CoverStudio.tsx", import.meta.url),
  new URL("../docs/cover.html", import.meta.url),
  new URL("../docs/cover.js", import.meta.url),
];

test("跨设备改版保留全部现有功能", async () => {
  const { requiredTokens } = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const combined = (await Promise.all(sources.map((url) => readFile(url, "utf8")))).join("\n");
  for (const token of requiredTokens) assert.match(combined, new RegExp(token), `缺少功能：${token}`);
});
```

- [ ] **Step 2: Run the test and verify it fails because the fixture is absent**

Run:

```bash
NBO_PNPM='/Users/nanbosheyingimacpro/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/fallback/pnpm'
"$NBO_PNPM" exec node --test tests/cover-feature-inventory.test.mjs
```

Expected: FAIL with `ENOENT` for `cover-feature-inventory.json`.

- [ ] **Step 3: Add the exact current feature inventory**

```json
{
  "requiredTokens": [
    "上传照片", "拍摄前素颜照", "同步封面", "同步文案",
    "上行主标题", "下行主标题", "补充小字", "标题横线",
    "水印透明度", "记忆 1", "抖音", "小红书", "视频号",
    "安全区", "前后对比", "尝试对齐", "恢复对比图默认尺寸",
    "照片缩放", "左右位置", "上下位置", "自由旋转",
    "亮度", "压暗强度", "底部向上压暗",
    "局部涂抹提亮", "画笔大小", "羽化", "涂抹强度",
    "涂抹前", "涂抹后", "撤销一步", "全部清除",
    "上方左题", "居中左题", "下方右题",
    "导出原图 PNG", "导出原图 JPG", "导出设计 PNG", "导出设计 JPG",
    "恢复默认", "彻底重置"
  ]
}
```

- [ ] **Step 4: Run the inventory and existing tests**

Run:

```bash
"$NBO_PNPM" exec node --test tests/cover-feature-inventory.test.mjs tests/rendered-html.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the baseline**

```bash
git add tests/fixtures/cover-feature-inventory.json tests/cover-feature-inventory.test.mjs tests/rendered-html.test.mjs
git commit -m "test: 锁定封面工具现有功能基线"
```

### Task 2: Add the canonical static-core build and responsive resolver

**Files:**
- Create: `app/cover/core/responsive-layout.ts`
- Create: `app/cover/core/static-entry.ts`
- Create: `scripts/build-cover-core.mjs`
- Create: `tests/responsive-layout.test.mjs`
- Create: `tests/static-core-parity.test.mjs`
- Generate: `docs/cover-core.js`
- Modify: `docs/cover.html`
- Modify: `package.json`

**Interfaces:**
- Consumes: Vite 8 already present in the repository.
- Produces: `CoverLayoutMode`, `LayoutEnvironment`, `resolveCoverLayoutMode(environment)` and browser global `window.NBOCoverCore`.

- [ ] **Step 1: Write failing layout tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { resolveCoverLayoutMode } from "../app/cover/core/responsive-layout.ts";

const mode = (width, height, pointer) => resolveCoverLayoutMode({ width, height, pointer });

test("设备能力选择 Compact Split Desktop", () => {
  assert.equal(mode(390, 844, "coarse"), "compact");
  assert.equal(mode(844, 390, "coarse"), "split");
  assert.equal(mode(834, 1194, "coarse"), "compact");
  assert.equal(mode(1194, 834, "coarse"), "split");
  assert.equal(mode(1024, 768, "fine"), "split");
  assert.equal(mode(1440, 900, "fine"), "desktop");
});
```

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `"$NBO_PNPM" exec node --test tests/responsive-layout.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the pure resolver**

```ts
export type CoverLayoutMode = "compact" | "split" | "desktop";
export type LayoutEnvironment = {
  width: number;
  height: number;
  pointer: "coarse" | "fine";
};

export function resolveCoverLayoutMode({ width, height, pointer }: LayoutEnvironment): CoverLayoutMode {
  if (pointer === "fine" && width >= 1180) return "desktop";
  if (width >= 680 && (width > height || pointer === "fine")) return "split";
  return "compact";
}
```

- [ ] **Step 4: Add the IIFE build entry and script**

`app/cover/core/static-entry.ts`:

```ts
export * from "./responsive-layout";
```

`scripts/build-cover-core.mjs`:

```js
import { build } from "vite";

await build({
  configFile: false,
  build: {
    emptyOutDir: false,
    minify: false,
    outDir: "docs",
    lib: {
      entry: "app/cover/core/static-entry.ts",
      name: "NBOCoverCore",
      formats: ["iife"],
      fileName: () => "cover-core.js",
    },
  },
});
```

Add scripts:

```json
{
  "scripts": {
    "build:cover-core": "node scripts/build-cover-core.mjs",
    "test": "pnpm run build:cover-core && pnpm run build && pnpm run typecheck && node --test tests/*.test.mjs"
  }
}
```

- [ ] **Step 5: Load the generated core before `docs/cover.js`**

```html
<script src="./cover-core.js?v=20260831-adaptive-editor"></script>
<script src="./cover.js?v=20260831-adaptive-editor"></script>
```

- [ ] **Step 6: Add static parity test and build**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as canonical from "../app/cover/core/responsive-layout.ts";

test("静态核心与 TypeScript 使用同一布局解析", async () => {
  const context = { window: {} };
  runInNewContext(await readFile(new URL("../docs/cover-core.js", import.meta.url), "utf8"), context);
  const input = { width: 1194, height: 834, pointer: "coarse" };
  assert.equal(context.NBOCoverCore.resolveCoverLayoutMode(input), canonical.resolveCoverLayoutMode(input));
});
```

Run:

```bash
"$NBO_PNPM" run build:cover-core
"$NBO_PNPM" exec node --test tests/responsive-layout.test.mjs tests/static-core-parity.test.mjs
```

Expected: PASS and `docs/cover-core.js` contains `NBOCoverCore`.

- [ ] **Step 7: Commit**

```bash
git add app/cover/core/responsive-layout.ts app/cover/core/static-entry.ts scripts/build-cover-core.mjs tests/responsive-layout.test.mjs tests/static-core-parity.test.mjs docs/cover-core.js docs/cover.html package.json
git commit -m "feat: 建立封面共享核心构建"
```

### Task 3: Define the complete mobile tool registry

**Files:**
- Create: `app/cover/core/tool-registry.ts`
- Create: `tests/tool-registry.test.mjs`
- Modify: `app/cover/core/static-entry.ts`
- Generate: `docs/cover-core.js`

**Interfaces:**
- Consumes: the feature inventory from Task 1.
- Produces: `PrimaryToolId`, `ToolDefinition`, `PRIMARY_TOOLS`, `SECONDARY_TOOLS`, `getSecondaryTools(primary, context)`.

- [ ] **Step 1: Write failing menu-completeness tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { PRIMARY_TOOLS, getSecondaryTools } from "../app/cover/core/tool-registry.ts";

test("一级菜单顺序固定且涂抹独立", () => {
  assert.deepEqual(PRIMARY_TOOLS.map((item) => item.id), [
    "photo", "compose", "text", "image", "retouch", "layout", "more",
  ]);
});

test("拍摄前构图和画面参数按一级菜单分组", () => {
  const ids = getSecondaryTools("compose", { comparisonEnabled: true, target: "before" }).map((item) => item.id);
  assert.deepEqual(ids, [
    "target", "beforeZoom", "beforeOffsetX", "beforeOffsetY", "beforeRotation",
    "alignBefore", "resetBeforeFrame",
  ]);
  assert.deepEqual(
    getSecondaryTools("image", { comparisonEnabled: true, target: "before" }).map((item) => item.settingKey),
    ["beforeBrightness", "beforeShade", "beforeBottomShade"],
  );
});
```

- [ ] **Step 2: Run and verify the missing-module failure**

Run: `"$NBO_PNPM" exec node --test tests/tool-registry.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement registry types and the seven primary groups**

```ts
export type PrimaryToolId = "photo" | "compose" | "text" | "image" | "retouch" | "layout" | "more";
export type ToolKind = "action" | "range" | "text" | "color" | "toggle" | "choice";
export type ToolContext = { comparisonEnabled: boolean; target: "after" | "before" };
export type ToolDefinition = {
  id: string;
  primary: PrimaryToolId;
  label: string;
  kind: ToolKind;
  settingKey?: string;
  min?: number;
  max?: number;
  defaultValue?: number | boolean | string;
  suffix?: string;
};

export const PRIMARY_TOOLS = [
  { id: "photo", label: "照片" }, { id: "compose", label: "构图" },
  { id: "text", label: "文字" }, { id: "image", label: "画面" },
  { id: "retouch", label: "涂抹" }, { id: "layout", label: "版式" },
  { id: "more", label: "更多" },
] as const;
```

Define `SECONDARY_TOOLS` explicitly from this matrix; these IDs are the stable binding contract for both React and the static shell:

| Primary | ID | Label / behavior | Kind | Setting / range / default |
| --- | --- | --- | --- | --- |
| photo | `uploadMain` | 精修图上传/更换 | action | current main-image loader |
| photo | `uploadBefore` | 拍摄前照片上传/更换 | action | current before-image loader; visible when comparison is enabled |
| photo | `comparison` | 前后对比 | toggle | `compareEnabled`, default `false` |
| photo | `safeArea` | 安全区 | toggle | `showSafeArea`, default `true` |
| photo | `syncCover` | 同步封面 | action | current synced-image callback |
| compose | `target` | 主照片与文字 / 拍摄前照片 | choice | UI-only `after` / `before` |
| compose | `zoom` | 照片缩放 | range | `zoom`, `0..400`, default `100`, `%` |
| compose | `offsetX` | 左右位置 | range | `offsetX`, `-200..200`, default `0` |
| compose | `offsetY` | 上下位置 | range | `offsetY`, `-200..200`, default `0` |
| compose | `rotation` | 自由旋转 | range | `rotation`, `-180..180`, default `0`, `°`; reuse snap behavior |
| compose | `beforeZoom` | 拍摄前照片缩放 | range | `beforeZoom`, `100..300`, default `100`, `%` |
| compose | `beforeOffsetX` | 拍摄前左右位置 | range | `beforeOffsetX`, dynamic `±getBeforeOffsetLimits().x`, default `0` |
| compose | `beforeOffsetY` | 拍摄前上下位置 | range | `beforeOffsetY`, dynamic `±getBeforeOffsetLimits().y`, default `0` |
| compose | `beforeRotation` | 拍摄前自由旋转 | range | `beforeRotation`, `-180..180`, default `0`, `°`; reuse snap behavior |
| compose | `alignBefore` | 尝试对齐 | action | current `alignBeforeFrame` |
| compose | `resetBeforeFrame` | 恢复对比图默认尺寸 | action | set `beforeFrameScale` to `100` only |
| text | `topText` | 上行主标题 | text | `topText`, max length `18` |
| text | `bottomText` | 下行主标题 | text | `bottomText`, max length `18` |
| text | `subtitle` | 补充小字 | text | `subtitle`, max length `38` |
| text | `topColor` | 上行颜色 | color | `topColor`, default `#FFFFFF` |
| text | `bottomColor` | 下行颜色 | color | `bottomColor`, default `#FFFFFF` |
| text | `subtitleColor` | 小字颜色 | color | `subtitleColor`, default `#FFFFFF` |
| text | `dividerColor` | 横线颜色 | color | `dividerColor`, default `#C9A77A` |
| text | `textScale` | 上行标题大小 | range | `textScale`, `0..200`, default `100`, `%` |
| text | `bottomTextScale` | 下行标题大小 | range | `bottomTextScale`, `0..200`, default `100`, `%`; disabled while linked |
| text | `subtitleScale` | 小字大小 | range | `subtitleScale`, `60..160`, default `100`, `%` |
| text | `textScaleLinked` | 上下行大小联动 | toggle | `textScaleLinked`, default `true` |
| text | `showDivider` | 显示标题横线 | toggle | `showDivider`, default `true` |
| text | `textStroke` | 字体描边 | range | `textStroke`, `0..100`, default `0`, `%` |
| text | `textShadow` | 字体阴影 | range | `textShadow`, `0..100`, default `50`, `%` |
| text | `syncCopy` | 文案同步 | action | current synced-copy callback |
| image | `brightness` | 亮度 | range | for `after`: `brightness`, `0..200`, default `100`, `%`; for `before`: `beforeBrightness`, same range/default |
| image | `shade` | 压暗强度 | range | for `after`: `shade`, `0..100`, default `0`, `%`; for `before`: `beforeShade`, same range/default |
| image | `bottomShade` | 底部向上压暗 | range | for `after`: `bottomShade`, `0..100`, default `100`, `%`; for `before`: `beforeBottomShade`, same range/default |
| retouch | `retouchEnabled` | 开启/退出涂抹 | toggle | UI-only brush mode; default off |
| retouch | `retouchTarget` | 主照片记录 / 拍摄前记录 | choice | UI-only `after` / `before` |
| retouch | `brushSize` | 画笔大小 | range | stroke state, `20..400`, default `120` |
| retouch | `brushFeather` | 羽化 | range | stroke state, `0..100`, default `70`, `%` |
| retouch | `brushStrength` | 涂抹强度 | range | stroke state, `0..100`, default `100`, `%` |
| retouch | `retouchBefore` | 涂抹前 | action | set comparison preview on |
| retouch | `retouchAfter` | 涂抹后 | action | set comparison preview off |
| retouch | `undoRetouch` | 撤销一步 | action | remove last stroke from selected target only |
| retouch | `clearRetouch` | 全部清除 | action | clear strokes from selected target only |
| layout | `template` | 9 个标题位置模板 | choice | exact `COVER_TEMPLATES` order |
| layout | `platform` | 抖音 / 小红书 / 视频号 | choice | exact `PLATFORM_PRESETS` order |
| more | `watermarkEnabled` | 使用 / 不使用水印 | choice | `watermarkEnabled`, default `false` |
| more | `replaceWatermark` | 更换水印 | action | current PNG loader |
| more | `removeWatermark` | 移除临时水印并恢复固定水印 | action | current remove callback |
| more | `watermarkAlign` | 左 / 中 / 右 | choice | `watermarkAlign`, default `left` |
| more | `watermarkOpacity` | 水印透明度 | range | `watermarkOpacity`, `0..100`, default `50`, `%` |
| more | `memory1..3` | 记忆 1–3 保存/应用/重命名 | action group | current memory callbacks |
| more | `resetSettings` | 恢复默认 | action | current reset callback |
| more | `factoryReset` | 彻底重置 | action | current confirmed factory-reset callback |
| more | `coverRules` | 长期规范 | action | opens current rules content |

Implement `getSecondaryTools(primary, context)` with these exact rules:

- `compose/after` returns `target, zoom, offsetX, offsetY, rotation`.
- `compose/before` returns `target, beforeZoom, beforeOffsetX, beforeOffsetY, beforeRotation, alignBefore, resetBeforeFrame`.
- `image/after` binds the three image IDs to main-photo keys; `image/before` binds the same visible labels to the three `before*` keys.
- `uploadBefore`, `retouchTarget=before`, and all before-photo controls are hidden or disabled when `comparisonEnabled` is false; they are never silently mapped to the main photo.
- All other groups return the matrix order unchanged.

- [ ] **Step 4: Export, rebuild, and run tests**

Add `export * from "./tool-registry";` to `static-entry.ts`.

Run:

```bash
"$NBO_PNPM" run build:cover-core
"$NBO_PNPM" exec node --test tests/tool-registry.test.mjs tests/static-core-parity.test.mjs tests/cover-feature-inventory.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/cover/core/tool-registry.ts app/cover/core/static-entry.ts tests/tool-registry.test.mjs docs/cover-core.js
git commit -m "feat: 定义移动端完整工具菜单"
```

### Task 4: Extract settings defaults and migrations

**Files:**
- Create: `app/cover/core/editor-settings.ts`
- Create: `tests/editor-settings.test.mjs`
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/cover/core/static-entry.ts`
- Modify: `docs/cover.js`
- Generate: `docs/cover-core.js`

**Interfaces:**
- Consumes: `PlatformPreset`, `CoverTemplate` from `cover-config.ts`.
- Produces: `CoverSettings`, `DEFAULT_COVER_SETTINGS`, `normalizeCoverSettings(value)`, `updateCoverSetting(settings, key, value)`.

- [ ] **Step 1: Write failing migration tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_COVER_SETTINGS, normalizeCoverSettings } from "../app/cover/core/editor-settings.ts";

test("空设置返回完整默认值", () => {
  assert.deepEqual(normalizeCoverSettings(null), DEFAULT_COVER_SETTINGS);
});

test("旧字号和旧左右位置继续迁移", () => {
  const value = normalizeCoverSettings({
    platformId: "douyin", titleScaleVersion: 1, textScale: 180,
    offsetXRangeVersion: 1, offsetX: 120,
  });
  assert.equal(value.textScale, 100);
  assert.equal(value.bottomTextScale, 100);
  assert.equal(value.offsetX, 20);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `"$NBO_PNPM" exec node --test tests/editor-settings.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Move the exact settings schema and migrations**

Move `StudioSettings`, `DEFAULT_SETTINGS`, `normalizeTemplateId`, and `normalizeStudioSettings` from `CoverStudio.tsx` into `editor-settings.ts`, rename them to the produced interface names, and export them. Preserve every compatibility branch, including `titleScaleVersion`, `offsetXRangeVersion`, `textShadowDefaultVersion`, watermark defaults, and the legacy text correction.

```ts
export function updateCoverSetting<K extends keyof CoverSettings>(
  settings: CoverSettings,
  key: K,
  value: CoverSettings[K],
): CoverSettings {
  return normalizeCoverSettings({ ...settings, [key]: value });
}
```

- [ ] **Step 4: Replace both UI copies with shared normalization**

React imports directly:

```ts
import {
  DEFAULT_COVER_SETTINGS,
  normalizeCoverSettings,
  type CoverSettings,
} from "./core/editor-settings";
```

Static shell reads:

```js
const {
  DEFAULT_COVER_SETTINGS,
  normalizeCoverSettings,
  updateCoverSetting,
} = window.NBOCoverCore;
```

Remove the duplicate default/migration bodies from `docs/cover.js` and `CoverStudio.tsx`.

- [ ] **Step 5: Rebuild and verify**

Run:

```bash
"$NBO_PNPM" run build:cover-core
"$NBO_PNPM" exec node --test tests/editor-settings.test.mjs tests/static-core-parity.test.mjs tests/rendered-html.test.mjs
"$NBO_PNPM" run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/cover/core/editor-settings.ts app/cover/core/static-entry.ts app/cover/CoverStudio.tsx docs/cover.js docs/cover-core.js tests/editor-settings.test.mjs
git commit -m "refactor: 统一封面设置与兼容迁移"
```

### Task 5: Extract one retouch and blending core

**Files:**
- Create: `app/cover/core/retouch-core.ts`
- Create: `tests/retouch-core.test.mjs`
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/cover/core/static-entry.ts`
- Modify: `docs/cover.js`
- Generate: `docs/cover-core.js`

**Interfaces:**
- Consumes: `RetouchTarget` and target geometry from `compare-layout.ts`.
- Produces: `RetouchPoint`, `RetouchStroke`, `RetouchBrushGeometry`, `getRetouchBrushGeometry`, `mapRetouchPoint`, `eraseShadeWithBrush`.

- [ ] **Step 1: Write failing feather and coordinate tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { getRetouchBrushGeometry, mapRetouchPoint } from "../app/cover/core/retouch-core.ts";

test("羽化几何与现有电脑公式完全相同", () => {
  assert.deepEqual(getRetouchBrushGeometry(120, 70, 1080), {
    radius: 60,
    coreRadius: 21.36,
    blurRadius: 24.36,
  });
});

test("归一化笔迹能无损映射到预览与高清导出", () => {
  assert.deepEqual(mapRetouchPoint({ x: 0.25, y: 0.75 }, 1080, 1920), { x: 270, y: 1440 });
  assert.deepEqual(mapRetouchPoint({ x: 0.25, y: 0.75 }, 540, 960), { x: 135, y: 720 });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `"$NBO_PNPM" exec node --test tests/retouch-core.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement and move the exact existing brush algorithm**

```ts
export type RetouchPoint = { x: number; y: number };
export type RetouchStroke = {
  points: RetouchPoint[];
  size: number;
  feather: number;
  strength: number;
};

export function getRetouchBrushGeometry(size: number, featherValue: number, canvasWidth: number) {
  const radius = size / 2 * canvasWidth / 1080;
  const feather = Math.max(0, Math.min(1, featherValue / 100));
  return {
    radius,
    coreRadius: radius * (1 - feather * 0.92),
    blurRadius: radius * feather * 0.58,
  };
}

export const mapRetouchPoint = (point: RetouchPoint, width: number, height: number) => ({
  x: point.x * width,
  y: point.y * height,
});
```

Move the current `quadraticCurveTo`, blur-filter, strength-alpha, and `destination-out` implementation into exported `eraseShadeWithBrush(context, strokeCanvas, width, height, strokes)`. Do not alter constants or blending order.

- [ ] **Step 4: Remove both duplicate brush implementations**

React imports `eraseShadeWithBrush` and types directly. Static code destructures the same exports from `window.NBOCoverCore`. Keep only pointer collection and UI state in the shells.

- [ ] **Step 5: Rebuild and verify parity**

Run:

```bash
"$NBO_PNPM" run build:cover-core
"$NBO_PNPM" exec node --test tests/retouch-core.test.mjs tests/compare-layout.test.mjs tests/static-core-parity.test.mjs tests/rendered-html.test.mjs
"$NBO_PNPM" run typecheck
```

Expected: PASS; `rg -n "function eraseShadeWithBrush" app/cover/CoverStudio.tsx docs/cover.js` returns no duplicate definitions.

- [ ] **Step 6: Commit**

```bash
git add app/cover/core/retouch-core.ts app/cover/core/static-entry.ts app/cover/CoverStudio.tsx docs/cover.js docs/cover-core.js tests/retouch-core.test.mjs
git commit -m "refactor: 手机电脑共用溶图涂抹核心"
```

### Task 6: Extract one rendering core without changing desktop output

**Files:**
- Create: `app/cover/core/render-core.ts`
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/cover/core/static-entry.ts`
- Modify: `docs/cover.js`
- Modify: `tests/rendered-html.test.mjs`
- Generate: `docs/cover-core.js`

**Interfaces:**
- Consumes: `CoverSettings`, `PlatformPreset`, comparison geometry, `RetouchStroke[]`.
- Produces: `CoverRenderInput`, `drawCover(input)`, `releaseCoverCanvas(canvas)`.

- [ ] **Step 1: Add a failing single-source assertion**

```js
test("渲染算法只存在于共享核心", async () => {
  const core = await readFile(new URL("../app/cover/core/render-core.ts", import.meta.url), "utf8");
  const react = await readFile(new URL("../app/cover/CoverStudio.tsx", import.meta.url), "utf8");
  const published = await readFile(new URL("../docs/cover.js", import.meta.url), "utf8");
  assert.match(core, /export function drawCover/);
  assert.doesNotMatch(react, /function drawCover\s*\(/);
  assert.doesNotMatch(published, /function drawCover\s*\(/);
});
```

- [ ] **Step 2: Run and verify the missing-core failure**

Run: `"$NBO_PNPM" exec node --test tests/rendered-html.test.mjs`

Expected: FAIL because `render-core.ts` does not exist.

- [ ] **Step 3: Move the renderer and all owned helpers**

Use this public interface:

```ts
export type CoverRenderInput = {
  canvas: HTMLCanvasElement;
  image: HTMLImageElement | null;
  beforeImage: HTMLImageElement | null;
  watermark: HTMLImageElement | null;
  settings: CoverSettings;
  preset: PlatformPreset;
  includeGuide: boolean;
  outputSize?: { width: number; height: number };
  photoOnly?: boolean;
  retouchStrokes?: RetouchStroke[];
  beforeRetouchStrokes?: RetouchStroke[];
};

export function drawCover(input: CoverRenderInput): void;
export function releaseCoverCanvas(canvas: HTMLCanvasElement): void;
```

Move these existing bodies without changing drawing constants or order: scratch-canvas lifecycle, rounded paths, before-photo frame, comparison fade, main photo transform, shade layers, `eraseShadeWithBrush` call, text fitting/wrapping, divider, safe-area guide, capsule labels and watermark rendering.

- [ ] **Step 4: Replace React and static calls with the object interface**

```ts
drawCover({
  canvas,
  image,
  beforeImage,
  watermark: settings.watermarkEnabled ? watermark : null,
  settings,
  preset,
  includeGuide: true,
  outputSize: previewSize,
  retouchStrokes: visibleAfterStrokes,
  beforeRetouchStrokes: visibleBeforeStrokes,
});
```

- [ ] **Step 5: Rebuild and run the full render-related suite**

Run:

```bash
"$NBO_PNPM" run build:cover-core
"$NBO_PNPM" exec node --test tests/retouch-core.test.mjs tests/compare-layout.test.mjs tests/rendered-html.test.mjs tests/static-core-parity.test.mjs
"$NBO_PNPM" run typecheck
```

Expected: PASS and no duplicate `drawCover` definition outside `render-core.ts`/generated output.

- [ ] **Step 6: Manually compare desktop baseline before continuing**

Run the local site and compare the same photo/settings at 1440px desktop width. Verify main crop, before-photo frame, capsule, text, watermark, safe area, shade and retouch edges are unchanged. Stop this task if any visual difference appears.

- [ ] **Step 7: Commit**

```bash
git add app/cover/core/render-core.ts app/cover/core/static-entry.ts app/cover/CoverStudio.tsx docs/cover.js docs/cover-core.js tests/rendered-html.test.mjs
git commit -m "refactor: 统一预览与导出绘制核心"
```

### Task 7: Extract one export core and preserve mobile limits

**Files:**
- Create: `app/cover/core/export-core.ts`
- Create: `tests/export-core.test.mjs`
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/cover/core/static-entry.ts`
- Modify: `docs/cover.js`
- Generate: `docs/cover-core.js`

**Interfaces:**
- Consumes: `drawCover`, existing export-attempt sizes and JPEG limits.
- Produces: `CoverExportAsset`, `CoverExportRequest`, `createCoverExportAsset(request)`, `formatExportTimestamp(date)`.

- [ ] **Step 1: Write failing export-policy tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { formatExportTimestamp, getExportFileName } from "../app/cover/core/export-core.ts";

test("导出命名在所有外壳保持一致", () => {
  const date = new Date(2026, 7, 31, 9, 8, 7);
  assert.equal(formatExportTimestamp(date), "20260831_090807");
  assert.equal(getExportFileName("T62_7263", "设计", "抖音", "9:16", "jpeg", date),
    "T62_7263_设计_抖音_9x16_20260831_090807.jpg");
});
```

- [ ] **Step 2: Run and verify failure**

Run: `"$NBO_PNPM" exec node --test tests/export-core.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the shared export request**

```ts
export type CoverExportAsset = {
  blob: Blob;
  file: File;
  outputSize: { width: number; height: number };
  originalOutputSize: { width: number; height: number };
  usedMobileFallback: boolean;
};

export type CoverExportRequest = {
  render: Omit<CoverRenderInput, "canvas" | "includeGuide" | "outputSize">;
  format: "png" | "jpeg";
  photoOnly: boolean;
  mobile: boolean;
  fileStem: string;
  now?: Date;
};

export async function createCoverExportAsset(request: CoverExportRequest): Promise<CoverExportAsset>;
```

Move the existing candidate-size loop, canvas release, PNG/JPEG `toBlob`, original-pixel tracking, JPEG qualities, 19.9MB enforcement and filename formatting into this module. Keep `navigator.share`, long-press preview and download clicks in the UI shells because they are presentation decisions.

- [ ] **Step 4: Replace both export generators**

Both React and static code call `createCoverExportAsset` and then pass the returned file to their existing share/save UI. Remove duplicate pixel generation loops from `CoverStudio.tsx` and `docs/cover.js`.

- [ ] **Step 5: Rebuild and test**

Run:

```bash
"$NBO_PNPM" run build:cover-core
"$NBO_PNPM" exec node --test tests/export-core.test.mjs tests/compare-layout.test.mjs tests/static-core-parity.test.mjs tests/rendered-html.test.mjs
"$NBO_PNPM" run typecheck
```

Expected: PASS; mobile fallback and 19.9MB constants appear only in core/generated output.

- [ ] **Step 6: Commit**

```bash
git add app/cover/core/export-core.ts app/cover/core/static-entry.ts app/cover/CoverStudio.tsx docs/cover.js docs/cover-core.js tests/export-core.test.mjs
git commit -m "refactor: 统一原像素导出核心"
```

### Task 8: Unify canvas interaction modes and preserve state across layout changes

**Files:**
- Create: `app/cover/core/interaction-core.ts`
- Create: `tests/interaction-core.test.mjs`
- Create: `app/cover/CoverCanvasSurface.tsx`
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/cover/core/static-entry.ts`
- Modify: `docs/cover.js`
- Generate: `docs/cover-core.js`

**Interfaces:**
- Consumes: `RetouchStroke`, `RetouchTarget`, `CoverLayoutMode`.
- Produces: `CanvasInteractionMode`, `resolveCanvasInteractionMode`, `appendRetouchPoint`, shared `CoverCanvasSurfaceProps`.

- [ ] **Step 1: Write failing interaction-state tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanvasInteractionMode } from "../app/cover/core/interaction-core.ts";

test("涂抹模式优先于照片移动", () => {
  assert.equal(resolveCanvasInteractionMode({ brushMode: true, rotationMode: false }), "brush");
  assert.equal(resolveCanvasInteractionMode({ brushMode: false, rotationMode: true }), "rotate");
  assert.equal(resolveCanvasInteractionMode({ brushMode: false, rotationMode: false }), "transform");
});
```

- [ ] **Step 2: Run and verify failure**

Run: `"$NBO_PNPM" exec node --test tests/interaction-core.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement mode resolution and immutable stroke append**

```ts
export type CanvasInteractionMode = "transform" | "rotate" | "brush";

export function resolveCanvasInteractionMode(input: { brushMode: boolean; rotationMode: boolean }): CanvasInteractionMode {
  if (input.brushMode) return "brush";
  if (input.rotationMode) return "rotate";
  return "transform";
}

export function appendRetouchPoint(stroke: RetouchStroke, point: RetouchPoint): RetouchStroke {
  return { ...stroke, points: [...stroke.points, point] };
}
```

- [ ] **Step 4: Extract the shared React canvas surface**

```ts
export type CoverCanvasSurfaceProps = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  preset: PlatformPreset;
  hasImage: boolean;
  brushMode: boolean;
  rotationMode: boolean;
  brushCursor: { x: number; y: number; visible: boolean };
  brushSize: number;
};
```

Move canvas markup, HUD, snap guides, brush cursor, pointer listeners and mobile multi-touch listener into `CoverCanvasSurface`. Keep images, settings and strokes in the parent so changing shell never unmounts their state owner.

- [ ] **Step 5: Make the static shell use the same interaction helpers**

Replace static mode branching and stroke appends with `window.NBOCoverCore.resolveCanvasInteractionMode` and `appendRetouchPoint`. Preserve existing hold, pinch, rotate, pointer capture and pointer-cancel behavior.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
"$NBO_PNPM" run build:cover-core
"$NBO_PNPM" exec node --test tests/interaction-core.test.mjs tests/retouch-core.test.mjs tests/rendered-html.test.mjs
"$NBO_PNPM" run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/cover/core/interaction-core.ts app/cover/core/static-entry.ts app/cover/CoverCanvasSurface.tsx app/cover/CoverStudio.tsx docs/cover.js docs/cover-core.js tests/interaction-core.test.mjs
git commit -m "refactor: 统一画布触控与涂抹状态"
```

### Task 9: Build the Compact full-screen shell and persistent preview

**Files:**
- Create: `app/cover/CoverCompactShell.tsx`
- Create: `app/cover/CoverExportSheet.tsx`
- Create: `tests/mobile-editor-layout.test.mjs`
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/globals.css`
- Modify: `docs/cover.html`
- Modify: `docs/cover.css`
- Modify: `docs/cover.js`

**Interfaces:**
- Consumes: `resolveCoverLayoutMode`, shared canvas, current upload and export callbacks.
- Produces: `CoverCompactShellProps`, `isCompactEditorOpen`, `CoverExportSheetProps`.

- [ ] **Step 1: Write failing structural tests**

```js
test("手机全屏编辑保留预览顶栏和底部菜单", async () => {
  const html = await readFile(new URL("../docs/cover.html", import.meta.url), "utf8");
  const css = await readFile(new URL("../docs/cover.css", import.meta.url), "utf8");
  assert.match(html, /id="mobileEditorTopbar"/);
  assert.match(html, /id="mobilePrimaryTools"/);
  assert.match(html, /id="mobileSecondaryTools"/);
  assert.match(html, /id="mobileExportSheet"/);
  assert.match(css, /100dvh/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
```

- [ ] **Step 2: Run and verify missing-structure failure**

Run: `"$NBO_PNPM" exec node --test tests/mobile-editor-layout.test.mjs`

Expected: FAIL because the new IDs are absent.

- [ ] **Step 3: Add app-like full-screen state without the Fullscreen API**

Use CSS `position: fixed; inset: 0; height: 100dvh` on coarse-pointer CompactShell after a main photo loads. Do not call `requestFullscreen`; Safari does not reliably allow it outside a direct user gesture.

```ts
export type CoverCompactShellProps = {
  open: boolean;
  onClose: () => void;
  onOpenExport: () => void;
  canvas: React.ReactNode;
  dock: React.ReactNode;
};
```

The state owner remains `CoverStudio`; closing only hides CompactShell and restores the normal page.

- [ ] **Step 4: Add static topbar, dock roots, and export sheet**

```html
<header id="mobileEditorTopbar" class="mobile-editor-topbar" hidden>
  <button id="closeMobileEditor" type="button">返回</button>
  <strong>南铂封面</strong>
  <button id="openMobileExport" type="button">导出</button>
</header>
<nav id="mobileSecondaryTools" aria-label="当前工具" hidden></nav>
<nav id="mobilePrimaryTools" aria-label="编辑分类" hidden></nav>
<section id="mobileExportSheet" aria-label="选择导出格式" hidden></section>
```

- [ ] **Step 5: Add safe-area and scroll ownership CSS**

CompactShell owns the viewport; the preview area uses `min-height: 0`, the two tool rows remain visible, and only those rows may scroll horizontally. Apply at least 44×44 CSS px touch targets and `padding-bottom: env(safe-area-inset-bottom)`.

- [ ] **Step 6: Run layout and existing tests**

Run:

```bash
"$NBO_PNPM" exec node --test tests/mobile-editor-layout.test.mjs tests/cover-feature-inventory.test.mjs tests/rendered-html.test.mjs
"$NBO_PNPM" run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/cover/CoverCompactShell.tsx app/cover/CoverExportSheet.tsx app/cover/CoverStudio.tsx app/globals.css docs/cover.html docs/cover.css docs/cover.js tests/mobile-editor-layout.test.mjs
git commit -m "feat: 增加手机全屏编辑外壳"
```

### Task 10: Implement A1 single-tool controls and the seven menus

**Files:**
- Create: `app/cover/CoverMobileToolDock.tsx`
- Modify: `app/cover/CoverCompactShell.tsx`
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/globals.css`
- Modify: `docs/cover.html`
- Modify: `docs/cover.js`
- Modify: `docs/cover.css`
- Modify: `tests/mobile-editor-layout.test.mjs`
- Modify: `tests/tool-registry.test.mjs`

**Interfaces:**
- Consumes: `PRIMARY_TOOLS`, `getSecondaryTools`, setting/action callbacks.
- Produces: `MobileToolDockProps`, `activePrimaryTool`, `activeSecondaryTool`.

- [ ] **Step 1: Add failing A1 interaction assertions**

```js
test("A1 一次只展示一个参数并提供数值和复位", async () => {
  const react = await readFile(new URL("../app/cover/CoverMobileToolDock.tsx", import.meta.url), "utf8");
  const html = await readFile(new URL("../docs/cover.html", import.meta.url), "utf8");
  assert.match(react, /activeSecondaryTool/);
  assert.match(react, /准确数值/);
  assert.match(react, /复位/);
  assert.match(html, /id="mobileSingleToolControl"/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `"$NBO_PNPM" exec node --test tests/mobile-editor-layout.test.mjs tests/tool-registry.test.mjs`

Expected: FAIL because the component and control root are absent.

- [ ] **Step 3: Implement the registry-driven Dock**

```ts
export type MobileToolDockProps = {
  primary: PrimaryToolId;
  secondary: string | null;
  context: ToolContext;
  valueFor: (tool: ToolDefinition) => unknown;
  onSelectPrimary: (id: PrimaryToolId) => void;
  onSelectSecondary: (id: string) => void;
  onChange: (tool: ToolDefinition, value: unknown) => void;
  onReset: (tool: ToolDefinition) => void;
  onAction: (tool: ToolDefinition) => void;
};
```

Render seven horizontally scrollable primary entries, the selected group's secondary row, and exactly one active range/text/color/toggle/choice control. A range control must include slider, numeric input, unit and reset.

- [ ] **Step 4: Wire every registry item to existing behavior**

Map each item in Spec section 7 to the existing callbacks. Do not add duplicate setting state inside the Dock. Photo upload uses the current input refs; text tools update `CoverSettings`; retouch actions use current stroke state; layout uses `COVER_TEMPLATES`/`PLATFORM_PRESETS`; more uses current watermark/memory/reset functions.

- [ ] **Step 5: Implement the same registry-driven DOM rendering in static shell**

`docs/cover.js` renders buttons from `window.NBOCoverCore.PRIMARY_TOOLS` and `getSecondaryTools`, stores only active menu IDs as UI state, and delegates values/actions to the existing shared settings and callbacks.

- [ ] **Step 6: Test all groups and feature inventory**

Run:

```bash
"$NBO_PNPM" run build:cover-core
"$NBO_PNPM" exec node --test tests/tool-registry.test.mjs tests/mobile-editor-layout.test.mjs tests/cover-feature-inventory.test.mjs tests/rendered-html.test.mjs
"$NBO_PNPM" run typecheck
```

Expected: PASS; every feature token is reachable from Desktop or the registry-driven mobile tools.

- [ ] **Step 7: Commit**

```bash
git add app/cover/CoverMobileToolDock.tsx app/cover/CoverCompactShell.tsx app/cover/CoverStudio.tsx app/globals.css docs/cover.html docs/cover.js docs/cover.css tests/mobile-editor-layout.test.mjs tests/tool-registry.test.mjs
git commit -m "feat: 完成手机两级菜单与单项调节"
```

### Task 11: Complete M1 retouch mode, keyboard handling, and mobile export sheet

**Files:**
- Modify: `app/cover/CoverMobileToolDock.tsx`
- Modify: `app/cover/CoverCompactShell.tsx`
- Modify: `app/cover/CoverExportSheet.tsx`
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/globals.css`
- Modify: `docs/cover.html`
- Modify: `docs/cover.js`
- Modify: `docs/cover.css`
- Modify: `tests/mobile-editor-layout.test.mjs`
- Modify: `tests/interaction-core.test.mjs`

**Interfaces:**
- Consumes: shared `RetouchCore`, `createCoverExportAsset`, current main/before stroke arrays.
- Produces: visible brush-mode status, keyboard-compacted preview, four-option mobile export sheet.

- [ ] **Step 1: Add failing safety assertions**

```js
test("涂抹模式持续可见且键盘不会移走预览", async () => {
  const css = await readFile(new URL("../docs/cover.css", import.meta.url), "utf8");
  const html = await readFile(new URL("../docs/cover.html", import.meta.url), "utf8");
  assert.match(html, /id="mobileBrushStatus"/);
  assert.match(css, /is-keyboard-open[\s\S]*mobile-editor-preview/);
  assert.match(css, /visualViewport|--mobile-keyboard-height/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `"$NBO_PNPM" exec node --test tests/mobile-editor-layout.test.mjs tests/interaction-core.test.mjs`

Expected: FAIL because brush status and keyboard rules are absent.

- [ ] **Step 3: Wire M1 to the existing shared brush state**

The retouch primary menu must expose: target record, enter/exit, brush size, feather, strength, before/after, undo and clear. Entering retouch sets interaction mode to `brush`; leaving it restores `transform`. Pointer position continues to call `resolveRetouchTargetFromPoint` so the main and before-photo records remain separate.

- [ ] **Step 4: Add keyboard-compacted preview**

Listen to `window.visualViewport.resize`. When viewport height drops by at least 140 CSS px while a text control is focused, set `is-keyboard-open`; reduce preview flex share but keep canvas visible. Clear the state on blur or restored viewport height. Text inputs use `font-size: 16px` on coarse pointers.

- [ ] **Step 5: Complete the four-option export sheet**

```ts
export type CoverExportSheetProps = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onExport: (format: "png" | "jpeg", photoOnly: boolean) => void;
};
```

Buttons map to `(png,true)`, `(jpeg,true)`, `(png,false)`, `(jpeg,false)`. Keep the existing mobile share/long-press save behavior and existing status messages.

- [ ] **Step 6: Test, typecheck, and manually verify on iPhone-sized viewport**

Run:

```bash
"$NBO_PNPM" exec node --test tests/mobile-editor-layout.test.mjs tests/interaction-core.test.mjs tests/retouch-core.test.mjs tests/export-core.test.mjs
"$NBO_PNPM" run typecheck
```

Manual viewport: 390×844. Verify preview remains visible during slider drag, text keyboard, retouch and export-sheet opening.

- [ ] **Step 7: Commit**

```bash
git add app/cover/CoverMobileToolDock.tsx app/cover/CoverCompactShell.tsx app/cover/CoverExportSheet.tsx app/cover/CoverStudio.tsx app/globals.css docs/cover.html docs/cover.js docs/cover.css tests/mobile-editor-layout.test.mjs tests/interaction-core.test.mjs
git commit -m "feat: 完成手机涂抹键盘与导出体验"
```

### Task 12: Build SplitShell and preserve the desktop shell

**Files:**
- Create: `app/cover/CoverSplitShell.tsx`
- Modify: `app/cover/CoverStudio.tsx`
- Modify: `app/globals.css`
- Modify: `docs/cover.html`
- Modify: `docs/cover.js`
- Modify: `docs/cover.css`
- Modify: `tests/responsive-layout.test.mjs`
- Modify: `tests/compare-panel-layout.test.mjs`
- Modify: `tests/mobile-editor-layout.test.mjs`

**Interfaces:**
- Consumes: shared canvas, Dock, `CoverLayoutMode`, current state owner.
- Produces: `CoverSplitShellProps` and layout-only switching among all three shells.

- [ ] **Step 1: Add failing Split/Desktop layout assertions**

```js
test("Split 工具独立滚动且 Desktop 保持三栏", async () => {
  const appCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const publicCss = await readFile(new URL("../docs/cover.css", import.meta.url), "utf8");
  for (const css of [appCss, publicCss]) {
    assert.match(css, /data-cover-layout="split"/);
    assert.match(css, /split-tools[\s\S]*overflow-y:\s*auto/);
    assert.match(css, /data-cover-layout="desktop"/);
  }
});
```

- [ ] **Step 2: Run and verify failure**

Run: `"$NBO_PNPM" exec node --test tests/compare-panel-layout.test.mjs tests/mobile-editor-layout.test.mjs`

Expected: FAIL because Split selectors are absent.

- [ ] **Step 3: Implement SplitShell without moving state ownership**

```ts
export type CoverSplitShellProps = {
  canvas: React.ReactNode;
  dock: React.ReactNode;
  onOpenExport: () => void;
};
```

Render preview left and tools right. Only right tools scroll vertically. Reuse the same Dock, active tool IDs and callbacks as CompactShell.

- [ ] **Step 4: Switch shells by layout mode while preserving editor state**

Use a `ResizeObserver` on the editor root plus `(pointer: coarse)` media query to create `LayoutEnvironment`. Keep `CoverStudio` as the state owner; shells receive props. Do not key shells by mode and do not reload images on mode change.

- [ ] **Step 5: Preserve Desktop markup and behavior**

Wrap the existing three-column render in the `desktop` branch without renaming existing desktop classes. Its controls, preview, templates, export buttons, mouse drag, wheel zoom and shortcuts must remain present.

- [ ] **Step 6: Implement the same three modes in static CSS/DOM**

Set `data-cover-layout` on the static studio root using `resolveCoverLayoutMode`. Reparent or show/hide existing DOM through fixed shell slots; do not duplicate the canvas element, because replacing the canvas would lose pointer capture and preview state.

- [ ] **Step 7: Run tests and rotate through target layouts**

Run:

```bash
"$NBO_PNPM" run build:cover-core
"$NBO_PNPM" exec node --test tests/responsive-layout.test.mjs tests/compare-panel-layout.test.mjs tests/mobile-editor-layout.test.mjs tests/cover-feature-inventory.test.mjs
"$NBO_PNPM" run typecheck
```

Manual checks: 834×1194 compact, 1194×834 split, 1440×900 desktop. Change the viewport after loading two photos and adding strokes; verify nothing resets.

- [ ] **Step 8: Commit**

```bash
git add app/cover/CoverSplitShell.tsx app/cover/CoverStudio.tsx app/globals.css docs/cover.html docs/cover.js docs/cover.css tests/responsive-layout.test.mjs tests/compare-panel-layout.test.mjs tests/mobile-editor-layout.test.mjs
git commit -m "feat: 完成平板分栏与桌面无回归适配"
```

### Task 13: Full parity, device matrix, and temporary-page acceptance

**Files:**
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/cover-feature-inventory.test.mjs`
- Modify: `docs/cover.html`
- Generate: `docs/cover-core.js`
- Review: all files listed in this plan

**Interfaces:**
- Consumes: every prior task.
- Produces: a test-clean, type-clean, build-clean temporary version ready for user acceptance; no formal deployment before approval.

- [ ] **Step 1: Add final generated-core and no-duplicate assertions**

```js
test("发布页先加载共享核心且不保留重复算法", async () => {
  const html = await readFile(new URL("../docs/cover.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../docs/cover.js", import.meta.url), "utf8");
  assert.ok(html.indexOf("cover-core.js") < html.indexOf("cover.js"));
  assert.doesNotMatch(script, /function drawCover\s*\(/);
  assert.doesNotMatch(script, /function eraseShadeWithBrush\s*\(/);
  assert.doesNotMatch(script, /function normalizeStudioSettings\s*\(/);
});
```

- [ ] **Step 2: Rebuild the committed static core**

Run: `"$NBO_PNPM" run build:cover-core`

Expected: `docs/cover-core.js` changes only when canonical core changes.

- [ ] **Step 3: Run the complete automated gate**

Run:

```bash
"$NBO_PNPM" test
"$NBO_PNPM" run lint
git diff --check
```

Expected: build, typecheck, all Node tests, lint and whitespace check PASS.

- [ ] **Step 4: Execute the full device/browser acceptance matrix**

Check these viewports: 320×568, 375×667, 390×844, 430×932, 667×375, 844×390, 932×430, 768×1024, 834×1194, 1024×1366, 1024×768, 1194×834, 1366×1024, 1280×800, 1440×900, 1920×1080.

Run the applicable viewport cases in iPhone Safari, iPad Safari, Android Chrome, macOS Chrome and macOS Safari. Cover touch, mouse, trackpad, coarse/fine pointer transitions and the on-screen keyboard; mobile export is not accepted from desktop emulation alone.

For each applicable shell verify: upload/drag, main and before photo, all seven menus, all sliders, text keyboard, compare, intelligent alignment, main/before retouch, undo/clear, watermark, memories, templates, platform change, safe area, four exports, rotation/resizing state preservation, no horizontal overflow and no system-bar overlap.

- [ ] **Step 5: Compare the same render state across shells**

Use one fixed main image, before image, settings JSON and two fixed stroke arrays. Export design PNG from compact, split and desktop. Verify dimensions and visible composition match; compare feather edge, before-photo frame, text positions, capsule spacing and shade transition. Any device-specific visual difference blocks acceptance.

- [ ] **Step 6: Open a temporary local page for user review**

Serve `docs/` locally and open the full URL. Tell the user exactly that this is a temporary acceptance page. Do not push the branch or replace the formal GitHub Pages release in this step.

- [ ] **Step 7: Commit the verified candidate**

```bash
git add app/cover docs/cover.html docs/cover.css docs/cover.js docs/cover-core.js scripts tests package.json
git commit -m "test: 完成跨设备封面编辑器验收"
```

- [ ] **Step 8: Stop and request deployment approval**

Report automated results, tested devices, known browser limits, temporary URL and commit. Wait for explicit approval before pushing or updating the formal release URL.
