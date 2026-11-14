import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';

const webkit = process.env.NBO_TEST_WEBKIT_MODULE
  ? (await import(pathToFileURL(resolve(process.env.NBO_TEST_WEBKIT_MODULE)).href)).webkit : null;

test('紧凑模板记录原PSD来源哈希，图集解码面积有界且片段均在图内', async () => {
  const manifest = JSON.parse(await readFile('public/makeover/assets/template-atlas.json', 'utf8'));
  const png = await readFile('public/makeover/assets/template-atlas.png');
  assert.equal(createHash('sha256').update(png).digest('hex'), manifest.atlas.sha256);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [manifest.atlas.width, manifest.atlas.height]);
  assert.ok(manifest.atlas.width * manifest.atlas.height <= 5_000_000, '不能把两张48MP模板换成另一张巨大图片');
  for (const name of ['fixed', 'gradient']) {
    const original = await readFile(`public/makeover/assets/template-${name}.png`);
    assert.equal(createHash('sha256').update(original).digest('hex'), manifest.originals[name]);
    for (const patch of manifest.layers[name]) {
      const [x, y, width, height] = patch.source;
      assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= manifest.atlas.width && y + height <= manifest.atlas.height);
    }
  }
});

async function withPage(t, run) {
  if (!webkit && !available) return t.skip('需Chrome/Playwright 或 WebKit');
  const server = await createServer({ root: resolve('.'), configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen(); browser = await (webkit ?? chromium).launch(webkit ? { headless: true } : { executablePath, headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/public/makeover/index.html`);
    await run(page);
  } finally { await browser?.close(); await server.close(); }
}

test('原始6000×8000模板所有可见RGBA像素通过有界画布逐块重建', { timeout: 90000 }, async t => {
  await withPage(t, async page => {
    const results = await page.evaluate(async () => {
      const { loadTemplateLayers, drawTemplateLayer } = await import('./template-layers.mjs');
      const decode = source => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
      const manifest = await (await fetch('./assets/template-atlas.json')).json();
      const layers = await loadTemplateLayers({ atlas: './assets/template-atlas.png', 'atlas-manifest': manifest }, decode);
      const output = [];
      for (const name of ['fixed', 'gradient']) {
        const original = await decode(`./assets/template-${name}.png`);
        const canvases = [document.createElement('canvas'), document.createElement('canvas')];
        for (const canvas of canvases) { canvas.width = 1000; canvas.height = 256; }
        const contexts = canvases.map(canvas => canvas.getContext('2d', { willReadFrequently: true }));
        let bad = 0, maxDelta = 0, pixels = 0;
        for (let y = 0; y < 8000; y += 256) for (let x = 0; x < 6000; x += 1000) {
          const width = Math.min(1000, 6000 - x), height = Math.min(256, 8000 - y);
          for (const context of contexts) { context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, 1000, 256); context.translate(-x, -y); context.imageSmoothingEnabled = false; }
          contexts[0].drawImage(original, 0, 0);
          drawTemplateLayer(contexts[1], layers[name]);
          const a = contexts[0].getImageData(0, 0, width, height).data, b = contexts[1].getImageData(0, 0, width, height).data;
          for (let i = 0; i < a.length; i++) { const delta = Math.abs(a[i] - b[i]); if (delta) bad++; maxDelta = Math.max(maxDelta, delta); }
          pixels += width * height;
        }
        original.src = 'data:,';
        output.push({ name, bad, maxDelta, pixels });
      }
      return output;
    });
    for (const result of results) {
      assert.equal(result.pixels, 48_000_000);
      assert.equal(result.bad, 0, JSON.stringify(results));
    }
  });
});

// Scaling a 48MP source and scaling sparse cropped sources may select different
// browser image filters at outside edges. Native pixels remain an exact golden
// above; these tests separately verify original artwork interiors, real preview
// structure, and the actual 2048×512 export seam neighborhoods.
test('原PSD模板带小数放大偏移的内部内容保持原像素采样', { timeout: 60000 }, async t => {
  await withPage(t, async page => {
    const results = await page.evaluate(async () => {
      const { loadTemplateLayers, drawTemplateLayer } = await import('./template-layers.mjs');
      const decode = source => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
      const manifest = await (await fetch('./assets/template-atlas.json')).json();
      const layers = await loadTemplateLayers({ atlas: './assets/template-atlas.png', 'atlas-manifest': manifest }, decode);
      const originals = {};
      for (const name of ['fixed', 'gradient']) originals[name] = await decode(`./assets/template-${name}.png`);
      const results = [];
      for (const scenario of [{ width: 1173, height: 277, scale: 1.125, x: 2049.25, y: 511.5 }, { width: 1173, height: 277, scale: 1.125, x: 511.5, y: 6000.25 }, { width: 1537, height: 273, scale: 1.032, x: 2341.25, y: 6200.5 }]) {
        const canvases = [document.createElement('canvas'), document.createElement('canvas')];
        for (const canvas of canvases) { canvas.width = scenario.width; canvas.height = scenario.height; }
        const contexts = canvases.map(canvas => canvas.getContext('2d', { willReadFrequently: true }));
        for (let i = 0; i < 2; i++) {
          const context = contexts[i]; context.fillStyle = '#c4b49e'; context.fillRect(0, 0, scenario.width, scenario.height);
          context.translate(-scenario.x, -scenario.y); context.scale(scenario.scale, scenario.scale);
          context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
          for (const name of ['gradient', 'fixed']) if (i) drawTemplateLayer(context, layers[name]); else context.drawImage(originals[name], 0, 0);
        }
        const a = contexts[0].getImageData(0, 0, scenario.width, scenario.height).data, b = contexts[1].getImageData(0, 0, scenario.width, scenario.height).data;
        let bad = 0, maxDelta = 0;
        for (let i = 0; i < a.length; i++) { const delta = Math.abs(a[i] - b[i]); if (delta) bad++; maxDelta = Math.max(maxDelta, delta); }
        results.push({ ...scenario, bad, maxDelta });
      }
      return results;
    });
    assert.ok(results.every(result => result.bad === 0), JSON.stringify(results));
  });
});

test('900×1200实际预览保留标题、期数、水印、前后标签和完整渐变', { timeout: 60000 }, async t => {
  await withPage(t, async page => {
    const result = await page.evaluate(async () => {
      const { loadTemplateLayers, drawTemplateLayer } = await import('./template-layers.mjs');
      let decodes = 0;
      const decode = source => new Promise((resolve, reject) => { decodes++; const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
      const manifest = await (await fetch('./assets/template-atlas.json')).json();
      const layers = await loadTemplateLayers({ atlas: './assets/template-atlas.png', 'atlas-manifest': manifest }, decode);
      const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 1200;
      const context = canvas.getContext('2d', { willReadFrequently: true }); context.scale(.15, .15);
      context.imageSmoothingQuality = 'high'; drawTemplateLayer(context, layers.fixed);
      const areas = { header: [50, 0, 800, 34], issue: [800, 50, 75, 40], watermark: [300, 775, 300, 75], before: [140, 997, 175, 43], after: [590, 997, 175, 43] };
      const coverage = {};
      for (const [name, rect] of Object.entries(areas)) {
        const pixels = context.getImageData(...rect).data;
        let alphaPixels = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) alphaPixels++;
        coverage[name] = alphaPixels;
      }
      context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, 900, 1200); context.scale(.15, .15);
      drawTemplateLayer(context, layers.gradient);
      const gradient = [300, 600, 900, 1100].map(y => context.getImageData(450, y, 1, 1).data[3]);
      return { decodes, sharesImage: layers.fixed.image === layers.gradient.image, coverage, gradient };
    });
    assert.equal(result.decodes, 1); assert.equal(result.sharesImage, true);
    assert.ok(Object.values(result.coverage).every(count => count > 50), JSON.stringify(result));
    assert.ok(result.gradient.every((alpha, i, values) => i === 0 || alpha >= values[i - 1]), JSON.stringify(result));
    assert.ok(result.gradient.at(-1) > 245, JSON.stringify(result));
  });
});

test('实际2048×512导出分块与整块绘制在接缝邻域连续，无丢块', { timeout: 60000 }, async t => {
  await withPage(t, async page => {
    const results = await page.evaluate(async () => {
      const { loadTemplateLayers, drawTemplateLayer } = await import('./template-layers.mjs');
      const decode = source => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source; });
      const manifest = await (await fetch('./assets/template-atlas.json')).json();
      const layers = await loadTemplateLayers({ atlas: './assets/template-atlas.png', 'atlas-manifest': manifest }, decode);
      const results = [];
      // Row origins match the real encoder's 512-output-pixel batches.
      for (const scenario of [{ scale: 1, y: 0 }, { scale: 1.032, y: 0 }, { scale: 1.125, y: 0 }, { scale: 1.032, y: 5632 }, { scale: 1.125, y: 5632 }]) {
        const width = 4213, height = 1031;
        const canvases = [document.createElement('canvas'), document.createElement('canvas')];
        for (const canvas of canvases) { canvas.width = width; canvas.height = height; }
        const contexts = canvases.map(canvas => canvas.getContext('2d', { willReadFrequently: true }));
        const paint = (context, x, y) => {
          context.fillStyle = '#c4b49e'; context.fillRect(0, 0, context.canvas.width, context.canvas.height);
          context.translate(-x, -y); context.scale(scenario.scale, scenario.scale); context.imageSmoothingQuality = 'high';
          for (const name of ['gradient', 'fixed']) drawTemplateLayer(context, layers[name]);
        };
        paint(contexts[0], 0, scenario.y);
        for (let y = 0; y < height; y += 512) for (let x = 0; x < width; x += 2048) {
          const columns = Math.min(2048, width - x), rows = Math.min(512, height - y);
          const tile = document.createElement('canvas'); tile.width = 2052; tile.height = 516;
          const context = tile.getContext('2d', { willReadFrequently: true }); paint(context, x - 2, scenario.y + y - 2);
          contexts[1].drawImage(tile, 2, 2, columns, rows, x, y, columns, rows); tile.width = tile.height = 0;
        }
        const a = contexts[0].getImageData(0, 0, width, height).data, b = contexts[1].getImageData(0, 0, width, height).data;
        let seamBad = 0, seamMaxDelta = 0, allBad = 0, allMaxDelta = 0, alphaBad = 0;
        const nearSeam = (x, y) => [2048, 4096].some(boundary => Math.abs(x - boundary) <= 2) || [512, 1024].some(boundary => Math.abs(y - boundary) <= 2);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let channel = 0; channel < 4; channel++) {
          const i = (y * width + x) * 4 + channel, delta = Math.abs(a[i] - b[i]);
          if (delta > 1) allBad++; allMaxDelta = Math.max(allMaxDelta, delta);
          if (channel === 3 && delta) alphaBad++;
          if (nearSeam(x, y)) { if (delta > 1) seamBad++; seamMaxDelta = Math.max(seamMaxDelta, delta); }
        }
        results.push({ ...scenario, seamBad, seamMaxDelta, allBad, allMaxDelta, alphaBad });
      }
      return results;
    });
    assert.ok(results.every(result => result.seamMaxDelta <= 1 && result.alphaBad === 0), JSON.stringify(results));
    assert.equal(results[0].allBad, 0, JSON.stringify(results));
    assert.equal(results[1].allBad, 0, JSON.stringify(results));
  });
});
