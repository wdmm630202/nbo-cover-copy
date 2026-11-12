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

/** Fit all pane corners inside the rotated photo. Zoom 100 is the minimum cover
 * fit for the current angle; pan is constrained in the photo's own axes.
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
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  // Project the frame onto the image axes, rather than fitting the image's
  // bounding box (which would leave empty triangles after rotation).
  const requiredW = paneW * Math.abs(cosine) + paneH * Math.abs(sine);
  const requiredH = paneW * Math.abs(sine) + paneH * Math.abs(cosine);
  const scale = Math.max(requiredW / sourceW, requiredH / sourceH) * clamp(settings.zoom, 100, 400, 100) / 100;
  const marginX = Math.max(0, (sourceW * scale - requiredW) / 2);
  const marginY = Math.max(0, (sourceH * scale - requiredH) / 2);
  const offsetX = clamp(settings.offsetX, -200, 200, 0) / 100 * paneW;
  const offsetY = clamp(settings.offsetY, -200, 200, 0) / 100 * paneH;
  const localX = clamp(offsetX * cosine + offsetY * sine, -marginX, marginX, 0);
  const localY = clamp(-offsetX * sine + offsetY * cosine, -marginY, marginY, 0);
  const coveredX = localX * cosine - localY * sine;
  const coveredY = localX * sine + localY * cosine;
  // Projection onto a rotated crop can enlarge one world-axis offset. Scale
  // toward the safe center so both percentage controls remain within bounds.
  const panScale = Math.min(1, coveredX ? paneW * 2 / Math.abs(coveredX) : 1,
    coveredY ? paneH * 2 / Math.abs(coveredY) : 1);
  return {
    centerX: (Number.isFinite(pane.x) ? pane.x : 0) + paneW / 2 + coveredX * panScale,
    centerY: (Number.isFinite(pane.y) ? pane.y : 0) + paneH / 2 + coveredY * panScale,
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
