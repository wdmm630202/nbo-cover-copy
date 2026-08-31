import assert from "node:assert/strict";
import test from "node:test";

import {
  eraseShadeWithBrush,
  getRetouchBrushGeometry,
  mapRetouchPoint,
} from "../app/cover/core/retouch-core.ts";

test("羽化几何与现有电脑公式完全相同", () => {
  assert.deepEqual(getRetouchBrushGeometry(120, 70, 1080), {
    radius: 60,
    coreRadius: 21.36,
    blurRadius: 24.36,
  });
});

test("归一化笔迹能无损映射到预览与高清导出", () => {
  assert.deepEqual(mapRetouchPoint({ x: 0.25, y: 0.75 }, 1080, 1920), { x: 270, y: 1440 });
  assert.deepEqual(mapRetouchPoint({ x: 0.25, y: 0.75 }, 540, 960), { x: 135, y: 720 });
});

function recordingContext(events) {
  const context = {
    clearRect: (...args) => events.push(["clearRect", ...args]),
    beginPath: () => events.push(["beginPath"]),
    moveTo: (...args) => events.push(["moveTo", ...args]),
    quadraticCurveTo: (...args) => events.push(["quadraticCurveTo", ...args]),
    lineTo: (...args) => events.push(["lineTo", ...args]),
    arc: (...args) => events.push(["arc", ...args]),
    fill: () => events.push(["fill"]),
    stroke: () => events.push(["stroke"]),
    save: () => events.push(["save"]),
    drawImage: (...args) => events.push(["drawImage", ...args]),
    restore: () => events.push(["restore"]),
  };
  for (const property of ["lineCap", "lineJoin", "lineWidth", "strokeStyle", "fillStyle", "globalCompositeOperation", "filter"]) {
    Object.defineProperty(context, property, {
      set: (value) => events.push([property, value]),
    });
  }
  return context;
}

test("多点笔迹保留二次曲线、羽化与 destination-out 的既有顺序", () => {
  const shadeEvents = [];
  const strokeEvents = [];
  const shadeContext = recordingContext(shadeEvents);
  const strokeContext = recordingContext(strokeEvents);
  const strokeCanvas = { getContext: () => strokeContext };

  eraseShadeWithBrush(shadeContext, strokeCanvas, 1080, 1920, [{
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.3, y: 0.4 },
      { x: 0.5, y: 0.6 },
    ],
    size: 120,
    feather: 70,
    strength: 55,
  }]);

  assert.deepEqual(strokeEvents, [
    ["clearRect", 0, 0, 1080, 1920],
    ["lineCap", "round"],
    ["lineJoin", "round"],
    ["lineWidth", 42.72],
    ["strokeStyle", "rgba(255,255,255,0.55)"],
    ["fillStyle", "rgba(255,255,255,0.55)"],
    ["beginPath"],
    ["moveTo", 108, 384],
    ["quadraticCurveTo", 324, 768, 432, 960],
    ["lineTo", 540, 1152],
    ["stroke"],
  ]);
  assert.deepEqual(shadeEvents, [
    ["save"],
    ["globalCompositeOperation", "destination-out"],
    ["filter", "blur(24.36px)"],
    ["drawImage", strokeCanvas, 0, 0],
    ["restore"],
  ]);
});

test("单点笔迹保留原有圆形落笔路径", () => {
  const shadeEvents = [];
  const strokeEvents = [];
  const shadeContext = recordingContext(shadeEvents);
  const strokeContext = recordingContext(strokeEvents);
  const strokeCanvas = { getContext: () => strokeContext };

  eraseShadeWithBrush(shadeContext, strokeCanvas, 540, 960, [{
    points: [{ x: 0.25, y: 0.75 }],
    size: 120,
    feather: 70,
    strength: 100,
  }]);

  assert.deepEqual(strokeEvents.slice(-4), [
    ["beginPath"],
    ["moveTo", 135, 720],
    ["arc", 135, 720, 10.68, 0, Math.PI * 2],
    ["fill"],
  ]);
  assert.equal(strokeEvents.some(([name]) => name === "stroke"), false);
  assert.deepEqual(shadeEvents.slice(0, 3), [
    ["save"],
    ["globalCompositeOperation", "destination-out"],
    ["filter", "blur(12.18px)"],
  ]);
});
