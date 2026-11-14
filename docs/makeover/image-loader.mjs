// Local/embedded image decoding must settle even if a browser omits both events.
export function decodeImage(url, { Image: ImageClass = globalThis.Image, timeoutMs = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    const image = new ImageClass();
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (error) { image.src = 'data:,'; reject(error); }
      else resolve(image);
    };
    const timer = setTimeout(() => finish(new Error('图片读取超时，请重新选择照片或重新打开制作台。')), timeoutMs);
    image.onload = () => finish(image.naturalWidth && image.naturalHeight ? null : new Error('图片没有有效尺寸'));
    image.onerror = () => finish(new Error('无法解码图片'));
    try { image.src = url; }
    catch { finish(new Error('无法解码图片')); }
  });
}
