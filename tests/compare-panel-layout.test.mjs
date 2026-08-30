import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sources = [
  {
    name: "应用版",
    path: new URL("../app/globals.css", import.meta.url),
    selector: ".cover-studio-grid.is-comparing .studio-memory",
  },
  {
    name: "静态发布版",
    path: new URL("../docs/cover.css", import.meta.url),
    selector: ".controls.compare-active .memory-panel",
  },
];

test("前后对比模式不把三组记忆卡片压缩折叠", async () => {
  for (const source of sources) {
    const css = await readFile(source.path, "utf8");
    const escapedSelector = source.selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rule = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

    assert.ok(rule, `${source.name}缺少前后对比记忆区规则`);
    assert.match(rule[1], /flex:\s*0\s+0\s+auto\s*;/, `${source.name}仍允许记忆区被压缩`);
    assert.match(rule[1], /grid-template-rows:\s*repeat\(3,\s*auto\)\s*;/, `${source.name}仍允许记忆卡片行高归零`);
  }
});
