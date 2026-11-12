import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { available, chromium, executablePath } from './helpers/live-browser-driver.mjs';
import { clickInFrame, frameBoundingBox } from './helpers/makeover-browser-geometry.mjs';

const POSTER = { width: 6000, height: 8000 };
const MARKER = [220, 180, 80, 255];

// Independent fixture geometry: an 800px square covers the tall, half-width pane.
// Its gold source marker is deliberately off center, so neither zoom nor rotation
// can pass by continuing to erase the original canvas position.
function markerPosition({ zoom = 100, offsetX = 0, offsetY = 0, rotation = 0 } = {}) {
  const radians = rotation * Math.PI / 180;
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  const edge = Math.max(2987 * Math.abs(cosine) + 7755 * Math.abs(sine), 2987 * Math.abs(sine) + 7755 * Math.abs(cosine)) * zoom / 100;
  const x = (.58 - .5) * edge, y = (.30 - .5) * edge;
  return [1506.5 + offsetX / 100 * 2987 + x * cosine - y * sine,
    4109.5 + offsetY / 100 * 7755 + x * sine + y * cosine];
}

function colorNear(actual, expected, tolerance, message) {
  assert.equal(actual[3], expected[3], `${message}: opacity`);
  assert.ok(actual.slice(0, 3).every((value, index) => Math.abs(value - expected[index]) <= tolerance),
    `${message}: ${actual} vs ${expected} (RGB tolerance ${tolerance})`);
}

async function settle(frame) {
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function setNumber(frame, key, value) {
  const field = frame.locator(`#adjust-${key}-value`);
  await field.fill(String(value));
  await field.press('Enter');
  await settle(frame);
  assert.equal(Number(await field.inputValue()), value);
}

async function samplePreview(frame, points) {
  return frame.locator('#preview').evaluate((canvas, points) => {
    const context = canvas.getContext('2d');
    return points.map(([x, y]) => {
      const px = Math.floor(x / 6000 * canvas.width), py = Math.floor(y / 8000 * canvas.height);
      return { color: [...context.getImageData(px, py, 1, 1).data],
        // Read the export at the same preview-pixel center, avoiding a systematic
        // half-preview-pixel offset in the soft brush edge comparison.
        center: [(px + .5) / canvas.width * 6000, (py + .5) / canvas.height * 8000] };
    });
  }, points);
}

async function templateSamples(frame, points) {
  return frame.evaluate(async points => {
    const bitmap = await createImageBitmap(await (await fetch('./assets/template-fixed.png')).blob());
    const canvas = document.createElement('canvas'); canvas.width = points.length; canvas.height = 1;
    const context = canvas.getContext('2d');
    points.forEach(([x, y], index) => context.drawImage(bitmap, Math.floor(x), Math.floor(y), 1, 1, index, 0, 1, 1));
    const colors = points.map((_, index) => [...context.getImageData(index, 0, 1, 1).data]);
    bitmap.close(); canvas.width = canvas.height = 0;
    return colors;
  }, points);
}

test('真实涂抹随原片标记移动、缩放、旋转，6K成图与预览一致且固定模板不变', { timeout: 90000 }, async t => {
  if (!available) { t.skip('需本机 Chrome 和 Playwright'); return; }
  const publicRoot = resolve('public');
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/brush-test-host.html') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;height:100dvh;overflow:hidden"><iframe id="editor" src="/makeover/index.html?embed=1" style="display:block;border:0;width:100%;height:100%"></iframe></body></html>');
      return;
    }
    const path = resolve(publicRoot, '.' + decodeURIComponent(pathname));
    if (!path.startsWith(publicRoot + '/')) { response.writeHead(403).end(); return; }
    try {
      const body = await readFile(path);
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(path)] ?? 'application/octet-stream');
      response.end(body);
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
    page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/brush-test-host.html`);
    const frame = await (await page.locator('#editor').elementHandle()).contentFrame();
    assert.ok(frame);
    const source = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 800;
      const context = canvas.getContext('2d');
      context.fillStyle = 'rgb(80,100,130)'; context.fillRect(0, 0, 800, 800);
      context.fillStyle = 'rgb(220,180,80)'; context.fillRect(424, 200, 80, 80);
      return canvas.toDataURL().split(',')[1];
    });
    for (const side of [0, 1]) await frame.locator(`#photo-${side}`).setInputFiles({
      name: `source-marker-${side}.png`, mimeType: 'image/png', buffer: Buffer.from(source, 'base64'),
    });
    await frame.waitForFunction(() => !document.querySelector('#export-png').disabled);
    await clickInFrame(frame.page(), frame, '[data-photo-target="0"]');
    await setNumber(frame, 'shade', 80);
    const details = frame.locator('.brush-settings');
    if (!await details.evaluate(element => element.open)) await clickInFrame(frame.page(), frame, details.locator('summary'));
    for (const [key, value] of [['size', 70], ['feather', 35], ['strength', 100]]) {
      const field = frame.locator(`#brush-${key}-value`);
      await field.fill(String(value)); await field.press('Enter');
    }
    await clickInFrame(frame.page(), frame, '#brush-toggle');
    const initial = markerPosition();
    const initialEdge = [initial[0] + 230, initial[1]];
    const [initialBefore, initialEdgeBefore] = await samplePreview(frame, [initial, initialEdge]);
    const rect = await frameBoundingBox(frame, '#preview');
    assert.ok(rect);
    await page.mouse.click(rect.x + initial[0] / POSTER.width * rect.width, rect.y + initial[1] / POSTER.height * rect.height);
    await settle(frame);
    assert.equal(await frame.locator('#brush-undo').isDisabled(), false, '真实鼠标落笔应留下可撤销的笔迹');
    const [initialAfter, initialEdgeAfter] = await samplePreview(frame, [initial, initialEdge]);
    colorNear(initialAfter.color, MARKER, 2, '初始笔迹应在源图金色标记上擦除额外压暗');
    const initialEdgeLift = initialEdgeAfter.color[0] - initialEdgeBefore.color[0];
    assert.ok(initialEdgeLift < 10, '230px探针应位于初始笔迹的羽化外侧');
    assert.ok(initialBefore.color[0] < 60, '未涂抹的标记必须已被额外压暗');
    await clickInFrame(frame.page(), frame, '#brush-toggle');

    const previousLocations = [initial];
    const stages = [
      { label: '移动', settings: { offsetX: -40, offsetY: 0 } },
      { label: '缩放', settings: { zoom: 150, offsetX: -25, offsetY: -5 } },
      { label: '旋转', settings: { zoom: 150, rotation: -20, offsetX: -25, offsetY: -5 } },
    ];
    for (const { label, settings } of stages) {
      for (const [key, value] of Object.entries(settings)) await setNumber(frame, key, value);
      const current = markerPosition(settings);
      assert.ok(previousLocations.every(point => Math.hypot(point[0] - current[0], point[1] - current[1]) > 500), `${label}必须把标记移出旧笔迹半径`);
      await clickInFrame(frame.page(), frame, '#brush-before'); await settle(frame);
      const growthProbe = [current[0] + 230, current[1]];
      const before = await samplePreview(frame, [current, ...previousLocations, growthProbe]);
      await clickInFrame(frame.page(), frame, '#brush-after'); await settle(frame);
      const after = await samplePreview(frame, [current, ...previousLocations, growthProbe]);
      colorNear(after[0].color, MARKER, 2, `${label}后的真实笔迹必须跟随同一个源图金色标记`);
      assert.ok(after[0].color[0] > before[0].color[0] + 100, `${label}后的真实像素应擦除额外压暗`);
      previousLocations.forEach((_, index) => colorNear(after[index + 1].color, before[index + 1].color, 2, `${label}后旧画布位置不得残留提亮`));
      if (label === '缩放') assert.ok(after.at(-1).color[0] - before.at(-1).color[0] > initialEdgeLift + 25,
        '放大原片必须同时放大真实笔迹，固定230px探针应进入扩大的羽化范围');
      previousLocations.push(current);
    }

    const current = previousLocations.at(-1);
    // The full center, soft transition, and untouched shade are all compared.
    // Only the shade mask is resampled between 900px preview and 6000px output;
    // these soft-edge RGB checks allow 8 bytes, while template checks are exact.
    const offsets = [-400, -300, -240, -200, -160, -120, -60, 0, 60, 120, 160, 200, 240, 300, 400];
    const profilePoints = offsets.map(offset => [current[0] + offset, current[1]]);
    const preview = await samplePreview(frame, profilePoints);
    const fixed = [[1500, 120], [3000, 120], [4500, 120]];
    const template = await templateSamples(frame, [...previousLocations, ...profilePoints, ...fixed]);
    assert.ok(template.slice(0, previousLocations.length + profilePoints.length).every(color => color[3] === 0), '源图及笔迹取样必须位于模板完全透明的区域');
    const fixedColors = template.slice(-fixed.length);
    assert.ok(fixedColors.every(color => color[3] === 255), '固定标题取样必须来自完全不透明的原模板');
    assert.ok(preview.some(({ color }) => color[0] > 60 && color[0] < 200), '最终取样应覆盖真实羽化边缘');

    // Comparison is a preview aid; exporting while it is selected must still
    // contain the completed, source-anchored brush effect.
    await clickInFrame(frame.page(), frame, '#brush-before'); await settle(frame);
    // Exercise the download fallback without opening an OS save dialog.
    await frame.evaluate(() => { window.showSaveFilePicker = undefined; });
    await clickInFrame(frame.page(), frame, '#export-png');
    await frame.locator('#download-result').waitFor({ state: 'visible' });
    const exported = await frame.locator('#download-link').evaluate(async (link, points) => {
      const bitmap = await createImageBitmap(await (await fetch(link.href)).blob());
      const canvas = document.createElement('canvas'); canvas.width = points.length; canvas.height = 1;
      const context = canvas.getContext('2d');
      points.forEach(([x, y], index) => context.drawImage(bitmap, Math.floor(x), Math.floor(y), 1, 1, index, 0, 1, 1));
      const result = { width: bitmap.width, height: bitmap.height,
        colors: points.map((_, index) => [...context.getImageData(index, 0, 1, 1).data]) };
      bitmap.close(); canvas.width = canvas.height = 0;
      return result;
    }, [...preview.map(sample => sample.center), ...fixed]);
    assert.deepEqual([exported.width, exported.height], [6000, 8000], '必须导出完整原尺寸成图');
    preview.forEach(({ color }, index) => colorNear(exported.colors[index], color, 8, `6K成图与预览的涂抹轮廓一致 (${offsets[index]}px)`));
    colorNear(exported.colors[offsets.indexOf(0)], MARKER, 2, '对比前视图不得进入最终导出');
    assert.deepEqual(exported.colors.slice(-fixed.length), fixedColors, '导出时所有照片操作和涂抹不得改写固定PNG的RGB');
    assert.deepEqual(errors, [], '实际涂抹、构图和导出不得出现页面异常');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
