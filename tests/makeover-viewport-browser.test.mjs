import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium, executablePath, available } from './helpers/live-browser-driver.mjs';

const MATRIX = [
  [320, 480, true], [640, 480, true],
  [1280, 720, false], [320, 568, true], [390, 844, true],
  [768, 1024, true], [844, 390, true], [1024, 768, true],
  [1920, 1080, false],
];
const CRITICAL_CONTROLS = [
  ['素颜上传', 'label[for="photo-0"]'], ['精修上传', 'label[for="photo-1"]'],
  ['素颜调整入口', '[data-edit-photo="0"]'], ['精修调整入口', '[data-edit-photo="1"]'],
  ['素颜选择', '.photo-card[data-side="0"] .side-choice'],
  ['精修选择', '.photo-card[data-side="1"] .side-choice'],
  ['照片占比', '#split'], ['恢复各半', '#equal-split'],
  ['PNG导出', '#export-png'], ['JPG导出', '#export-jpg'],
  ['分界拖块', '#split-handle'],
];

async function settle(page, frame) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const frameVisible = await frame.evaluate(() => {
    const rect = frameElement?.getBoundingClientRect();
    return !rect || (rect.width > 0 && rect.height > 0);
  });
  if (frameVisible) await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function withBrowser(t, run) {
  if (!available) { t.skip('需本机 Chrome 和 Playwright'); return; }
  const vite = await createServer({
    root: resolve('.'), configFile: false, logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  let browser;
  try {
    await vite.listen();
    browser = await chromium.launch({ executablePath, headless: true });
    await run(browser, `http://127.0.0.1:${vite.httpServer.address().port}/docs/cover.html`);
  } finally {
    await browser?.close();
    await vite.close();
  }
}

async function openMakeover(browser, url, width, height, touch = false) {
  const page = await browser.newPage({
    viewport: { width, height }, hasTouch: touch, isMobile: touch,
    deviceScaleFactor: 1, reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(10000);
  await page.addInitScript(() => localStorage.setItem('nbo_cover_access_until', String(Date.now() + 1000000)));
  await page.goto(`${url}?mode=makeover`);
  const iframe = page.locator('#makeoverFrame');
  await iframe.waitFor({ state: 'visible' });
  const frame = await (await iframe.elementHandle()).contentFrame();
  assert.ok(frame, '同源素人改造编辑器必须实际载入');
  await frame.waitForFunction(() => {
    const status = document.querySelector('#status');
    return status && !status.textContent.includes('正在加载原版模板');
  });
  await frame.locator('#preview').waitFor({ state: 'visible' });
  await settle(page, frame);
  return { page, frame };
}

async function snapshot(page, frame) {
  const parent = await page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return {
      width: innerWidth, height: innerHeight,
      overflowX: document.documentElement.scrollWidth - innerWidth,
      overflowY: document.documentElement.scrollHeight - innerHeight,
      scrollX, scrollY,
      iframe: rect(document.querySelector('#makeoverFrame')),
    };
  });
  const child = await frame.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return {
      width: innerWidth, height: innerHeight,
      overflowX: document.documentElement.scrollWidth - innerWidth,
      overflowY: document.documentElement.scrollHeight - innerHeight,
      scrollX, scrollY,
      poster: rect(document.querySelector('#preview')),
      wrap: rect(document.querySelector('.poster-wrap')),
    };
  });
  return { parent, child };
}

function assertFullPreview({ parent, child }, label) {
  assert.ok(parent.iframe.y >= -1 && parent.iframe.bottom <= parent.height + 1,
    `${label}: iframe应在父页一屏内 ${JSON.stringify(parent)}`);
  assert.ok(child.poster.y >= -1 && child.poster.bottom <= child.height + 1,
    `${label}: 完整海报不应超出iframe ${JSON.stringify(child)}`);
  assert.ok(child.poster.x >= -1 && child.poster.right <= child.width + 1,
    `${label}: 海报左右不应被裁切`);
  assert.ok(child.poster.width > 0 && child.poster.height > 0, `${label}: 海报应保持可见`);
  assert.ok(Math.abs(child.poster.width / child.poster.height - 3 / 4) < .002,
    `${label}: 原版3:4海报不能被拉伸`);
  assert.ok(Math.abs(child.wrap.width - child.poster.width) <= 1 && Math.abs(child.wrap.height - child.poster.height) <= 1,
    `${label}: 海报边界与定位容器应一致`);
  assert.ok(parent.overflowX <= 1 && child.overflowX <= 1, `${label}: 父子页面不应横向溢出`);
  assert.ok(parent.overflowY <= 1 && child.overflowY <= 1,
    `${label}: 正常编辑不能依赖父页或iframe外层滚动 ${JSON.stringify({ parent, child })}`);
  assert.ok(Math.abs(parent.scrollX) <= 1 && Math.abs(parent.scrollY) <= 1 && Math.abs(child.scrollX) <= 1 && Math.abs(child.scrollY) <= 1,
    `${label}: 外层页面不能因控件操作发生滚动`);
}

async function syntheticPhoto(page, name, color) {
  const base64 = await page.evaluate(color => {
    const canvas = document.createElement('canvas');
    canvas.width = 120; canvas.height = 180;
    const context = canvas.getContext('2d');
    context.fillStyle = color; context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png').split(',')[1];
  }, color);
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

async function uploadPair(page, frame) {
  await frame.locator('#photo-0').setInputFiles(await syntheticPhoto(page, 'viewport-before.png', '#d23c46'));
  await frame.locator('#photo-1').setInputFiles(await syntheticPhoto(page, 'viewport-after.png', '#2864dc'));
  await frame.waitForFunction(() => !document.querySelector('#export-png').disabled && !document.querySelector('#export-jpg').disabled);
  await settle(page, frame);
}

async function setRange(frame, selector, value) {
  await frame.locator(selector).evaluate((control, value) => {
    control.value = String(value); control.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function assertReachable(frame, controls, label) {
  for (const [name, selector] of controls) {
    const result = await frame.locator(selector).evaluate(element => {
      const rect = element.getBoundingClientRect();
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      const style = getComputedStyle(element);
      return {
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
        inside: rect.x >= -1 && rect.y >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
        hit: hit === element || element.contains(hit),
        disabled: 'disabled' in element && element.disabled,
        rect: { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom },
      };
    });
    assert.ok(result.visible && result.inside && result.hit && !result.disabled,
      `${label}: ${name}必须无需滚动即可看见并操作 ${JSON.stringify(result)}`);
  }
}

async function assertDivider(frame, percentage, label) {
  await setRange(frame, '#split', percentage);
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const result = await frame.evaluate(() => {
    const canvas = document.querySelector('#preview');
    const poster = canvas.getBoundingClientRect();
    const divider = document.querySelector('#divider').getBoundingClientRect();
    const handle = document.querySelector('#split-handle').getBoundingClientRect();
    const fraction = Number(document.querySelector('#split').value) / 100;
    const context = canvas.getContext('2d');
    const boundary = Math.round((13 + 5974 * fraction) / 6000 * canvas.width);
    const y = Math.round(canvas.height * .25);
    return {
      expectedX: poster.x + poster.width * (13 + 5974 * fraction) / 6000,
      expectedTop: poster.y + poster.height * 232 / 8000,
      expectedHeight: poster.height * 7755 / 8000,
      actualX: divider.x + divider.width / 2,
      handleX: handle.x + handle.width / 2,
      actualTop: divider.y, actualHeight: divider.height,
      leftPixel: [...context.getImageData(boundary - 2, y, 1, 1).data],
      rightPixel: [...context.getImageData(boundary + 2, y, 1, 1).data],
      accessibleValue: document.querySelector('#split-handle').getAttribute('aria-valuenow'),
    };
  });
  assert.ok(Math.abs(result.actualX - result.expectedX) <= 1 && Math.abs(result.handleX - result.expectedX) <= 1,
    `${label}: 分界线和拖块应贴合照片共享边界 ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.actualTop - result.expectedTop) <= 1 && Math.abs(result.actualHeight - result.expectedHeight) <= 1,
    `${label}: 分界线应覆盖原版照片区域`);
  assert.deepEqual(result.leftPixel, [210, 60, 70, 255], `${label}: 分界左侧应显示素颜测试图`);
  assert.deepEqual(result.rightPixel, [40, 100, 220, 255], `${label}: 分界右侧应显示精修测试图`);
  assert.equal(Number(result.accessibleValue), percentage, `${label}: 可访问占比应与实际分界一致`);
}

async function assertExport(page, frame, format, label) {
  // This viewport regression verifies the fallback download, not an OS save dialog.
  await frame.evaluate(() => { window.showSaveFilePicker = undefined; });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    frame.locator(`#export-${format}`).click(),
  ]);
  assert.equal(await download.failure(), null, `${label}: ${format}下载应成功`);
  assert.ok(download.suggestedFilename().endsWith(`.${format}`));
  const image = await frame.locator('#download-link').evaluate(async link => {
    const blob = await fetch(link.href).then(response => response.blob());
    const decoded = await createImageBitmap(blob);
    const result = { width: decoded.width, height: decoded.height, type: blob.type };
    decoded.close();
    return result;
  });
  assert.deepEqual(image, { width: 6000, height: 8000, type: format === 'png' ? 'image/png' : 'image/jpeg' },
    `${label}: 缩小预览不能改变原生6K导出`);
  await settle(page, frame);
  assertFullPreview(await snapshot(page, frame), `${label} ${format}导出后`);
  await assertReachable(frame, [['再次下载', '#download-link'], ['打开图片', '#open-image']], `${label} ${format}导出后`);
}

test('素人改造在九种设备尺寸中完整预览、操作分界并导出原生6K', { timeout: 120000 }, async t => {
  await withBrowser(t, async (browser, url) => {
    for (const [width, height, touch] of MATRIX) {
      const { page, frame } = await openMakeover(browser, url, width, height, touch);
      const label = `${width}×${height}`;
      try {
        assertFullPreview(await snapshot(page, frame), label);
        await uploadPair(page, frame);
        assertFullPreview(await snapshot(page, frame), `${label}上传后`);
        await assertReachable(frame, CRITICAL_CONTROLS, label);
        await assertDivider(frame, 37.4, label);
        if (width === 1280) {
          await assertExport(page, frame, 'png', label);
          await assertExport(page, frame, 'jpg', label);
          await assertReachable(frame, CRITICAL_CONTROLS, `${label}双格式导出后`);
        }
      } finally { await page.close(); }
    }
  });
});

test('连续缩放和切换制作模式保留两边照片、取景与文案状态', { timeout: 60000 }, async t => {
  await withBrowser(t, async (browser, url) => {
    const { page, frame } = await openMakeover(browser, url, 1280, 720);
    try {
      await uploadPair(page, frame);
      await frame.locator('[data-photo-target="0"]').click();
      await setRange(frame, '#adjust-zoom', 160);
      await frame.locator('[data-photo-target="1"]').click();
      await setRange(frame, '#adjust-zoom', 180);
      await assertDivider(frame, 37.4, '切换前');
      await page.getByRole('tab', { name: '封面制作', exact: true }).click();
      await page.locator('#fileInput').setInputFiles(await syntheticPhoto(page, 'cover-retained.png', '#358b58'));
      await page.waitForFunction(() => document.querySelector('#fileName').textContent === 'cover-retained.png');
      await page.locator('#topText').fill('窗口保留');
      await setRange(page, '#zoom', 137);
      await page.evaluate(() => document.fonts.ready);
      await settle(page, frame);
      const coverPixels = await page.locator('#coverCanvas').evaluate(canvas => canvas.toDataURL());

      await page.getByRole('tab', { name: '素人改造', exact: true }).click();
      for (const [width, height] of [[390, 844], [844, 390], [1920, 1080], [320, 568], [1280, 720]]) {
        await page.setViewportSize({ width, height });
        await settle(page, frame);
        const label = `连续缩放${width}×${height}`;
        assertFullPreview(await snapshot(page, frame), label);
        await frame.locator('button[data-tool="compose"]').evaluate(button => button.click());
        await frame.locator('[data-photo-target="0"]').click();
        assert.equal(await frame.locator('#adjust-zoom').inputValue(), '160', `${label}: 素颜缩放应保留`);
        await frame.locator('[data-photo-target="1"]').click();
        assert.equal(await frame.locator('#adjust-zoom').inputValue(), '180', `${label}: 精修缩放应保留`);
        await frame.locator('button[data-tool="photos"]').evaluate(button => button.click());
        await settle(page, frame);
        assert.equal(await frame.locator('#split').inputValue(), '37.4', `${label}: 分界占比应保留`);
        assert.equal(await frame.locator('#file-name-0').textContent(), 'viewport-before.png');
        assert.equal(await frame.locator('#file-name-1').textContent(), 'viewport-after.png');
        await assertDivider(frame, 37.4, label);
        await assertReachable(frame, CRITICAL_CONTROLS, label);
      }
      await page.getByRole('tab', { name: '封面制作', exact: true }).click();
      assert.equal(await page.locator('#topText').inputValue(), '窗口保留', '返回封面应保留文案');
      assert.equal(await page.locator('#zoom').inputValue(), '137', '返回封面应保留照片取景');
      assert.equal(await page.locator('#fileName').textContent(), 'cover-retained.png', '返回封面应保留原照片');
      await settle(page, frame);
      assert.equal(await page.locator('#coverCanvas').evaluate(canvas => canvas.toDataURL()), coverPixels,
        '往返模式和缩放窗口不应改变封面成品');
      await page.getByRole('tab', { name: '素人改造', exact: true }).click();
      await settle(page, frame);
      assertFullPreview(await snapshot(page, frame), '返回素人改造');
      await frame.locator('button[data-tool="compose"]').evaluate(button => button.click());
      await frame.locator('[data-photo-target="0"]').click();
      assert.equal(await frame.locator('#adjust-zoom').inputValue(), '160');
      await frame.locator('[data-photo-target="1"]').click();
      assert.equal(await frame.locator('#adjust-zoom').inputValue(), '180');
      assert.equal(await frame.locator('#split').inputValue(), '37.4');
    } finally { await page.close(); }
  });
});
