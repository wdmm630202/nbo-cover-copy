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

test("响应式核心不暴露伪造的业务状态过渡接口", () => {
  assert.equal("resolveCoverLayoutTransition" in responsiveLayout, false);
});
