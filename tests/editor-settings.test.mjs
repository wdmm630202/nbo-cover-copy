import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  DEFAULT_COVER_SETTINGS,
  normalizeCoverSettings,
  updateCoverSetting,
} from "../app/cover/core/editor-settings.ts";

test("空设置返回完整默认值", () => {
  assert.deepEqual(normalizeCoverSettings(null), DEFAULT_COVER_SETTINGS);
  assert.notEqual(normalizeCoverSettings(null), DEFAULT_COVER_SETTINGS);
});

test("旧字号和旧左右位置继续迁移", () => {
  const value = normalizeCoverSettings({
    platformId: "douyin",
    titleScaleVersion: 1,
    textScale: 180,
    offsetXRangeVersion: 1,
    offsetX: 120,
  });
  assert.equal(value.textScale, 100);
  assert.equal(value.bottomTextScale, 100);
  assert.equal(value.textScaleLinked, true);
  assert.equal(value.titleScaleVersion, 3);
  assert.equal(value.offsetX, 20);
  assert.equal(value.offsetXRangeVersion, 2);
});

test("水印、阴影、旧底色与旧文案保留原有迁移", () => {
  const value = normalizeCoverSettings({
    platformId: "douyin",
    bottomText: "藏在自然状态里",
    bottomColor: "#FEE800",
    shade: 62,
    watermarkOpacity: 92,
    watermarkScale: 42,
    watermarkEnabled: true,
    watermarkDefaultVersion: 0,
    textShadow: 0,
    textShadowDefaultVersion: 0,
  });
  assert.equal(value.bottomText, "藏在自然状态");
  assert.equal(value.bottomColor, "#FFFFFF");
  assert.equal(value.shade, 0);
  assert.equal(value.watermarkOpacity, 50);
  assert.equal(value.watermarkScale, 100);
  assert.equal(value.watermarkEnabled, false);
  assert.equal(value.watermarkDefaultVersion, 1);
  assert.equal(value.textShadow, 50);
  assert.equal(value.textShadowDefaultVersion, 1);
});

test("模板别名、边界与非法值按当前 React 规则归一", () => {
  const value = normalizeCoverSettings({
    platformId: "invalid",
    templateId: "badge",
    topText: "12345678901234567890",
    topColor: "#abcdef",
    subtitleScale: 999,
    zoom: -1,
    offsetY: 999,
    rotation: -999,
    beforeZoom: 50,
    beforeFrameScale: 999,
    watermarkAlign: "invalid",
  });
  assert.equal(value.platformId, "douyin");
  assert.equal(value.templateId, "middle-left");
  assert.equal(value.topText, "123456789012345678");
  assert.equal(value.topColor, "#ABCDEF");
  assert.equal(value.subtitleScale, 160);
  assert.equal(value.zoom, 0);
  assert.equal(value.offsetY, 200);
  assert.equal(value.rotation, -180);
  assert.equal(value.beforeZoom, 100);
  assert.equal(value.beforeFrameScale, 120);
  assert.equal(value.watermarkAlign, "left");
});

test("静态旧缓存字段名转为共享设置且保留日用模板回退", () => {
  const value = normalizeCoverSettings({
    platform: "xiaohongshu",
    template: "not-a-template",
    divider: false,
    safe: false,
    titleScaleVersion: 3,
    offsetXRangeVersion: 2,
    textShadowDefaultVersion: 1,
    watermarkDefaultVersion: 1,
  });
  assert.equal(value.platformId, "xiaohongshu");
  assert.equal(value.templateId, "top-left");
  assert.equal(value.showDivider, false);
  assert.equal(value.showSafeArea, false);
});

test("静态记忆点保留原先未执行的水印和压暗迁移", () => {
  const value = normalizeCoverSettings({
    platform: "douyin",
    template: "middle-left",
    watermarkEnabled: true,
    watermarkDefaultVersion: 0,
    shade: 62,
  }, "static-memory");
  assert.equal(value.watermarkEnabled, true);
  assert.equal(value.watermarkDefaultVersion, 0);
  assert.equal(value.shade, 62);
});

test("静态记忆点不重写原先保留的水印版本标记", () => {
  const value = normalizeCoverSettings({
    platform: "douyin",
    watermarkDefaultVersion: 5,
  }, "static-memory");
  assert.equal(value.watermarkDefaultVersion, 5);
});

test("单项更新也经过同一归一化边界", () => {
  const updated = updateCoverSetting(DEFAULT_COVER_SETTINGS, "zoom", 999);
  assert.equal(updated.zoom, 400);
  assert.equal(DEFAULT_COVER_SETTINGS.zoom, 100);
});

test("静态核心与 TypeScript 使用同一设置迁移", async () => {
  const context = { window: {} };
  runInNewContext(await readFile(new URL("../docs/cover-core.js", import.meta.url), "utf8"), context);
  const input = {
    platform: "douyin",
    template: "badge",
    titleScaleVersion: 1,
    textScale: 180,
    offsetXRangeVersion: 1,
    offsetX: 120,
  };
  const actual = context.NBOCoverCore.normalizeCoverSettings(input);
  const expected = normalizeCoverSettings(input);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.NBOCoverCore.DEFAULT_COVER_SETTINGS)),
    DEFAULT_COVER_SETTINGS,
  );
  assert.equal(typeof context.NBOCoverCore.updateCoverSetting, "function");
});
