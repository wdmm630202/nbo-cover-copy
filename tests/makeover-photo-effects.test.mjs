import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { drawPhotoEffects, projectBrushStroke } from '../public/makeover/photo-effects.mjs';
import { available, chromium, executablePath } from './helpers/live-browser-driver.mjs';

const stroke = { points: [{ x: .75, y: .5 }], radius: .1, feather: 0, strength: 100 };

test('source-anchored brush moves and scales with the photo inside an asymmetric pane', () => {
  const pane = { x: 5, y: 10, width: 100, height: 80 };
  const transform = { centerX: 45, centerY: 50, width: 80, height: 100, rotationRadians: 0 };
  const original = projectBrushStroke(stroke, pane, transform);
  assert.deepEqual(original.points, [{ x: .6, y: .5 }]);
  assert.ok(Math.abs(original.size - 172.8) < 1e-10);
  const rotated = projectBrushStroke(stroke, { ...pane, x: 25, width: 50 }, {
    ...transform, centerX: 55, width: 160, height: 200, rotationRadians: Math.PI / 2,
  });
  assert.deepEqual(rotated.points, [{ x: .6, y: 1 }]);
  assert.ok(Math.abs(rotated.size - 691.2) < 1e-10);
  assert.equal(rotated.strength, 100);
  assert.equal(rotated.feather, 0);
  assert.deepEqual(stroke.points, [{ x: .75, y: .5 }]);
});

test('neutral shading and invisible edge panes do not draw or allocate a canvas', () => {
  // There is no DOM in this test, so even allocating a scratch canvas would fail.
  const pane = { x: 5, y: 10, width: 100, height: 80 };
  const photo = { shade: 0, bottomShade: 0, strokes: [stroke] };
  drawPhotoEffects(null, pane, null, photo);
  drawPhotoEffects(null, { ...pane, width: 0 }, null, { ...photo, shade: 70 });
});

// Model the canvas state that survives a failed draw, including the browser's
// context reset when either bitmap dimension is assigned. Keep the real effects
// and brush implementations in the path; only the canvas primitive can fail.
const controlledGradient = { addColorStop() {} };
function controlledCanvas() {
  const stack = [];
  const context = {
    operations: [],
    failNext: '',
    reset() {
      stack.length = 0;
      this.operations.length = 0;
      this.fillStyle = '#000';
      this.globalCompositeOperation = 'source-over';
      this.filter = 'none';
    },
    state() {
      return { fillStyle: this.fillStyle, composite: this.globalCompositeOperation, filter: this.filter, depth: stack.length };
    },
    save() { stack.push(this.state()); },
    restore() {
      const state = stack.pop();
      if (state) {
        this.fillStyle = state.fillStyle;
        this.globalCompositeOperation = state.composite;
        this.filter = state.filter;
      }
    },
    clearRect() { this.operations.length = 0; },
    fillRect(...rect) { this.operations.push({ type: 'fill', rect, ...this.state() }); },
    createLinearGradient() {
      if (this.failNext === 'gradient') { this.failNext = ''; throw new Error('控制画布渐变失败'); }
      return controlledGradient;
    },
    drawImage(source, ...rect) {
      if (this.failNext === 'image') { this.failNext = ''; throw new Error('控制画布笔迹失败'); }
      this.operations.push({ type: 'image', rect, ...this.state(), source: source.context.operations.slice() });
    },
    beginPath() {}, moveTo() {}, arc() {}, fill() {},
  };
  context.reset();
  let width = 300, height = 150;
  return {
    context,
    get width() { return width; }, set width(value) { width = value; context.reset(); },
    get height() { return height; }, set height(value) { height = value; context.reset(); },
    getContext() { return context; },
  };
}

test('failed direct shading restores caller state before a later render', () => {
  const pane = { x: 5, y: 10, width: 100, height: 80 };
  const photo = { shade: 45, bottomShade: 50, strokes: [] };
  const context = controlledCanvas().context;
  const initial = context.state();
  context.failNext = 'gradient';
  assert.throws(() => drawPhotoEffects(context, pane, null, photo), /控制画布渐变失败/);
  assert.deepEqual(context.state(), initial, '失败不能泄漏保存栈或改变调用方的画布状态');
  context.clearRect();
  drawPhotoEffects(context, pane, null, photo);
  const baseline = controlledCanvas().context;
  drawPhotoEffects(baseline, pane, null, photo);
  assert.deepEqual(context.operations, baseline.operations, '重试的压暗绘制应与新画布一致');
});

test('failed brush shading discards poisoned scratch state before the next same-size render', async () => {
  const { drawPhotoEffects: draw } = await import('../public/makeover/photo-effects.mjs?brush-recovery');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const scratch = [];
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement() { const canvas = controlledCanvas(); scratch.push(canvas); return canvas; },
  } });
  try {
    const pane = { x: 5, y: 10, width: 100, height: 80 };
    const transform = { centerX: 55, centerY: 50, width: 100, height: 80, rotationRadians: 0 };
    const photo = { shade: 50, bottomShade: 0, strokes: [stroke] };
    const context = controlledCanvas().context;
    draw(context, pane, transform, photo);
    const baseline = structuredClone(context.operations);
    context.clearRect();
    scratch[0].context.failNext = 'image';
    assert.throws(() => draw(context, pane, transform, photo), /控制画布笔迹失败/);
    assert.deepEqual(context.operations, [], '失败的蒙版不能被发布到照片画布');
    draw(context, pane, transform, photo);
    assert.deepEqual(context.operations, baseline, '同尺寸重试必须恢复正常压暗和笔迹合成，不能继承 destination-out');
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  }
});

test('real canvas erases only user shading, keeps both panes opaque and restores it for comparison', { skip: !available }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const files = new Set(['photo-effects.mjs', 'geometry.mjs', 'brush-core.mjs']);
    await page.route('http://makeover.test/**', async route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      if (!file) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>画面测试</title>' });
      if (!files.has(file)) return route.abort();
      const body = await readFile(new URL('../public/makeover/' + file, import.meta.url));
      return route.fulfill({ contentType: 'text/javascript', body });
    });
    await page.goto('http://makeover.test/');
    const result = await page.evaluate(async stroke => {
      const { drawPhotoEffects } = await import('/photo-effects.mjs');
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      const pane = { x: 20, y: 10, width: 80, height: 80 };
      const transform = { centerX: 60, centerY: 50, width: 80, height: 80, rotationRadians: 0 };
      const photo = { shade: 50, bottomShade: 0, strokes: [stroke] };
      function render(photo, transform, compareBefore = false) {
        ctx.fillStyle = 'rgb(200, 100, 60)';
        ctx.fillRect(0, 0, 200, 100);
        drawPhotoEffects(ctx, pane, transform, photo, { compareBefore, renderWidth: 6000 });
      }
      const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      render(photo, transform);
      const cleared = pixel(80, 50), darkened = pixel(40, 40), neighbor = pixel(100, 50);
      render(photo, transform, true);
      const comparison = pixel(80, 50);
      render(photo, { ...transform, rotationRadians: Math.PI / 2 });
      const rotated = pixel(60, 70), oldLocation = pixel(80, 50);
      render({ shade: 0, bottomShade: 100, strokes: [] }, transform);
      return { cleared, darkened, neighbor, comparison, rotated, oldLocation, top: pixel(60, 25), bottom: pixel(60, 89) };
    }, stroke);
    const photoPixel = [200, 100, 60, 255];
    assert.deepEqual(result.cleared, photoPixel);
    assert.deepEqual(result.neighbor, photoPixel);
    assert.deepEqual(result.rotated, photoPixel);
    assert.deepEqual(result.top, photoPixel);
    assert.ok(Math.abs(result.darkened[0] - 100) <= 1);
    assert.deepEqual(result.darkened, result.comparison);
    assert.deepEqual(result.darkened, result.oldLocation);
    assert.equal(result.darkened[3], 255);
    assert.ok(result.bottom[0] >= 19 && result.bottom[0] <= 25);
  } finally {
    await browser.close();
  }
});
