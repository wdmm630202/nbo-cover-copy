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
  hasExactCoverLengths_,
  hasCompletePlatformPackages_,
  codePointLength_
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
  );

  assert.equal(result.sets.length, 3);
  assert.equal(context.__copyTest.hasExactCoverLengths_(result), true);
  assert.equal(context.__copyTest.hasCompletePlatformPackages_(result), true);
  assert.equal(context.__copyTest.getCopyValidationIssues_(result).length, 0);
  result.sets.forEach((item) => {
    assert.equal(context.__copyTest.codePointLength_(item.top), 7);
    assert.equal(context.__copyTest.codePointLength_(item.bottom), 8);
    ["xiaohongshu", "douyin", "channels"].forEach((key) => {
      assert.ok(item.platforms[key].title);
      assert.ok(item.platforms[key].description);
      assert.ok(item.platforms[key].topics.length >= 2);
    });
  });
});
