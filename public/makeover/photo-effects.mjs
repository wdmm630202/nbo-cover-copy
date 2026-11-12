import { POSTER, projectPhotoPoint } from './geometry.mjs?v=20261112-photo-ops';
import { eraseShadeWithBrush } from './brush-core.mjs?v=20261112-photo-ops';

const maxMaskEdge = 1200;
let shadeCanvas;
let strokeCanvas;

// Convert stored source anchors into the pane-local coordinates used by the cover brush.
export function projectBrushStroke(stroke, pane, transform) {
  return {
    points: stroke.points.map(point => {
      const posterPoint = projectPhotoPoint(transform, point);
      return { x: (posterPoint.x - pane.x) / pane.width, y: (posterPoint.y - pane.y) / pane.height };
    }),
    size: stroke.radius * transform.width * 2160 / pane.width,
    feather: stroke.feather,
    strength: stroke.strength,
  };
}

function shadePane(context, x, y, width, height, shade, bottomShade) {
  if (shade > 0) {
    context.fillStyle = `rgba(0,0,0,${Math.min(.9, shade / 100)})`;
    context.fillRect(x, y, width, height);
  }
  if (bottomShade > 0) {
    const gradient = context.createLinearGradient(x, y + height * .35, x, y + height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,0,0,${Math.min(.9, bottomShade / 100)})`);
    context.fillStyle = gradient;
    context.fillRect(x, y, width, height);
  }
}

// Only the soft shade mask is downsampled. The photo and PSD retain their native raster.
export function drawPhotoEffects(context, pane, transform, photo, { compareBefore = false, renderWidth = POSTER.width } = {}) {
  const { shade, bottomShade, strokes = [] } = photo;
  if (pane.width <= 0 || pane.height <= 0 || !(shade > 0 || bottomShade > 0)) return;
  if (compareBefore || !strokes.length || transform.width <= 0 || transform.height <= 0) {
    context.save();
    try {
      shadePane(context, pane.x, pane.y, pane.width, pane.height, shade, bottomShade);
    } finally { context.restore(); }
    return;
  }

  const scale = Math.min(renderWidth / POSTER.width, maxMaskEdge / Math.max(pane.width, pane.height));
  const width = Math.max(1, Math.round(pane.width * scale));
  const height = Math.max(1, Math.round(pane.height * scale));
  try {
    shadeCanvas ??= document.createElement('canvas');
    strokeCanvas ??= document.createElement('canvas');
    for (const canvas of [shadeCanvas, strokeCanvas]) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }
    const shadeContext = shadeCanvas.getContext('2d');
    if (!shadeContext || !strokeCanvas.getContext('2d')) throw new Error('画笔图层无法创建，请重新打开编辑器。');
    shadeContext.clearRect(0, 0, width, height);
    shadePane(shadeContext, 0, 0, width, height, shade, bottomShade);
    const projected = strokes.map(stroke => projectBrushStroke(stroke, pane, transform));
    eraseShadeWithBrush(shadeContext, strokeCanvas, width, height, projected);
    context.drawImage(shadeCanvas, pane.x, pane.y, pane.width, pane.height);
  } catch (error) {
    // Reset the shared brush's save stack, composite mode and filter after a
    // failed primitive so a same-size retry starts with clean canvas state.
    for (const canvas of [shadeCanvas, strokeCanvas]) if (canvas) canvas.width = canvas.height = 0;
    throw error;
  }
}
