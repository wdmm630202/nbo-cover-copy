import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';

const MOUSE_WINDOWS = [[1024, 1366], [1024, 768], [800, 600], [1920, 1080]];

async function settle(page, frame) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (frame) await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function uploadPair(page, frame) {
  for (const [side, color] of [[0, '#d23c46'], [1, '#2864dc']]) {
    const base64 = await page.evaluate(color => {
      const canvas = document.createElement('canvas');
      canvas.width = 120; canvas.height = 180;
      const context = canvas.getContext('2d');
      context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    }, color);
    await frame.locator(`#photo-${side}`).setInputFiles({
      name: `desktop-scaling-${side}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64'),
    });
  }
  await frame.waitForFunction(() => !document.querySelector('#export-png').disabled && !document.querySelector('#export-jpg').disabled);
  await settle(page, frame);
}

async function snapshot(page, frame) {
  const parent = await page.evaluate(() => {
    const iframe = document.querySelector('#makeoverFrame').getBoundingClientRect();
    return {
      width: innerWidth, height: innerHeight,
      zoom: Number(getComputedStyle(document.querySelector('.cover-page')).zoom),
      overflowX: document.documentElement.scrollWidth - innerWidth,
      overflowY: document.documentElement.scrollHeight - innerHeight,
      scrollX, scrollY,
      iframe: { x: iframe.x, y: iframe.y, width: iframe.width, height: iframe.height, right: iframe.right, bottom: iframe.bottom },
    };
  });
  const child = await frame.evaluate(() => {
    const rect = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    return {
      width: innerWidth, height: innerHeight,
      layout: getComputedStyle(document.querySelector('.workspace')).display,
      controls: rect('.controls'), preview: rect('.preview-section'), settings: rect('.settings-panel'),
      poster: rect('#preview'), wrap: rect('.poster-wrap'),
      handle: rect('#split-handle'), divider: rect('#divider'),
      split: Number(document.querySelector('#split').value),
      accessibleSplit: Number(document.querySelector('#split-handle').getAttribute('aria-valuenow')),
      overflowX: document.documentElement.scrollWidth - innerWidth,
      overflowY: document.documentElement.scrollHeight - innerHeight,
      scrollX, scrollY,
    };
  });
  return { parent, child };
}

function assertDesktopLayout({ parent, child }, coverZoom, expectedScale, label) {
  assert.ok(Math.abs(parent.zoom - expectedScale) < .001 && Math.abs(parent.zoom - coverZoom) < .001,
    `${label}: 素人改造应沿用封面制作的整页缩放 ${JSON.stringify({ expectedScale, coverZoom, parent, layout: child.layout })}`);
  assert.equal(child.layout, 'grid', `${label}: 鼠标窗口中的编辑器应保持三栏`);
  assert.ok(child.controls.width > 0 && child.preview.width > 0 && child.settings.width > 0,
    `${label}: 左侧工具、中间预览、右侧设置均应可见`);
  assert.ok(child.controls.right <= child.preview.x + 1 && child.preview.right <= child.settings.x + 1,
    `${label}: 三栏应按工具、预览、设置从左向右排列 ${JSON.stringify(child)}`);
  assert.ok(Math.abs(child.controls.y - child.preview.y) <= 1 && Math.abs(child.preview.y - child.settings.y) <= 1,
    `${label}: 三栏不能切成上下堆叠`);
  assert.ok(parent.iframe.x >= -1 && parent.iframe.right <= parent.width + 1 && parent.iframe.y >= -1 && parent.iframe.bottom <= parent.height + 1,
    `${label}: 编辑器应完整放入一屏 ${JSON.stringify(parent)}`);
  assert.ok(child.poster.x >= -1 && child.poster.right <= child.width + 1 && child.poster.y >= -1 && child.poster.bottom <= child.height + 1,
    `${label}: 完整海报应位于iframe内 ${JSON.stringify(child)}`);
  assert.ok(child.poster.width > 0 && child.poster.height > 0 && Math.abs(child.poster.width / child.poster.height - .75) < .002,
    `${label}: 3:4海报应完整显示且保持原比例`);
  assert.ok(Math.abs(child.wrap.width - child.poster.width) <= 1 && Math.abs(child.wrap.height - child.poster.height) <= 1,
    `${label}: 分界定位容器应与海报边界一致`);
  assert.ok(parent.overflowX <= 1 && parent.overflowY <= 1 && child.overflowX <= 1 && child.overflowY <= 1,
    `${label}: 父页和iframe不能横溢或依赖外层滚动 ${JSON.stringify({ parent, child })}`);
  assert.ok([parent.scrollX, parent.scrollY, child.scrollX, child.scrollY].every(value => Math.abs(value) <= 1),
    `${label}: 操作不应引发外层滚动`);
}

async function dragDivider(page, frame, label) {
  const before = await snapshot(page, frame);
  assert.equal(before.child.split, 50, `${label}: 默认分界应从各半开始`);
  // Convert child viewport coordinates to physical mouse coordinates. An iframe
  // under CSS zoom has a larger logical viewport than its on-screen rectangle.
  const scaleX = before.parent.iframe.width / before.child.width;
  const scaleY = before.parent.iframe.height / before.child.height;
  const startX = before.parent.iframe.x + (before.child.handle.x + before.child.handle.width / 2) * scaleX;
  const y = before.parent.iframe.y + (before.child.handle.y + before.child.handle.height / 2) * scaleY;
  const targetFraction = (13 + 5974 * .65) / 6000;
  const targetX = before.parent.iframe.x + (before.child.poster.x + before.child.poster.width * targetFraction) * scaleX;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(targetX, y, { steps: 12 });
  await page.mouse.up();
  await settle(page, frame);
  const after = await snapshot(page, frame);
  assert.ok(Math.abs(after.child.split - 65) <= 1,
    `${label}: 真实鼠标拖动应把50%调整到约65% ${JSON.stringify({ startX, targetX, y, split: after.child.split })}`);
  assert.equal(after.child.accessibleSplit, after.child.split, `${label}: 拖块读数应与占比控件一致`);
  const expectedX = after.child.poster.x + after.child.poster.width * (13 + 5974 * after.child.split / 100) / 6000;
  const actualX = after.child.divider.x + after.child.divider.width / 2;
  const handleX = after.child.handle.x + after.child.handle.width / 2;
  assert.ok(Math.abs(actualX - expectedX) <= 1 && Math.abs(handleX - expectedX) <= 1,
    `${label}: 实际分界线和拖块应与65%照片边界一致 ${JSON.stringify({ expectedX, actualX, handleX })}`);
  const physicalX = after.parent.iframe.x + actualX * (after.parent.iframe.width / after.child.width);
  assert.ok(Math.abs(physicalX - targetX) <= 2, `${label}: 分界线应跟随缩放后的真实鼠标位置`);
  return after;
}

test('鼠标窗口的素人改造沿用封面整页缩放、保持三栏并能准确拖动分界', { timeout: 90000 }, async t => {
  if (!available) { t.skip('需本机 Chrome 和 Playwright'); return; }
  const vite = await createServer({ root: resolve('.'), configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await vite.listen();
    browser = await chromium.launch({ executablePath, headless: true });
    const url = `http://127.0.0.1:${vite.httpServer.address().port}/docs/cover.html`;
    for (const [width, height] of MOUSE_WINDOWS) {
      await t.test(`${width}×${height}`, async () => {
        const page = await browser.newPage({ viewport: { width, height }, hasTouch: false, isMobile: false, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
        page.setDefaultTimeout(10000);
        try {
          await page.addInitScript(() => localStorage.setItem('nbo_cover_access_until', String(Date.now() + 1000000)));
          await page.goto(url);
          await page.locator('#coverPage').waitFor({ state: 'visible' });
          await settle(page);
          assert.equal(await page.evaluate(() => matchMedia('(pointer: fine)').matches), true, '应实际使用鼠标设备');
          const coverZoom = await page.locator('.cover-page').evaluate(element => Number(getComputedStyle(element).zoom));
          const expectedScale = Math.min(1, width / 1520, height / 1230);
          assert.ok(Math.abs(coverZoom - expectedScale) < .001, '封面制作应应用基准窗口缩放');
          await page.locator('#creation-tab-makeover').click();
          const iframe = page.locator('#makeoverFrame');
          await iframe.waitFor({ state: 'visible' });
          const frame = await (await iframe.elementHandle()).contentFrame();
          assert.ok(frame, '同源编辑器应实际载入');
          await frame.locator('#preview').waitFor({ state: 'visible' });
          await uploadPair(page, frame);
          const label = `${width}×${height}`;
          assertDesktopLayout(await snapshot(page, frame), coverZoom, expectedScale, label);
          assertDesktopLayout(await dragDivider(page, frame, label), coverZoom, expectedScale, `${label}拖动后`);
        } finally { await page.close(); }
      });
    }
  } finally {
    await browser?.close();
    await vite.close();
  }
});
