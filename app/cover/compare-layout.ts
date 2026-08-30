export type CompareCanvasSize = { width: number; height: number };
export type CompareRect = { x: number; y: number; width: number; height: number };
export type RetouchTarget = "after" | "before";
export type CoverExportFormat = "jpeg" | "png";
export type ComparisonPhotoAdjustments = {
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  brightness: number;
  shade: number;
  bottomShade: number;
};

const COMPARISON_PHOTO_DEFAULTS: ComparisonPhotoAdjustments = {
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  brightness: 100,
  shade: 0,
  bottomShade: 100,
};

function comparisonNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function normalizeComparisonPhotoAdjustments(
  value: Partial<Record<keyof ComparisonPhotoAdjustments, unknown>> | null = {},
): ComparisonPhotoAdjustments {
  const source = value ?? {};
  return {
    zoom: comparisonNumber(source.zoom, COMPARISON_PHOTO_DEFAULTS.zoom, 100, 300),
    offsetX: comparisonNumber(source.offsetX, COMPARISON_PHOTO_DEFAULTS.offsetX, -100, 100),
    offsetY: comparisonNumber(source.offsetY, COMPARISON_PHOTO_DEFAULTS.offsetY, -100, 100),
    rotation: comparisonNumber(source.rotation, COMPARISON_PHOTO_DEFAULTS.rotation, -180, 180),
    brightness: comparisonNumber(source.brightness, COMPARISON_PHOTO_DEFAULTS.brightness, 0, 200),
    shade: comparisonNumber(source.shade, COMPARISON_PHOTO_DEFAULTS.shade, 0, 100),
    bottomShade: comparisonNumber(source.bottomShade, COMPARISON_PHOTO_DEFAULTS.bottomShade, 0, 100),
  };
}

export function getComparisonPhotoTransform(
  image: { width: number; height: number },
  frame: CompareRect,
  value: Partial<Record<keyof ComparisonPhotoAdjustments, unknown>> | null = {},
) {
  const settings = normalizeComparisonPhotoAdjustments(value);
  const rotationRadians = settings.rotation * Math.PI / 180;
  const cosine = Math.abs(Math.cos(rotationRadians));
  const sine = Math.abs(Math.sin(rotationRadians));
  const naturalWidth = Math.max(1, image.width);
  const naturalHeight = Math.max(1, image.height);
  const coverScale = Math.max(
    (frame.width * cosine + frame.height * sine) / naturalWidth,
    (frame.width * sine + frame.height * cosine) / naturalHeight,
  ) * settings.zoom / 100;

  return {
    drawWidth: naturalWidth * coverScale,
    drawHeight: naturalHeight * coverScale,
    centerX: frame.x + frame.width / 2 + settings.offsetX / 100 * frame.width,
    centerY: frame.y + frame.height / 2 + settings.offsetY / 100 * frame.height,
    rotationRadians,
  };
}

export function resolveRetouchTarget(
  target: unknown,
  comparisonEnabled: boolean,
  hasBeforeImage: boolean,
): RetouchTarget {
  return target === "before" && comparisonEnabled && hasBeforeImage ? "before" : "after";
}

export function getVisibleRetouchStrokes<T>(
  strokes: Record<RetouchTarget, T[]>,
  target: RetouchTarget,
  showBefore: boolean,
) {
  return showBefore ? [] : strokes[target];
}

export function isPointInComparisonPhotoFrame(
  point: { x: number; y: number },
  canvas: CompareCanvasSize,
) {
  const { frame, imageInset } = getComparisonEvidenceLayout(canvas);
  const inset = Math.max(2, Math.round(imageInset * canvas.width / 1080));
  const x = point.x * canvas.width;
  const y = point.y * canvas.height;
  return x >= frame.x + inset
    && x <= frame.x + frame.width - inset
    && y >= frame.y + inset
    && y <= frame.y + frame.height - inset;
}

export function resolveRetouchTargetFromPoint(
  point: { x: number; y: number },
  canvas: CompareCanvasSize,
  comparisonEnabled: boolean,
  hasBeforeImage: boolean,
): RetouchTarget {
  return comparisonEnabled && hasBeforeImage && isPointInComparisonPhotoFrame(point, canvas)
    ? "before"
    : "after";
}

export function resolvePhotoInteractionTargetFromPoint(
  point: { x: number; y: number },
  canvas: CompareCanvasSize,
  comparisonEnabled: boolean,
  hasBeforeImage: boolean,
): RetouchTarget {
  return resolveRetouchTargetFromPoint(point, canvas, comparisonEnabled, hasBeforeImage);
}

export function getAdjustmentPanelVisibility(comparisonEnabled: boolean, target: RetouchTarget) {
  const before = comparisonEnabled && target === "before";
  return {
    selector: comparisonEnabled,
    after: !before,
    before,
  };
}

export function getComparisonSafeRect(canvas: CompareCanvasSize): CompareRect {
  const safeHeight = Math.min(canvas.height, Math.round(canvas.width / 3 * 4));
  return {
    x: 0,
    y: Math.round((canvas.height - safeHeight) / 2),
    width: canvas.width,
    height: safeHeight,
  };
}

export function getComparisonEvidenceLayout(canvas: CompareCanvasSize) {
  const safe = getComparisonSafeRect(canvas);
  const width = Math.round(safe.width * 0.39);
  const height = Math.round(safe.height * 0.42);
  return {
    safe,
    frame: {
      x: safe.x + safe.width - width - Math.round(safe.width * 0.027),
      y: safe.y + safe.height - height - Math.round(safe.height * 0.0194),
      width,
      height,
      radius: Math.round(safe.width * 0.0278),
    },
    imageInset: 4,
  };
}

export function getComparisonLabelLayout(canvas: CompareCanvasSize) {
  const { safe, frame } = getComparisonEvidenceLayout(canvas);
  const scale = canvas.width / 1080;
  const capsule = {
    width: Math.round(104 * scale),
    height: Math.round(54 * scale),
    radius: Math.round(27 * scale),
  };
  return {
    after: { right: safe.x + safe.width - Math.round(48 * scale), y: safe.y + Math.round(48 * scale), ...capsule },
    before: { right: safe.x + safe.width - Math.round(48 * scale), y: frame.y + Math.round(24 * scale), ...capsule },
  };
}

function drawComparisonCapsule(
  context: CanvasRenderingContext2D,
  capsule: { right: number; y: number; width: number; height: number; radius: number },
  word: "前" | "后",
  roundedRectPath: (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => void,
  outputScale: number,
) {
  const x = capsule.right - capsule.width;
  const onePhysicalPixel = 1 / Math.max(0.01, outputScale);
  context.save();
  context.shadowColor = "rgba(0,0,0,.24)";
  context.shadowBlur = Math.max(3, 8 * outputScale);
  context.shadowOffsetY = Math.max(1, 2 * outputScale);
  roundedRectPath(context, x, capsule.y, capsule.width, capsule.height, capsule.radius);
  const shellGradient = context.createLinearGradient(0, capsule.y, 0, capsule.y + capsule.height);
  shellGradient.addColorStop(0, "rgba(126,126,130,.52)");
  shellGradient.addColorStop(0.1, "rgba(79,79,82,.76)");
  shellGradient.addColorStop(0.58, "rgba(50,50,53,.72)");
  shellGradient.addColorStop(1, "rgba(31,31,34,.68)");
  context.fillStyle = shellGradient;
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = Math.max(1.4, onePhysicalPixel);
  context.strokeStyle = "rgba(255,255,255,.52)";
  context.stroke();

  const circleRadius = capsule.height * 0.39;
  const circleX = x + capsule.width - capsule.height / 2;
  const circleY = capsule.y + capsule.height / 2;
  context.shadowColor = "rgba(0,0,0,.2)";
  context.shadowBlur = Math.max(2, 4 * outputScale);
  context.shadowOffsetY = Math.max(0.5, outputScale);
  context.beginPath();
  context.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
  const buttonGradient = context.createLinearGradient(0, circleY - circleRadius, 0, circleY + circleRadius);
  buttonGradient.addColorStop(0, "rgba(255,255,255,.99)");
  buttonGradient.addColorStop(0.55, "rgba(239,239,241,.98)");
  buttonGradient.addColorStop(1, "rgba(205,205,208,.97)");
  context.fillStyle = buttonGradient;
  context.fill();
  context.shadowColor = "transparent";
  context.lineWidth = Math.max(1.2, onePhysicalPixel);
  context.strokeStyle = "rgba(255,255,255,.9)";
  context.stroke();

  context.textBaseline = "middle";
  context.textAlign = "center";
  const labelFontSize = Math.round(capsule.height * 0.34);
  const opticalGap = capsule.height * 0.074;
  const secondCharacterX = circleX - circleRadius - opticalGap - labelFontSize / 2;
  const firstCharacterX = secondCharacterX - labelFontSize - opticalGap;
  context.font = `700 ${labelFontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
  context.fillStyle = "rgba(248,248,250,.96)";
  context.fillText("拍", firstCharacterX, circleY);
  context.fillText("摄", secondCharacterX, circleY);
  context.font = `800 ${Math.round(capsule.height * 0.48)}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
  context.fillStyle = "#252527";
  context.fillText(word, circleX, circleY + 0.5);
  context.restore();
}

export function drawComparisonEditorialOverlay(
  context: CanvasRenderingContext2D,
  canvas: CompareCanvasSize,
  roundedRectPath: (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => void,
) {
  const scale = canvas.width / 1080;
  const baseCanvas = { width: 1080, height: canvas.height / scale };
  const safe = getComparisonSafeRect(baseCanvas);
  const { frame } = getComparisonEvidenceLayout(baseCanvas);
  const labels = getComparisonLabelLayout(baseCanvas);

  context.save();
  context.scale(scale, scale);
  context.beginPath();
  context.rect(safe.x, safe.y, safe.width, safe.height);
  context.clip();
  context.save();
  context.setLineDash([14, 10]);
  context.lineWidth = 3.5;
  context.strokeStyle = "rgba(222,222,224,.86)";
  roundedRectPath(context, frame.x, frame.y, frame.width, frame.height, frame.radius);
  context.stroke();
  context.restore();
  drawComparisonCapsule(context, labels.after, "后", roundedRectPath, scale);
  drawComparisonCapsule(context, labels.before, "前", roundedRectPath, scale);
  context.restore();
}

export function getComparisonFadeStops() {
  return [[0, 0], [0.04, 0.78], [0.08, 1], [0.92, 1], [0.96, 0.78], [1, 0]];
}

export function getComparisonExportError(enabled: boolean, hasBeforeImage: boolean) {
  return enabled && !hasBeforeImage ? "请先添加拍摄前素颜照，或关闭前后对比" : "";
}

export function getComparisonOverlapWarning(enabled: boolean, templateId: string) {
  if (!enabled || templateId.endsWith("-left")) return "";
  return "当前版式可能与右侧对比照重叠，建议选择左侧版式";
}

export function getOriginalPixelExportPlan(
  source: CompareCanvasSize,
  preset: CompareCanvasSize,
  format: CoverExportFormat,
) {
  const sourceWidth = Math.max(1, Math.round(source.width));
  const sourceHeight = Math.max(1, Math.round(source.height));
  const targetRatio = Math.max(1, preset.width) / Math.max(1, preset.height);
  const sourceRatio = sourceWidth / sourceHeight;
  const output = sourceRatio >= targetRatio
    ? { width: Math.max(1, Math.round(sourceHeight * targetRatio)), height: sourceHeight }
    : { width: sourceWidth, height: Math.max(1, Math.round(sourceWidth / targetRatio)) };
  return { ...output, quality: format === "jpeg" ? 0.98 : null };
}

export function getOriginalPixelJpegQualities() {
  return [0.98, 0.91, 0.84, 0.77, 0.7, 0.63, 0.56];
}

export function getOriginalPixelJpegMaxBytes() {
  return 19.9 * 1024 * 1024;
}
