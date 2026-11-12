export const POSTER = { width: 6000, height: 8000 };
export const PHOTO_AREA = { x: 13, y: 232, width: 5974, height: 7755 };

const clamp = (value, min, max, fallback) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));

export function clampSplit(value) {
  return clamp(value, 0, 1, .5);
}

export function getPanes(split, renderWidth = POSTER.width) {
  const fraction = clampSplit(split);
  const pixelsPerUnit = Math.max(1, Number.isFinite(renderWidth) ? renderWidth : POSTER.width) / POSTER.width;
  const requestedBoundary = PHOTO_AREA.x + PHOTO_AREA.width * fraction;
  // One shared integer render-pixel boundary prevents both clips from partially
  // compositing onto white. Keep the original outer edges, including 0/100%.
  const boundary = fraction === 0 ? PHOTO_AREA.x : fraction === 1 ? PHOTO_AREA.x + PHOTO_AREA.width :
    clamp(Math.round(requestedBoundary * pixelsPerUnit) / pixelsPerUnit, PHOTO_AREA.x, PHOTO_AREA.x + PHOTO_AREA.width, requestedBoundary);
  const width = boundary - PHOTO_AREA.x;
  return [
    { ...PHOTO_AREA, width },
    { ...PHOTO_AREA, x: boundary, width: PHOTO_AREA.x + PHOTO_AREA.width - boundary },
  ];
}

// Pan is normalized to [-1, 1] of each axis's available crop margin.
// A shared scale preserves source aspect ratio, even at a zero-width split edge.
export function coverImage(pane, sourceWidth, sourceHeight, zoom = 1, panX = 0, panY = 0) {
  const safeWidth = Math.max(1, Number.isFinite(sourceWidth) ? sourceWidth : 1);
  const safeHeight = Math.max(1, Number.isFinite(sourceHeight) ? sourceHeight : 1);
  const scale = Math.max(pane.width / safeWidth, pane.height / safeHeight) * clamp(zoom, 1, 4, 1);
  const width = safeWidth * scale;
  const height = safeHeight * scale;
  const marginX = Math.max(0, (width - pane.width) / 2);
  const marginY = Math.max(0, (height - pane.height) / 2);
  return {
    x: pane.x - marginX + clamp(panX, -1, 1, 0) * marginX,
    y: pane.y - marginY + clamp(panY, -1, 1, 0) * marginY,
    width, height, marginX, marginY,
  };
}

/** Match the proven cover renderer: cover the rotated source bounding box, then
 * translate in pane percentages. At zoom 100 and rotation 0 this is the existing
 * centered cover fit; intentional zoom-out/translation may reveal the pane fill.
 * Callers clip to the pane, then translate, rotate and draw centered at (0, 0).
 * @param {{x:number,y:number,width:number,height:number}} pane
 * @param {number} sourceWidth
 * @param {number} sourceHeight
 * @param {{zoom?:number,offsetX?:number,offsetY?:number,rotation?:number}} settings
 */
export function getPhotoTransform(pane, sourceWidth, sourceHeight, settings = {}) {
  const sourceW = Math.max(1, Number.isFinite(sourceWidth) ? sourceWidth : 1);
  const sourceH = Math.max(1, Number.isFinite(sourceHeight) ? sourceHeight : 1);
  const paneW = Math.max(0, Number.isFinite(pane.width) ? pane.width : 0);
  const paneH = Math.max(0, Number.isFinite(pane.height) ? pane.height : 0);
  const rotationRadians = clamp(settings.rotation, -180, 180, 0) * Math.PI / 180;
  const cosine = Math.abs(Math.cos(rotationRadians));
  const sine = Math.abs(Math.sin(rotationRadians));
  const rotatedW = sourceW * cosine + sourceH * sine;
  const rotatedH = sourceW * sine + sourceH * cosine;
  const scale = Math.max(paneW / rotatedW, paneH / rotatedH) * clamp(settings.zoom, 0, 400, 100) / 100;
  return {
    centerX: (Number.isFinite(pane.x) ? pane.x : 0) + paneW / 2 + clamp(settings.offsetX, -200, 200, 0) / 100 * paneW,
    centerY: (Number.isFinite(pane.y) ? pane.y : 0) + paneH / 2 + clamp(settings.offsetY, -200, 200, 0) / 100 * paneH,
    width: sourceW * scale,
    height: sourceH * scale,
    rotationRadians,
  };
}

/** Round/clamp like the cover pointer path, then snap within three degrees.
 * @param {number} value */
export function snapPhotoRotation(value) {
  const rotation = clamp(Math.round(value), -180, 180, 0);
  const angles = [-180, -90, 0, 90, 180];
  const nearest = angles.reduce((best, angle) => Math.abs(angle - rotation) < Math.abs(best - rotation) ? angle : best);
  const snapped = Math.abs(nearest - rotation) <= 3;
  return { value: snapped ? nearest : rotation, guide: snapped ? (Math.abs(nearest) === 90 ? 'vertical' : 'horizontal') : '' };
}

/** @param {number} startRotation @param {number} deltaX @param {number} paneDisplayWidth */
export function rotationFromDrag(startRotation, deltaX, paneDisplayWidth) {
  const start = Number.isFinite(startRotation) ? startRotation : 0;
  const delta = Number.isFinite(deltaX) && Number.isFinite(paneDisplayWidth) && paneDisplayWidth > 0 ? deltaX / paneDisplayWidth * 180 : 0;
  return snapPhotoRotation(start + delta);
}

/** Convert a poster point into normalized, unbounded source coordinates.
 * A caller may reject outside-source points for a brush; do not clamp here,
 * because doing so would bend a stroke dragged past the photograph's edge.
 * @param {{centerX:number,centerY:number,width:number,height:number,rotationRadians:number}} transform
 * @param {{x:number,y:number}} point
 */
export function inversePhotoPoint(transform, point) {
  if (![transform.centerX, transform.centerY, transform.width, transform.height, transform.rotationRadians, point.x, point.y].every(Number.isFinite) || transform.width <= 0 || transform.height <= 0) return null;
  const x = point.x - transform.centerX;
  const y = point.y - transform.centerY;
  const cosine = Math.cos(transform.rotationRadians);
  const sine = Math.sin(transform.rotationRadians);
  return { x: (x * cosine + y * sine) / transform.width + .5, y: (-x * sine + y * cosine) / transform.height + .5 };
}

/** Project a normalized source anchor through the exact canvas photo transform.
 * @param {{centerX:number,centerY:number,width:number,height:number,rotationRadians:number}} transform
 * @param {{x:number,y:number}} point
 */
export function projectPhotoPoint(transform, point) {
  const x = (point.x - .5) * transform.width;
  const y = (point.y - .5) * transform.height;
  const cosine = Math.cos(transform.rotationRadians);
  const sine = Math.sin(transform.rotationRadians);
  return { x: transform.centerX + x * cosine - y * sine, y: transform.centerY + x * sine + y * cosine };
}
