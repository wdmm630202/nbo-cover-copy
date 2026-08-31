import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const appLayoutUrl = new URL("../app/cover/compare-layout.ts", import.meta.url);
const staticLayoutUrl = new URL("../docs/compare-layout.js", import.meta.url);

const plain = (value) => JSON.parse(JSON.stringify(value));

async function loadImplementations() {
  const app = await import(`${appLayoutUrl.href}?test=${Date.now()}`);
  const source = await readFile(staticLayoutUrl, "utf8");
  const context = { window: {} };
  runInNewContext(source, context);
  return [app, context.window.NBOCompareLayout];
}

const cases = [
  {
    name: "小红书与视频号 3:4 使用整张画布",
    canvas: { width: 1080, height: 1440 },
    safe: { x: 0, y: 0, width: 1080, height: 1440 },
    frame: { x: 630, y: 807, width: 421, height: 605, radius: 30 },
    labels: {
      after: { right: 1032, y: 48, width: 104, height: 54, radius: 27 },
      before: { right: 1031, y: 827, width: 104, height: 54, radius: 27 },
    },
  },
  {
    name: "抖音 9:16 把全部对比元素锁进居中 3:4 安全区",
    canvas: { width: 1080, height: 1920 },
    safe: { x: 0, y: 240, width: 1080, height: 1440 },
    frame: { x: 630, y: 1047, width: 421, height: 605, radius: 30 },
    labels: {
      after: { right: 1032, y: 288, width: 104, height: 54, radius: 27 },
      before: { right: 1031, y: 1067, width: 104, height: 54, radius: 27 },
    },
  },
];

for (const item of cases) {
  test(item.name, async () => {
    for (const layout of await loadImplementations()) {
      assert.deepEqual(plain(layout.getComparisonSafeRect(item.canvas)), item.safe);
      assert.deepEqual(plain(layout.getComparisonEvidenceLayout(item.canvas).frame), item.frame);
      const labels = layout.getComparisonLabelLayout(item.canvas);
      assert.deepEqual(plain(labels.after), item.labels.after);
      assert.deepEqual(plain(labels.before), item.labels.before);
      assert.ok(labels.after.y >= item.safe.y);
      assert.ok(labels.before.y + labels.before.height <= item.safe.y + item.safe.height);
    }
  });
}

test("四周溶图从透明进入完整照片再回到透明", async () => {
  const expected = [[0, 0], [0.04, 0.78], [0.08, 1], [0.92, 1], [0.96, 0.78], [1, 0]];
  for (const layout of await loadImplementations()) {
    assert.deepEqual(plain(layout.getComparisonFadeStops()), expected);
  }
});

test("胶囊尺寸和边距随预览宽度同比缩放", async () => {
  const expected = {
    after: { right: 516, y: 24, width: 52, height: 27, radius: 13.5 },
    before: { right: 515, y: 414, width: 52, height: 27, radius: 13.5 },
  };
  for (const layout of await loadImplementations()) {
    assert.deepEqual(plain(layout.getComparisonLabelLayout({ width: 540, height: 720 })), expected);
  }
});

test("拍摄前版块固定右下角并只向左上放大", async () => {
  const canvas = { width: 1080, height: 1920 };
  for (const layout of await loadImplementations()) {
    assert.equal(typeof layout.normalizeComparisonFrameScale, "function");
    assert.equal(layout.normalizeComparisonFrameScale(90), 100);
    assert.equal(layout.normalizeComparisonFrameScale(130), 120);
    const original = layout.getComparisonEvidenceLayout(canvas, 100).frame;
    const enlarged = layout.getComparisonEvidenceLayout(canvas, 110).frame;
    assert.deepEqual(plain(enlarged), { x: 588, y: 986, width: 463, height: 666, radius: 33 });
    assert.equal(enlarged.x + enlarged.width, original.x + original.width);
    assert.equal(enlarged.y + enlarged.height, original.y + original.height);
  }
});

test("尝试对齐只在100% 到120% 内放大，且保留36px文字间距", async () => {
  const canvas = { width: 1080, height: 1920 };
  for (const layout of await loadImplementations()) {
    assert.equal(typeof layout.getComparisonAlignmentPlan, "function");
    const success = layout.getComparisonAlignmentPlan(canvas, {
      left: 80,
      right: 520,
      top: 986,
      bottom: 1240,
    });
    assert.equal(success.ok, true);
    assert.equal(success.frame.y, 986);
    assert.equal(success.frame.x + success.frame.width, 1051);
    assert.ok(success.frame.x - 520 >= 36);
    assert.ok(success.scale >= 100 && success.scale <= 120);

    const overlap = layout.getComparisonAlignmentPlan(canvas, {
      left: 80,
      right: 560,
      top: 986,
      bottom: 1240,
    });
    assert.equal(overlap.ok, false);
    assert.equal(overlap.reason, "overlap");

    const tooLarge = layout.getComparisonAlignmentPlan(canvas, {
      left: 80,
      right: 520,
      top: 900,
      bottom: 1240,
    });
    assert.equal(tooLarge.ok, false);
    assert.equal(tooLarge.reason, "too-large");

    const needsShrink = layout.getComparisonAlignmentPlan(canvas, {
      left: 80,
      right: 520,
      top: 1100,
      bottom: 1240,
    });
    assert.equal(needsShrink.ok, false);
    assert.equal(needsShrink.reason, "needs-shrink");
  }
});

test("已放大版块不会被再次对齐操作缩小", async () => {
  const canvas = { width: 1080, height: 1920 };
  for (const layout of await loadImplementations()) {
    const result = layout.getComparisonAlignmentPlan(
      canvas,
      { left: 80, right: 520, top: 1017, bottom: 1240 },
      { currentScale: 115 },
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, "needs-shrink");
  }
});

test("胶囊不随对比框放大，并与右上两条边保持相同间距", async () => {
  const canvas = { width: 1080, height: 1920 };
  for (const layout of await loadImplementations()) {
    const frame = layout.getComparisonEvidenceLayout(canvas, 110).frame;
    const labels = layout.getComparisonLabelLayout(canvas, 110);
    assert.deepEqual(plain(labels.before), { right: 1031, y: 1006, width: 104, height: 54, radius: 27 });
    assert.equal(frame.x + frame.width - labels.before.right, 20);
    assert.equal(labels.before.y - frame.y, 20);
    assert.deepEqual(plain(labels.after), { right: 1032, y: 288, width: 104, height: 54, radius: 27 });
  }
});

test("放大后的虚线框与拍摄前照片鼠标命中区共用同一几何", async () => {
  const canvas = { width: 1080, height: 1920 };
  const newlyCoveredPoint = { x: 600 / 1080, y: 1000 / 1920 };
  for (const layout of await loadImplementations()) {
    assert.equal(layout.isPointInComparisonPhotoFrame(newlyCoveredPoint, canvas, 100), false);
    assert.equal(layout.isPointInComparisonPhotoFrame(newlyCoveredPoint, canvas, 110), true);
    assert.equal(layout.resolvePhotoInteractionTargetFromPoint(newlyCoveredPoint, canvas, true, true, 110), "before");
  }
});

test("缺少拍摄前照片时阻止设计导出", async () => {
  for (const layout of await loadImplementations()) {
    assert.equal(layout.getComparisonExportError(true, false), "请先添加拍摄前素颜照，或关闭前后对比");
    assert.equal(layout.getComparisonExportError(true, true), "");
    assert.equal(layout.getComparisonExportError(false, false), "");
  }
});

test("前后对比只提醒可能遮挡的非左侧版式", async () => {
  for (const layout of await loadImplementations()) {
    assert.equal(layout.getComparisonOverlapWarning(true, "bottom-left"), "");
    assert.match(layout.getComparisonOverlapWarning(true, "bottom-center"), /建议选择左侧版式/);
    assert.match(layout.getComparisonOverlapWarning(true, "bottom-right"), /建议选择左侧版式/);
    assert.equal(layout.getComparisonOverlapWarning(false, "bottom-right"), "");
  }
});

test("拍摄前照片保留七项独立参数并限制输入范围", async () => {
  const defaults = {
    zoom: 100,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    brightness: 100,
    shade: 0,
    bottomShade: 100,
  };
  const clamped = {
    zoom: 300,
    offsetX: -100,
    offsetY: 100,
    rotation: 180,
    brightness: 0,
    shade: 100,
    bottomShade: 0,
  };

  for (const layout of await loadImplementations()) {
    assert.deepEqual(plain(layout.normalizeComparisonPhotoAdjustments()), defaults);
    assert.deepEqual(plain(layout.normalizeComparisonPhotoAdjustments({
      zoom: 999,
      offsetX: -999,
      offsetY: 999,
      rotation: 999,
      brightness: -1,
      shade: 999,
      bottomShade: -1,
    })), clamped);
  }
});

test("拍摄前照片旋转后仍按相框覆盖并独立应用位置", async () => {
  const image = { width: 400, height: 800 };
  const frame = { x: 100, y: 200, width: 400, height: 600 };

  for (const layout of await loadImplementations()) {
    const straight = layout.getComparisonPhotoTransform(image, frame, {
      zoom: 100,
      offsetX: 25,
      offsetY: -10,
    });
    assert.equal(straight.drawWidth, 400);
    assert.equal(straight.drawHeight, 800);
    assert.equal(straight.centerX, 400);
    assert.equal(straight.centerY, 440);
    assert.equal(straight.rotationRadians, 0);

    const rotated = layout.getComparisonPhotoTransform(image, frame, {
      zoom: 100,
      rotation: 90,
    });
    assert.ok(Math.abs(rotated.drawWidth - 600) < 1e-9);
    assert.ok(Math.abs(rotated.drawHeight - 1200) < 1e-9);
    assert.ok(Math.abs(rotated.rotationRadians - Math.PI / 2) < 1e-9);
  }
});

test("涂抹目标只在前后对比和拍摄前照片都可用时指向拍摄前", async () => {
  for (const layout of await loadImplementations()) {
    assert.equal(layout.resolveRetouchTarget("before", true, true), "before");
    assert.equal(layout.resolveRetouchTarget("before", false, true), "after");
    assert.equal(layout.resolveRetouchTarget("before", true, false), "after");
    assert.equal(layout.resolveRetouchTarget("after", true, true), "after");
  }
});

test("主照片与拍摄前照片的涂抹记录互不混用", async () => {
  const strokes = {
    after: [{ id: "after-stroke" }],
    before: [{ id: "before-stroke" }],
  };
  for (const layout of await loadImplementations()) {
    assert.deepEqual(plain(layout.getVisibleRetouchStrokes(strokes, "after", false)), strokes.after);
    assert.deepEqual(plain(layout.getVisibleRetouchStrokes(strokes, "before", false)), strokes.before);
    assert.deepEqual(plain(layout.getVisibleRetouchStrokes(strokes, "before", true)), []);
  }
});

test("拍摄前照片涂抹只接受右下角照片相框内的落笔", async () => {
  const canvas = { width: 1080, height: 1920 };
  for (const layout of await loadImplementations()) {
    assert.equal(layout.isPointInComparisonPhotoFrame({ x: 0.8, y: 0.7 }, canvas), true);
    assert.equal(layout.isPointInComparisonPhotoFrame({ x: 0.4, y: 0.7 }, canvas), false);
    assert.equal(layout.isPointInComparisonPhotoFrame({ x: 0.8, y: 0.4 }, canvas), false);
  }
});

test("前后对比涂抹按落笔位置自动选择照片，而不是沿用面板中的旧目标", async () => {
  const canvas = { width: 1080, height: 1920 };
  for (const layout of await loadImplementations()) {
    assert.equal(typeof layout.resolveRetouchTargetFromPoint, "function");
    assert.equal(layout.resolveRetouchTargetFromPoint({ x: 0.8, y: 0.7 }, canvas, true, true), "before");
    assert.equal(layout.resolveRetouchTargetFromPoint({ x: 0.4, y: 0.7 }, canvas, true, true), "after");
    assert.equal(layout.resolveRetouchTargetFromPoint({ x: 0.8, y: 0.7 }, canvas, false, true), "after");
    assert.equal(layout.resolveRetouchTargetFromPoint({ x: 0.8, y: 0.7 }, canvas, true, false), "after");
  }
});

test("普通鼠标操作在拍摄前虚线框内控制拍摄前照片，框外仍控制主照片", async () => {
  const canvas = { width: 1080, height: 1920 };
  for (const layout of await loadImplementations()) {
    assert.equal(typeof layout.resolvePhotoInteractionTargetFromPoint, "function");
    assert.equal(layout.resolvePhotoInteractionTargetFromPoint({ x: 0.8, y: 0.7 }, canvas, true, true), "before");
    assert.equal(layout.resolvePhotoInteractionTargetFromPoint({ x: 0.4, y: 0.7 }, canvas, true, true), "after");
    assert.equal(layout.resolvePhotoInteractionTargetFromPoint({ x: 0.8, y: 0.7 }, canvas, false, true), "after");
    assert.equal(layout.resolvePhotoInteractionTargetFromPoint({ x: 0.8, y: 0.7 }, canvas, true, false), "after");
  }
});

test("前后对比只显示一组照片构图控制，避免右栏重复堆叠", async () => {
  for (const layout of await loadImplementations()) {
    assert.equal(typeof layout.getAdjustmentPanelVisibility, "function");
    const single = layout.getAdjustmentPanelVisibility(false, "before");
    assert.equal(single.selector, false);
    assert.equal(single.after, true);
    assert.equal(single.before, false);
    const after = layout.getAdjustmentPanelVisibility(true, "after");
    assert.equal(after.selector, true);
    assert.equal(after.after, true);
    assert.equal(after.before, false);
    const before = layout.getAdjustmentPanelVisibility(true, "before");
    assert.equal(before.selector, true);
    assert.equal(before.after, false);
    assert.equal(before.before, true);
  }
});

test("前后对比装饰层只绘制前后胶囊，不再写入多余品牌字", async () => {
  for (const layout of await loadImplementations()) {
    const text = [];
    const context = {
      save() {}, restore() {}, scale() {}, beginPath() {}, rect() {}, clip() {},
      moveTo() {}, lineTo() {}, closePath() {},
      setLineDash() {}, stroke() {}, fill() {}, arc() {},
      createLinearGradient() { return { addColorStop() {} }; },
      fillText(value) { text.push(value); },
    };
    layout.drawComparisonEditorialOverlay(context, { width: 1080, height: 1920 }, () => {});
    assert.deepEqual(text, ["拍", "摄", "后", "拍", "摄", "前"]);
  }
});

test("前后胶囊使用原版的深色高光与亮面圆钮材质", async () => {
  for (const layout of await loadImplementations()) {
    const gradients = [];
    let strokes = 0;
    const context = {
      save() {}, restore() {}, scale() {}, beginPath() {}, rect() {}, clip() {},
      moveTo() {}, lineTo() {}, closePath() {},
      setLineDash() {}, fill() {}, arc() {}, fillText() {},
      stroke() { strokes += 1; },
      createLinearGradient() {
        const stops = [];
        gradients.push(stops);
        return { addColorStop(offset, color) { stops.push([offset, color]); } };
      },
    };
    layout.drawComparisonEditorialOverlay(context, { width: 1080, height: 1920 }, () => {});
    assert.equal(gradients.length, 4, "两个胶囊各需要深色底和亮面圆钮两层渐变");
    assert.deepEqual(gradients.map((stops) => stops.length), [4, 3, 4, 3]);
    assert.equal(strokes, 7, "虚线框之外，每个胶囊应有独立外层高光，主体和圆钮也各有描边");
  }
});

test("胶囊按参考图的主体、内圆和三字像素锚点等比缩放", async () => {
  for (const layout of await loadImplementations()) {
    const gradients = [];
    const capsulePaths = [];
    const arcs = [];
    const text = [];
    const strokes = [];
    const context = {
      save() {}, restore() {}, scale() {}, beginPath() {}, rect() {}, clip() {},
      moveTo() {}, lineTo() {}, closePath() {},
      setLineDash() {}, fill() {}, stroke() { strokes.push(this.lineWidth); },
      arc(x, y, radius, start, end) { arcs.push({ x, y, radius, start, end }); },
      fillText(value, x, y) { text.push({ value, x, y, font: this.font }); },
      measureText(value) {
        return value === "拍"
          ? { actualBoundingBoxLeft: 7, actualBoundingBoxRight: 8 }
          : { actualBoundingBoxLeft: 8, actualBoundingBoxRight: 7.5 };
      },
      createLinearGradient() {
        const stops = [];
        gradients.push(stops);
        return { addColorStop(offset, color) { stops.push([offset, color]); } };
      },
    };
    layout.drawComparisonEditorialOverlay(
      context,
      { width: 540, height: 960 },
      (_context, x, y, width, height, radius) => capsulePaths.push({ x, y, width, height, radius }),
    );

    assert.deepEqual(capsulePaths, [
      { x: 630, y: 1047, width: 421, height: 605, radius: 30 },
    ]);
    assert.deepEqual(text.map((item) => item.value), ["拍", "摄", "后", "拍", "摄", "前"]);
    assert.deepEqual(arcs, [
      { x: 1005, y: 315, radius: 27, start: -Math.PI / 2, end: Math.PI / 2 },
      { x: 955, y: 315, radius: 27, start: Math.PI / 2, end: Math.PI * 1.5 },
      { x: 1004.5, y: 315, radius: 19, start: 0, end: Math.PI * 2 },
      { x: 1004, y: 1094, radius: 27, start: -Math.PI / 2, end: Math.PI / 2 },
      { x: 954, y: 1094, radius: 27, start: Math.PI / 2, end: Math.PI * 1.5 },
      { x: 1003.5, y: 1094, radius: 19, start: 0, end: Math.PI * 2 },
    ]);
    assert.deepEqual(text.map(({ x, y }) => ({ x, y })), [
      { x: 948.5, y: 314.5 },
      { x: 968.35, y: 314.5 },
      { x: 1004.5, y: 314.5 },
      { x: 947.5, y: 1093.5 },
      { x: 967.35, y: 1093.5 },
      { x: 1003.5, y: 1093.5 },
    ]);
    assert.ok(text.filter((_, index) => index % 3 !== 2).every((item) => item.font.includes("18px")));
    assert.ok(text.filter((_, index) => index % 3 === 2).every((item) => item.font.includes("22px")));

    const alpha = (color) => Number(color.match(/,([.\d]+)\)$/)[1]);
    for (const stops of [gradients[0], gradients[2]]) {
      assert.ok(stops.every(([, color]) => alpha(color) <= 0.78));
    }
    assert.ok(strokes.slice(1).every((lineWidth) => lineWidth >= 2));
  }
});
