import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCoverLayoutMode,
  resolveCoverLayoutTransition,
} from "../app/cover/core/responsive-layout.ts";

const mode = (width, height, pointer) => resolveCoverLayoutMode({ width, height, pointer });

test("设备能力选择 Compact Split Desktop", () => {
  assert.equal(mode(390, 844, "coarse"), "compact");
  assert.equal(mode(844, 390, "coarse"), "split");
  assert.equal(mode(834, 1194, "coarse"), "compact");
  assert.equal(mode(1194, 834, "coarse"), "split");
  assert.equal(mode(1024, 768, "fine"), "split");
  assert.equal(mode(1440, 900, "fine"), "desktop");
});

test("布局切换只更改外壳模式并保留全部业务引用", () => {
  const editorState = {
    settings: { zoom: 137 },
    photos: { main: { src: "blob:main" }, before: { src: "blob:before" } },
    strokes: { main: [{ x: 1 }], before: [{ x: 2 }] },
    memories: [{ name: "记忆 1" }],
    exportState: { jpeg: { generation: 8 } },
  };

  for (const environment of [
    { width: 834, height: 1194, pointer: "coarse" },
    { width: 1194, height: 834, pointer: "coarse" },
    { width: 1440, height: 900, pointer: "fine" },
  ]) {
    const transition = resolveCoverLayoutTransition(editorState, environment);
    assert.strictEqual(transition.editorState, editorState);
    assert.strictEqual(transition.editorState.settings, editorState.settings);
    assert.strictEqual(transition.editorState.photos, editorState.photos);
    assert.strictEqual(transition.editorState.strokes.main, editorState.strokes.main);
    assert.strictEqual(transition.editorState.strokes.before, editorState.strokes.before);
    assert.strictEqual(transition.editorState.memories, editorState.memories);
    assert.strictEqual(transition.editorState.exportState, editorState.exportState);
  }
});
