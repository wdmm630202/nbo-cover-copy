import { encodeJpegRows } from './vendor/jpeg-encoder.mjs?v=20261113-mobile-strips';

const ROWS = 128;
const TILE_WIDTH = 2048;
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

export async function encodePngRows(width, height, readRows, checkCurrent) {
  if (typeof CompressionStream !== 'function') throw new Error('当前浏览器不支持原片分块导出，请更新Safari或浏览器后重试。');
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
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
    const stride = width * 4;
    for (let y = 0; y < height; y += ROWS) {
      checkCurrent();
      const rows = Math.min(ROWS, height - y), rgba = await readRows(y, rows);
      const filtered = new Uint8Array((stride + 1) * rows);
      for (let row = 0; row < rows; row++) {
        const from = row * stride, to = row * (stride + 1);
        filtered[to] = 1; // PNG Sub filter is reversible; no quantization.
        for (let x = 0; x < stride; x++) filtered[to + 1 + x] = (rgba[from + x] - (x >= 4 ? rgba[from + x - 4] : 0)) & 255;
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

/** The only canvas is at most 2052 x 132, even for 48+ megapixel output. */
export async function createStripExport({ format, width, height, render, checkCurrent, onProgress = () => {} }) {
  const canvas = document.createElement('canvas');
  const readRows = async (y, rows) => {
    checkCurrent();
    const rgba = new Uint8Array(width * rows * 4), gutter = 2;
    for (let x = 0; x < width; x += TILE_WIDTH) {
      checkCurrent();
      const columns = Math.min(TILE_WIDTH, width - x);
      canvas.width = columns + gutter * 2; canvas.height = rows + gutter * 2;
      render(canvas, { x: x - gutter, y: y - gutter, width, height });
      const context = canvas.getContext('2d');
      if (!context) throw new Error('手机绘图内存不足，请关闭其他页面后重试；未降低画质。');
      const pixels = context.getImageData(gutter, gutter, columns, rows).data;
      for (let row = 0; row < rows; row++) rgba.set(pixels.subarray(row * columns * 4, (row + 1) * columns * 4), (row * width + x) * 4);
    }
    onProgress(Math.floor(y / height * 100));
    // Yield between strips to let touch, cancellation and Safari's memory reclamation run.
    await new Promise(resolve => setTimeout(resolve, 0));
    checkCurrent(); return rgba;
  };
  try {
    const blob = format === 'png' ? await encodePngRows(width, height, readRows, checkCurrent) : await encodeJpegRows(width, height, readRows);
    checkCurrent(); onProgress(100);
    return { blob, width, height, resized: false };
  } finally { canvas.width = canvas.height = 0; }
}
