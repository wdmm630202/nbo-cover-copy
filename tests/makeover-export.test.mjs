import * as makeoverExport from '../public/makeover/export.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createMakeoverExportAsset, getMakeoverExportFileName, getMakeoverExportSize } from '../public/makeover/export.mjs';

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


test('mobile cancellation releases its small canvas without allocating a full poster', async()=>{
  let cancelled=false, largest=0;
  const canvas={width:0,height:0,getContext:()=>({getImageData:(_x,_y,w,h)=>({data:new Uint8Array(w*h*4)})})};
  await withCanvas(canvas,async()=>{
    await assert.rejects(createMakeoverExportAsset({format:'png',width:6000,height:8000,tiled:true,
      isCancelled:()=>cancelled,
      render:(target,region)=>{assert.ok(region);largest=Math.max(largest,target.width*target.height);cancelled=true;},
    }),/构图已更改/);
    assert.ok(largest<=1_100_000);assert.equal(canvas.width,0);assert.equal(canvas.height,0);
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
