import { drawTemplateLayer } from './template-layers.mjs';

function drawSource(context, image, width, height) {
  if (image?.kind === 'nanbo-original-psd-patches') {
    context.save();
    try { context.scale(width / image.width, height / image.height); drawTemplateLayer(context, image); }
    finally { context.restore(); }
  } else context.drawImage(image, 0, 0, width, height);
}

// Preserve the original PSD alpha raster. A small reusable surface avoids an
// extra 48+ megapixel canvas when mobile exports render one strip at a time.
let scratch;
export function drawTintedMask(context, image, width, height, color, visible = null) {
  if (color === '#000000') {
    drawSource(context, image, width, height);
    return;
  }
  const left = Math.max(0, Math.floor(visible?.x ?? 0));
  const top = Math.max(0, Math.floor(visible?.y ?? 0));
  const right = Math.min(width, Math.ceil(visible ? visible.x + visible.width : width));
  const bottom = Math.min(height, Math.ceil(visible ? visible.y + visible.height : height));
  scratch ??= document.createElement('canvas');
  for (let y = top; y < bottom; y += 132) {
    for (let x = left; x < right; x += 2052) {
      scratch.width = Math.min(2052, right - x);
      scratch.height = Math.min(132, bottom - y);
      const mask = scratch.getContext('2d');
      if (!mask) throw new Error('渐变调色内存不足，请关闭其他页面后重试；未降低画质。');
      mask.imageSmoothingEnabled = true;
      mask.imageSmoothingQuality = 'high';
      // Use the full image transform on every tile to keep sampling continuous.
      mask.save();
      try { mask.translate(-x, -y); drawSource(mask, image, width, height); }
      finally { mask.restore(); }
      mask.globalCompositeOperation = 'source-in';
      mask.fillStyle = color;
      mask.fillRect(0, 0, scratch.width, scratch.height);
      context.drawImage(scratch, x, y);
    }
  }
}
