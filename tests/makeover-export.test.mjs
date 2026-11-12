import assert from 'node:assert/strict';
import test from 'node:test';
import { createMakeoverExportAsset, getMakeoverExportFileName } from '../public/makeover/export.mjs';

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

test('an encoder that stays over the cap never returns an asset and releases its canvas', async () => {
  const oversized = new Blob([new Uint8Array(20_000_000)], { type: 'image/png' });
  const canvas = { width: 0, height: 0, toBlob: callback => callback(oversized) };
  await withCanvas(canvas, async () => {
    await assert.rejects(createMakeoverExportAsset({ format: 'png', render: () => {} }), /19\.9MB/);
    assert.equal(canvas.width, 0);
    assert.equal(canvas.height, 0);
  });
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
