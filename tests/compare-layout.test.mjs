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
      after: { right: 1032, y: 43.5, width: 104, height: 63, radius: 31.5 },
      before: { right: 1032, y: 826.5, width: 104, height: 63, radius: 31.5 },
    },
  },
  {
    name: "抖音 9:16 把全部对比元素锁进居中 3:4 安全区",
    canvas: { width: 1080, height: 1920 },
    safe: { x: 0, y: 240, width: 1080, height: 1440 },
    frame: { x: 630, y: 1047, width: 421, height: 605, radius: 30 },
    labels: {
      after: { right: 1032, y: 283.5, width: 104, height: 63, radius: 31.5 },
      before: { right: 1032, y: 1066.5, width: 104, height: 63, radius: 31.5 },
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
    after: { right: 516, y: 21.75, width: 52, height: 31.5, radius: 15.75 },
    before: { right: 516, y: 413.75, width: 52, height: 31.5, radius: 15.75 },
  };
  for (const layout of await loadImplementations()) {
    assert.deepEqual(plain(layout.getComparisonLabelLayout({ width: 540, height: 720 })), expected);
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
    assert.equal(strokes, 5, "虚线框之外，每个胶囊和圆钮都应有细高光描边");
  }
});

test("胶囊缩小时仍保持整圆角、透明材质和三字协调间距", async () => {
  for (const layout of await loadImplementations()) {
    const gradients = [];
    const capsulePaths = [];
    const arcs = [];
    const text = [];
    const strokes = [];
    const context = {
      save() {}, restore() {}, scale() {}, beginPath() {}, rect() {}, clip() {},
      setLineDash() {}, fill() {}, stroke() { strokes.push(this.lineWidth); },
      arc(x, y, radius) { arcs.push({ x, y, radius }); },
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
      (_context, _x, _y, _width, height, radius) => capsulePaths.push({ height, radius }),
    );

    assert.deepEqual(capsulePaths.slice(-2), [
      { height: 63, radius: 31.5 },
      { height: 63, radius: 31.5 },
    ]);
    assert.deepEqual(text.map((item) => item.value), ["拍", "摄", "后", "拍", "摄", "前"]);
    assert.ok(arcs.every((circle) => circle.radius === 16.5 && circle.x === 1002.5));
    assert.ok(text.filter((_, index) => index % 3 !== 2).every((item) => item.font.includes("16px")));
    assert.ok(text.filter((_, index) => index % 3 === 2).every((item) => item.font.includes("21px")));

    for (let index = 0; index < text.length; index += 3) {
      const [first, second, third] = text.slice(index, index + 3);
      const circle = arcs[index / 3];
      const firstGap = second.x - 8 - (first.x + 8);
      const secondGap = third.x - circle.radius - (second.x + 7.5);
      assert.ok(Math.abs(firstGap - secondGap) < 0.01);
    }

    const alpha = (color) => Number(color.match(/,([.\d]+)\)$/)[1]);
    for (const stops of [gradients[0], gradients[2]]) {
      assert.ok(stops.every(([, color]) => alpha(color) <= 0.78));
    }
    assert.ok(strokes.slice(1).every((lineWidth) => lineWidth >= 2));
  }
});

test("大尺寸照片导出始终保留原始裁切像素，不按手机或文件大小降级", async () => {
  const source = { width: 6000, height: 9000 };
  const preset = { width: 1080, height: 1920 };
  for (const layout of await loadImplementations()) {
    assert.equal(typeof layout.getOriginalPixelExportPlan, "function");
    assert.deepEqual(
      plain(layout.getOriginalPixelExportPlan(source, preset, "png")),
      { width: 5063, height: 9000, quality: null },
    );
    assert.deepEqual(
      plain(layout.getOriginalPixelExportPlan(source, preset, "jpeg")),
      { width: 5063, height: 9000, quality: 0.98 },
    );
  }
});

test("JPG 保留原始像素时仍按旧规则尝试压到 19.9MB", async () => {
  for (const layout of await loadImplementations()) {
    assert.equal(typeof layout.getOriginalPixelJpegQualities, "function");
    assert.equal(typeof layout.getOriginalPixelJpegMaxBytes, "function");
    assert.deepEqual(
      plain(layout.getOriginalPixelJpegQualities()),
      [0.98, 0.91, 0.84, 0.77, 0.7, 0.63, 0.56],
    );
    assert.equal(layout.getOriginalPixelJpegMaxBytes(), 19.9 * 1024 * 1024);
  }
});
