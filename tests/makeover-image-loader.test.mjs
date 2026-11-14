import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeImage } from '../public/makeover/image-loader.mjs';

test('无响应图片解码在明确期限内失败并释放源，不会永久停留在模板加载', async () => {
  class StalledImage {}
  const image = new StalledImage();
  const createImage = function () { return image; };
  await assert.rejects(decodeImage('data:image/png;base64,held', { Image: createImage, timeoutMs: 5 }), /图片读取超时/);
  assert.equal(image.src, 'data:,');
  assert.equal(image.onload, null);
  assert.equal(image.onerror, null);
});

test('正常图片保留原始解码对象和像素尺寸，错误图片保留中文错误', async () => {
  class GoodImage {
    naturalWidth = 6000; naturalHeight = 8000;
    set src(value) { this.source = value; queueMicrotask(() => this.onload?.()); }
  }
  const image = await decodeImage('original', { Image: GoodImage, timeoutMs: 50 });
  assert.equal(image.source, 'original');
  assert.deepEqual([image.naturalWidth, image.naturalHeight], [6000, 8000]);
  class BadImage { set src(value) { if (value !== 'data:,') queueMicrotask(() => this.onerror?.()); } }
  await assert.rejects(decodeImage('bad', { Image: BadImage, timeoutMs: 50 }), /无法解码图片/);
});
