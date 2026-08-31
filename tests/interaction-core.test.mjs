import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appendRetouchPoint,
  resolveCanvasInteractionMode,
} from "../app/cover/core/interaction-core.ts";

test("画布交互模式按涂抹、旋转、移动的固定优先级解析", () => {
  assert.equal(resolveCanvasInteractionMode({ brushMode: false, rotationMode: false }), "transform");
  assert.equal(resolveCanvasInteractionMode({ brushMode: false, rotationMode: true }), "rotate");
  assert.equal(resolveCanvasInteractionMode({ brushMode: true, rotationMode: false }), "brush");
  assert.equal(resolveCanvasInteractionMode({ brushMode: true, rotationMode: true }), "brush");
});

test("追加涂抹点保留全部笔迹元数据且不修改原笔迹", () => {
  const originalPoint = { x: 0, y: 1 };
  const stroke = {
    points: [originalPoint],
    size: 120,
    feather: 70,
    strength: 100,
    target: "before",
    source: "pointer-17",
  };
  const point = { x: 1, y: 0 };

  const appended = appendRetouchPoint(stroke, point);

  assert.notStrictEqual(appended, stroke);
  assert.notStrictEqual(appended.points, stroke.points);
  assert.deepEqual(stroke.points, [originalPoint]);
  assert.deepEqual(appended, {
    points: [originalPoint, point],
    size: 120,
    feather: 70,
    strength: 100,
    target: "before",
    source: "pointer-17",
  });
  assert.strictEqual(appended.points[0], originalPoint);
  assert.strictEqual(appended.points[1], point);
});

test("连续追加不复用可变数组也不会串改另一目标笔迹", () => {
  const beforeStroke = {
    points: [{ x: 0.25, y: 0.75 }],
    size: 80,
    feather: 40,
    strength: 65,
    target: "before",
  };
  const afterStroke = {
    points: [{ x: 0.5, y: 0.5 }],
    size: 100,
    feather: 50,
    strength: 90,
    target: "after",
  };

  const first = appendRetouchPoint(beforeStroke, { x: 0.4, y: 0.6 });
  const second = appendRetouchPoint(first, { x: 0.6, y: 0.4 });

  assert.notStrictEqual(first.points, second.points);
  assert.deepEqual(beforeStroke.points, [{ x: 0.25, y: 0.75 }]);
  assert.deepEqual(first.points, [{ x: 0.25, y: 0.75 }, { x: 0.4, y: 0.6 }]);
  assert.deepEqual(second.points, [{ x: 0.25, y: 0.75 }, { x: 0.4, y: 0.6 }, { x: 0.6, y: 0.4 }]);
  assert.equal(second.target, "before");
  assert.deepEqual(afterStroke, {
    points: [{ x: 0.5, y: 0.5 }],
    size: 100,
    feather: 50,
    strength: 90,
    target: "after",
  });
});

test("React 共享画布承载原交互路径且不拥有编辑状态", async () => {
  const [studio, surface] = await Promise.all([
    readFile(new URL("../app/cover/CoverStudio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/cover/CoverCanvasSurface.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(studio, /import CoverCanvasSurface from "\.\/CoverCanvasSurface"/);
  assert.match(studio, /<CoverCanvasSurface/);
  assert.doesNotMatch(studio, /<canvas\b/);
  assert.doesNotMatch(studio, /canvas\.addEventListener/);
  assert.match(surface, /resolveCanvasInteractionMode/);
  assert.match(surface, /appendRetouchPoint/);
  assert.doesNotMatch(surface, /\buseState\b/);
  assert.doesNotMatch(surface, /key=\{[^}]*layout/i);
  assert.match(surface, /addEventListener\("pointercancel"/);
  assert.match(surface, /setPointerCapture/);
  assert.match(surface, /releasePointerCapture/);
  assert.match(surface, /addEventListener\("touchstart"/);
  assert.match(surface, /addEventListener\("touchmove"/);
  assert.match(surface, /mode === "move"/);
  assert.match(surface, /mode === "rotate"/);
  assert.match(surface, /mode === "scaleMove"/);
});

test("静态壳只复用共享模式解析和不可变追加且保留取消捕获路径", async () => {
  const source = await readFile(new URL("../docs/cover.js", import.meta.url), "utf8");

  assert.match(source, /const \{[\s\S]*?appendRetouchPoint[\s\S]*?resolveCanvasInteractionMode[\s\S]*?\} = window\.NBOCoverCore;/);
  assert.match(source, /resolveCanvasInteractionMode\(\{/);
  assert.match(source, /appendRetouchPoint\(/);
  assert.doesNotMatch(source, /\.points\.push\(/);
  assert.match(source, /addEventListener\("pointercancel"/);
  assert.match(source, /setPointerCapture/);
  assert.match(source, /releasePointerCapture/);
  assert.match(source, /mode === "rotate"/);
  assert.match(source, /mode === "scaleMove"/);
});
