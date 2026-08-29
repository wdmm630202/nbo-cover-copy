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
      before: { right: 1032, y: 831, width: 104, height: 54, radius: 27 },
    },
  },
  {
    name: "抖音 9:16 把全部对比元素锁进居中 3:4 安全区",
    canvas: { width: 1080, height: 1920 },
    safe: { x: 0, y: 240, width: 1080, height: 1440 },
    frame: { x: 630, y: 1047, width: 421, height: 605, radius: 30 },
    labels: {
      after: { right: 1032, y: 288, width: 104, height: 54, radius: 27 },
      before: { right: 1032, y: 1071, width: 104, height: 54, radius: 27 },
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
    after: { right: 516, y: 24, width: 52, height: 27, radius: 14 },
    before: { right: 516, y: 416, width: 52, height: 27, radius: 14 },
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
