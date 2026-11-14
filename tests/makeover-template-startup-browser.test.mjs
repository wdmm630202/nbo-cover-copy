import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';
import { clickInFrame } from './helpers/makeover-browser-geometry.mjs';

// A missing/slow independent template request must not strand the editor before
// photo import or make a later full-resolution export require another download.
test('模板图片网址全部失败时，手机首次打开仍能就绪并可断网导出原PSD成图', { timeout: 120000 }, async t => {
  if (!available) return t.skip('需Chrome/Playwright');
  const server = await createServer({ root: resolve('.'), configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen(); browser = await chromium.launch({ executablePath, headless: true });
    const context = await browser.newContext({ viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true, serviceWorkers: 'block',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
    await context.addInitScript(() => localStorage.setItem('nbo_cover_access_until', String(Date.now() + 1000000)));
    const page = await context.newPage(), requested = [];
    await page.route(/\/makeover\/assets\/template-[^/]+\.png/, route => { requested.push(route.request().url()); return route.abort('failed'); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/docs/cover.html?mode=makeover`);
    const frame = await (await page.locator('#makeoverFrame').elementHandle()).contentFrame();
    await frame.waitForFunction(() => /请选择|加载失败/.test(document.querySelector('#status').textContent), undefined, { timeout: 5000 });
    assert.match(await frame.locator('#status').textContent(), /^请选择/, '模板外链失败也不能阻止编辑器就绪');
    assert.deepEqual(requested, [], '打开和导出都应使用随页面内置的原PSD资源');
    const sources = await frame.locator('#template-assets').evaluate(element => JSON.parse(element.textContent));
    for (const name of ['fixed', 'gradient', 'fixed-mobile', 'gradient-mobile', 'note']) {
      const bytes = Buffer.from(sources[name].split(',')[1], 'base64');
      const original = await readFile(`public/makeover/assets/template-${name}.png`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), createHash('sha256').update(original).digest('hex'), `${name}必须是原PSD导出的原文件字节`);
    }
    const data = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 180;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#789abc'; ctx.fillRect(0, 0, 120, 180);
      return canvas.toDataURL().split(',')[1];
    });
    for (const side of [0, 1]) await frame.locator(`#photo-${side}`).setInputFiles({ name: '本机原片.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
    await frame.waitForFunction(() => !document.querySelector('#export-png').disabled);
    await context.setOffline(true);
    for (const format of ['png', 'jpg']) {
      await clickInFrame(page, frame, `#export-${format}`);
      await frame.locator('#mobile-save-preview').waitFor({ state: 'visible', timeout: 30000 });
      const result = await frame.locator('#mobile-save-image').evaluate(async image => {
        await image.decode();
        // Inspect the actual decoded save image; a second full-size bitmap would
        // duplicate 192MB of pixels and distort this startup/network regression.
        const blob = await (await fetch(image.src)).blob();
        return { width: image.naturalWidth, height: image.naturalHeight, type: blob.type, bytes: blob.size };
      });
      assert.deepEqual([result.width, result.height], [6000, 8000]);
      assert.equal(result.type, format === 'png' ? 'image/png' : 'image/jpeg'); assert.ok(result.bytes > 0);
      await clickInFrame(page, frame, '#mobile-save-close');
    }
    assert.deepEqual(requested, []);
  } finally { await browser?.close(); await server.close(); }
});

test('编辑器尚未载入时，不启动整套Live离线资源下载抢占手机带宽', { timeout: 20000 }, async t => {
  if (!available) return t.skip('需Chrome/Playwright');
  const server = await createServer({ root: resolve('.'), configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  let browser, release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    await server.listen(); browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('nbo_cover_access_until', String(Date.now() + 1000000));
      window.offlineRegistrations = 0;
      navigator.serviceWorker.register = () => { window.offlineRegistrations++; return new Promise(() => {}); };
    });
    await page.route(/\/makeover\/app\.js\?/, async route => { await gate; await route.continue(); });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/docs/cover.html?mode=makeover`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => document.readyState), 'interactive');
    assert.equal(await page.evaluate(() => window.offlineRegistrations), 0, '不要在编辑器仍下载时抢占带宽缓存41MB Live素材');
    release();
    await page.waitForLoadState('load');
    await page.waitForFunction(() => window.offlineRegistrations === 1);
  } finally { release(); await browser?.close(); await server.close(); }
});
