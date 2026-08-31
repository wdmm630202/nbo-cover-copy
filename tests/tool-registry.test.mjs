import assert from "node:assert/strict";
import test from "node:test";
import { PRIMARY_TOOLS, getSecondaryTools } from "../app/cover/core/tool-registry.ts";

test("一级菜单顺序固定且涂抹独立", () => {
  assert.deepEqual(PRIMARY_TOOLS.map((item) => item.id), [
    "photo", "compose", "text", "image", "retouch", "layout", "more",
  ]);
});

test("拍摄前构图和画面参数按一级菜单分组", () => {
  assert.deepEqual(
    getSecondaryTools("compose", { comparisonEnabled: true, target: "before" }).map((item) => item.id),
    [
      "target", "beforeZoom", "beforeOffsetX", "beforeOffsetY", "beforeRotation",
      "alignBefore", "resetBeforeFrame",
    ],
  );
  assert.deepEqual(
    getSecondaryTools("image", { comparisonEnabled: true, target: "before" }).map((item) => item.settingKey),
    ["beforeBrightness", "beforeShade", "beforeBottomShade"],
  );
});

test("拍摄前工具在未开启对比时不会映射到主照片", () => {
  assert.deepEqual(
    getSecondaryTools("compose", { comparisonEnabled: false, target: "before" }).map((item) => item.id),
    [],
  );
  assert.deepEqual(
    getSecondaryTools("image", { comparisonEnabled: false, target: "before" }).map((item) => item.id),
    [],
  );
  assert.ok(!getSecondaryTools("photo", { comparisonEnabled: false, target: "after" }).some((item) => item.id === "uploadBefore"));
});
