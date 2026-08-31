import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import * as canonical from "../app/cover/core/responsive-layout.ts";

const sample = (width, height, focused, active = true, orientation = width > height ? "landscape" : "portrait") => ({
  width,
  height,
  focused,
  active,
  orientation,
});

test("旋转或分屏改变宽度方向时立即重建基线且不会误报键盘", () => {
  assert.equal(typeof canonical.updateMobileKeyboardViewport, "function");
  let state = canonical.updateMobileKeyboardViewport(null, sample(390, 844, false));
  assert.deepEqual(state, {
    baselineWidth: 390,
    baselineHeight: 844,
    orientation: "portrait",
    open: false,
    keyboardHeight: 0,
  });

  state = canonical.updateMobileKeyboardViewport(state, sample(844, 390, true));
  assert.deepEqual(state, {
    baselineWidth: 844,
    baselineHeight: 390,
    orientation: "landscape",
    open: false,
    keyboardHeight: 0,
  });

  state = canonical.updateMobileKeyboardViewport(state, sample(844, 390, false));
  state = canonical.updateMobileKeyboardViewport(state, sample(844, 390, true));
  assert.equal(state.open, false);
  assert.equal(state.keyboardHeight, 0);

  state = canonical.updateMobileKeyboardViewport(state, sample(760, 390, true));
  assert.equal(state.baselineWidth, 760);
  assert.equal(state.baselineHeight, 390);
  assert.equal(state.open, false);
});

test("同方向只在下降至少 140px 且文本聚焦时打开，blur 与高度恢复都会关闭", () => {
  assert.equal(typeof canonical.updateMobileKeyboardViewport, "function");
  let state = canonical.updateMobileKeyboardViewport(null, sample(390, 844, false));

  state = canonical.updateMobileKeyboardViewport(state, sample(390, 705, true));
  assert.equal(state.open, false);
  assert.equal(state.keyboardHeight, 0);
  assert.equal(state.baselineHeight, 844);

  state = canonical.updateMobileKeyboardViewport(state, sample(390, 704, true));
  assert.equal(state.open, true);
  assert.equal(state.keyboardHeight, 140);

  state = canonical.updateMobileKeyboardViewport(state, sample(390, 704, false));
  assert.equal(state.open, false);
  assert.equal(state.keyboardHeight, 0);
  assert.equal(state.baselineHeight, 704);

  state = canonical.updateMobileKeyboardViewport(state, sample(390, 844, false));
  assert.equal(state.open, false);
  assert.equal(state.baselineHeight, 844);

  state = canonical.updateMobileKeyboardViewport(state, sample(390, 844, true));
  assert.equal(state.open, false);
  assert.equal(state.keyboardHeight, 0);

  state = canonical.updateMobileKeyboardViewport(null, sample(390, 667, false, true, "portrait"));
  state = canonical.updateMobileKeyboardViewport(state, sample(390, 367, true, true, "portrait"));
  assert.equal(state.orientation, "portrait");
  assert.equal(state.open, true);
  assert.equal(state.keyboardHeight, 300);
});

test("同方向 1 到 3px 宽度抖动仍识别键盘，较大分屏宽变会重建基线", () => {
  for (const width of [391, 392, 393]) {
    let state = canonical.updateMobileKeyboardViewport(null, sample(390, 844, false, true, "portrait"));
    state = canonical.updateMobileKeyboardViewport(state, sample(width, 704, true, true, "portrait"));
    assert.equal(state.open, true, `${width - 390}px 宽度抖动不应掩盖 140px 键盘下降`);
    assert.equal(state.keyboardHeight, 140);
    assert.equal(state.baselineWidth, 390);
  }

  let state = canonical.updateMobileKeyboardViewport(null, sample(430, 932, false, true, "portrait"));
  state = canonical.updateMobileKeyboardViewport(state, sample(433, 632, true, true, "portrait"));
  assert.equal(state.open, true);
  assert.equal(state.keyboardHeight, 300);
  assert.equal(state.baselineWidth, 430);

  state = canonical.updateMobileKeyboardViewport(null, sample(390, 844, false, true, "portrait"));
  state = canonical.updateMobileKeyboardViewport(state, sample(430, 704, true, true, "portrait"));
  assert.deepEqual(state, {
    baselineWidth: 430,
    baselineHeight: 704,
    orientation: "portrait",
    open: false,
    keyboardHeight: 0,
  });
});

test("静态核心与 React 使用同一个键盘视口状态转换", async () => {
  assert.equal(typeof canonical.updateMobileKeyboardViewport, "function");
  const context = {};
  runInNewContext(await readFile(new URL("../docs/cover-core.js", import.meta.url), "utf8"), context);
  assert.equal(typeof context.NBOCoverCore.updateMobileKeyboardViewport, "function");

  const sequence = [
    sample(390, 844, false),
    sample(390, 705, true),
    sample(390, 704, true),
    sample(393, 544, true, true, "portrait"),
    sample(430, 704, true, true, "portrait"),
    sample(844, 390, true),
    sample(844, 390, false),
    sample(844, 390, true),
  ];
  let canonicalState = null;
  let staticState = null;
  for (const input of sequence) {
    canonicalState = canonical.updateMobileKeyboardViewport(canonicalState, input);
    staticState = context.NBOCoverCore.updateMobileKeyboardViewport(staticState, input);
    assert.deepEqual(JSON.parse(JSON.stringify(staticState)), canonicalState);
  }
});
