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
  assert.match(messages[0], /使用人数较多/);
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
  assert.match(messages[0], /使用人数较多/);
});
