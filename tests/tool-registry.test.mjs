import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { PRIMARY_TOOLS, SECONDARY_TOOLS, getSecondaryTools } from "../app/cover/core/tool-registry.ts";

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

const tool = (id, primary, label, kind, options = {}) => ({ id, primary, label, kind, ...options });

test("完整二级工具矩阵锁定 ID、类型、绑定和默认参数", () => {
  assert.deepEqual(SECONDARY_TOOLS, {
    photo: [
      tool("uploadMain", "photo", "精修图上传/更换", "action"),
      tool("uploadBefore", "photo", "拍摄前照片上传/更换", "action"),
      tool("comparison", "photo", "前后对比", "toggle", { settingKey: "compareEnabled", defaultValue: false }),
      tool("safeArea", "photo", "安全区", "toggle", { settingKey: "showSafeArea", defaultValue: true }),
      tool("syncCover", "photo", "同步封面", "action"),
    ],
    compose: [
      tool("target", "compose", "主照片与文字 / 拍摄前照片", "choice"),
      tool("zoom", "compose", "照片缩放", "range", { settingKey: "zoom", min: 0, max: 400, defaultValue: 100, suffix: "%" }),
      tool("offsetX", "compose", "左右位置", "range", { settingKey: "offsetX", min: -200, max: 200, defaultValue: 0 }),
      tool("offsetY", "compose", "上下位置", "range", { settingKey: "offsetY", min: -200, max: 200, defaultValue: 0 }),
      tool("rotation", "compose", "自由旋转", "range", { settingKey: "rotation", min: -180, max: 180, defaultValue: 0, suffix: "°" }),
      tool("beforeZoom", "compose", "拍摄前照片缩放", "range", { settingKey: "beforeZoom", min: 100, max: 300, defaultValue: 100, suffix: "%" }),
      tool("beforeOffsetX", "compose", "拍摄前左右位置", "range", { settingKey: "beforeOffsetX", defaultValue: 0, dynamicBounds: "beforeOffsetLimits.x" }),
      tool("beforeOffsetY", "compose", "拍摄前上下位置", "range", { settingKey: "beforeOffsetY", defaultValue: 0, dynamicBounds: "beforeOffsetLimits.y" }),
      tool("beforeRotation", "compose", "拍摄前自由旋转", "range", { settingKey: "beforeRotation", min: -180, max: 180, defaultValue: 0, suffix: "°" }),
      tool("alignBefore", "compose", "尝试对齐", "action"),
      tool("resetBeforeFrame", "compose", "恢复对比图默认尺寸", "action"),
    ],
    text: [
      tool("topText", "text", "上行主标题", "text", { settingKey: "topText", max: 18 }),
      tool("bottomText", "text", "下行主标题", "text", { settingKey: "bottomText", max: 18 }),
      tool("subtitle", "text", "补充小字", "text", { settingKey: "subtitle", max: 38 }),
      tool("topColor", "text", "上行颜色", "color", { settingKey: "topColor", defaultValue: "#FFFFFF" }),
      tool("bottomColor", "text", "下行颜色", "color", { settingKey: "bottomColor", defaultValue: "#FFFFFF" }),
      tool("subtitleColor", "text", "小字颜色", "color", { settingKey: "subtitleColor", defaultValue: "#FFFFFF" }),
      tool("dividerColor", "text", "横线颜色", "color", { settingKey: "dividerColor", defaultValue: "#C9A77A" }),
      tool("textScale", "text", "上行标题大小", "range", { settingKey: "textScale", min: 0, max: 200, defaultValue: 100, suffix: "%" }),
      tool("bottomTextScale", "text", "下行标题大小", "range", { settingKey: "bottomTextScale", min: 0, max: 200, defaultValue: 100, suffix: "%" }),
      tool("subtitleScale", "text", "小字大小", "range", { settingKey: "subtitleScale", min: 60, max: 160, defaultValue: 100, suffix: "%" }),
      tool("textScaleLinked", "text", "上下行大小联动", "toggle", { settingKey: "textScaleLinked", defaultValue: true }),
      tool("showDivider", "text", "显示标题横线", "toggle", { settingKey: "showDivider", defaultValue: true }),
      tool("textStroke", "text", "字体描边", "range", { settingKey: "textStroke", min: 0, max: 100, defaultValue: 0, suffix: "%" }),
      tool("textShadow", "text", "字体阴影", "range", { settingKey: "textShadow", min: 0, max: 100, defaultValue: 50, suffix: "%" }),
      tool("syncCopy", "text", "文案同步", "action"),
    ],
    image: [
      tool("brightness", "image", "亮度", "range", { settingKey: "brightness", min: 0, max: 200, defaultValue: 100, suffix: "%" }),
      tool("shade", "image", "压暗强度", "range", { settingKey: "shade", min: 0, max: 100, defaultValue: 0, suffix: "%" }),
      tool("bottomShade", "image", "底部向上压暗", "range", { settingKey: "bottomShade", min: 0, max: 100, defaultValue: 100, suffix: "%" }),
    ],
    retouch: [
      tool("retouchEnabled", "retouch", "开启/退出涂抹", "toggle", { defaultValue: false }),
      tool("retouchTarget", "retouch", "主照片记录 / 拍摄前记录", "choice"),
      tool("brushSize", "retouch", "画笔大小", "range", { min: 20, max: 400, defaultValue: 120 }),
      tool("brushFeather", "retouch", "羽化", "range", { min: 0, max: 100, defaultValue: 70, suffix: "%" }),
      tool("brushStrength", "retouch", "涂抹强度", "range", { min: 0, max: 100, defaultValue: 100, suffix: "%" }),
      tool("retouchBefore", "retouch", "涂抹前", "action"),
      tool("retouchAfter", "retouch", "涂抹后", "action"),
      tool("undoRetouch", "retouch", "撤销一步", "action"),
      tool("clearRetouch", "retouch", "全部清除", "action"),
    ],
    layout: [
      tool("template", "layout", "9 个标题位置模板", "choice"),
      tool("platform", "layout", "抖音 / 小红书 / 视频号", "choice"),
    ],
    more: [
      tool("watermarkEnabled", "more", "使用 / 不使用水印", "choice", { settingKey: "watermarkEnabled", defaultValue: false }),
      tool("replaceWatermark", "more", "更换水印", "action"),
      tool("removeWatermark", "more", "移除临时水印并恢复固定水印", "action"),
      tool("watermarkAlign", "more", "左 / 中 / 右", "choice", { settingKey: "watermarkAlign", defaultValue: "left" }),
      tool("watermarkOpacity", "more", "水印透明度", "range", { settingKey: "watermarkOpacity", min: 0, max: 100, defaultValue: 50, suffix: "%" }),
      tool("memory1", "more", "记忆 1", "action"),
      tool("memory2", "more", "记忆 2", "action"),
      tool("memory3", "more", "记忆 3", "action"),
      tool("resetSettings", "more", "恢复默认", "action"),
      tool("factoryReset", "more", "彻底重置", "action"),
      tool("coverRules", "more", "长期规范", "action"),
    ],
  });
});

test("拍摄前构图、动态边界和画面绑定按目标切换", () => {
  const comparisonOn = { comparisonEnabled: true, target: "before" };
  assert.deepEqual(
    getSecondaryTools("compose", { comparisonEnabled: true, target: "after" }).map((item) => item.id),
    ["target", "zoom", "offsetX", "offsetY", "rotation"],
  );
  assert.deepEqual(
    getSecondaryTools("compose", comparisonOn).filter((item) => item.id.startsWith("beforeOffset")).map((item) => item.dynamicBounds),
    ["beforeOffsetLimits.x", "beforeOffsetLimits.y"],
  );
  assert.deepEqual(getSecondaryTools("image", { comparisonEnabled: true, target: "after" }).map((item) => item.settingKey), ["brightness", "shade", "bottomShade"]);
  assert.deepEqual(getSecondaryTools("image", comparisonOn).map((item) => item.settingKey), ["beforeBrightness", "beforeShade", "beforeBottomShade"]);
});

test("未开启对比时所有拍摄前入口都不可用且不会映射到主照片", () => {
  const comparisonOff = { comparisonEnabled: false, target: "after" };
  const composeBefore = getSecondaryTools("compose", { ...comparisonOff, target: "before" });
  const imageBefore = getSecondaryTools("image", { ...comparisonOff, target: "before" });
  assert.deepEqual(composeBefore, []);
  assert.deepEqual(imageBefore, []);
  assert.ok(Object.isFrozen(composeBefore));
  assert.ok(Object.isFrozen(imageBefore));
  assert.throws(() => { composeBefore.push({ id: "bad" }); }, TypeError);
  assert.throws(() => { imageBefore.push({ id: "bad" }); }, TypeError);
  assert.deepEqual(getSecondaryTools("compose", { ...comparisonOff, target: "before" }), []);
  assert.deepEqual(getSecondaryTools("image", { ...comparisonOff, target: "before" }), []);
  assert.ok(!getSecondaryTools("photo", comparisonOff).some((item) => item.id === "uploadBefore"));
  assert.ok(!getSecondaryTools("retouch", comparisonOff).some((item) => item.id === "retouchTarget"));
});

test("注册表和每次查询结果在运行时均不可变", () => {
  assert.ok(Object.isFrozen(PRIMARY_TOOLS));
  assert.ok(Object.isFrozen(PRIMARY_TOOLS[0]));
  assert.ok(Object.isFrozen(SECONDARY_TOOLS));
  assert.ok(Object.isFrozen(SECONDARY_TOOLS.compose));
  assert.ok(Object.isFrozen(SECONDARY_TOOLS.compose[0]));
  assert.throws(() => { PRIMARY_TOOLS[0].label = "已修改"; }, TypeError);

  const tools = getSecondaryTools("image", { comparisonEnabled: true, target: "before" });
  assert.ok(Object.isFrozen(tools));
  assert.ok(Object.isFrozen(tools[0]));
  assert.throws(() => { tools[0].settingKey = "brightness"; }, TypeError);
  assert.equal(getSecondaryTools("image", { comparisonEnabled: true, target: "before" })[0].settingKey, "beforeBrightness");
});

test("静态核心导出同一份不可变工具注册表契约", async () => {
  const context = { window: {} };
  runInNewContext(await readFile(new URL("../docs/cover-core.js", import.meta.url), "utf8"), context);
  assert.deepEqual([...context.NBOCoverCore.PRIMARY_TOOLS].map((item) => item.id), PRIMARY_TOOLS.map((item) => item.id));
  assert.equal(typeof context.NBOCoverCore.getSecondaryTools, "function");
  assert.equal(context.NBOCoverCore.SECONDARY_TOOLS.compose[6].dynamicBounds, "beforeOffsetLimits.x");
  assert.ok(Object.isFrozen(context.NBOCoverCore.SECONDARY_TOOLS));
});

test("七个一级组在合法上下文均有可达工具", () => {
  const context = { comparisonEnabled: true, target: "after" };
  for (const primary of PRIMARY_TOOLS) {
    assert.ok(getSecondaryTools(primary.id, context).length > 0, `${primary.id} 没有可达工具`);
  }
});

test("移动端回调覆盖表覆盖注册表每一个 ID", async () => {
  const [dock, staticSource] = await Promise.all([
    readFile(new URL("../app/cover/CoverMobileToolDock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/cover.js", import.meta.url), "utf8"),
  ]);
  const ids = Object.values(SECONDARY_TOOLS).flat().map((item) => item.id);
  for (const id of ids) {
    assert.match(dock, new RegExp(`(?:^|\\W)${id}\\s*:`), `React 缺少接线声明：${id}`);
    assert.match(staticSource, new RegExp(`(?:^|\\W)${id}\\s*:`), `静态页缺少接线：${id}`);
  }
});
