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
