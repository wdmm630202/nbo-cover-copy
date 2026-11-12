import { POSTER } from './geometry.mjs?v=20261112-cover-minimum';

// Decimal MB also stays below a 19.9 MiB upload limit.
export const MAX_EXPORT_BYTES = 19_900_000;
const JPEG_QUALITIES = [.98, .91, .84, .77, .7, .63, .56];
let lastExportTime = -Infinity;

export function getMakeoverExportFileName(format, date = new Date()) {
  if (!['png', 'jpg'].includes(format) || !Number.isFinite(date.getTime())) throw new Error('导出格式或时间无效。');
  // Keep rapid exports distinct using only the date and time, including milliseconds.
  date = new Date(Math.max(date.getTime(), lastExportTime + 1));
  lastExportTime = date.getTime();
  const stamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date).replace(/\D/g, '');
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `南铂素人改造_${stamp.slice(0, 8)}_${stamp.slice(8)}_${milliseconds}.${format}`;
}

function encode(canvas, type, quality) {
  return new Promise(resolve => {
    try { canvas.toBlob(resolve, type, quality); }
    catch { resolve(null); }
  });
}

/** Render from the source photos at every size, never from an encoded JPEG.
 * JPG keeps the native dimensions while trying lower qualities first. PNG has
 * no quality setting, so oversize PNGs must use a smaller 3:4 canvas instead.
 * No asset is returned unless the actual encoded bytes satisfy the cap.
 */
export async function createMakeoverExportAsset({ format, render, isCancelled = () => false }) {
  if (!['png', 'jpg'].includes(format)) throw new Error('导出格式无效。');
  const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const canvas = document.createElement('canvas');
  let units = POSTER.width / 3;
  const checkCurrent = () => {
    if (isCancelled()) throw new Error('照片或构图已更改，请重新导出。');
  };
  try {
    for (let attempt = 0; attempt < 8; attempt++) {
      checkCurrent();
      canvas.width = units * 3;
      canvas.height = units * 4;
      render(canvas);
      checkCurrent();
      let encodedSize = 0;
      for (const quality of format === 'jpg' ? JPEG_QUALITIES : [undefined]) {
        const blob = await encode(canvas, type, quality);
        checkCurrent();
        if (!blob || blob.size === 0) break;
        if (blob.type !== type) throw new Error('浏览器无法生成指定格式，请更换浏览器重试。');
        if (blob.size <= MAX_EXPORT_BYTES) {
          return { blob, width: canvas.width, height: canvas.height, resized: canvas.width !== POSTER.width };
        }
        encodedSize = blob.size;
      }
      if (units === 1) break;
      const scale = encodedSize ? Math.min(.9, Math.sqrt(MAX_EXPORT_BYTES / encodedSize) * .95) : .75;
      units = Math.max(1, Math.floor(units * scale));
    }
    throw new Error('无法将图片控制在19.9MB以内，请关闭其他页面后重试。');
  } finally {
    canvas.width = canvas.height = 0;
  }
}
