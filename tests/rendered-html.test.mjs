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
  const [page, layout, packageJson, code, publicEntry, publicCover, publicCoverScript, publicCompareLayout, coverPage, coverStudio, coverCompareLayout, coverConfig, copyWorkspaceSwitch, coverWorkspaceEntry, workspaceSync, aiPage] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8"),
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/cover.html", import.meta.url), "utf8"),
    readFile(new URL("../docs/cover.js", import.meta.url), "utf8"),
    readFile(new URL("../docs/compare-layout.js", import.meta.url), "utf8"),
    readFile(new URL("../app/cover/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cover/CoverStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cover/compare-layout.ts", import.meta.url), "utf8"),
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
  assert.match(coverPage, /NBO南铂封面制作台/);
  assert.match(coverPage, /CopyWorkspaceSwitch/);
  assert.doesNotMatch(coverPage, /返回智能文案/);
  assert.match(copyWorkspaceSwitch, /切换到文案页/);
  assert.match(copyWorkspaceSwitch, /window\.opener/);
  assert.match(copyWorkspaceSwitch, /window\.opener\.focus\(\)/);
  assert.match(copyWorkspaceSwitch, /window\.open\("\/", "nbo-copy-studio"\)/);
  assert.match(coverStudio, /导出原图 JPG/);
  assert.doesNotMatch(coverStudio, /cover-studio-intro/);
  assert.match(coverStudio, /导出设计 JPG/);
  assert.match(coverStudio, /前后对比/);
  assert.match(coverStudio, /拍摄前素颜照/);
  assert.match(coverStudio, /拍摄前照片缩放/);
  assert.match(coverStudio, /拍摄前自由旋转/);
  assert.match(coverStudio, /拍摄前亮度/);
  assert.match(coverStudio, /拍摄前压暗强度/);
  assert.match(coverStudio, /拍摄前底部向上压暗/);
  assert.match(coverStudio, /尝试对齐/);
  assert.match(coverStudio, /恢复对比图默认尺寸/);
  assert.match(coverStudio, /getComparisonAlignmentPlan/);
  assert.match(coverStudio, /beforeFrameScale/);
  assert.match(coverStudio, /getComparisonEvidenceLayout/);
  assert.match(coverStudio, /getComparisonExportError/);
  assert.match(coverStudio, /photoOnly/);
  assert.match(coverStudio, /字体描边/);
  assert.match(coverStudio, /字体阴影/);
  assert.match(coverStudio, /局部涂抹提亮/);
  assert.match(coverStudio, /studio-preview-tools/);
  assert.match(coverStudio, /画笔大小/);
  assert.match(coverStudio, /羽化/);
  assert.match(coverStudio, /涂抹强度/);
  assert.match(coverStudio, /BracketLeft/);
  assert.match(coverStudio, /BracketRight/);
  assert.match(coverStudio, /studio-brush-cursor/);
  assert.match(coverStudio, /涂抹前/);
  assert.match(coverStudio, /涂抹后/);
  assert.match(coverStudio, /aria-label="管理涂抹记录"/);
  assert.match(coverStudio, /主照片/);
  assert.match(coverStudio, /拍摄前照片/);
  assert.match(coverStudio, /getVisibleRetouchStrokes/);
  assert.match(coverStudio, /beforeRetouchStrokes/);
  assert.match(coverStudio, /eraseShadeWithBrush/);
  assert.match(coverStudio, /quadraticCurveTo/);
  assert.match(coverStudio, /filter = `blur\(/);
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
  assert.match(coverStudio, /ROTATION_SNAP_ANGLES[\s\S]*?-90[\s\S]*?90/);
  assert.match(coverStudio, /studio-transform-hud/);
  assert.match(coverStudio, /studio-snap-guide/);
  assert.match(coverStudio, /settings\.watermarkAlign === "left"/);
  assert.match(coverStudio, /settings\.watermarkAlign === "right"/);
  assert.match(coverStudio, /startsWith\("top-"\)/);
  assert.match(coverStudio, /startsWith\("bottom-"\)/);
  assert.match(coverStudio, /全部同步/);
  assert.match(coverStudio, /彻底重置/);
  assert.match(coverStudio, /studio-slider-number/);
  assert.match(coverStudio, /准确数值/);
  assert.match(coverStudio, /恢复默认/);
  assert.match(coverStudio, /window\.caches\?\.keys/);
  assert.match(coverStudio, /COVER_COPY_SYNC_KEY/);
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
  assert.match(publicCover, /前后对比/);
  assert.match(publicCover, /拍摄前素颜照/);
  assert.match(publicCover, /拍摄前照片缩放/);
  assert.match(publicCover, /id="beforeRotation"/);
  assert.match(publicCover, /id="beforeBrightness"/);
  assert.match(publicCover, /id="beforeShade"/);
  assert.match(publicCover, /id="beforeBottomShade"/);
  assert.match(publicCover, /id="alignBeforeFrame"/);
  assert.match(publicCover, /id="resetBeforeFrame"/);
  assert.match(publicCover, /compare-layout\.js/);
  assert.match(publicCover, /NBO南铂封面制作台/);
  assert.doesNotMatch(publicCover, /class="intro"/);
  assert.match(publicCover, /cover\.css\?v=20260830-before-frame-align/);
  assert.match(publicCover, /id="mobileTouchZone"/);
  assert.match(publicCoverScript, /mobileGesture/);
  assert.match(publicCoverScript, /mode: "rotate"/);
  assert.match(publicCoverScript, /mode: "scaleMove"/);
  assert.match(publicCoverScript, /touchmove.*stopNativeMobileTouch/);
  assert.match(publicCover, /class="preview-tools"/);
  assert.match(publicCover, /访问密码/);
  assert.match(publicCover, /id="copyWorkspaceSwitch"/);
  assert.match(publicCover, /切换到文案页/);
  assert.match(publicCover, /id="syncAllCopy"/);
  assert.match(publicCover, /id="syncCoverImage"/);
  assert.match(publicCover, /id="factoryReset"/);
  assert.match(publicCover, /彻底重置/);
  assert.match(publicCover, /data-value-control="zoom"/);
  assert.match(publicCover, /data-reset-control="zoom"/);
  assert.match(publicCoverScript, /已应用准确数值/);
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
  assert.match(publicCoverScript, /window\.caches\?\.keys/);
  assert.match(publicCoverScript, /localStorage\.removeItem/);
  assert.match(publicCoverScript, /NBO_COVER_IMAGE_REQUEST/);
  assert.match(publicEntry, /NBO_COVER_COPY_SELECTED/);
  assert.match(publicEntry, /NBO_COVER_IMAGE_READY/);
  assert.match(publicEntry, /localStorage\.setItem/);
  assert.match(publicCoverScript, /image\/jpeg/);
  assert.match(publicCoverScript, /getComparisonEvidenceLayout/);
  assert.match(publicCoverScript, /getComparisonExportError/);
  assert.match(publicCoverScript, /typeof navigator\.share/);
  assert.match(publicCoverScript, /navigator\.share/);
  assert.match(publicCoverScript, /存储图像/);
  assert.match(publicCoverScript, /scheduleExportPreparation/);
  assert.match(publicCoverScript, /lowPower \? 420 : 540/);
  assert.match(publicCoverScript, /navigator\.hardwareConcurrency/);
  assert.match(publicCoverScript, /requestAnimationFrame/);
  assert.match(publicCoverScript, /pagehide/);
  assert.match(publicCoverScript, /系统没有缩小图片/);
  assert.match(publicCoverScript, /JPG 控制在 19\.9MB 内/);
  assert.doesNotMatch(publicCoverScript, /8_000_000/);
  assert.match(publicCoverScript, /正在生成原图尺寸/);
  assert.doesNotMatch(publicCoverScript, /请再次点击导出/);
  assert.match(publicCoverScript, /eraseShadeWithBrush/);
  assert.match(publicCoverScript, /quadraticCurveTo/);
  assert.match(publicCoverScript, /filter = `blur\(/);
  assert.match(publicCover, /局部涂抹提亮/);
  assert.match(publicCover, /id="brushCursor"/);
  assert.match(publicCover, /id="compareBefore"/);
  assert.match(publicCover, /id="compareAfter"/);
  assert.match(publicCover, /id="retouchTargetAfter"/);
  assert.match(publicCover, /id="retouchTargetBefore"/);
  assert.match(publicCoverScript, /getVisibleRetouchStrokes/);
  assert.match(publicCoverScript, /beforeStrokes/);
  assert.match(publicCoverScript, /getComparisonAlignmentPlan/);
  assert.match(publicCoverScript, /beforeFrameScale/);
  assert.match(publicCoverScript, /strokes\.push\([\s\S]*?canvas\.setPointerCapture\([\s\S]*?updateUi\(\);[\s\S]*?draw\(\);/);
  assert.match(publicCoverScript, /BracketLeft/);
  assert.match(publicCoverScript, /BracketRight/);
  assert.match(publicCover, /id="brightness" type="range" min="0" max="200" value="100"/);
  assert.match(publicCoverScript, /主页 3:4 安全区/);
  assert.match(publicCoverScript, /rotationSnapAngles[\s\S]*?-90[\s\S]*?90/);
  assert.match(publicCover, /transformHud/);
  assert.match(publicCover, /snapHorizontal/);
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
  assert.doesNotMatch(coverStudio + coverCompareLayout + publicCoverScript + publicCompareLayout, /真实客片\s*·\s*NANBOART/);
  assert.match(publicCover, /data-template="top-left"/);
  assert.match(publicCover, /data-template="bottom-right"/);
  assert.match(publicCover, /data-watermark-align="center"/);
  assert.doesNotMatch(
    page + layout + packageJson + publicEntry + coverPage + coverStudio,
    /react-loading-skeleton|codex-preview|_sites-preview/,
  );
});
