import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { pathToFileURL } from 'node:url';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';

const webkit = process.env.NBO_TEST_WEBKIT_MODULE ? (await import(pathToFileURL(resolve(process.env.NBO_TEST_WEBKIT_MODULE)).href)).webkit : null;

async function withPage(t, run, mobile = false) {
  if (!webkit && !available) return t.skip('需Chrome/Playwright');
  const server = await createServer({ root: resolve('.'), configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen(); browser = await (webkit ?? chromium).launch(webkit ? { headless: true } : { executablePath, headless: true });
    const page = await browser.newPage(mobile ? { viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } : {});
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/public/makeover/index.html`);
    await run(page);
  } finally { await browser?.close(); await server.close(); }
}

for (const format of ['png', 'jpg']) {
  test(`${format} 手机读回暂时空白时恢复缺失块，完整保存左右和上下全部像素`, { timeout: 60000 }, async t => {
    await withPage(t, async page => {
      const result = await page.evaluate(async format => {
        const { createStripExport } = await import('./strip-export.mjs');
        const width = 4200, height = 1152, get = CanvasRenderingContext2D.prototype.getImageData;
        let fault = false, key, missing = 0, attempts = 0; const failed = new Set();
        CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
          if (fault && missing < 3 && !failed.has(key)) { failed.add(key); missing++; return new ImageData(w, h); }
          return get.call(this, x, y, w, h);
        };
        let asset;
        try {
          asset = await createStripExport({ format, width, height, opaque: true, checkCurrent() {}, render(canvas, region) {
            attempts++; key = `${region.x}:${region.y}`; fault = (region.y < 0 && region.x > 2000) || (region.y >= 510 && region.y < 1020);
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#789abc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          } });
        } finally { CanvasRenderingContext2D.prototype.getImageData = get; }
        const image = await createImageBitmap(asset.blob), canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); image.close();
        const pixels = ctx.getImageData(0, 0, width, height).data;
        let bad = 0;
        for (let p = 0; p < pixels.length; p += 4) if (Math.abs(pixels[p] - 120) > 2 || Math.abs(pixels[p + 1] - 154) > 2 || Math.abs(pixels[p + 2] - 188) > 2 || pixels[p + 3] !== 255) bad++;
        return { bad, missing, attempts, width: asset.width, height: asset.height, type: asset.blob.type };
      }, format);
      assert.equal(result.missing, 3, '必须触发真实读回故障');
      assert.equal(result.bad, 0, '任何黑块、透明块或缺行均不得保存');
      assert.deepEqual([result.width, result.height], [4200, 1152]);
      assert.equal(result.type, format === 'png' ? 'image/png' : 'image/jpeg');
    });
  });
  test(`${format} 手机持续读回空白时明确报错，不能把残缺成图当作成功`, { timeout: 30000 }, async t => {
    await withPage(t, async page => {
      const result = await page.evaluate(async format => {
        const { createStripExport } = await import('./strip-export.mjs');
        const get = CanvasRenderingContext2D.prototype.getImageData; let reads = 0;
        CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) { reads++; return new ImageData(w, h); };
        try {
          const asset = await createStripExport({ format, width: 120, height: 128, opaque: true, checkCurrent() {}, render(canvas) {
            const ctx = canvas.getContext('2d'); ctx.fillStyle = '#789abc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          } });
          return { saved: Boolean(asset.blob), reads };
        } catch (error) { return { error: error.message, reads }; }
        finally { CanvasRenderingContext2D.prototype.getImageData = get; }
      }, format);
      assert.match(result.error || '', /分块.*读取失败/);
      assert.equal(result.reads, 3, '失败重试必须有上限');
      assert.notEqual(result.saved, true);
    });
  });
}


test('手机页面持续丢块时PNG/JPG均保留中文错误，不显示残缺保存图片', { timeout: 60000 }, async t => {
  await withPage(t, async page => {
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 100; c.height = 160; c.getContext('2d').fillRect(0, 0, 100, 160); return c.toDataURL().split(',')[1]; });
    for (const side of [0, 1]) await page.locator('#photo-' + side).setInputFiles({ name: '故障验证.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => !document.querySelector('#export-jpg').disabled);
    await page.evaluate(() => {
      const get = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h) {
        if (this.canvas.width > 1800 && this.canvas.height <= 516) return new ImageData(w, h);
        return get.call(this, x, y, w, h);
      };
    });
    for (const format of ['png', 'jpg']) {
      await page.locator('#export-' + format).click();
      await page.waitForFunction(() => document.querySelector('#status').classList.contains('error') && !document.querySelector('#export-jpg').disabled);
      assert.match(await page.locator('#status').textContent(), /分块.*读取失败/);
      assert.equal(await page.locator('#mobile-save-preview').isVisible(), false);
      assert.equal(await page.locator('#download-result').isVisible(), false);
    }
  }, true);
});
