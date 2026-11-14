import { encodeJpegRows } from './vendor/jpeg-encoder.mjs?v=20261114-single-document';

const ROWS = 128;
const TILE_WIDTH = 2048;
const DRAW_ROWS = 512;
const ROW_CACHE_BYTES = 16 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function chunk(type, bytes) {
  const result = new Uint8Array(bytes.length + 12), view = new DataView(result.buffer);
  view.setUint32(0, bytes.length);
  for (let i = 0; i < 4; i++) result[4 + i] = type.charCodeAt(i);
  result.set(bytes, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < result.length - 4; i++) crc = crcTable[(crc ^ result[i]) & 255] ^ (crc >>> 8);
  view.setUint32(result.length - 4, (crc ^ 0xffffffff) >>> 0);
  return result;
}

export async function encodePngRows(width, height, readRows, checkCurrent, { opaque = false } = {}) {
  if (typeof CompressionStream !== 'function') throw new Error('当前浏览器不支持原片分块导出，请更新Safari或浏览器后重试。');
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = opaque ? 2 : 6;
  const parts = [new Uint8Array([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('sRGB', new Uint8Array([0]))];
  const stream = new CompressionStream('deflate'), writer = stream.writable.getWriter(), reader = stream.readable.getReader();
  let readError;
  const consuming = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parts.push(chunk('IDAT', value));
      }
    } catch (error) { readError = error; }
    finally { reader.releaseLock(); }
  })();
  try {
    const channels = opaque ? 3 : 4, stride = width * channels;
    for (let y = 0; y < height; y += ROWS) {
      checkCurrent();
      const rows = Math.min(ROWS, height - y), rgba = await readRows(y, rows);
      const filtered = new Uint8Array((stride + 1) * rows);
      for (let row = 0; row < rows; row++) {
        const from = row * width * 4, to = row * (stride + 1);
        filtered[to] = 1; // PNG Sub filter is reversible; no quantization.
        if (opaque) {
          for (let x = 0; x < width; x++) {
            const source = from + x * 4, target = to + 1 + x * 3;
            if (rgba[source + 3] !== 255) throw new Error('成图包含透明像素，已停止导出以保留画质，请重试。');
            filtered[target] = (rgba[source] - (x ? rgba[source - 4] : 0)) & 255;
            filtered[target + 1] = (rgba[source + 1] - (x ? rgba[source - 3] : 0)) & 255;
            filtered[target + 2] = (rgba[source + 2] - (x ? rgba[source - 2] : 0)) & 255;
          }
        } else {
          for (let x = 0; x < stride; x++) filtered[to + 1 + x] = (rgba[from + x] - (x >= 4 ? rgba[from + x - 4] : 0)) & 255;
        }
      }
      await writer.write(filtered);
    }
    await writer.close(); await consuming;
    if (readError) throw readError;
    checkCurrent(); parts.push(chunk('IEND', new Uint8Array()));
    return new Blob(parts, { type: 'image/png' });
  } catch (error) {
    await writer.abort(error).catch(() => {}); await consuming;
    throw error;
  } finally { writer.releaseLock(); }
}

/** Reuse a bounded row batch; never allocate a full-poster mobile canvas. */
export async function createStripExport({ format, width, height, render, checkCurrent, opaque = false, onProgress = () => {} }) {
  // Keep one readback surface instead of reallocating its backing store for
  // every tile, avoiding GPU backing-store resets during readback.
  const drawRows = Math.max(ROWS, Math.min(DRAW_ROWS, Math.floor(ROW_CACHE_BYTES / (width * 4 * ROWS)) * ROWS));
  const gutter = 2;
  let canvas, context, cached, cachedY = -1;
  const releaseSurface = () => {
    if (canvas) canvas.width = canvas.height = 0;
    canvas = context = null;
  };
  const readTile = async (x, y, columns, rows) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      checkCurrent();
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.width = Math.min(TILE_WIDTH, width) + gutter * 2;
        canvas.height = Math.min(drawRows, height) + gutter * 2;
        // This must be the first getContext call, before the renderer chooses
        // an accelerated backing store. It changes storage, never image quality.
        context = canvas.getContext('2d', { willReadFrequently: true, alpha: true });
      }
      if (context) {
        context.save();
        try {
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, canvas.width, canvas.height);
          render(canvas, { x: x - gutter, y: y - gutter, width, height });
        } finally { context.restore(); }
        try {
          const pixels = context.getImageData(gutter, gutter, columns, rows).data;
          let valid = pixels.length === columns * rows * 4;
          if (valid && opaque) {
            for (let alpha = 3; alpha < pixels.length; alpha += 4) {
              if (pixels[alpha] !== 255) { valid = false; break; }
            }
          }
          if (valid) return pixels;
        } catch { /* Recreate a failed readback surface at the same resolution. */ }
      }
      releaseSurface();
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 0));
    }
    throw new Error('手机分块画面读取失败，请重新导出；未降低像素和画质。');
  };
  const readRows = async (y, rows) => {
    checkCurrent();
    if (cachedY < 0 || y >= cachedY + drawRows) {
      cachedY = y;
      const batchRows = Math.min(drawRows, height - y);
      cached ??= new Uint8Array(width * Math.min(drawRows, height) * 4);
      for (let x = 0; x < width; x += TILE_WIDTH) {
        checkCurrent();
        const columns = Math.min(TILE_WIDTH, width - x);
        const pixels = await readTile(x, y, columns, batchRows);
        for (let row = 0; row < batchRows; row++) cached.set(pixels.subarray(row * columns * 4, (row + 1) * columns * 4), (row * width + x) * 4);
      }
    }
    onProgress(Math.floor(y / height * 100));
    // Yield between strips to let touch, cancellation and Safari's memory reclamation run.
    await new Promise(resolve => setTimeout(resolve, 0));
    checkCurrent(); return cached.subarray((y - cachedY) * width * 4, (y - cachedY + rows) * width * 4);
  };
  try {
    const blob = format === 'png' ? await encodePngRows(width, height, readRows, checkCurrent, { opaque }) : await encodeJpegRows(width, height, readRows);
    checkCurrent(); onProgress(100);
    return { blob, width, height, resized: false };
  } finally { cached = null; releaseSurface(); }
}
