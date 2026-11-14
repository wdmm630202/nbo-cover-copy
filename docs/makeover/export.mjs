import { createStripExport } from './strip-export.mjs?v=20261114-complete-mobile-export';
import { POSTER, getPanes, getPhotoTransform } from './geometry.mjs?v=20261112-cover-minimum';

export function isMobileMakeoverDevice(environment = globalThis) {
  const { userAgent = '', maxTouchPoints = 0 } = environment.navigator || {};
  return /Android|iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

// Expand the composition whenever its current photo placement would discard source pixels.
export function getMakeoverExportSize(photos, split = .5) {
  const panes = getPanes(split);
  let scale = 1;
  photos.forEach((photo, side) => {
    if (!photo.image || panes[side].width <= 0) return;
    const { naturalWidth: width, naturalHeight: height } = photo.image;
    const transform = getPhotoTransform(panes[side], width, height, photo);
    scale = Math.max(scale, width / transform.width, height / transform.height);
  });
  const units = Math.ceil(POSTER.width * scale / 3);
  return { width: units * 3, height: units * 4 };
}
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

/** Encode the rendered composition once. Never lower resolution or quality on failure. */
export async function createMakeoverExportAsset({ format, render, width = POSTER.width, height = POSTER.height, isCancelled = () => false, tiled = false, opaque = false, onProgress }) {
  if (!['png', 'jpg'].includes(format)) throw new Error('导出格式无效。');
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('导出尺寸无效。');
  const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const checkCurrent = () => {
    if (isCancelled()) throw new Error('照片或构图已更改，请重新导出。');
  };
  if (tiled) return createStripExport({ format, width, height, render, checkCurrent, opaque, onProgress });
  const canvas = document.createElement('canvas');
  try {
    checkCurrent();
    canvas.width = width;
    canvas.height = height;
    render(canvas);
    checkCurrent();
    const blob = await encode(canvas, type, format === 'jpg' ? 1 : undefined);
    checkCurrent();
    if (!blob || !blob.size) {
      canvas.width = canvas.height = 0;
      return await createStripExport({ format, width, height, render, checkCurrent, opaque, onProgress });
    }
    if (blob.type !== type) throw new Error('浏览器无法生成指定格式，请更换浏览器重试。');
    return { blob, width, height, resized: false };
  } finally {
    canvas.width = canvas.height = 0;
  }
}
