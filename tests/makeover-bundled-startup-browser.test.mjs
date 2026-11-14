import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';
import { clickInFrame } from './helpers/makeover-browser-geometry.mjs';

const webkit = process.env.NBO_TEST_WEBKIT_MODULE
  ? (await import(pathToFileURL(resolve(process.env.NBO_TEST_WEBKIT_MODULE)).href)).webkit : null;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

async function withBundledEditor(t, run, publicEntry = false) {
  if (!webkit && !available) return t.skip('需 Chrome/Playwright 或 WebKit');
  const root = resolve('.');
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + '/')) return response.writeHead(403).end();
    try {
      const bytes = await readFile(file);
      response.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' })[extname(file)] || 'application/octet-stream');
      response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    browser = await (webkit ?? chromium).launch(webkit ? { headless: true } : { executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', userAgent: IPHONE_UA });
    await context.addInitScript(() => {
      localStorage.setItem('nbo_cover_access_until', String(Date.now() + 1000000));
      window.bundledStartup = { shares: [], failedCanvases: [], embeddedImages: [], blockedImages: [] };
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        if (this.width > 4096 || this.height > 4096 || this.width * this.height > 4_000_000) {
          window.bundledStartup.failedCanvases.push([this.width, this.height]);
          return null;
        }
        return original.apply(this, args);
      };
      // Canvas limits alone miss decoded PNG memory: the old mobile preview
      // decoded two 6.2MP PNGs, then export decoded two more 48MP PNGs. Model
      // a conservative per-image memory budget before invoking native decode.
      const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      if (!source.set.bundledPngBudget) {
        const setSource = function (value) {
          const prefix = 'data:image/png;base64,';
          if (typeof value === 'string' && value.startsWith(prefix)) {
            const bytes = Uint8Array.from(atob(value.slice(prefix.length, prefix.length + 64)), char => char.charCodeAt(0));
            const header = new DataView(bytes.buffer);
            const size = { width: header.getUint32(16), height: header.getUint32(20) };
            size.area = size.width * size.height;
            window.bundledStartup.embeddedImages.push(size);
            if (size.area > 4_200_000 || size.width > 8192 || size.height > 8192) {
              window.bundledStartup.blockedImages.push(size);
              queueMicrotask(() => this.dispatchEvent(new Event('error')));
              return;
            }
          }
          source.set.call(this, value);
        };
        setSource.bundledPngBudget = true;
        Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set: setSource });
      }
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: data => data.files?.length === 1 && data.files[0] instanceof File && data.files[0].size > 0 });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ files }) => {
        window.bundledStartup.shares.push({ active: navigator.userActivation.isActive, name: files[0].name, type: files[0].type, size: files[0].size });
      } });
    });
    const subordinateRequests = [], errors = [];
    // One slow/missing JPEG module formerly prevented even the first preview.
    // The delivered editor must not request any stylesheet/module at all.
    await context.route(/\/makeover\/[^?#]+\.(?:m?js|css)(?:[?#]|$)/, route => {
      subordinateRequests.push(route.request().url());
      return route.abort('failed');
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    if (publicEntry) await page.route('**/__bundle-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><iframe id="makeoverFrame" style="border:0;width:100%;height:1800px" src="/public/makeover/editor.html?embed=1"></iframe>' }));
    await page.goto(publicEntry ? base + '/__bundle-fixture' : base + '/docs/cover.html?mode=makeover', { waitUntil: 'domcontentloaded' });
    const iframe = await page.waitForSelector('#makeoverFrame');
    const frame = await iframe.contentFrame(); assert.ok(frame);
    try {
      await frame.waitForFunction(() => document.querySelector('#status')?.textContent.startsWith('请选择'), undefined, { timeout: 8000 });
    } catch {
      const state = await frame.evaluate(() => ({ status: document.querySelector('#status')?.textContent, embedded: document.documentElement.classList.contains('is-embedded'), blockedImages: window.bundledStartup.blockedImages }));
      assert.fail(`制作台不能等待外部 CSS/JS，必须及时初始化：${JSON.stringify({ state, subordinateRequests })}`);
    }
    const identity = await frame.evaluate(() => ({
      embedded: document.documentElement.classList.contains('is-embedded'),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      header: getComputedStyle(document.querySelector('.page-header')).display,
      labels: [...document.querySelectorAll('.export-buttons button')].map(button => button.textContent),
    }));
    assert.deepEqual(identity, { embedded: true, accent: '#ff2442', header: 'none', labels: ['手机 PNG', '手机 JPG'] });
    assert.deepEqual(subordinateRequests, [], '初始化不依赖任何分开的 CSS/JS 模块请求');
    const html = await readFile(publicEntry ? 'public/makeover/editor.html' : 'docs/makeover/index.html', 'utf8');
    assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
    assert.doesNotMatch(html, /<link\b[^>]*rel=["']stylesheet["']/i);
    assert.match(html, /id="status"[^>]*>正在启动制作台…</, '应用入口尚未运行时，不得误报模板加载状态');
    await run(page, frame);
    assert.deepEqual(await frame.evaluate(() => window.bundledStartup.failedCanvases), [], '手机启动和导出不得分配超限画布');
    const images = await frame.evaluate(() => window.bundledStartup.embeddedImages);
    assert.ok(images.length > 0, '必须实际解码内置原PSD图层');
    assert.ok(images.every(image => image.area <= 4_200_000 && image.width <= 8192 && image.height <= 8192), JSON.stringify(images));
    assert.ok(images.reduce((sum, image) => sum + image.area, 0) <= 5_000_000,
      `启动及两次导出必须共享模板，不能重复解码大PNG：${JSON.stringify(images)}`);
    assert.deepEqual(await frame.evaluate(() => window.bundledStartup.blockedImages), []);
    assert.deepEqual(subordinateRequests, []);
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); await new Promise(done => server.close(done)); }
}

test('托管单HTML不等待任何CSS/JS子请求，手机可导入并保存6K PNG/JPG', { timeout: 90000 }, async t => {
  await withBundledEditor(t, async (page, frame) => {
    const base64 = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 180;
      const context = canvas.getContext('2d'); context.fillStyle = '#789abc'; context.fillRect(0, 0, 120, 180);
      return canvas.toDataURL().split(',')[1];
    });
    for (const side of [0, 1]) await frame.locator(`#photo-${side}`).setInputFiles({ name: '完整启动验证.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
    await frame.waitForFunction(() => !document.querySelector('#export-png').disabled);
    for (const format of ['png', 'jpg']) {
      await clickInFrame(page, frame, '#export-' + format);
      await frame.locator('#mobile-save-preview').waitFor({ state: 'visible', timeout: 45000 });
      const asset = await frame.locator('#mobile-save-image').evaluate(async image => {
        await image.decode();
        const blob = await (await fetch(image.currentSrc || image.src)).blob();
        return { width: image.naturalWidth, height: image.naturalHeight, type: blob.type, size: blob.size };
      });
      assert.deepEqual([asset.width, asset.height], [6000, 8000]);
      assert.equal(asset.type, format === 'png' ? 'image/png' : 'image/jpeg'); assert.ok(asset.size > 0);
      await clickInFrame(page, frame, '#mobile-share');
      const share = await frame.evaluate(() => window.bundledStartup.shares.at(-1));
      assert.equal(share.active, true); assert.equal(share.type, asset.type); assert.equal(share.size, asset.size);
      assert.match(share.name, new RegExp('^南铂素人改造_\\d{8}_\\d{6}_\\d{3}\\.' + format + '$'));
      await clickInFrame(page, frame, '#mobile-save-close');
    }
  });
});

test('React使用的public单HTML入口同样不依赖模块并立即进入手机嵌入布局', { timeout: 20000 }, async t => {
  await withBundledEditor(t, async () => {}, true);
});
