import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';

async function withEditor(t, touch, run, { injectEffectsFailure = false } = {}) {
  if (!available) { t.skip('需本机 Chrome 和 Playwright'); return; }
  const publicRoot = resolve('public');
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/makeover-test-host.html') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;height:100dvh;overflow:hidden"><iframe id="editor" title="素人改造测试" src="/makeover/index.html?embed=1" style="display:block;border:0;width:100%;height:100%"></iframe></body></html>');
      return;
    }
    const path = resolve(publicRoot, '.' + decodeURIComponent(pathname));
    if (!path.startsWith(publicRoot + '/')) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(path);
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' })[extname(path)] ?? 'application/octet-stream');
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    page.setDefaultTimeout(6000);
    // A captured pre-fix module can prove regressions without rewriting shared source.
    if (process.env.NBO_PHOTO_OPS_APP_OVERRIDE) {
      await page.route('**/makeover/app.js?*', route => route.fulfill({ path: resolve(process.env.NBO_PHOTO_OPS_APP_OVERRIDE), contentType: 'text/javascript' }));
    }
    if (injectEffectsFailure) {
      await page.route(/\/makeover\/photo-effects\.mjs\?v=/, route => route.fulfill({
        contentType: 'text/javascript',
        body: `import { drawPhotoEffects as realDraw, projectBrushStroke } from './photo-effects.mjs?original=1';
export { projectBrushStroke };
export function drawPhotoEffects(...args) {
  if (globalThis.failNextPhotoEffects) {
    globalThis.failNextPhotoEffects = false;
    throw new Error('INJECTED_PHOTO_EFFECTS_FAILURE');
  }
  return realDraw(...args);
}`,
      }));
    }
    await page.goto(`http://127.0.0.1:${server.address().port}/makeover-test-host.html`);
    const frame = await (await page.locator('#editor').elementHandle()).contentFrame();
    assert.ok(frame);
    await frame.locator('#preview').waitFor({ state: 'visible' });
    await run({ page, frame });
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

async function settle(frame) {
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function uploadPair(page, frame) {
  for (const [side, color] of [[0, '#a85462'], [1, '#3472b4']]) {
    const data = await page.evaluate(color => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 800;
      const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(0, 0, 800, 800);
      context.fillStyle = '#d6b879'; context.fillRect(80, 100, 90, 500);
      return canvas.toDataURL().split(',')[1];
    }, color);
    await frame.locator(`#photo-${side}`).setInputFiles({ name: `操作测试${side}.png`, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  }
  await frame.waitForFunction(() => !document.querySelector('#export-png').disabled && !document.querySelector('#export-jpg').disabled);
  await settle(frame);
}

async function target(frame, side) {
  await frame.locator(`[data-photo-target="${side}"]`).click();
  await settle(frame);
}
const field = (frame, key) => frame.locator(`#adjust-${key}-value`);
async function setNumber(frame, key, value) {
  await field(frame, key).fill(String(value));
  await field(frame, key).press('Enter');
  await settle(frame);
  assert.equal(Number(await field(frame, key).inputValue()), value, `${key}精确数值不得被吸附改写`);
}

test('导入即填满，数值、滑块、滚轮和键盘均不能缩小到露出黑边', { timeout: 30000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    await target(frame, 0);
    assert.equal(Number(await field(frame, 'zoom').inputValue()), 100);
    await field(frame, 'zoom').fill('25');
    await field(frame, 'zoom').press('Enter');
    assert.equal(Number(await field(frame, 'zoom').inputValue()), 100, '低于铺满大小的数值必须回到最小缩放');
    await frame.locator('#adjust-zoom').evaluate(range => { range.value = '0'; range.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(Number(await field(frame, 'zoom').inputValue()), 100);
    const rect = await frame.locator('#preview').boundingBox();
    await page.mouse.move(rect.x + rect.width * .25, rect.y + rect.height * .4);
    await page.mouse.wheel(0, 1000);
    await frame.locator('#preview').focus();
    await frame.locator('#preview').press('-');
    await settle(frame);
    assert.equal(Number(await field(frame, 'zoom').inputValue()), 100);
    for (const [key, value] of [['offsetX', 200], ['offsetY', -200], ['rotation', 45]]) {
      await field(frame, key).fill(String(value)); await field(frame, key).press('Enter');
    }
    await settle(frame);
    const colors = await samplePixels(frame, [[.01,.08],[.49,.08],[.01,.3],[.49,.3]]);
    assert.ok(colors.every(color => Math.max(...color.slice(0, 3)) > 40), `框内应始终显示照片，不能露出黑底：${JSON.stringify(colors)}`);
    await frame.locator('#reset-photo').click();
    assert.equal(Number(await field(frame, 'zoom').inputValue()), 100);
    assert.equal(Number(await field(frame, 'offsetX').inputValue()), 0);
    assert.equal(Number(await field(frame, 'offsetY').inputValue()), 0);
  });
});

test('素人改造照片操作保留精确数值，拖动锁定当前图，轻滚轮与旋转复位互不串图', { timeout: 60000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    await target(frame, 0);
    await setNumber(frame, 'zoom', 200);
    await setNumber(frame, 'rotation', 88);
    await setNumber(frame, 'offsetX', 13);
    await frame.locator('[data-reset-setting="offsetX"]').click();
    assert.equal(Number(await field(frame, 'offsetX').inputValue()), 0);
    assert.equal(Number(await field(frame, 'rotation').inputValue()), 88, '单项复位保留其它构图参数');
    await setNumber(frame, 'rotation', 0);
    await target(frame, 1);
    await setNumber(frame, 'offsetX', 17);
    await target(frame, 0);
    const canvas = frame.locator('#preview');
    const rect = await canvas.boundingBox();
    await page.mouse.move(rect.x + rect.width * .25, rect.y + rect.height * .4);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .8, rect.y + rect.height * .48, { steps: 12 });
    await page.mouse.up();
    await settle(frame);
    assert.notEqual(Number(await field(frame, 'offsetX').inputValue()), 0, '照片可沿水平方向移动');
    assert.notEqual(Number(await field(frame, 'offsetY').inputValue()), 0, '放大后可在裁切余量内上下移动');
    await target(frame, 1);
    assert.equal(Number(await field(frame, 'offsetX').inputValue()), 17, '跨越分界拖动不得改写另一张照片');
    assert.equal(Number(await field(frame, 'offsetY').inputValue()), 0);

    await target(frame, 0);
    await frame.locator('#reset-photo').click();
    await settle(frame);
    await page.mouse.move(rect.x + rect.width * .25, rect.y + rect.height * .4);
    await page.mouse.wheel(0, -1000);
    await settle(frame);
    const zoom = Number(await field(frame, 'zoom').inputValue());
    assert.ok(zoom > 100 && zoom <= 102, `单次滚轮缩放应轻微且最多2%，实际${zoom}`);

    await page.mouse.dblclick(rect.x + rect.width * .25, rect.y + rect.height * .4);
    await settle(frame);
    assert.equal(await frame.locator('#rotation-mode').getAttribute('aria-pressed'), 'true');
    await page.mouse.move(rect.x + rect.width * .25, rect.y + rect.height * .4);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .35, rect.y + rect.height * .4, { steps: 8 });
    await page.mouse.up();
    await settle(frame);
    const rotation = Number(await field(frame, 'rotation').inputValue());
    assert.ok(Math.abs(rotation) > 3 && Math.abs(rotation) <= 180, '旋转模式横拖改变当前图角度');
    await page.mouse.dblclick(rect.x + rect.width * .25, rect.y + rect.height * .4);
    await settle(frame);
    assert.equal(await frame.locator('#rotation-mode').getAttribute('aria-pressed'), 'false');
    await frame.locator('#reset-photo').click();
    assert.equal(Number(await field(frame, 'rotation').inputValue()), 0);
    assert.equal(Number(await field(frame, 'zoom').inputValue()), 100);
    await target(frame, 1);
    assert.equal(Number(await field(frame, 'offsetX').inputValue()), 17, '当前图整体复位不重置另一张图');
  });
});

test('双指缩放只调整手势起点照片并保留另一侧构图', { timeout: 60000 }, async t => {
  await withEditor(t, true, async ({ page, frame }) => {
    await uploadPair(page, frame);
    await target(frame, 0);
    const rect = await frame.locator('#preview').boundingBox();
    const x = rect.x + rect.width * .25;
    const y = rect.y + rect.height * .4;
    const cdp = await page.context().newCDPSession(page);
    const touch = async (type, points) => {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 2, radiusY: 2 })) });
      await page.waitForTimeout(40);
    };
    await touch('touchStart', [[0, x - 12, y], [1, x + 12, y]]);
    await touch('touchMove', [[0, x - 24, y], [1, x + 24, y]]);
    await touch('touchEnd', []);
    await settle(frame);
    const zoom = Number(await field(frame, 'zoom').inputValue());
    assert.ok(zoom > 110 && zoom <= 400, `双指张开应缩放当前图，实际${zoom}`);
    await touch('touchStart', [[0, x - 24, y], [1, x + 24, y]]);
    await touch('touchMove', [[0, x - 3, y], [1, x + 3, y]]);
    await touch('touchEnd', []);
    await settle(frame);
    assert.equal(Number(await field(frame, 'zoom').inputValue()), 100, '双指收拢也不能小于填满框的最小缩放');
    await target(frame, 1);
    assert.equal(Number(await field(frame, 'zoom').inputValue()), 100, '另一侧照片不继承双指缩放');
    await cdp.detach();
  });
});

async function samplePixels(frame, points) {
  return frame.locator('#preview').evaluate((canvas, points) => {
    const context = canvas.getContext('2d');
    return points.map(([x, y]) => [...context.getImageData(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1).data]);
  }, points);
}

test('模板渐变可独立调整、复位与导出，照片参数和固定标题保持不变', { timeout: 60000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    const control = frame.locator('#adjust-templateGradient');
    assert.equal(await control.count(), 1, 'PSD渐变应有独立的控制滑块');
    const number = frame.locator('#adjust-templateGradient-value');
    assert.equal(await number.inputValue(), '100', '默认保持PSD原有渐变强度');
    const points = [[.25,.62],[.75,.62],[.25,.015],[.5,.015],[.75,.015]];
    const original = await samplePixels(frame, points);
    await number.fill('0'); await number.press('Enter'); await settle(frame);
    const clear = await samplePixels(frame, points);
    for (const i of [0, 1]) assert.ok(light(clear[i]) > light(original[i]) + 20, '关闭渐变应同时恢复左右照片原有亮度');
    for (const i of [2, 3, 4]) colorNear(clear[i], original[i], '模板渐变不得改变固定标题和边框');
    await target(frame, 0);
    assert.equal(await field(frame, 'shade').inputValue(), '0');
    assert.equal(await field(frame, 'bottomShade').inputValue(), '0');
    await target(frame, 1);
    assert.equal(await number.inputValue(), '0', '整体渐变不能跟随照片切换被复位');
    await frame.locator('#reset-photo').click();
    assert.equal(await number.inputValue(), '0', '照片复位不能覆盖独立的模板渐变');
    await number.fill('50'); await number.press('Enter'); await settle(frame);
    const middle = await samplePixels(frame, points);
    for (const i of [0, 1]) assert.ok(light(middle[i]) > light(original[i]) && light(middle[i]) < light(clear[i]));
    const exported = await inspectExport(frame, 'png', [[1500,4960],[4500,4960]]);
    for (const i of [0, 1]) colorNear(exported.colors[i], middle[i], '导出应使用当前模板渐变强度');
    await frame.locator('[data-reset-template-gradient]').click(); await settle(frame);
    assert.equal(await number.inputValue(), '100');
    const reset = await samplePixels(frame, points);
    for (let i = 0; i < points.length; i++) colorNear(reset[i], original[i], '复位应恢复原有模板效果');
  });
});

test('渐变图层绘制失败后画布变换仍复原，下次调整可正常恢复', { timeout: 30000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    const points = [[.25,.62],[.75,.62],[.5,.015]];
    const before = await samplePixels(frame, points);
    await frame.evaluate(() => {
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      let fail = true;
      CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
        if (fail && image?.src?.includes('template-gradient.png')) { fail = false; throw new Error('GRADIENT_FAILURE'); }
        return draw.call(this, image, ...args);
      };
    });
    await frame.locator('#adjust-templateGradient').evaluate(range => { range.value = '80'; range.dispatchEvent(new Event('input', { bubbles: true })); });
    await settle(frame);
    const transform = await frame.locator('#preview').evaluate(canvas => {
      const m = canvas.getContext('2d').getTransform(); return [m.a,m.b,m.c,m.d,m.e,m.f];
    });
    assert.deepEqual(transform, [1,0,0,1,0,0], '异常不能把预览缩放泄漏到下一帧');
    await frame.locator('[data-reset-template-gradient]').click(); await settle(frame);
    const after = await samplePixels(frame, points);
    for (let i = 0; i < points.length; i++) colorNear(after[i], before[i], '故障恢复后照片与固定模板不得继承错误绘制状态');
  });
});
const light = color => color[0] + color[1] + color[2];
// GPU canvas compositing can round a restored shade channel by one byte.
// Keep a two-byte RGB allowance while requiring the exact opacity and strong
// pixel changes for the actual brush effect; fixed-template PNG checks stay exact.
function colorNear(actual, expected, message) {
  assert.equal(actual[3], expected[3], message);
  assert.ok(actual.slice(0, 3).every((value, index) => Math.abs(value - expected[index]) <= 2), `${message}: ${actual} vs ${expected}`);
}

async function brushStroke(page, frame, from, to) {
  const rect = await frame.locator('#preview').boundingBox();
  await page.mouse.move(rect.x + rect.width * from[0], rect.y + rect.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * to[0], rect.y + rect.height * to[1], { steps: 10 });
  await page.mouse.up();
  await settle(frame);
}

async function enableOpaqueBrush(frame, size = 120) {
  await target(frame, 0);
  await setNumber(frame, 'shade', 100);
  const details = frame.locator('.brush-settings');
  if (!await details.evaluate(element => element.open)) await details.locator('summary').click();
  await frame.locator('#brush-toggle').click();
  for (const [key, value] of [['size', size], ['feather', 0], ['strength', 100]]) {
    await frame.locator(`#brush-${key}-value`).fill(String(value));
    await frame.locator(`#brush-${key}-value`).press('Enter');
  }
  await settle(frame);
}

test('回归：涂抹前切换构图、照片或旋转后显示真实笔迹并与导出一致', { timeout: 60000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    await enableOpaqueBrush(frame);
    const point = [.225, .4];
    const [before] = await samplePixels(frame, [point]);
    await brushStroke(page, frame, [.2, .4], [.25, .4]);
    const [after] = await samplePixels(frame, [point]);
    assert.ok(light(after) > light(before) + 20, '必须先产生真实涂抹效果');
    await page.setViewportSize({ width: 1000, height: 1000 });
    const restored = [];
    for (const tool of ['compose', 'photos']) {
      await frame.locator('button[data-tool="brush"]').click();
      await frame.locator('#brush-before').click();
      await settle(frame);
      colorNear((await samplePixels(frame, [point]))[0], before, '切换前应处于涂抹前对比状态');
      await frame.locator(`button[data-tool="${tool}"]`).click();
      await settle(frame);
      restored.push([tool, (await samplePixels(frame, [point]))[0]]);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await frame.locator('#brush-before').click();
    await frame.locator('#rotation-mode').click();
    await settle(frame);
    restored.push(['rotation', (await samplePixels(frame, [point]))[0]]);
    const exported = await inspectExport(frame, 'png', [[1350, 3200]]);
    colorNear(exported.colors[0], after, '导出始终包含最终笔迹');
    for (const [action, color] of restored) {
      colorNear(color, exported.colors[0], `${action}退出对比后预览必须恢复最终笔迹，与导出相同`);
    }
  });
});

for (const operation of ['reset', 'number', 'split']) {
  test(`回归：鼠标拖动中${operation}调整不会被旧拖动起点覆盖`, { timeout: 30000 }, async t => {
    await withEditor(t, false, async ({ page, frame }) => {
      await uploadPair(page, frame);
      await target(frame, 0);
      await setNumber(frame, 'offsetX', 20);
      const rect = await frame.locator('#preview').boundingBox();
      const at = (x, y = .4) => [rect.x + rect.width * x, rect.y + rect.height * y];
      await page.mouse.move(...at(.2));
      await page.mouse.down();
      try {
        await page.mouse.move(...at(.28), { steps: 3 });
        await settle(frame);
        assert.ok(Number(await field(frame, 'offsetX').inputValue()) > 20, '测试时鼠标拖动必须已生效');
        if (operation === 'reset') await frame.locator('[data-reset-setting="offsetX"]').evaluate(button => button.click());
        else if (operation === 'number') await setNumber(frame, 'offsetX', 70);
        else await frame.locator('#split').evaluate(range => { range.value = '70'; range.dispatchEvent(new Event('input', { bubbles: true })); });
        await settle(frame);
        const applied = Number(await field(frame, 'offsetX').inputValue());
        if (operation !== 'split') assert.equal(applied, operation === 'reset' ? 0 : 70);
        await page.mouse.move(...at(.29));
        await settle(frame);
        assert.equal(Number(await field(frame, 'offsetX').inputValue()), applied, '调整参数应结束旧手势，后续同次按压不得覆盖新构图');
      } finally { await page.mouse.up(); }
    });
  });
}

for (const [gesture, operation] of [['drag', 'reset'], ['pinch', 'number'], ['pinch', 'split']]) {
  test(`回归：触屏${gesture}中${operation}调整不会被旧手势起点覆盖`, { timeout: 30000 }, async t => {
    await withEditor(t, true, async ({ page, frame }) => {
      await uploadPair(page, frame);
      await target(frame, 0);
      const rect = await frame.locator('#preview').boundingBox();
      const x = rect.x + rect.width * .25, y = rect.y + rect.height * .4;
      const cdp = await page.context().newCDPSession(page);
      const touch = async (type, points) => {
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, dx, dy = 0]) => ({ id, x: x + dx, y: y + dy, radiusX: 2, radiusY: 2 })) });
        await settle(frame);
      };
      const key = gesture === 'drag' ? 'offsetX' : 'zoom';
      try {
        if (gesture === 'drag') {
          await touch('touchStart', [[0, 0]]);
          await touch('touchMove', [[0, 20]]);
        } else {
          await touch('touchStart', [[0, -12], [1, 12]]);
          await touch('touchMove', [[0, -20], [1, 20]]);
        }
        assert.ok(Number(await field(frame, key).inputValue()) > (key === 'zoom' ? 110 : 0), '测试时真实触摸手势必须已生效');
        if (operation === 'reset') await frame.locator(`[data-reset-setting="${key}"]`).evaluate(button => button.click());
        else if (operation === 'number') await setNumber(frame, key, 135);
        else await frame.locator('#split').evaluate(range => { range.value = '70'; range.dispatchEvent(new Event('input', { bubbles: true })); });
        await settle(frame);
        const applied = Number(await field(frame, key).inputValue());
        if (operation !== 'split') assert.equal(applied, operation === 'reset' ? 0 : 135);
        await touch('touchMove', gesture === 'drag' ? [[0, 23]] : [[0, -21], [1, 21]]);
        assert.equal(Number(await field(frame, key).inputValue()), applied, '调整参数应结束旧触摸，后续移动不得重新应用旧基线');
      } finally {
        await touch('touchEnd', []);
        await cdp.detach();
      }
    });
  });
}

test('回归：聚焦左图数值草稿后滚轮选中右图，失焦仅提交给左图', { timeout: 30000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    await target(frame, 1);
    await setNumber(frame, 'offsetX', 17);
    await target(frame, 0);
    await field(frame, 'offsetX').fill('37');
    assert.equal(await field(frame, 'offsetX').evaluate(input => document.activeElement === input), true, '滚轮前左图草稿必须仍聚焦且未提交');
    const rect = await frame.locator('#preview').boundingBox();
    await page.mouse.move(rect.x + rect.width * .75, rect.y + rect.height * .4);
    await page.mouse.wheel(0, -50);
    await settle(frame);
    assert.equal(await frame.locator('[data-photo-target="1"]').getAttribute('aria-pressed'), 'true', '真实滚轮必须已选中右图');
    // Switching may safely blur first; otherwise the later blur must retain its owner.
    await field(frame, 'offsetX').evaluate(input => input.blur());
    await settle(frame);
    assert.equal(Number(await field(frame, 'offsetX').inputValue()), 17, '左图草稿失焦不得写入右图');
    assert.equal(Number(await field(frame, 'zoom').inputValue()), 101, '右图仍保留自己的滚轮缩放');
    await target(frame, 0);
    assert.equal(Number(await field(frame, 'offsetX').inputValue()), 37, '草稿应提交到开始编辑的照片');
  });
});

test('回归：预览图像效果抛错后提示中文，下次调整恢复完整照片和固定模板', { timeout: 30000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    const uncaught = [];
    page.on('pageerror', error => uncaught.push(error.message));
    await uploadPair(page, frame);
    await target(frame, 0);
    await setNumber(frame, 'zoom', 150);
    await setNumber(frame, 'rotation', 17);
    await setNumber(frame, 'brightness', 72);
    await setNumber(frame, 'shade', 45);
    const points = [[.1, .3], [.25, .4], [.75, .4], [.25, .015], [.5, .015], [.75, .015]];
    const original = await samplePixels(frame, points);
    await frame.evaluate(() => { globalThis.failNextPhotoEffects = true; });
    await setNumber(frame, 'offsetX', 13);
    const failedStatus = await frame.locator('#status').textContent();
    const showedFailure = await frame.locator('#status').evaluate(status => status.classList.contains('error'));
    await setNumber(frame, 'offsetX', 0);
    const recovered = await samplePixels(frame, points);
    recovered.forEach((color, index) => colorNear(color, original[index], `恢复后第${index + 1}处照片/固定模板像素必须完整，不能继承错误帧的裁切或缩放`));
    assert.ok(showedFailure && /[\u3400-\u9fff]/.test(failedStatus), '绘制失败应显示可理解的中文错误');
    assert.equal(await frame.locator('#status').evaluate(status => status.classList.contains('error')), false, '恢复绘制后错误状态应清除');
    assert.deepEqual(uncaught, [], '预览异常应在界面处理，不得逃逸成未捕获错误');
    assert.equal(await frame.locator('#export-png').isEnabled(), true);
  }, { injectEffectsFailure: true });
});

test('回归：涂抹离开当前照片再进入时不连接跨界前后的笔迹', { timeout: 30000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    await enableOpaqueBrush(frame, 40);
    const middle = [.2, .45];
    const start = [.175, .3];
    const [untouched, unbrushed] = await samplePixels(frame, [middle, start]);
    const rect = await frame.locator('#preview').boundingBox();
    const at = (x, y) => [rect.x + rect.width * x, rect.y + rect.height * y];
    await page.mouse.move(...at(.15, .3));
    await page.mouse.down();
    await page.mouse.move(...at(.2, .3));
    await page.mouse.move(...at(.7, .45));
    await page.mouse.move(...at(.2, .6));
    await page.mouse.up();
    await settle(frame);
    const [afterMiddle, afterStart] = await samplePixels(frame, [middle, start]);
    assert.ok(light(afterStart) > light(unbrushed) + 20, '离开照片前应已画出真实笔迹');
    colorNear(afterMiddle, untouched, '跨出当前照片应中断笔迹，重新进入不得画出穿过中间的连接线');
  });
});

async function inspectExport(frame, format, fixedPoints) {
  await frame.locator(`#export-${format}`).click();
  await frame.locator('#download-result').waitFor({ state: 'visible' });
  return frame.locator('#download-link').evaluate(async (link, points) => {
    const bitmap = await createImageBitmap(await (await fetch(link.href)).blob());
    const canvas = document.createElement('canvas'); canvas.width = points.length; canvas.height = 1;
    const context = canvas.getContext('2d');
    points.forEach(([x, y], index) => context.drawImage(bitmap, x, y, 1, 1, index, 0, 1, 1));
    const colors = points.map((_, index) => [...context.getImageData(index, 0, 1, 1).data]);
    const result = { width: bitmap.width, height: bitmap.height, colors };
    bitmap.close(); canvas.width = canvas.height = 0;
    return result;
  }, fixedPoints);
}

test('成品按南铂素人改造加北京时间命名，连续导出不重复且不超过19.9MB', { timeout: 60000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    const names = [];
    for (let i = 0; i < 2; i++) {
      await frame.locator('#export-jpg').click();
      await frame.locator('#download-result').waitFor({ state: 'visible' });
      const result = await frame.locator('#download-link').evaluate(async link => ({
        name: link.download, size: (await (await fetch(link.href)).blob()).size,
      }));
      assert.match(result.name, /^南铂素人改造_\d{8}_\d{6}_\d{3}_[a-z0-9_-]+\.jpg$/);
      assert.ok(result.size > 0 && result.size <= 19_900_000);
      names.push(result.name);
    }
    assert.notEqual(names[0], names[1]);
  });
});

test('超限导出不交付大文件：JPG先降质量保留6K，PNG等比缩小并显示实际尺寸', { timeout: 60000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    // Model a native-size encode exceeding the cap once per format. All retries
    // use the real browser encoder and must produce decodable image files.
    await frame.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      const oversized = new Set();
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        if (this.width === 6000 && this.height === 8000 && !oversized.has(type)) {
          oversized.add(type);
          callback(new Blob([new Uint8Array(20_000_000)], { type }));
          return;
        }
        return original.call(this, callback, type, quality);
      };
    });
    for (const format of ['jpg', 'png']) {
      await frame.locator(`#export-${format}`).click();
      await frame.locator('#download-result').waitFor({ state: 'visible' });
      const result = await frame.locator('#download-link').evaluate(async link => {
        const blob = await (await fetch(link.href)).blob();
        if (blob.size > 19_900_000) return { size: blob.size, type: blob.type, width: 0, height: 0 };
        const bitmap = await createImageBitmap(blob);
        const result = { size: blob.size, type: blob.type, width: bitmap.width, height: bitmap.height };
        bitmap.close(); return result;
      });
      assert.ok(result.size <= 19_900_000, `不能交付超限${format}：${result.size}`);
      assert.equal(result.type, format === 'jpg' ? 'image/jpeg' : 'image/png');
      assert.equal(result.width / result.height, .75);
      if (format === 'jpg') assert.deepEqual([result.width, result.height], [6000, 8000]);
      else assert.ok(result.width < 6000 && result.height < 8000);
      assert.ok((await frame.locator('#status').textContent()).includes(`${result.width} × ${result.height}`), '成功提示应显示真实导出尺寸');
    }
  });
});

test('涂抹局部提亮跟随照片移动且不越界，预览导出共享图像操作并保留固定模板', { timeout: 90000 }, async t => {
  await withEditor(t, false, async ({ page, frame }) => {
    await uploadPair(page, frame);
    await target(frame, 0);
    await setNumber(frame, 'shade', 100);
    await setNumber(frame, 'bottomShade', 100);
    const details = frame.locator('.brush-settings');
    if (!await details.evaluate(element => element.open)) await details.locator('summary').click();
    await frame.locator('#brush-toggle').click();
    for (const [key, value] of [['size', 120], ['feather', 0], ['strength', 100]]) {
      await frame.locator(`#brush-${key}-value`).fill(String(value));
      await frame.locator(`#brush-${key}-value`).press('Enter');
    }
    const point = [.225, .4];
    const [unbrushed] = await samplePixels(frame, [point]);
    const rightBefore = await samplePixels(frame, [[.6, .4], [.75, .4]]);
    await brushStroke(page, frame, [.2, .4], [.25, .4]);
    const [brushed] = await samplePixels(frame, [point]);
    assert.ok(light(brushed) > light(unbrushed) + 20, `真实笔迹应擦除额外压暗，而不是仅更新状态: before=${unbrushed}, after=${brushed}, status=${await frame.locator('#status').textContent()}, toggle=${await frame.locator('#brush-toggle').getAttribute('aria-pressed')}, undoDisabled=${await frame.locator('#brush-undo').isDisabled()}`);
    await frame.locator('#brush-before').click();
    await settle(frame);
    colorNear((await samplePixels(frame, [point]))[0], unbrushed, '涂抹前视图应恢复未擦除效果');
    await frame.locator('#brush-after').click();
    await settle(frame);
    colorNear((await samplePixels(frame, [point]))[0], brushed, '涂抹后视图应恢复真实提亮');
    await frame.locator('#brush-undo').click();
    await settle(frame);
    colorNear((await samplePixels(frame, [point]))[0], unbrushed, '撤销必须撤销真实像素效果');
    await brushStroke(page, frame, [.2, .4], [.25, .4]);
    await setNumber(frame, 'offsetX', 20);
    // A +20% pane offset is +10% of the full poster at the half split.
    const moved = [.325, .4];
    await frame.locator('#brush-before').click();
    await settle(frame);
    const beforeMove = await samplePixels(frame, [point, moved]);
    await frame.locator('#brush-after').click();
    await settle(frame);
    const afterMove = await samplePixels(frame, [point, moved]);
    colorNear(afterMove[0], beforeMove[0], '旧画布位置不得残留刷痕');
    assert.ok(light(afterMove[1]) > light(beforeMove[1]) + 20, '刷痕应随原片归一坐标平移');
    await brushStroke(page, frame, [.2, .4], [.8, .4]);
    const rightAfter = await samplePixels(frame, [[.6, .4], [.75, .4]]);
    rightAfter.forEach((color, index) => colorNear(color, rightBefore[index], '笔迹跨过竖线也不得改写另一张图'));
    await frame.locator('#brush-clear').click();
    await settle(frame);
    colorNear((await samplePixels(frame, [moved]))[0], beforeMove[1], '清除当前图恢复其额外压暗');

    await frame.locator('#brush-toggle').click();
    await setNumber(frame, 'rotation', 33);
    await setNumber(frame, 'brightness', 72);
    const fixed = [[1500, 120], [3000, 120], [4500, 120]];
    const overlay = await frame.evaluate(async points => {
      const bitmap = await createImageBitmap(await (await fetch('./assets/template-fixed.png')).blob());
      const canvas = document.createElement('canvas'); canvas.width = points.length; canvas.height = 1;
      const context = canvas.getContext('2d');
      const colors = points.map(([x, y], index) => {
        context.drawImage(bitmap, x, y, 1, 1, index, 0, 1, 1);
        return [...context.getImageData(index, 0, 1, 1).data];
      });
      bitmap.close(); canvas.width = canvas.height = 0;
      return colors;
    }, fixed);
    assert.ok(overlay.every(color => color[3] === 255), '固定标题取样点必须来自完全不透明模板');
    const png = await inspectExport(frame, 'png', fixed);
    assert.deepEqual([png.width, png.height], [6000, 8000]);
    assert.deepEqual(png.colors, overlay, '图像变换/亮度/压暗不得改写原模板固定RGB');
    const jpg = await inspectExport(frame, 'jpg', fixed);
    assert.deepEqual([jpg.width, jpg.height], [6000, 8000]);
  });
});
