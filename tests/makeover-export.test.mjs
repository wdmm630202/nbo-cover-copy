import assert from 'node:assert/strict';
import test from 'node:test';
import { createMakeoverExportAsset, getMakeoverExportFileName, getMakeoverExportSize } from '../public/makeover/export.mjs';
import * as makeoverExport from '../public/makeover/export.mjs';

test('export names use Beijing time across midnight with milliseconds and the requested prefix', () => {
  const name = getMakeoverExportFileName('png', new Date('2026-01-01T16:00:00.007Z'));
  assert.match(name, /^南铂素人改造_20260102_000000_007\.png$/);
});

test('a burst of exports with the same clock value has distinct safe filenames', () => {
  const date = new Date('2026-11-12T00:05:06.123Z');
  const names = Array.from({ length: 1000 }, () => getMakeoverExportFileName('jpg', date));
  assert.equal(new Set(names).size, 1000);
  assert.ok(names.every(name => /^南铂素人改造_\d{8}_\d{6}_\d{3}\.jpg$/.test(name)));
});

async function withCanvas(canvas, run) {
  const original = globalThis.document;
  globalThis.document = { createElement: () => canvas };
  try { await run(); }
  finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}

async function withCanvasFactory(createCanvas, run) {
  const original = globalThis.document;
  globalThis.document = { createElement: tag => {
    assert.equal(tag, 'canvas');
    return createCanvas();
  } };
  try { await run(); }
  finally {
    if (original === undefined) delete globalThis.document;
    else globalThis.document = original;
  }
}

test('both formats keep oversized bytes and requested dimensions with a single highest quality encode', async () => {
  for (const format of ['jpg', 'png']) {
    let calls = 0;
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const oversized = new Blob([new Uint8Array(20_000_000)], { type });
    const canvas = { width: 0, height: 0, toBlob: (callback, mime, quality) => {
      calls++;
      assert.equal(mime, type);
      assert.equal(quality, format === 'jpg' ? 1 : undefined);
      callback(oversized);
    } };
    await withCanvas(canvas, async () => {
      const asset = await createMakeoverExportAsset({ format, width: 9000, height: 12000, render: () => {} });
      assert.equal(asset.blob.size, 20_000_000);
      assert.deepEqual([asset.width, asset.height], [9000, 12000]);
      assert.equal(calls, 1);
      assert.equal(canvas.width, 0);
    });
  }
});

test('export canvas expands so each placed source pixel is retained', () => {
  const photos = [{ image: { naturalWidth: 8000, naturalHeight: 12000 } }, { image: { naturalWidth: 4000, naturalHeight: 6000 } }];
  const size = getMakeoverExportSize(photos);
  assert.equal(size.width / size.height, .75);
  assert.ok(size.height * 7755 / 8000 >= 12000);
  assert.deepEqual(getMakeoverExportSize([{image:{naturalWidth:800,naturalHeight:800}}]), {width:6000,height:8000});
});

test('a changed composition cancels an export before encoding and releases its canvas', async () => {
  let cancelled = false;
  const canvas = { width: 0, height: 0, toBlob: () => assert.fail('失效构图不得编码交付') };
  await withCanvas(canvas, async () => {
    await assert.rejects(createMakeoverExportAsset({
      format: 'jpg', render: () => { cancelled = true; }, isCancelled: () => cancelled,
    }), /构图已更改/);
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  });
});

test('mobile detection includes Android, iPhone, iPad and desktop-mode iPadOS only', () => {
  const detect = makeoverExport.isMobileMakeoverDevice;
  assert.equal(typeof detect, 'function');
  for (const navigator of [
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
    { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)' },
    { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' },
    { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', maxTouchPoints: 5 },
  ]) assert.equal(detect({ navigator }), true);
  for (const environment of [
    {},
    { navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7)', maxTouchPoints: 0 } },
    { navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 10 } },
  ]) assert.equal(detect(environment), false);
});

test('mobile size preset stays at 2160 by 2880 even for large originals and split edges', () => {
  const photos = [{ image: { naturalWidth: 8000, naturalHeight: 12000 } }];
  for (const split of [0, .5, 1]) {
    assert.deepEqual(getMakeoverExportSize(photos, split, { mobile: true }), { width: 2160, height: 2880 });
  }
  assert.deepEqual(getMakeoverExportSize([], .5, { mobile: true }), { width: 2160, height: 2880 });
});

test('mobile export never allocates an iOS-unsafe original-size canvas and keeps full encoder quality', async () => {
  for (const format of ['jpg', 'png']) {
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const canvases = [];
    const allocated = [];
    const bytes = new Blob([new Uint8Array(20_000_000)], { type });
    await withCanvasFactory(() => {
      let width = 0;
      let height = 0;
      const canvas = {
        get width() { return width; },
        set width(value) { width = value; },
        get height() { return height; },
        set height(value) {
          if (width * value > 16_000_000) throw new Error('iOS canvas area exceeded');
          height = value;
          if (width && height) allocated.push([width, height]);
        },
        getContext: () => ({}),
        toBlob(callback, mime, quality) {
          assert.equal(mime, type);
          assert.equal(quality, format === 'jpg' ? 1 : undefined);
          callback(bytes);
        },
      };
      canvases.push(canvas);
      return canvas;
    }, async () => {
      const asset = await createMakeoverExportAsset({ mobile: true, format, width: 6000, height: 8000, render: canvas => assert.ok(canvas.getContext('2d')) });
      assert.deepEqual([asset.width, asset.height, asset.resized], [2160, 2880, true]);
      assert.equal(asset.blob.size, 20_000_000);
    });
    assert.deepEqual(allocated, [[2160, 2880]]);
    assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  }
});

test('mobile default export reports its HD preset without a fallback resize', async () => {
  const canvas = { width: 0, height: 0, toBlob: callback => callback(new Blob(['image'], { type: 'image/png' })) };
  await withCanvas(canvas, async () => {
    const asset = await createMakeoverExportAsset({ mobile: true, format: 'png', render: () => {} });
    assert.deepEqual([asset.width, asset.height, asset.resized], [2160, 2880, false]);
  });
});

test('mobile retries canvas allocation, missing context and render failures at smaller dimensions', async t => {
  for (const failure of ['allocation', 'context', 'render']) await t.test(failure, async () => {
    const canvases = [];
    const rendered = [];
    let eventLoopYielded = false;
    let scheduled = false;
    await withCanvasFactory(() => {
      assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0), '旧画布必须在下次分配前释放');
      if (scheduled) assert.equal(eventLoopYielded, true, '重试必须异步让出事件循环');
      if (!scheduled) {
        scheduled = true;
        setTimeout(() => { eventLoopYielded = true; }, 0);
      }
      const attempt = canvases.length;
      let height = 0;
      const canvas = {
        width: 0,
        get height() { return height; },
        set height(value) {
          if (attempt === 0 && value && failure === 'allocation') throw new Error('Cannot allocate canvas backing store');
          height = value;
        },
        getContext: () => attempt === 0 && failure === 'context' ? null : {},
        toBlob: callback => callback(new Blob(['image'], { type: 'image/png' })),
      };
      canvases.push(canvas);
      return canvas;
    }, async () => {
      const asset = await createMakeoverExportAsset({
        mobile: true, format: 'png', width: 2160, height: 2880,
        render: canvas => {
          rendered.push([canvas.width, canvas.height]);
          if (!canvas.getContext('2d')) throw new Error('Canvas 2D context unavailable');
          if (canvases.length === 1 && failure === 'render') throw new Error('Out of memory while drawing');
        },
      });
      assert.deepEqual([asset.width, asset.height, asset.resized], [1536, 2048, true]);
    });
    assert.equal(canvases.length, 2);
    assert.deepEqual(rendered.at(-1), [1536, 2048]);
    assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  });
});

test('mobile retries null blobs down to 1080 by 1440 while preserving MIME type and encoder quality', async () => {
  for (const format of ['jpg', 'png']) {
    const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const attempts = [];
    const canvases = [];
    await withCanvasFactory(() => {
      const canvas = { width: 0, height: 0, toBlob(callback, mime, quality) {
        attempts.push([canvas.width, canvas.height, mime, quality]);
        callback(attempts.length < 3 ? null : new Blob(['image'], { type }));
      } };
      canvases.push(canvas);
      return canvas;
    }, async () => {
      const asset = await createMakeoverExportAsset({ mobile: true, format, width: 2160, height: 2880, render: () => {} });
      assert.deepEqual([asset.width, asset.height, asset.resized], [1080, 1440, true]);
    });
    assert.deepEqual(attempts, [[2160, 2880, type, format === 'jpg' ? 1 : undefined], [1536, 2048, type, format === 'jpg' ? 1 : undefined], [1080, 1440, type, format === 'jpg' ? 1 : undefined]]);
    assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  }
});

test('exhausted mobile encodes show a Chinese recovery message and release all canvases', async () => {
  const canvases = [];
  await withCanvasFactory(() => {
    const canvas = { width: 0, height: 0, toBlob: callback => callback(null) };
    canvases.push(canvas);
    return canvas;
  }, async () => {
    await assert.rejects(createMakeoverExportAsset({ mobile: true, format: 'jpg', render: () => {} }), /手机.*导出失败.*(?:内存|画布).*重试/);
  });
  assert.equal(canvases.length, 3);
  assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test('mobile cancellation after a failed encode prevents retries', async () => {
  let cancelled = false;
  let created = 0;
  await withCanvasFactory(() => {
    created++;
    return { width: 0, height: 0, toBlob(callback) { cancelled = true; callback(null); } };
  }, async () => {
    await assert.rejects(createMakeoverExportAsset({ mobile: true, format: 'jpg', render: () => {}, isCancelled: () => cancelled }), /构图已更改/);
  });
  assert.equal(created, 1);
});

test('mobile format mismatch is not retried as a memory failure even for an empty blob', async () => {
  for (const bytes of [['image'], []]) {
    let created = 0;
    await withCanvasFactory(() => {
      created++;
      return { width: 0, height: 0, toBlob: callback => callback(new Blob(bytes, { type: 'image/png' })) };
    }, async () => {
      await assert.rejects(createMakeoverExportAsset({ mobile: true, format: 'jpg', render: () => {} }), /无法生成指定格式/);
    });
    assert.equal(created, 1);
  }
});

test('a browser AbortError stops mobile export without a smaller retry and shows Chinese text', async () => {
  for (const stage of ['render', 'encode']) {
    let created = 0;
    const abort = () => { throw new DOMException('The operation was aborted.', 'AbortError'); };
    await withCanvasFactory(() => {
      created++;
      return { width: 0, height: 0, toBlob: stage === 'encode' ? abort : () => assert.fail('取消后不得编码') };
    }, async () => {
      await assert.rejects(createMakeoverExportAsset({ mobile: true, format: 'jpg', render: stage === 'render' ? abort : () => {} }), /重新导出/);
    });
    assert.equal(created, 1);
  }
});

test('desktop failed encoding stays a single original-size attempt with an explicit error', async () => {
  let calls = 0;
  const canvas = { width: 0, height: 0, toBlob(callback) { calls++; callback(null); } };
  await withCanvas(canvas, async () => {
    await assert.rejects(createMakeoverExportAsset({ format: 'jpg', width: 9000, height: 12000, render: () => {} }), /原片像素导出失败.*未降低画质/);
    assert.equal(calls, 1);
    assert.equal(canvas.width, 0);
  });
});

test('desktop render errors retain the original Chinese message without retries', async () => {
  let created = 0;
  const canvas = { width: 0, height: 0, toBlob: () => assert.fail('绘制失败后不得编码') };
  await withCanvasFactory(() => { created++; return canvas; }, async () => {
    await assert.rejects(createMakeoverExportAsset({
      mobile: false, format: 'png', render: () => { throw new Error('照片图层绘制失败'); },
    }), { message: '照片图层绘制失败' });
  });
  assert.equal(created, 1);
  assert.equal(canvas.width, 0);
  assert.equal(canvas.height, 0);
});

test('invalid export dimensions are rejected before allocating a canvas on either device', async () => {
  for (const mobile of [false, true]) for (const [width, height] of [[0, 8000], [6000, -1], [NaN, 8000], [6000, Infinity], [1.5, 8000], [Number.MAX_SAFE_INTEGER + 1, 8000]]) {
    await withCanvasFactory(() => assert.fail('无效尺寸不得分配画布'), async () => {
      await assert.rejects(createMakeoverExportAsset({ mobile, format: 'png', width, height, render: () => {} }), /导出尺寸无效/);
    });
  }
});
