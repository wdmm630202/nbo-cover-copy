import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PRIMARY_TOOLS, SECONDARY_TOOLS } from "../app/cover/core/tool-registry.ts";
import {
  assertLayoutSnapshot,
  assertShellTraceParity,
  assertToolCoverage,
  auditCoreOwnership,
  parseScriptSources,
} from "./helpers/final-acceptance-audit.mjs";

const repoRoot = new URL("../", import.meta.url);

test("核心实现由唯一 canonical 模块持有，HTML 先加载 core 再加载 shell", async () => {
  const result = await auditCoreOwnership(repoRoot);
  assert.deepEqual(result.owners, {
    drawCover: "app/cover/core/render-core.ts",
    eraseShadeWithBrush: "app/cover/core/retouch-core.ts",
    createCoverExportAsset: "app/cover/core/export-core.ts",
    PRIMARY_TOOLS: "app/cover/core/tool-registry.ts",
    SECONDARY_TOOLS: "app/cover/core/tool-registry.ts",
    resolveCanvasInteractionMode: "app/cover/core/interaction-core.ts",
    appendRetouchPoint: "app/cover/core/interaction-core.ts",
  });
  assert.equal(result.duplicateCanvasAlgorithms.length, 0);
  const html = await readFile(new URL("../docs/cover.html", import.meta.url), "utf8");
  assert.deepEqual(parseScriptSources(html).slice(-2), [
    "./cover-core.js?v=20260831-adaptive-editor",
    "./cover.js?v=20260831-adaptive-editor",
  ]);
});

test("核心审计会抓到改名复制的 Canvas 算法", async () => {
  await assert.rejects(() => auditCoreOwnership(repoRoot, {
    mutants: {
      "docs/cover.js": `function renamedClone(canvas) { const ctx = canvas.getContext("2d"); ctx.globalCompositeOperation = "destination-out"; ctx.quadraticCurveTo(1, 2, 3, 4); }`,
    },
  }), /重复 Canvas 算法/);
});

test("布局、工具覆盖与跨 shell 断言对负面样本敏感", () => {
  const valid = {
    viewport: { left: 0, top: 0, right: 390, bottom: 844 },
    preview: { left: 16, top: 72, right: 374, bottom: 560, width: 358, height: 488 },
    interactive: [{ id: "A1", left: 12, top: 700, right: 378, bottom: 748, width: 366, height: 48 }],
    transformedOffscreen: [],
  };
  assert.doesNotThrow(() => assertLayoutSnapshot(valid));
  assert.throws(() => assertLayoutSnapshot({ ...valid, preview: { ...valid.preview, width: 1 } }), /预览尺寸/);
  assert.throws(() => assertLayoutSnapshot({ ...valid, transformedOffscreen: ["#mobilePrimaryTools"] }), /transform/);

  const ids = Object.values(SECONDARY_TOOLS).flat().map(({ id }) => id);
  assert.equal(ids.length, 56);
  assert.doesNotThrow(() => assertToolCoverage(ids, Object.fromEntries(ids.map((id) => [id, true]))));
  const missing = Object.fromEntries(ids.slice(1).map((id) => [id, true]));
  assert.throws(() => assertToolCoverage(ids, missing), /缺少真实回调/);

  const traces = [{ width: 1080, height: 1920, trace: ["drawImage:main", "fillText:标题"] }];
  assert.doesNotThrow(() => assertShellTraceParity({ compact: traces[0], split: traces[0], desktop: traces[0] }));
  assert.throws(() => assertShellTraceParity({ compact: traces[0], split: traces[0], desktop: { ...traces[0], trace: ["wrong-shell"] } }), /跨 shell/);
  assert.equal(PRIMARY_TOOLS.length, 7);
});
