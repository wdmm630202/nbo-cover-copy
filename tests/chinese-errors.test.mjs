import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(source, /"gemini-2\.5-flash"/);
  assert.match(source, /"gemini-2\.5-flash-lite"/);
  assert.doesNotMatch(source, /gemini-3-flash-preview/);
  assert.match(source, /thinkingBudget:\s*0/);

  const isRetryable = await loadFunction(
    "apps-script/Code.gs",
    "function isRetryableGeminiError_",
    "function sleepBeforeRetry_",
    "isRetryableGeminiError_",
  );
  assert.equal(isRetryable(429, "resource exhausted"), true);
  assert.equal(isRetryable(503, "service unavailable"), true);
  assert.equal(isRetryable(408, "timeout"), true);
  assert.equal(isRetryable(400, "invalid argument"), false);
  assert.equal(isRetryable(403, "permission denied"), false);
});
