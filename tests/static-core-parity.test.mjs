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
