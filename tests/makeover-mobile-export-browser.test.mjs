import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';
import { clickInFrame } from './helpers/makeover-browser-geometry.mjs';

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function withIPhone(t, run, { sharing = true } = {}) {
  if (!available) { t.skip('需本机 Chrome 和 Playwright'); return; }
  const vite = await createServer({ root: resolve('.'), configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await vite.listen();
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA,
      isMobile: true, hasTouch: true, deviceScaleFactor: 1,
      reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    page.setDefaultTimeout(10000);
    const events = { downloads: 0, popups: 0, errors: [], templates: [] };
    page.on('download', () => { events.downloads += 1; });
    page.on('popup', popup => { events.popups += 1; void popup.close(); });
    page.on('pageerror', error => events.errors.push(error.message));
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (/\/template-(fixed|gradient)(-mobile)?\.png$/.test(path)) events.templates.push(path);
    });
    await page.addInitScript(({ sharing }) => {
      localStorage.setItem('nbo_cover_access_until', String(Date.now() + 1000000));
      const state = window.__mobileExportTest = {
        encodes: [], failedCanvases: [], revoked: [], shares: [],
        shareOutcome: 'success', lastGesture: null,
      };
      // The iframe's initial Document can be replaced during navigation. The
      // Window capture listener still observes its final trusted click chain.
      window.addEventListener('click', event => {
        if (event.isTrusted) state.lastGesture = {
          target: event.target.closest('button, a')?.id || event.target.id,
          active: navigator.userActivation.isActive,
        };
      }, true);
      const revokeObjectURL = URL.revokeObjectURL;
      URL.revokeObjectURL = function (url) {
        state.revoked.push(url);
        return revokeObjectURL.call(this, url);
      };
      const getContext = HTMLCanvasElement.prototype.getContext;
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      const tooLarge = canvas => canvas.width > 4096 || canvas.height > 4096 || canvas.width * canvas.height > 16_777_216;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        if (tooLarge(this)) {
          state.failedCanvases.push({ operation: 'getContext', width: this.width, height: this.height });
          return null;
        }
        return getContext.apply(this, args);
      };
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        state.encodes.push({ width: this.width, height: this.height, type, quality: quality ?? null });
        if (tooLarge(this)) {
          state.failedCanvases.push({ operation: 'toBlob', width: this.width, height: this.height });
          setTimeout(() => callback(null));
          return;
        }
        return toBlob.call(this, callback, type, quality);
      };
      // The OS share sheet is external. Keep its real File input and trusted
      // browser activation observable while replacing only the OS handoff.
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: sharing ? data =>
        data.files?.length === 1 && data.files[0] instanceof File && data.files[0].size > 0 : undefined });
      Object.defineProperty(navigator, 'share', { configurable: true, value: sharing ? async data => {
        const call = {
          active: navigator.userActivation.isActive,
          gesture: state.lastGesture,
          files: (data.files || []).map(file => ({ isFile: file instanceof File, name: file.name, type: file.type, size: file.size })),
          outcome: state.shareOutcome,
        };
        state.shares.push(call);
        if (data.files?.[0]) {
          const bitmap = await createImageBitmap(data.files[0]);
          call.image = { width: bitmap.width, height: bitmap.height };
          bitmap.close();
        }
        if (call.outcome !== 'success') throw new DOMException('测试系统分享结果', call.outcome);
      } : undefined });
    }, { sharing });
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/docs/cover.html?mode=makeover`);
    const iframe = page.locator('#makeoverFrame');
    await iframe.waitFor({ state: 'visible' });
    const frame = await (await iframe.elementHandle()).contentFrame();
    assert.ok(frame, '同源素人改造编辑器必须实际载入');
    await frame.waitForFunction(() => {
      const status = document.querySelector('#status');
      return status && !status.textContent.includes('正在加载原版模板');
    });
    for (const [side, color] of [[0, '#d23c46'], [1, '#2864dc']]) {
      const base64 = await page.evaluate(color => {
        const canvas = document.createElement('canvas');
        canvas.width = 120; canvas.height = 180;
        const context = canvas.getContext('2d');
        context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      }, color);
      await frame.locator(`#photo-${side}`).setInputFiles({ name: `mobile-${side}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') });
    }
    await frame.waitForFunction(() => !document.querySelector('#export-png').disabled && !document.querySelector('#export-jpg').disabled);
    await run(page, frame, events);
  } finally {
    await browser?.close();
    await vite.close();
  }
}

async function exportMobile(page, frame, format, events) {
  const pageURL = page.url(), frameURL = frame.url();
  const previousShares = await frame.evaluate(() => window.__mobileExportTest.shares.length);
  await clickInFrame(page, frame, `#export-${format}`);
  await frame.waitForFunction(() => !document.querySelector('#export-png').disabled && !document.querySelector('#status').textContent.includes('正在生成'));
  const result = await frame.evaluate(() => ({ href: document.querySelector('#download-link').getAttribute('href'), status: document.querySelector('#status').textContent }));
  assert.ok(result.href?.startsWith('blob:'), `iPhone 画布限制下应成功生成 ${format} 成图：${JSON.stringify(result)}`);
  await frame.locator('#mobile-save-preview').waitFor({ state: 'visible' });
  await frame.locator('#mobile-save-image').waitFor({ state: 'visible' });
  const image = await frame.locator('#mobile-save-image').evaluate(async image => {
    await image.decode();
    const blob = await fetch(image.currentSrc || image.src).then(response => response.blob());
    const header = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
    const bitmap = await createImageBitmap(blob);
    const sample = document.createElement('canvas');
    sample.width = 2; sample.height = 1;
    const context = sample.getContext('2d');
    context.drawImage(bitmap, bitmap.width / 2 - 20, bitmap.height / 4, 1, 1, 0, 0, 1, 1);
    context.drawImage(bitmap, bitmap.width / 2 + 20, bitmap.height / 4, 1, 1, 1, 0, 1, 1);
    const pixels = [...context.getImageData(0, 0, 2, 1).data];
    const result = {
      tag: image.tagName, src: image.currentSrc || image.src,
      width: bitmap.width, height: bitmap.height, type: blob.type, bytes: blob.size,
      pngColorType: blob.type === 'image/png' ? header[25] : null,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, pixels,
      pointerEvents: getComputedStyle(image).pointerEvents,
      touchCallout: getComputedStyle(image).getPropertyValue('-webkit-touch-callout'),
      contextMenuAllowed: image.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    };
    bitmap.close();
    return result;
  });
  assert.equal(image.tag, 'IMG', '保存页必须呈现可长按的真实图片元素');
  assert.equal(image.src, result.href, '预览与备用下载应引用同一份成图');
  assert.deepEqual([image.width, image.height, image.naturalWidth, image.naturalHeight], [6000, 8000, 6000, 8000], '实际 Blob 与长按图片均应为 6000×8000');
  assert.equal(image.type, format === 'png' ? 'image/png' : 'image/jpeg');
  if (format === 'png') assert.equal(image.pngColorType, 2, '不透明成品用无损RGB编码，减少冗余alpha处理');
  assert.ok(image.bytes > 0, '成图不能是空 Blob');
  const expectedPixels = [210, 60, 70, 255, 40, 100, 220, 255];
  image.pixels.forEach((value, index) => assert.ok(Math.abs(value - expectedPixels[index]) <= (format === 'png' ? 0 : 12), `${format} 应包含实际导入的左右照片 ${JSON.stringify(image.pixels)}`));
  assert.notEqual(image.pointerEvents, 'none', '图片必须能接收长按');
  assert.notEqual(image.touchCallout, 'none', '不能禁用 iOS 图片长按菜单');
  assert.ok(image.contextMenuAllowed, '图片的保存菜单不能被页面阻止');
  const modal = await frame.locator('#mobile-save-preview').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { role: element.getAttribute('role'), x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  assert.equal(modal.role, 'dialog');
  assert.ok(Math.abs(modal.x) <= 1 && Math.abs(modal.y) <= 1 && Math.abs(modal.width - modal.viewportWidth) <= 2 && Math.abs(modal.height - modal.viewportHeight) <= 2,
    `保存预览必须在编辑页内全屏展示 ${JSON.stringify(modal)}`);
  const note = await frame.locator('#mobile-save-note').textContent();
  assert.match(note, /6000\s*[×xX*]\s*8000/, '保存说明必须写出实际成图尺寸');
  assert.match(note, /长按/, '系统分享不可用时仍应说明长按保存');
  assert.equal(await frame.locator('#open-image').getAttribute('href'), image.src);
  const state = await frame.evaluate(() => window.__mobileExportTest);
  assert.deepEqual(state.failedCanvases, [], '手机流程不能创建超过 Safari 上限的画布');
  assert.deepEqual(state.encodes, [], '手机分块编码不得调用整图toBlob');
  assert.equal(state.shares.length, previousShares, '异步生成后不能自动唤起系统分享');
  assert.deepEqual([...new Set(events.templates)].sort(), [
    '/docs/makeover/assets/template-fixed-mobile.png',
    '/docs/makeover/assets/template-gradient-mobile.png',
    '/docs/makeover/assets/template-fixed.png',
    '/docs/makeover/assets/template-gradient.png',
  ].sort(), '预览加载小模板，最终成品使用原版PSD模板');
  assert.equal(events.downloads, 0, '手机生成后不能自动触发下载');
  assert.equal(events.popups, 0, '手机生成后不能自动打开新页面');
  assert.deepEqual(events.errors, [], '手机生成不能出现未处理脚本错误');
  assert.equal(page.url(), pageURL, '成图应留在当前页面');
  assert.equal(frame.url(), frameURL, '成图应留在当前编辑器');
  return image.src;
}

async function shareMobile(page, frame, format, outcome = 'success') {
  const previous = await frame.evaluate(outcome => {
    window.__mobileExportTest.shareOutcome = outcome;
    return window.__mobileExportTest.shares.length;
  }, outcome);
  await clickInFrame(page, frame, '#mobile-share');
  await frame.waitForFunction(previous => window.__mobileExportTest.shares.length === previous + 1 && window.__mobileExportTest.shares.at(-1).image && !document.querySelector('#mobile-share').disabled, previous);
  const call = await frame.evaluate(() => window.__mobileExportTest.shares.at(-1));
  assert.ok(call.active && call.gesture?.active, `系统分享必须由新的真实点击提供用户激活 ${JSON.stringify(call)}`);
  assert.equal(call.gesture.target, 'mobile-share', '系统分享必须紧接保存弹层中的分享按钮点击');
  assert.equal(call.files.length, 1);
  assert.ok(call.files[0].isFile && call.files[0].size > 0, '系统分享必须携带可读取的真实 File');
  assert.ok(call.files[0].name.endsWith(`.${format}`));
  assert.equal(call.files[0].type, format === 'png' ? 'image/png' : 'image/jpeg');
  assert.deepEqual(call.image, { width: 6000, height: 8000 }, '系统分享应拿到实际导出的成图文件');
}

async function assertCleared(frame, url, label) {
  await frame.locator('#mobile-save-preview').waitFor({ state: 'hidden' });
  const state = await frame.evaluate(() => ({
    revoked: window.__mobileExportTest.revoked,
    image: document.querySelector('#mobile-save-image').getAttribute('src'),
    download: document.querySelector('#download-link').getAttribute('href'),
    open: document.querySelector('#open-image').getAttribute('href'),
  }));
  assert.ok(state.revoked.includes(url), `${label}应释放旧成图的 Blob URL`);
  assert.ok(!state.image && !state.download && !state.open, `${label}后不能继续保存已失效的成图 ${JSON.stringify(state)}`);
}

test('iPhone 在 Safari 画布上限内生成 PNG/JPG，同页长按并用新点击分享真实文件', { timeout: 60000 }, async t => {
  await withIPhone(t, async (page, frame, events) => {
    const pngURL = await exportMobile(page, frame, 'png', events);
    await shareMobile(page, frame, 'png');
    await clickInFrame(page, frame, '#mobile-save-close');
    await assertCleared(frame, pngURL, '关闭保存预览');

    const jpgURL = await exportMobile(page, frame, 'jpg', events);
    assert.notEqual(jpgURL, pngURL, '再次生成应使用新的成图 URL');
    await shareMobile(page, frame, 'jpg');
    await frame.locator('#split').evaluate(input => {
      input.value = '37.4';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await assertCleared(frame, jpgURL, '修改构图');
  });
});

test('iPhone 浏览器不支持系统分享时仍保留可长按保存的成图', { timeout: 60000 }, async t => {
  await withIPhone(t, async (page, frame, events) => {
    const url = await exportMobile(page, frame, 'png', events);
    const share = frame.locator('#mobile-share');
    assert.ok(!await share.isVisible() || await share.isDisabled(), '缺少系统分享能力时不能留下会失败的可用按钮');
    assert.equal(await frame.locator('#mobile-save-image').getAttribute('src'), url);
    await clickInFrame(page, frame, '#mobile-save-close');
    await assertCleared(frame, url, '关闭不支持分享的预览');
  }, { sharing: false });
});

test('iPhone 用户取消或系统拒绝分享后仍能长按保存且不清除成图', { timeout: 60000 }, async t => {
  await withIPhone(t, async (page, frame, events) => {
    const url = await exportMobile(page, frame, 'jpg', events);
    for (const outcome of ['AbortError', 'NotAllowedError']) {
      await shareMobile(page, frame, 'jpg', outcome);
      assert.ok(await frame.locator('#mobile-save-preview').isVisible(), `${outcome} 后保存预览应保留`);
      const image = await frame.locator('#mobile-save-image').evaluate(image => ({ src: image.src, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }));
      assert.deepEqual(image, { src: url, complete: true, width: 6000, height: 8000 }, `${outcome} 后仍应显示原成图`);
      assert.ok(!await frame.evaluate(url => window.__mobileExportTest.revoked.includes(url), url), `${outcome} 不能释放仍可保存的图片`);
      assert.match(await frame.locator('#mobile-save-note').textContent(), /长按/, `${outcome} 后应保留长按保存说明`);
      assert.equal(events.downloads, 0);
      assert.equal(events.popups, 0);
    }
    assert.deepEqual(events.errors, [], '拒绝或取消分享必须被页面正常处理');
  });
});
