import assert from "node:assert/strict";
import test from "node:test";
import { getSecondaryTools } from "../app/cover/core/tool-registry.ts";
import {
  applyMobileSyncedCopy,
  getMobileRetouchTargetChoices,
  isMobileToolDisabled,
  resetMobileToolSetting,
  revealCoverRules,
} from "../app/cover/core/mobile-tool-behavior.ts";

test("手机文案同步只更新两行文字，已有主照片与同步图片均不参与替换", () => {
  const mainImage = { id: "current-main" };
  const beforeImage = { id: "current-before" };
  const syncedImage = { id: "available-but-must-not-apply" };
  const current = { topText: "旧上行", bottomText: "旧下行", image: mainImage, beforeImage, syncedImage };

  const next = applyMobileSyncedCopy(current, { topText: "新上行", bottomText: "新下行" }, "all");

  assert.equal(next.topText, "新上行");
  assert.equal(next.bottomText, "新下行");
  assert.equal(next.image, mainImage);
  assert.equal(next.beforeImage, beforeImage);
  assert.equal(next.syncedImage, syncedImage);
});

test("拍摄前三项画面复位只重置 before 设置，主照片参数保持不变", () => {
  const beforeTools = getSecondaryTools("image", { comparisonEnabled: true, target: "before" });
  let current = {
    brightness: 132,
    shade: 42,
    bottomShade: 61,
    beforeBrightness: 54,
    beforeShade: 73,
    beforeBottomShade: 28,
  };

  for (const tool of beforeTools) current = resetMobileToolSetting(current, tool);

  assert.deepEqual(current, {
    brightness: 132,
    shade: 42,
    bottomShade: 61,
    beforeBrightness: 100,
    beforeShade: 0,
    beforeBottomShade: 100,
  });
});

test("动态拍摄前构图复位仍按 settingKey 归位且不会触碰主构图", () => {
  const beforeTools = getSecondaryTools("compose", { comparisonEnabled: true, target: "before" });
  const offsetX = beforeTools.find((tool) => tool.id === "beforeOffsetX");
  const current = { offsetX: 37, beforeOffsetX: -22, beforeOffsetY: 16 };
  const next = resetMobileToolSetting(current, offsetX);

  assert.equal(next.offsetX, 37);
  assert.equal(next.beforeOffsetX, 0);
  assert.equal(next.beforeOffsetY, 16);
});

test("上下行字号联动时手机下行字号控件整体禁用", () => {
  const bottomScale = getSecondaryTools("text", { comparisonEnabled: false, target: "after" })
    .find((tool) => tool.id === "bottomTextScale");

  assert.equal(isMobileToolDisabled(bottomScale, { textScaleLinked: true }), true);
  assert.equal(isMobileToolDisabled(bottomScale, { textScaleLinked: false }), false);
});

test("没有拍摄前照片时涂抹目标不提供会回退主照片的死选项", () => {
  assert.deepEqual(getMobileRetouchTargetChoices(false), [{ value: "after", label: "主照片记录" }]);
  assert.deepEqual(getMobileRetouchTargetChoices(true), [
    { value: "after", label: "主照片记录" },
    { value: "before", label: "拍摄前记录" },
  ]);
});

test("Compact 内打开长期规范会先退出，再等待布局恢复后滚动并聚焦", () => {
  const events = [];
  let deferred;
  const target = {
    scrollIntoView: (options) => events.push(["scroll", options]),
    focus: (options) => events.push(["focus", options]),
  };

  revealCoverRules({
    compactOpen: true,
    closeCompact: () => events.push(["close"]),
    afterLayout: (callback) => { events.push(["schedule"]); deferred = callback; },
    getTarget: () => target,
  });

  assert.deepEqual(events, [["close"], ["schedule"]]);
  deferred();
  assert.deepEqual(events, [
    ["close"],
    ["schedule"],
    ["scroll", { behavior: "smooth", block: "start" }],
    ["focus", { preventScroll: true }],
  ]);
});
