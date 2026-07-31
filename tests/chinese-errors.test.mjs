import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);

async function loadFunction(file, startMarker, endMarker, functionName) {
  const source = await readFile(new URL(file, root), "utf8");
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `找不到 ${functionName}`);
  const declaration = source.slice(start, end).trim();
  return Function(`${declaration}; return ${functionName};`)();
}

function assertChineseOnly(message) {
  assert.match(message, /[\u4e00-\u9fff]/);
  assert.doesNotMatch(message, /[A-Za-z]/);
}

test("后台把外部服务英文错误统一转换成中文", async () => {
  const translate = await loadFunction(
    "apps-script/Code.gs",
    "function toChineseError_",
    "function collectPublicTrends_",
    "toChineseError_",
  );
  const messages = [
    translate("This model is currently experiencing high demand."),
    translate("Deadline exceeded while fetching response."),
    translate("Permission denied for API key."),
    translate("Unexpected foreign service failure."),
  ];
  messages.forEach(assertChineseOnly);
  assert.match(messages[0], /自动尝试/);
});

test("前端兜底不会把未知英文错误显示给用户", async () => {
  const translate = await loadFunction(
    "apps-script/Index.html",
    "function toChineseErrorMessage",
    "let toastTimer",
    "toChineseErrorMessage",
  );
  const messages = [
    translate({ message: "This model is currently experiencing high demand." }),
    translate({ message: "Failed to fetch because the network is offline." }),
    translate({ message: "Something completely unexpected happened." }),
  ];
  messages.forEach(assertChineseOnly);
  assert.match(messages[0], /自动尝试/);
});

test("繁忙时只重试临时错误并自动切换免费稳定模型", async () => {
  const source = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  assert.match(source, /"gemini-3\.6-flash"/);
  assert.match(source, /"gemini-3\.5-flash-lite"/);
  assert.match(
    source,
    /const GEMINI_INSIGHT_MODELS = \[\s*"gemini-3\.5-flash-lite",\s*"gemini-3\.6-flash"/,
  );
  assert.match(
    source,
    /const GEMINI_COPY_MODELS = \[\s*"gemini-3\.6-flash",\s*"gemini-3\.5-flash-lite"/,
  );
  assert.doesNotMatch(source, /gemini-2\.5-flash/);
  assert.doesNotMatch(source, /gemini-3-flash-preview/);
  assert.match(source, /thinkingLevel:\s*"minimal"/);
  assert.match(source, /\{ thinkingLevel: "low", temperature: 0\.9 \}/);
  assert.match(source, /maxOutputTokens:/);
  assert.doesNotMatch(source, /temperature:\s*temperature/);

  const isRetryable = await loadFunction(
    "apps-script/Code.gs",
    "function isRetryableGeminiError_",
    "function sleepBeforeRetry_",
    "isRetryableGeminiError_",
  );
  assert.equal(isRetryable(429, "resource exhausted"), true);
  assert.equal(isRetryable(503, "service unavailable"), true);
  assert.equal(isRetryable(408, "timeout"), true);
  assert.equal(isRetryable(404, "This model is no longer available to new users"), true);
  assert.equal(isRetryable(404, "Unknown page"), false);
  assert.equal(isRetryable(400, "invalid argument"), false);
  assert.equal(isRetryable(403, "permission denied"), false);
});

test("文案校验不再整单失败并能自动补齐三套结果", async () => {
  const source = await readFile(new URL("apps-script/Code.gs", root), "utf8");
  assert.doesNotMatch(source, /本次内容校验未通过，请点击“换一批”重新生成/);
  assert.match(source, /finalizeCopyResult_/);
  assert.match(source, /检测到缺项，立即转为本地补全/);
  assert.doesNotMatch(source, /buildRepairPrompt_\(result/);

  const context = { console };
  runInNewContext(
    `${source}
globalThis.__copyTest = {
  finalizeCopyResult_,
  getCopyValidationIssues_,
  hasValidCoverLengths_,
  hasCompletePlatformPackages_,
  codePointLength_,
  normalizeCoverConfig_
};`,
    context,
  );

  const initial = {
    sets: [
      {
        eyebrow: "珠宝细节",
        top: "太短",
        bottom: "这是一条明显超过八个字的封面文案",
        reason: "",
        score: 95,
        platforms: {
          xiaohongshu: { title: "", description: "", topics: [] },
          douyin: null,
          channels: {},
        },
      },
    ],
  };
  const insight = {
    category: "珠宝首饰",
    summary: "暗色背景里，一只手拿着带有金色细节的手链。",
    keywords: ["珠宝", "手链", "暗调"],
    audience: "喜欢珠宝细节和氛围摄影的人",
    contentOpportunity: "用暗光与金色细节形成视觉反差",
  };
  const result = context.__copyTest.finalizeCopyResult_(
    initial,
    insight,
    { terms: ["珠宝拍摄", "手链搭配"] },
    { mode: "smart" },
  );

  assert.equal(result.sets.length, 3);
  assert.equal(
    context.__copyTest.hasValidCoverLengths_(result, { mode: "smart" }),
    true,
  );
  assert.equal(context.__copyTest.hasCompletePlatformPackages_(result), true);
  assert.equal(
    context.__copyTest.getCopyValidationIssues_(result, { mode: "smart" }).length,
    0,
  );
  result.sets.forEach((item) => {
    assert.ok(context.__copyTest.codePointLength_(item.top) >= 4);
    assert.ok(context.__copyTest.codePointLength_(item.top) <= 14);
    assert.ok(context.__copyTest.codePointLength_(item.bottom) >= 4);
    assert.ok(context.__copyTest.codePointLength_(item.bottom) <= 14);
    ["xiaohongshu", "douyin", "channels"].forEach((key) => {
      assert.ok(item.platforms[key].title);
      assert.ok(item.platforms[key].description);
      assert.ok(item.platforms[key].topics.length >= 2);
    });
  });
});

test("封面默认智能决定字数并允许手动设置上下行长度", async () => {
  const [source, page] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("apps-script/Index.html", root), "utf8"),
  ]);

  assert.match(source, /mode === "manual" \? "manual" : "smart"/);
  assert.match(source, /禁止为了统一排版硬凑7\+8/);
  assert.match(source, /top 和 bottom 各自可在4至14个中文字符之间自由决定/);
  assert.match(source, /运营者、博主或客户的个人情感/);
  assert.match(source, /多来源共同出现的需求高于单一来源词/);
  assert.match(source, /categoryQuery \+ " 小红书"/);
  assert.match(source, /categoryQuery \+ " 抖音"/);
  assert.match(source, /categoryQuery \+ " 视频号"/);

  assert.match(page, /智能推荐（首选）/);
  assert.match(page, /topLengthInput/);
  assert.match(page, /bottomLengthInput/);
  assert.match(page, /按此设置重新生成/);
  assert.match(page, /个人情绪和审美偏好不会覆盖图片与数据判断/);
  assert.doesNotMatch(page, /每组严格校验上行 7 字、下行 8 字/);
  assert.doesNotMatch(page, /3 组固定 7\+8 字封面/);

  const context = { console };
  runInNewContext(
    `${source}
globalThis.__coverModeTest = {
  finalizeCopyResult_,
  hasValidCoverLengths_,
  getCopyValidationIssues_,
  codePointLength_
};`,
    context,
  );
  const baseResult = {
    sets: [
      { top: "数据判断这张图", bottom: "不是情绪替你做决定", platforms: {} },
      { top: "这张图该怎么发", bottom: "先让当下数据来回答", platforms: {} },
      { top: "不再硬套固定字", bottom: "每张图片都有自己节奏", platforms: {} },
    ],
  };
  const insight = {
    category: "人物写真",
    summary: "一位人物在暗色背景中看向镜头。",
    keywords: ["人物写真", "暗调"],
    audience: "关注人物摄影表达的人",
    contentOpportunity: "用画面情绪与真实需求建立停留",
  };
  const manual = context.__coverModeTest.finalizeCopyResult_(
    baseResult,
    insight,
    { terms: ["人物写真文案"] },
    { mode: "manual", topLength: 6, bottomLength: 10 },
  );
  assert.equal(
    context.__coverModeTest.hasValidCoverLengths_(
      manual,
      { mode: "manual", topLength: 6, bottomLength: 10 },
    ),
    true,
  );
  manual.sets.forEach((item) => {
    assert.equal(context.__coverModeTest.codePointLength_(item.top), 6);
    assert.equal(context.__coverModeTest.codePointLength_(item.bottom), 10);
  });
});

test("爆款生成先现查趋势、发散十二个角度并筛选三组", async () => {
  const [source, page] = await Promise.all([
    readFile(new URL("apps-script/Code.gs", root), "utf8"),
    readFile(new URL("apps-script/Index.html", root), "utf8"),
  ]);

  assert.match(source, /const TREND_CACHE_SECONDS = 600/);
  assert.match(source, /const VIRAL_CANDIDATE_COUNT = 12/);
  assert.match(source, /Google公开搜索联想/);
  assert.match(source, /Bing公开搜索联想/);
  assert.match(source, /百度公开搜索联想/);
  assert.match(source, /发散恰好12个不同创意角度/);
  assert.match(source, /图片相关性30分、跨来源数据与新鲜度20分、平台匹配20分/);
  assert.match(source, /过时套话、单一来源信号和无关热词自动降权/);
  assert.match(source, /一个热词只有与图片至少一半内容强相关时才可采用/);
  assert.match(source, /sets\.sort/);

  assert.match(page, /本次现查的公开趋势信号/);
  assert.match(page, /跨来源信号与图片事实共同决策/);
  assert.match(page, /图片与数据共同决策 · 智能字数首选/);
});
