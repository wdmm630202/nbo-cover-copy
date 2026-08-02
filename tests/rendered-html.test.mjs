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

test("验证后入口在自有页面内运行智能文案应用", async () => {
  const [page, layout, packageJson, code, publicEntry, publicCover, publicCoverScript, coverPage, coverStudio, coverConfig, copyWorkspaceSwitch, coverWorkspaceEntry, workspaceSync, aiPage] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8"),
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/cover.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/cover.js", import.meta.url), "utf8"),
    readFile(new URL("../app/cover/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cover/CoverStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cover/cover-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/cover/CopyWorkspaceSwitch.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/CoverWorkspaceEntry.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../apps-script/Index.html", import.meta.url), "utf8"),
  ]);

  assert.match(
    page,
    /https:\/\/script\.google\.com\/macros\/s\/AKfycbwE3jYEnaSh75A-5ft6T-ChSvDnKrLFHvKi8fBvMEHhyRcBgieWcKsuN-3iuuzwQIQ_\/exec/,
  );
  assert.match(page, /<iframe/);
  assert.match(page, /nbo_embed=1/);
  assert.doesNotMatch(page, /window\.location\.replace\(AI_APP_URL\)/);
  assert.match(code, /setXFrameOptionsMode\(HtmlService\.XFrameOptionsMode\.ALLOWALL\)/);
  assert.match(publicEntry, /<iframe/);
  assert.match(publicEntry, /href="\.\/cover\.html"/);
  assert.match(publicEntry, /target="nbo-cover-studio"/);
  assert.match(publicEntry, /class="workspace-nav"/);
  assert.match(publicEntry, /position: fixed/);
  assert.match(publicEntry, /iframe \{[^}]*height: 100%;[^}]*top: 0;/);
  assert.doesNotMatch(publicEntry, /top:\s*-48px|calc\(100%\s*\+\s*48px\)/);
  assert.doesNotMatch(publicEntry, /http-equiv="refresh"|window\.location\.replace/);
  assert.match(page, /CoverWorkspaceEntry/);
  assert.match(coverWorkspaceEntry, /href="\/cover"/);
  assert.match(coverWorkspaceEntry, /target="nbo-cover-studio"/);
  assert.match(layout, /NBO 自媒体工作台｜智能文案与封面制作/);
  assert.match(layout, /og-workbench\.png/);
  assert.match(coverPage, /南铂封面制作台|CoverStudio/);
  assert.match(coverPage, /CopyWorkspaceSwitch/);
  assert.doesNotMatch(coverPage, /返回智能文案/);
  assert.match(copyWorkspaceSwitch, /切换到文案页/);
  assert.match(copyWorkspaceSwitch, /window\.opener/);
  assert.match(copyWorkspaceSwitch, /window\.opener\.focus\(\)/);
  assert.match(copyWorkspaceSwitch, /window\.open\("\/", "nbo-copy-studio"\)/);
  assert.match(coverStudio, /导出原图 JPG/);
  assert.match(coverStudio, /导出设计 JPG/);
  assert.match(coverStudio, /photoOnly/);
  assert.match(coverStudio, /字体描边/);
  assert.match(coverStudio, /字体阴影/);
  assert.match(coverStudio, /局部涂抹提亮/);
  assert.match(coverStudio, /画笔大小/);
  assert.match(coverStudio, /羽化/);
  assert.match(coverStudio, /涂抹强度/);
  assert.match(coverStudio, /eraseShadeWithBrush/);
  assert.match(coverStudio, /label="亮度"[\s\S]*?min=\{0\}[\s\S]*?max=\{200\}/);
  assert.match(coverStudio, /strokeText/);
  assert.match(coverStudio, /#FEE800/);
  assert.match(coverStudio, /主页 3:4 安全区/);
  assert.match(coverStudio, /图片不上传、不保存/);
  assert.match(coverStudio, /getWatermarkVisibleHeight\(width\) \/ Math\.max\(1, bounds\.bottom - bounds\.top\)/);
  assert.match(coverStudio, /WATERMARK_VISIBLE_HEIGHT_AT_1080 = 32/);
  assert.match(coverStudio, /WATERMARK_BOTTOM_GAP_AT_1080 = 36/);
  assert.match(coverStudio, /getWatermarkBottomGap\(width\)/);
  assert.match(coverStudio, /label="照片缩放"[\s\S]*?min=\{0\}[\s\S]*?max=\{400\}/);
  assert.match(coverStudio, /label="左右位置"[\s\S]*?min=\{-200\}[\s\S]*?max=\{200\}/);
  assert.match(coverStudio, /label="上下位置"[\s\S]*?min=\{-200\}[\s\S]*?max=\{200\}/);
  assert.match(coverStudio, /settings\.watermarkAlign === "left"/);
  assert.match(coverStudio, /settings\.watermarkAlign === "right"/);
  assert.match(coverStudio, /startsWith\("top-"\)/);
  assert.match(coverStudio, /startsWith\("bottom-"\)/);
  assert.match(coverStudio, /全部同步/);
  assert.match(coverStudio, /同步文案/);
  assert.match(coverStudio, /同步封面/);
  assert.match(coverStudio, /照片和构图保持不变/);
  assert.match(coverStudio, /BroadcastChannel/);
  assert.match(workspaceSync, /nbo-cover-copy-sync-v1/);
  assert.match(workspaceSync, /NBO_COVER_IMAGE_READY/);
  assert.match(workspaceSync, /NBO_COVER_IMAGE_REQUEST/);
  assert.match(coverWorkspaceEntry, /NBO_COVER_COPY_SELECTED|COVER_COPY_MESSAGE_TYPE/);
  assert.match(coverWorkspaceEntry, /COVER_IMAGE_MESSAGE_TYPE/);
  assert.match(coverWorkspaceEntry, /localStorage\.setItem/);
  assert.match(aiPage, /NBO_COVER_COPY_SELECTED/);
  assert.match(aiPage, /NBO_COVER_IMAGE_READY/);
  assert.match(aiPage, /publishCoverSelection/);
  assert.match(aiPage, /publishCoverImage/);
  assert.match(coverConfig, /1080/);
  assert.match(coverConfig, /1920/);
  assert.match(coverConfig, /COVER_RULES_VERSION/);
  assert.match(coverConfig, /playCountReserve: 144/);
  assert.match(coverConfig, /cropTop: 240/);
  assert.match(coverConfig, /cropBottom: 1680/);
  assert.match(coverConfig, /bottom-right/);
  assert.match(publicCover, /南铂封面制作台/);
  assert.match(publicCover, /访问密码/);
  assert.match(publicCover, /id="copyWorkspaceSwitch"/);
  assert.match(publicCover, /切换到文案页/);
  assert.match(publicCover, /id="syncAllCopy"/);
  assert.match(publicCover, /id="syncCoverImage"/);
  assert.match(publicCover, /同步文案/);
  assert.doesNotMatch(publicCover, /返回智能文案/);
  assert.match(publicCoverScript, /0817/);
  assert.match(publicCoverScript, /window\.opener/);
  assert.match(publicCoverScript, /window\.opener\.focus\(\)/);
  assert.match(publicCoverScript, /window\.open\("\.\/", "nbo-copy-studio"\)/);
  assert.match(publicCoverScript, /nbo-cover-copy-sync-v1/);
  assert.match(publicCoverScript, /BroadcastChannel/);
  assert.match(publicCoverScript, /applySyncedCopy/);
  assert.match(publicCoverScript, /applySyncedImage/);
  assert.match(publicCoverScript, /NBO_COVER_IMAGE_REQUEST/);
  assert.match(publicEntry, /NBO_COVER_COPY_SELECTED/);
  assert.match(publicEntry, /NBO_COVER_IMAGE_READY/);
  assert.match(publicEntry, /localStorage\.setItem/);
  assert.match(publicCoverScript, /image\/jpeg/);
  assert.match(publicCoverScript, /typeof navigator\.share/);
  assert.match(publicCoverScript, /navigator\.share/);
  assert.match(publicCoverScript, /存储图像/);
  assert.match(publicCoverScript, /scheduleExportPreparation/);
  assert.match(publicCoverScript, /这次生成没有完成/);
  assert.match(publicCoverScript, /原图尺寸文件已准备完成/);
  assert.match(publicCoverScript, /eraseShadeWithBrush/);
  assert.match(publicCover, /局部涂抹提亮/);
  assert.match(publicCover, /id="brightness" type="range" min="0" max="200" value="100"/);
  assert.match(publicCoverScript, /主页 3:4 安全区/);
  assert.match(publicCoverScript, /播放量避让区 144px/);
  assert.match(publicCoverScript, /requestedY/);
  assert.match(publicCoverScript, /getWatermarkVisibleHeight\(width\) \/ Math\.max\(1, bounds\.bottom - bounds\.top\)/);
  assert.match(publicCoverScript, /WATERMARK_VISIBLE_HEIGHT_AT_1080 = 32/);
  assert.match(publicCoverScript, /WATERMARK_BOTTOM_GAP_AT_1080 = 36/);
  assert.match(publicCoverScript, /getWatermarkBottomGap\(width\)/);
  assert.match(publicCover, /id="zoom" type="range" min="0" max="400" value="100"/);
  assert.match(publicCover, /id="offsetX" type="range" min="-200" max="200" value="0"/);
  assert.match(publicCover, /id="offsetY" type="range" min="-200" max="200" value="0"/);
  assert.match(publicCoverScript, /state\.watermarkAlign === "left"/);
  assert.match(publicCoverScript, /state\.watermarkAlign === "right"/);
  assert.match(publicCover, /data-template="top-left"/);
  assert.match(publicCover, /data-template="bottom-right"/);
  assert.match(publicCover, /data-watermark-align="center"/);
  assert.doesNotMatch(
    page + layout + packageJson + publicEntry + coverPage + coverStudio,
    /react-loading-skeleton|codex-preview|_sites-preview/,
  );
});
