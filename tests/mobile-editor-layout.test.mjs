import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { resolveCoverLayoutMode } from "../app/cover/core/responsive-layout.ts";

const read = async (path) => readFile(new URL(path, import.meta.url), "utf8").catch(() => "");

async function readTaskSources() {
  const coverFiles = (await readdir(new URL("../app/cover/", import.meta.url)))
    .filter((name) => name.endsWith(".tsx") || name.endsWith(".ts"));
  const docsFiles = ["cover.html", "cover.css", "cover.js"];
  return Promise.all([
    ...coverFiles.map((name) => read(`../app/cover/${name}`)),
    ...docsFiles.map((name) => read(`../docs/${name}`)),
  ]);
}

test("静态页提供可访问的手机顶栏、两级工具栏与导出根节点", async () => {
  const html = await read("../docs/cover.html");

  assert.match(html, /<header id="mobileEditorTopbar" class="mobile-editor-topbar" hidden>/);
  assert.match(html, /<button id="closeMobileEditor" type="button">返回<\/button>/);
  assert.match(html, /<strong>南铂封面<\/strong>/);
  assert.match(html, /<button id="openMobileExport" type="button">导出<\/button>/);
  assert.match(html, /<nav id="mobileSecondaryTools"[^>]*aria-label="当前工具" hidden>/);
  assert.match(html, /<nav id="mobilePrimaryTools"[^>]*aria-label="编辑分类" hidden>/);
  assert.match(html, /<section id="mobileSingleToolControl"[^>]*aria-live="polite" hidden>/);
  assert.match(html, /<section id="mobileExportSheet"[^>]*aria-label="选择导出格式" hidden>/);
});

test("A1 一次只展示一个参数并由唯一注册表驱动", async () => {
  const [dock, shell, studio, staticSource] = await Promise.all([
    read("../app/cover/CoverMobileToolDock.tsx"),
    read("../app/cover/CoverCompactShell.tsx"),
    read("../app/cover/CoverStudio.tsx"),
    read("../docs/cover.js"),
  ]);

  assert.match(dock, /export type MobileToolDockProps/);
  assert.match(dock, /PRIMARY_TOOLS\.map/);
  assert.match(dock, /getSecondaryTools\(primary, context\)/);
  assert.match(dock, /id="mobileSingleToolControl"/);
  assert.match(dock, /准确数值/);
  assert.match(dock, /复位/);
  assert.equal((dock.match(/className="mobile-single-tool-control"/g) || []).length, 1);
  assert.match(shell, /singleToolControl/);
  assert.match(studio, /activePrimaryTool/);
  assert.match(studio, /activeSecondaryTool/);
  assert.match(staticSource, /PRIMARY_TOOLS/);
  assert.match(staticSource, /getSecondaryTools/);
  assert.match(staticSource, /activePrimaryTool/);
  assert.match(staticSource, /activeSecondaryTool/);
  assert.doesNotMatch(staticSource, /\[\s*["']photo["']\s*,\s*["']compose["']/);
});

test("React 与静态手机接线共同使用语义行为层", async () => {
  const [studio, staticSource] = await Promise.all([
    read("../app/cover/CoverStudio.tsx"),
    read("../docs/cover.js"),
  ]);
  for (const source of [studio, staticSource]) {
    assert.match(source, /applyMobileSyncedCopy/);
    assert.match(source, /getMobileRetouchTargetChoices/);
    assert.match(source, /isMobileToolDisabled/);
    assert.match(source, /revealCoverRules/);
  }
  assert.match(staticSource, /tool\.id === "syncCopy"\) return applySyncedCopy\("all"\)/);
  assert.match(staticSource, /resetMobileToolSetting\(state, tool\)/);
});

test("单项面板支持 range text color toggle choice action 且触控目标足够大", async () => {
  const [dock, appCss, staticCss] = await Promise.all([
    read("../app/cover/CoverMobileToolDock.tsx"),
    read("../app/globals.css"),
    read("../docs/cover.css"),
  ]);
  for (const kind of ["range", "text", "color", "toggle", "choice", "action"]) {
    assert.match(dock, new RegExp(`activeTool\\.kind === ["']${kind}["']`));
  }
  assert.match(dock, /type="range"/);
  assert.match(dock, /type="number"/);
  assert.match(dock, /aria-pressed/);
  for (const css of [appCss, staticCss]) {
    assert.match(css, /mobile-single-tool-control[\s\S]{0,1200}min-height:\s*44px/);
    assert.match(css, /mobile-single-tool-control[\s\S]{0,1800}font-size:\s*16px/);
    assert.match(css, /mobile-(?:secondary|primary)-tools[\s\S]{0,500}overscroll-behavior-(?:x|inline):\s*contain/);
  }
});

test("React Compact 壳层保留单一画布并由 CoverStudio 拥有开关状态", async () => {
  const [studio, shell, dock, exportSheet] = await Promise.all([
    read("../app/cover/CoverStudio.tsx"),
    read("../app/cover/CoverCompactShell.tsx"),
    read("../app/cover/CoverMobileToolDock.tsx"),
    read("../app/cover/CoverExportSheet.tsx"),
  ]);

  assert.match(shell, /export type CoverCompactShellProps = \{/);
  assert.match(shell, /id="mobileEditorTopbar"/);
  assert.match(dock, /id="mobileSecondaryTools"/);
  assert.match(dock, /id="mobilePrimaryTools"/);
  assert.doesNotMatch(shell, /\buseState\b/);
  assert.match(exportSheet, /export type CoverExportSheetProps = \{/);
  assert.match(exportSheet, /id="mobileExportSheet"/);
  assert.match(studio, /import \{[\s\S]{0,100}resolveCoverLayoutMode[\s\S]{0,100}\} from "\.\/core\/responsive-layout"/);
  assert.match(studio, /const \[isCompactEditorOpen, setIsCompactEditorOpen\] = useState\(false\)/);
  assert.match(studio, /<CoverCompactShell/);
  assert.match(studio, /canvas=\{coverCanvas\}/);
  assert.doesNotMatch(studio, /key=\{[^}]*layout/i);
  assert.equal((studio.match(/<CoverCanvasSurface/g) || []).length, 1);
});

test("Compact 壳层占有 100dvh 并将滚动限定在工具横排", async () => {
  const [appCss, staticCss] = await Promise.all([
    read("../app/globals.css"),
    read("../docs/cover.css"),
  ]);

  for (const css of [appCss, staticCss]) {
    assert.match(css, /height:\s*100dvh/);
    assert.match(css, /position:\s*fixed/);
    assert.match(css, /inset:\s*0/);
    assert.match(css, /min-height:\s*0/);
    assert.match(css, /env\(safe-area-inset-top\)/);
    assert.match(css, /env\(safe-area-inset-bottom\)/);
    assert.match(css, /min-(?:width|inline-size):\s*44px/);
    assert.match(css, /min-(?:height|block-size):\s*44px/);
    assert.match(css, /mobile-(?:secondary|primary)-tools[\s\S]{0,500}overflow-x:\s*auto/);
    assert.match(css, /mobile-editor-open[\s\S]{0,300}overflow:\s*hidden/);
    assert.match(css, /data-cover-layout="compact"[\s\S]{0,500}mobile-editor-launcher[\s\S]{0,120}display:\s*inline-flex/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /prefers-reduced-transparency:\s*reduce/);
  }
});

test("手机壳层只由共享 resolver 决定且模式变化会安全隐藏", async () => {
  const [studio, staticSource] = await Promise.all([
    read("../app/cover/CoverStudio.tsx"),
    read("../docs/cover.js"),
  ]);

  assert.equal(resolveCoverLayoutMode({ width: 390, height: 844, pointer: "coarse" }), "compact");
  assert.equal(resolveCoverLayoutMode({ width: 430, height: 932, pointer: "coarse" }), "compact");
  assert.equal(resolveCoverLayoutMode({ width: 1440, height: 900, pointer: "fine" }), "desktop");
  assert.match(studio, /resolveCoverLayoutMode\(\{/);
  assert.match(studio, /layoutMode (?:===|!==) "compact"/);
  assert.match(staticSource, /resolveCoverLayoutMode\(\{/);
  assert.match(staticSource, /studioGrid\.dataset\.coverLayout = coverLayoutMode/);
  assert.match(staticSource, /addEventListener\("resize", syncMobileEditorLayout\)/);
  assert.match(staticSource, /coverPointerQuery\.addEventListener\?\.\("change", syncMobileEditorLayout\)/);
  assert.match(staticSource, /compactEditorOpen = false/);
});

test("实现不依赖 Fullscreen API 且保留桌面三栏选择器", async () => {
  const sources = await readTaskSources();
  const [appCss, staticCss] = await Promise.all([
    read("../app/globals.css"),
    read("../docs/cover.css"),
  ]);

  assert.doesNotMatch(sources.join("\n"), /requestFullscreen|webkitRequestFullscreen/);
  assert.match(appCss, /\.cover-studio-grid\s*\{/);
  assert.match(staticCss, /\.studio-grid\s*\{/);
  assert.match(appCss, /\.mobile-editor-action:active[\s\S]{0,120}transform:\s*scale\(/);
  assert.match(staticCss, /\.mobile-editor-topbar button:active[\s\S]{0,120}transform:\s*scale\(/);
});

test("Compact 打开前画布触控即由编辑器接管且普通页面仍可纵向滚动", async () => {
  const [appCss, staticCss] = await Promise.all([
    read("../app/globals.css"),
    read("../docs/cover.css"),
  ]);

  assert.match(appCss, /\.cover-compact-shell\.is-open \.studio-canvas-shell\.has-image canvas,[\s\S]{0,180}\.cover-compact-shell\.is-open \.studio-mobile-touch-zone\.is-active[\s\S]{0,80}touch-action:\s*none/);
  assert.match(staticCss, /\.studio-grid\[data-cover-layout="compact"\]\.is-mobile-editor-open \.canvas-shell\.has-image canvas,[\s\S]{0,220}\.studio-grid\[data-cover-layout="compact"\]\.is-mobile-editor-open \.mobile-touch-zone\.active[\s\S]{0,80}touch-action:\s*none/);
  assert.match(appCss, /\.studio-canvas-shell\.has-image canvas\s*\{\s*touch-action:\s*pan-y/);
  assert.match(staticCss, /\.canvas-shell\.has-image canvas\s*\{\s*touch-action:\s*pan-y/);
});

test("手机涂抹状态在预览内持续可见且两端共用业务状态", async () => {
  const [studio, shell, surface, html, staticSource] = await Promise.all([
    read("../app/cover/CoverStudio.tsx"),
    read("../app/cover/CoverCompactShell.tsx"),
    read("../app/cover/CoverCanvasSurface.tsx"),
    read("../docs/cover.html"),
    read("../docs/cover.js"),
  ]);

  assert.match(shell, /mobileBrushStatus/);
  assert.match(studio, /brushMode=\{brushMode\}/);
  assert.match(studio, /brushTarget=\{activeRetouchTarget\}/);
  assert.match(html, /id="mobileBrushStatus"/);
  assert.match(staticSource, /mobileBrushStatus[\s\S]{0,500}retouch\.active/);
  assert.match(surface, /resolveRetouchTargetFromPoint/);
  assert.doesNotMatch([studio, shell, staticSource].join("\n"), /destination-out|createRadialGradient/);
});

test("文本键盘只在视口下降 140px 且聚焦时压缩工具区，预览仍保留", async () => {
  const [studio, staticSource, appCss, staticCss] = await Promise.all([
    read("../app/cover/CoverStudio.tsx"),
    read("../docs/cover.js"),
    read("../app/globals.css"),
    read("../docs/cover.css"),
  ]);

  for (const source of [studio, staticSource]) {
    assert.match(source, /visualViewport/);
    assert.match(source, /updateMobileKeyboardViewport/);
    assert.match(source, /isTextControlFocused/);
    assert.match(source, /--mobile-keyboard-height/);
    assert.match(source, /is-keyboard-open/);
  }
  for (const css of [appCss, staticCss]) {
    assert.match(css, /is-keyboard-open[\s\S]{0,500}(?:cover-compact-preview|canvas-shell)/);
    assert.match(css, /is-keyboard-open[\s\S]{0,900}mobile-single-tool-control/);
    assert.match(css, /--mobile-keyboard-height/);
    assert.match(css, /@media\s*\(pointer:\s*coarse\)[\s\S]{0,900}font-size:\s*16px/);
  }
});

test("手机导出 Sheet 精确提供四种共享导出并在 busy 时防重复", async () => {
  const [studio, sheet, html, staticSource] = await Promise.all([
    read("../app/cover/CoverStudio.tsx"),
    read("../app/cover/CoverExportSheet.tsx"),
    read("../docs/cover.html"),
    read("../docs/cover.js"),
  ]);

  assert.match(sheet, /busy:\s*boolean/);
  assert.match(sheet, /onExport:\s*\(format:\s*"png"\s*\|\s*"jpeg",\s*photoOnly:\s*boolean\)/);
  for (const mapping of [
    /onExport\("png",\s*true\)/,
    /onExport\("jpeg",\s*true\)/,
    /onExport\("png",\s*false\)/,
    /onExport\("jpeg",\s*false\)/,
  ]) assert.match(sheet, mapping);
  assert.match(sheet, /disabled=\{busy\}/);
  assert.match(studio, /busy=\{isMobileExportBusy\}/);
  assert.match(studio, /onExport=\{handleMobileExport\}/);
  assert.match(studio, /mobileExportBusyRef\.current/);
  for (const id of ["mobileExportOriginalPng", "mobileExportOriginalJpg", "mobileExportDesignPng", "mobileExportDesignJpg"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(staticSource, /mobileExportOriginalPng[\s\S]{0,140}runMobileExport\("png",\s*true\)/);
  assert.match(staticSource, /mobileExportOriginalJpg[\s\S]{0,140}runMobileExport\("jpeg",\s*true\)/);
  assert.match(staticSource, /mobileExportDesignPng[\s\S]{0,140}runMobileExport\("png",\s*false\)/);
  assert.match(staticSource, /mobileExportDesignJpg[\s\S]{0,140}runMobileExport\("jpeg",\s*false\)/);
  assert.match(staticSource, /mobileExportBusy/);
  assert.match(staticSource, /navigator\.share/);
  assert.match(staticSource, /savePreview/);
});
