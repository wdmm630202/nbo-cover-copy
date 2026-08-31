import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as exportCore from "../app/cover/core/export-core.ts";
import * as canonical from "../app/cover/core/responsive-layout.ts";

test("静态核心与 TypeScript 使用同一布局解析", async () => {
  const context = { window: {} };
  runInNewContext(await readFile(new URL("../docs/cover-core.js", import.meta.url), "utf8"), context);
  const input = { width: 1194, height: 834, pointer: "coarse" };
  assert.equal(context.NBOCoverCore.resolveCoverLayoutMode(input), canonical.resolveCoverLayoutMode(input));
});

test("静态核心与 TypeScript 使用同一导出策略", async () => {
  const context = {};
  runInNewContext(await readFile(new URL("../docs/cover-core.js", import.meta.url), "utf8"), context);
  const source = { width: 3375, height: 6000 };
  const preset = { width: 1080, height: 1920 };
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.NBOCoverCore.getExportAttemptSizes(source, preset, "jpeg", true))),
    exportCore.getExportAttemptSizes(source, preset, "jpeg", true),
  );
  assert.equal(
    context.NBOCoverCore.getExportFileName("T62_7263", "设计", "抖音", "9:16", "jpeg", new Date(2026, 7, 31, 9, 8, 7)),
    exportCore.getExportFileName("T62_7263", "设计", "抖音", "9:16", "jpeg", new Date(2026, 7, 31, 9, 8, 7)),
  );
});
