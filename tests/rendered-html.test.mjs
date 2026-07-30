import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("公开入口显示中文密码验证页并记住登录状态", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>NBO 灵感封面｜访问验证<\/title>/i);
  assert.match(html, /请输入访问密码/);
  assert.match(html, /name="password"/);
  assert.match(html, /首次输入后，这台设备将自动记住180天/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("验证后入口指向现有智能文案应用", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(
    page,
    /https:\/\/script\.google\.com\/macros\/s\/AKfycbwE3jYEnaSh75A-5ft6T-ChSvDnKrLFHvKi8fBvMEHhyRcBgieWcKsuN-3iuuzwQIQ_\/exec/,
  );
  assert.match(page, /window\.location\.replace\(AI_APP_URL\)/);
  assert.match(page, /真实识图 · 公开趋势 · 固定7\+8字封面/);
  assert.match(layout, /NBO 灵感封面｜图片转发布文案/);
  assert.doesNotMatch(page + layout + packageJson, /react-loading-skeleton|codex-preview|_sites-preview/);
});
