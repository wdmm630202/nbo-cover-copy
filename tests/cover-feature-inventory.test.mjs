import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PRIMARY_TOOLS, SECONDARY_TOOLS } from "../app/cover/core/tool-registry.ts";

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

test("最终功能库覆盖 7 个一级菜单、56 个工具与电脑端输入方式", async () => {
  const [studio, html, script, dock] = await Promise.all([
    readFile(new URL("../app/cover/CoverStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/cover.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/cover.js", import.meta.url), "utf8"),
    readFile(new URL("../app/cover/CoverMobileToolDock.tsx", import.meta.url), "utf8"),
  ]);
  const allTools = Object.values(SECONDARY_TOOLS).flat();
  assert.equal(PRIMARY_TOOLS.length, 7);
  assert.equal(allTools.length, 56);
  assert.equal(new Set(allTools.map(({ id }) => id)).size, 56);
  for (const { id } of allTools) {
    assert.match(dock, new RegExp(`(?:^|\\W)${id}\\s*:`), `React 移动工具未委托：${id}`);
    assert.match(script, new RegExp(`(?:^|\\W)${id}\\s*:`), `静态移动工具未委托：${id}`);
  }
  assert.match(`${studio}\n${script}`, /createImageDropController/);
  assert.match(script, /addEventListener\("wheel"/);
  assert.match(script, /addEventListener\("keydown"/);
  assert.match(html, /id="exportOriginalPng"/);
  assert.match(html, /id="exportOriginalJpg"/);
  assert.match(html, /id="exportPng"/);
  assert.match(html, /id="exportJpg"/);
  assert.equal((html.match(/data-template=/g) || []).length, 9);
  assert.equal((html.match(/data-platform=/g) || []).length, 3);
  assert.equal((html.match(/data-memory-name/g) || []).length, 3);
});
