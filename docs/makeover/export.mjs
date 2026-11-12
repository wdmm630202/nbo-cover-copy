import { POSTER, getPanes, getPhotoTransform } from './geometry.mjs?v=20261112-cover-minimum';

const MOBILE_EXPORT = { width: 2160, height: 2880 };
const MOBILE_FALLBACKS = [{ width: 1536, height: 2048 }, { width: 1080, height: 1440 }];
const CANCELLATION_MESSAGE = '照片或构图已更改，请重新导出。';

export function isMobileMakeoverDevice(environment = globalThis) {
  const { userAgent = '', maxTouchPoints = 0 } = environment.navigator || {};
  return /Android|iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
}

// Expand the composition whenever its current photo placement would discard source pixels.
export function getMakeoverExportSize(photos, split = .5, { mobile = false } = {}) {
  if (mobile) return { ...MOBILE_EXPORT };
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
  return new Promise((resolve, reject) => {
    try { canvas.toBlob(resolve, type, quality); }
    catch (error) {
      if (error?.name === 'AbortError') reject(new Error(CANCELLATION_MESSAGE));
      else resolve(null);
    }
  });
}

/** Desktop keeps source pixels. Mobile uses a bounded HD canvas and retries smaller canvases. */
export async function createMakeoverExportAsset({ format, render, mobile = false,
  width = mobile ? MOBILE_EXPORT.width : POSTER.width,
  height = mobile ? MOBILE_EXPORT.height : POSTER.height, isCancelled = () => false }) {
  if (!['png', 'jpg'].includes(format)) throw new Error('导出格式无效。');
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('导出尺寸无效。');
  const type = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const units = mobile ? Math.floor(Math.min(width / 3, height / 4, MOBILE_EXPORT.width / 3)) : 0;
  if (mobile && units < 1) throw new Error('导出尺寸无效。');
  const sizes = mobile ? [{ width: units * 3, height: units * 4 },
    ...MOBILE_FALLBACKS.filter(size => size.width < units * 3)] : [{ width, height }];
  const checkCurrent = () => {
    if (isCancelled()) throw new Error(CANCELLATION_MESSAGE);
  };

  for (const size of sizes) {
    checkCurrent();
    let canvas;
    let blob;
    try {
      // Allocation and rendering can fail before toBlob on memory-limited browsers.
      let rendered = false;
      try {
        canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        render(canvas);
        rendered = true;
      } catch (error) {
        if (!mobile) throw error;
        if (error?.name === 'AbortError') throw new Error(CANCELLATION_MESSAGE);
      }
      checkCurrent();
      if (rendered) blob = await encode(canvas, type, format === 'jpg' ? 1 : undefined);
      checkCurrent();
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
    }
    checkCurrent();
    if (blob && blob.type !== type) throw new Error('浏览器无法生成指定格式，请更换浏览器重试。');
    if (blob?.size) {
      return { blob, ...size, resized: size.width !== width || size.height !== height };
    }
    if (size !== sizes.at(-1)) {
      // Release backing memory before allowing the next canvas allocation.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  throw new Error(mobile ? '手机高清导出失败，可能超出浏览器内存或画布上限。请关闭其他页面后重试。' :
    '原片像素导出失败，可能超出浏览器内存或画布上限。请关闭其他页面后重试；未降低画质。');
}
