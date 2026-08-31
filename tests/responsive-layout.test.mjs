import assert from "node:assert/strict";
import test from "node:test";
import * as responsiveLayout from "../app/cover/core/responsive-layout.ts";

const { resolveCoverLayoutMode } = responsiveLayout;

const mode = (width, height, pointer) => resolveCoverLayoutMode({ width, height, pointer });

test("设备能力选择 Compact Split Desktop", () => {
  assert.equal(mode(390, 844, "coarse"), "compact");
  assert.equal(mode(844, 390, "coarse"), "split");
  assert.equal(mode(834, 1194, "coarse"), "compact");
  assert.equal(mode(1194, 834, "coarse"), "split");
  assert.equal(mode(1024, 768, "fine"), "split");
  assert.equal(mode(1440, 900, "fine"), "desktop");
});

test("最终 16 个视口尺寸选择预期外壳", () => {
  const cases = [
    [320, 568, "coarse", "compact"], [375, 667, "coarse", "compact"],
    [390, 844, "coarse", "compact"], [430, 932, "coarse", "compact"],
    [667, 375, "coarse", "compact"], [844, 390, "coarse", "split"],
    [932, 430, "coarse", "split"], [768, 1024, "coarse", "compact"],
    [834, 1194, "coarse", "compact"], [1024, 1366, "coarse", "compact"],
    [1024, 768, "coarse", "split"], [1194, 834, "coarse", "split"],
    [1366, 1024, "coarse", "split"], [1280, 800, "fine", "desktop"],
    [1440, 900, "fine", "desktop"], [1920, 1080, "fine", "desktop"],
  ];
  for (const [width, height, pointer, expected] of cases) {
    assert.equal(mode(width, height, pointer), expected, `${width}×${height} ${pointer}`);
  }
});

test("响应式核心不暴露伪造的业务状态过渡接口", () => {
  assert.equal("resolveCoverLayoutTransition" in responsiveLayout, false);
});
