import {
  DOUYIN_HOME_GRID_SAFE_AREA,
  type CoverTemplate,
  type PlatformPreset,
} from "../cover-config";
import {
  drawComparisonEditorialOverlay,
  getComparisonEvidenceLayout,
  getComparisonFadeStops,
  getComparisonPhotoTransform,
} from "../compare-layout";
import type { CoverSettings } from "./editor-settings";
import { eraseShadeWithBrush, type RetouchStroke } from "./retouch-core";

export type CoverRenderInput = {
  canvas: HTMLCanvasElement;
  image: HTMLImageElement | null;
  beforeImage: HTMLImageElement | null;
  watermark: HTMLImageElement | null;
  settings: CoverSettings;
  preset: PlatformPreset;
  includeGuide: boolean;
  outputSize?: { width: number; height: number };
  photoOnly?: boolean;
  retouchStrokes?: RetouchStroke[];
  beforeRetouchStrokes?: RetouchStroke[];
};

type CoverScratchKind = "shade" | "stroke" | "compare";
type CoverScratch = Partial<Record<CoverScratchKind, HTMLCanvasElement>>;

const coverScratch = new WeakMap<HTMLCanvasElement, CoverScratch>();

function getCoverScratch(
  canvas: HTMLCanvasElement,
  kind: CoverScratchKind,
  width: number,
  height: number,
) {
  let scratch = coverScratch.get(canvas);
  if (!scratch) {
    scratch = {};
    coverScratch.set(canvas, scratch);
  }
  let item = scratch[kind];
  if (!item) {
    item = document.createElement("canvas");
    scratch[kind] = item;
  }
  if (item.width !== width) item.width = width;
  if (item.height !== height) item.height = height;
  return item;
}

function releaseCoverScratch(canvas: HTMLCanvasElement, kind: CoverScratchKind) {
  const scratch = coverScratch.get(canvas);
  const item = scratch?.[kind];
  if (!scratch || !item) return;
  item.width = item.height = 1;
  delete scratch[kind];
  if (!Object.keys(scratch).length) coverScratch.delete(canvas);
}

export function releaseCoverScratchCanvases(canvas: HTMLCanvasElement) {
  const scratch = coverScratch.get(canvas);
  if (scratch) {
    Object.values(scratch).forEach((item) => {
      item.width = item.height = 1;
    });
    coverScratch.delete(canvas);
  }
}

export function releaseCoverCanvas(canvas: HTMLCanvasElement) {
  releaseCoverScratchCanvases(canvas);
  canvas.width = canvas.height = 1;
}

const WATERMARK_VISIBLE_HEIGHT_AT_1080 = 32;
const WATERMARK_BOTTOM_GAP_AT_1080 = 36;
const getWatermarkVisibleHeight = (width: number) => Math.round(WATERMARK_VISIBLE_HEIGHT_AT_1080 * (width / 1080));
const getWatermarkBottomGap = (width: number) => Math.round(WATERMARK_BOTTOM_GAP_AT_1080 * (width / 1080));
function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

export function getBeforeOffsetLimits(
  beforeImage: HTMLImageElement | null,
  frame: { width: number; height: number },
  beforeZoom: number,
  beforeRotation = 0,
) {
  if (!beforeImage || !beforeImage.naturalWidth || !beforeImage.naturalHeight) return { x: 0, y: 0 };
  const transform = getComparisonPhotoTransform(
    { width: beforeImage.naturalWidth, height: beforeImage.naturalHeight },
    { x: 0, y: 0, width: frame.width, height: frame.height },
    { zoom: beforeZoom, rotation: beforeRotation },
  );
  const cosine = Math.abs(Math.cos(transform.rotationRadians));
  const sine = Math.abs(Math.sin(transform.rotationRadians));
  const drawWidth = transform.drawWidth * cosine + transform.drawHeight * sine;
  const drawHeight = transform.drawWidth * sine + transform.drawHeight * cosine;
  return {
    x: Math.min(100, Math.max(0, (drawWidth - frame.width) / 2 / frame.width * 100)),
    y: Math.min(100, Math.max(0, (drawHeight - frame.height) / 2 / frame.height * 100)),
  };
}

export function getBeforeImageFrame(canvas: { width: number; height: number }, frameScale = 100) {
  const { frame, imageInset } = getComparisonEvidenceLayout(canvas, frameScale);
  const inset = Math.max(2, Math.round(imageInset * canvas.width / 1080));
  return {
    x: frame.x + inset,
    y: frame.y + inset,
    width: frame.width - inset * 2,
    height: frame.height - inset * 2,
    radius: Math.max(1, frame.radius - inset),
  };
}

function applyComparisonFadeMask(
  context: CanvasRenderingContext2D,
  frame: { x: number; y: number; width: number; height: number },
) {
  context.save();
  context.globalCompositeOperation = "destination-in";
  const horizontalMask = context.createLinearGradient(frame.x, 0, frame.x + frame.width, 0);
  const verticalMask = context.createLinearGradient(0, frame.y, 0, frame.y + frame.height);
  for (const [stop, alpha] of getComparisonFadeStops()) {
    horizontalMask.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    verticalMask.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  }
  context.fillStyle = horizontalMask;
  context.fillRect(frame.x, frame.y, frame.width, frame.height);
  context.fillStyle = verticalMask;
  context.fillRect(frame.x, frame.y, frame.width, frame.height);
  context.restore();
}

function drawComparisonEvidence(
  context: CanvasRenderingContext2D,
  ownerCanvas: HTMLCanvasElement,
  beforeImage: HTMLImageElement | null,
  settings: CoverSettings,
  width: number,
  height: number,
  beforeRetouchStrokes: RetouchStroke[],
) {
  const { frame } = getComparisonEvidenceLayout({ width, height }, settings.beforeFrameScale);
  const imageFrame = getBeforeImageFrame({ width, height }, settings.beforeFrameScale);

  if (!beforeImage) {
    context.save();
    roundedRectPath(context, imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, imageFrame.radius);
    context.clip();
    context.fillStyle = "rgba(28,28,28,.66)";
    context.fillRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
    context.fillStyle = "rgba(238,238,238,.86)";
    context.font = `600 ${Math.max(12, Math.round(width * 0.018))}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("请添加拍摄前素颜照", frame.x + frame.width / 2, frame.y + frame.height / 2, frame.width * 0.82);
    context.restore();
    return;
  }

  const scratch = getCoverScratch(ownerCanvas, "compare", width, height);
  const scratchContext = scratch.getContext("2d");
  if (!scratchContext) return;
  scratchContext.clearRect(0, 0, width, height);
  scratchContext.save();
  roundedRectPath(scratchContext, imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, imageFrame.radius);
  scratchContext.clip();
  const offsetLimits = getBeforeOffsetLimits(beforeImage, imageFrame, settings.beforeZoom, settings.beforeRotation);
  const offsetX = Math.max(-offsetLimits.x, Math.min(offsetLimits.x, settings.beforeOffsetX));
  const offsetY = Math.max(-offsetLimits.y, Math.min(offsetLimits.y, settings.beforeOffsetY));
  const transform = getComparisonPhotoTransform(
    { width: beforeImage.naturalWidth, height: beforeImage.naturalHeight },
    imageFrame,
    {
      zoom: settings.beforeZoom,
      offsetX,
      offsetY,
      rotation: settings.beforeRotation,
    },
  );
  scratchContext.filter = `brightness(${settings.beforeBrightness}%)`;
  scratchContext.translate(transform.centerX, transform.centerY);
  scratchContext.rotate(transform.rotationRadians);
  scratchContext.drawImage(beforeImage, -transform.drawWidth / 2, -transform.drawHeight / 2, transform.drawWidth, transform.drawHeight);
  scratchContext.setTransform(1, 0, 0, 1, 0, 0);
  scratchContext.filter = "none";
  scratchContext.restore();
  applyComparisonFadeMask(scratchContext, imageFrame);
  context.drawImage(scratch, 0, 0);

  if (settings.beforeShade > 0 || settings.beforeBottomShade > 0) {
    const shadeCanvas = getCoverScratch(ownerCanvas, "shade", width, height);
    const strokeCanvas = getCoverScratch(ownerCanvas, "stroke", width, height);
    const shadeContext = shadeCanvas.getContext("2d");
    if (!shadeContext) return;
    shadeContext.clearRect(0, 0, width, height);
    shadeContext.save();
    roundedRectPath(shadeContext, imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, imageFrame.radius);
    shadeContext.clip();
    if (settings.beforeShade > 0) {
      const shadeAlpha = Math.max(0, Math.min(0.9, settings.beforeShade / 100));
      shadeContext.fillStyle = `rgba(0,0,0,${shadeAlpha})`;
      shadeContext.fillRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
    }
    if (settings.beforeBottomShade > 0) {
      const bottomAlpha = Math.max(0, Math.min(0.9, settings.beforeBottomShade / 100));
      const bottomGradient = shadeContext.createLinearGradient(0, imageFrame.y + imageFrame.height * 0.35, 0, imageFrame.y + imageFrame.height);
      bottomGradient.addColorStop(0, "rgba(0,0,0,0)");
      bottomGradient.addColorStop(1, `rgba(0,0,0,${bottomAlpha})`);
      shadeContext.fillStyle = bottomGradient;
      shadeContext.fillRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
    }
    shadeContext.restore();
    eraseShadeWithBrush(shadeContext, strokeCanvas, width, height, beforeRetouchStrokes);
    applyComparisonFadeMask(shadeContext, imageFrame);
    context.drawImage(shadeCanvas, 0, 0);
  }
}

export function drawCover({
  canvas,
  image,
  beforeImage,
  watermark,
  settings,
  preset,
  includeGuide,
  outputSize,
  photoOnly = false,
  retouchStrokes = [],
  beforeRetouchStrokes = [],
}: CoverRenderInput): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  const { width, height } = outputSize ?? preset;
  if (!settings.compareEnabled || photoOnly) releaseCoverScratch(canvas, "compare");
  if ((!retouchStrokes.length && !beforeRetouchStrokes.length) || photoOnly) {
    releaseCoverScratch(canvas, "shade");
    releaseCoverScratch(canvas, "stroke");
  }
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#151515";
  context.fillRect(0, 0, width, height);

  if (image) {
    const radians = settings.rotation * Math.PI / 180;
    const rotatedWidth = Math.abs(image.naturalWidth * Math.cos(radians)) + Math.abs(image.naturalHeight * Math.sin(radians));
    const rotatedHeight = Math.abs(image.naturalWidth * Math.sin(radians)) + Math.abs(image.naturalHeight * Math.cos(radians));
    const baseScale = Math.max(width / rotatedWidth, height / rotatedHeight);
    const scale = baseScale * settings.zoom / 100;
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    context.save();
    context.filter = `brightness(${settings.brightness}%)`;
    context.translate(width / 2 + (settings.offsetX / 100) * width, height / 2 + (settings.offsetY / 100) * height);
    context.rotate(radians);
    context.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    context.restore();
  } else {
    const placeholder = context.createLinearGradient(0, 0, width, height);
    placeholder.addColorStop(0, "#161616");
    placeholder.addColorStop(0.58, "#2b2725");
    placeholder.addColorStop(1, "#0d0d0d");
    context.fillStyle = placeholder;
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(255,255,255,.36)";
    context.font = `600 ${Math.round(width * 0.034)}px sans-serif`;
    context.textAlign = "center";
    context.fillText("上传照片后在这里预览", width / 2, height / 2);
  }

  if (!photoOnly) {
    if (retouchStrokes.length) {
      const shadeCanvas = getCoverScratch(canvas, "shade", width, height);
      const strokeCanvas = getCoverScratch(canvas, "stroke", width, height);
      const shadeContext = shadeCanvas.getContext("2d");
      if (shadeContext) {
        shadeContext.clearRect(0, 0, width, height);
        drawTemplateShade(shadeContext, settings.templateId, width, height, settings.shade, settings.bottomShade);
        eraseShadeWithBrush(shadeContext, strokeCanvas, width, height, retouchStrokes);
        context.drawImage(shadeCanvas, 0, 0);
      }
    } else {
      drawTemplateShade(context, settings.templateId, width, height, settings.shade, settings.bottomShade);
    }
    if (settings.compareEnabled) {
      drawComparisonEvidence(context, canvas, beforeImage, settings, width, height, beforeRetouchStrokes);
    }
    drawCoverText(context, settings, width, height, watermark);
    if (settings.compareEnabled) {
      drawComparisonEditorialOverlay(context, { width, height }, roundedRectPath, settings.beforeFrameScale);
    }
    if (watermark) drawWatermark(context, watermark, settings, width, height);
  }

  if (!photoOnly && includeGuide && settings.showSafeArea && preset.id === "douyin") {
    const guideScale = width / preset.width;
    const safeHeight = width / 3 * 4;
    const safeTop = (height - safeHeight) / 2;
    context.save();
    context.setLineDash([18 * guideScale, 14 * guideScale]);
    context.lineWidth = 4 * guideScale;
    context.strokeStyle = "rgba(254,232,0,.92)";
    context.strokeRect(18 * guideScale, safeTop, width - 36 * guideScale, safeHeight);
    context.setLineDash([]);
    context.fillStyle = "rgba(254,232,0,.94)";
    context.font = `700 ${Math.round(width * 0.024)}px sans-serif`;
    context.textAlign = "right";
    context.fillText("主页 3:4 安全区（导出时自动隐藏）", width - 30 * guideScale, safeTop + 38 * guideScale);
    const reserveTop = (DOUYIN_HOME_GRID_SAFE_AREA.cropBottom - DOUYIN_HOME_GRID_SAFE_AREA.playCountReserve) * guideScale;
    const reserveHeight = DOUYIN_HOME_GRID_SAFE_AREA.playCountReserve * guideScale;
    context.fillStyle = "rgba(255,45,70,.12)";
    context.fillRect(18 * guideScale, reserveTop, width - 36 * guideScale, reserveHeight);
    context.setLineDash([12 * guideScale, 10 * guideScale]);
    context.strokeStyle = "rgba(255,80,96,.9)";
    context.beginPath();
    context.moveTo(18 * guideScale, reserveTop);
    context.lineTo(width - 18 * guideScale, reserveTop);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "rgba(255,110,120,.96)";
    context.textAlign = "left";
    context.fillText("播放量避让区 144px", 30 * guideScale, reserveTop + 38 * guideScale);
    context.restore();
  }
}

function drawTemplateShade(
  context: CanvasRenderingContext2D,
  templateId: CoverTemplate["id"],
  width: number,
  height: number,
  shade: number,
  bottomShade: number,
) {
  const alpha = Math.max(0, Math.min(0.9, shade / 100));
  let gradient: CanvasGradient;

  if (templateId.startsWith("bottom-")) {
    gradient = context.createLinearGradient(0, height * 0.35, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
  } else if (templateId.endsWith("-right")) {
    gradient = context.createLinearGradient(width * 0.18, 0, width, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
  } else if (templateId === "middle-center") {
    gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha * 0.3})`);
    gradient.addColorStop(0.5, `rgba(0,0,0,${alpha * 0.12})`);
    gradient.addColorStop(1, `rgba(0,0,0,${alpha * 0.72})`);
  } else {
    gradient = context.createLinearGradient(0, 0, width * 0.82, 0);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gradient.addColorStop(0.68, `rgba(0,0,0,${alpha * 0.36})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  if (bottomShade > 0) {
    const bottomAlpha = Math.max(0, Math.min(0.9, bottomShade / 100));
    const bottomGradient = context.createLinearGradient(0, height * 0.35, 0, height);
    bottomGradient.addColorStop(0, "rgba(0,0,0,0)");
    bottomGradient.addColorStop(1, `rgba(0,0,0,${bottomAlpha})`);
    context.fillStyle = bottomGradient;
    context.fillRect(0, 0, width, height);
  }
}

function colorWithAlpha(color: string, alpha: number) {
  const value = Number.parseInt(color.replace("#", ""), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
}

export function drawCoverText(
  context: CanvasRenderingContext2D,
  settings: CoverSettings,
  width: number,
  height: number,
  watermark: HTMLImageElement | null,
) {
  const isRight = settings.templateId.endsWith("-right");
  const isCenter = settings.templateId.endsWith("-center");
  const textAlign: CanvasTextAlign = isRight ? "right" : isCenter ? "center" : "left";
  const geometryScale = width / 1080;
  const horizontalInset = DOUYIN_HOME_GRID_SAFE_AREA.horizontalInset * geometryScale;
  const x = isRight ? width - horizontalInset : isCenter ? width / 2 : horizontalInset;
  const maxWidth = width - horizontalInset * 2;
  const topBaseFont = Math.max(1, Math.round(width * 0.074 * 2.1 * (settings.textScale / 100)));
  const bottomBaseFont = Math.max(1, Math.round(width * 0.074 * 2.1 * (settings.bottomTextScale / 100)));
  context.save();
  context.textAlign = textAlign;
  const textStroke = Math.max(0, Math.min(1, settings.textStroke / 100));
  const textShadow = Math.max(0, Math.min(1, settings.textShadow / 100));
  context.lineJoin = "round";
  context.strokeStyle = `rgba(0,0,0,${0.92 * textStroke})`;
  context.lineWidth = width * 0.012 * textStroke;
  context.shadowColor = `rgba(0,0,0,${0.78 * textShadow})`;
  context.shadowBlur = width * 0.024 * textShadow;
  context.shadowOffsetX = width * 0.004 * textShadow;
  context.shadowOffsetY = width * 0.006 * textShadow;

  const hasBottomText = Boolean(settings.bottomText.trim());
  const topFit = fitText(context, settings.topText, topBaseFont, maxWidth);
  const bottomFit = hasBottomText ? fitText(context, settings.bottomText, settings.textScaleLinked ? topBaseFont : bottomBaseFont, maxWidth) : topFit;
  const linkedFontSize = Math.min(topFit, bottomFit);
  const topFontSize = settings.textScaleLinked ? linkedFontSize : topFit;
  const bottomFontSize = settings.textScaleLinked ? linkedFontSize : bottomFit;
  const subtitleFontSize = Math.round(width * 0.061 * (settings.subtitleScale / 100));
  const activeHeadlineFontSize = hasBottomText ? bottomFontSize : topFontSize;
  context.font = `900 ${topFontSize}px sans-serif`;
  const topHeadlineInk = measureInkBounds(context, settings.topText || "国");
  context.font = `900 ${activeHeadlineFontSize}px sans-serif`;
  const activeHeadlineInk = measureInkBounds(context, settings.bottomText || settings.topText || "国");
  context.font = `400 ${subtitleFontSize}px sans-serif`;
  const subtitleInk = measureInkBounds(context, settings.subtitle || "国");
  const fixedVerticalGap = getWatermarkVisibleHeight(width);
  const lineGap = Math.round(topHeadlineInk.descent + fixedVerticalGap + activeHeadlineInk.ascent);
  const dividerThickness = 4;
  const relativeActiveBaseline = hasBottomText ? lineGap : 0;
  const relativeDividerY = Math.round(relativeActiveBaseline + activeHeadlineInk.descent + fixedVerticalGap);
  const relativeSubtitleBaseline = Math.round(relativeDividerY + dividerThickness + fixedVerticalGap + subtitleInk.ascent);
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.45);
  const subtitleLines = countWrappedLines(settings.subtitle);
  const blockTop = -topHeadlineInk.ascent;
  const blockBottom = settings.subtitle.trim()
    ? relativeSubtitleBaseline + (subtitleLines - 1) * subtitleLineHeight + subtitleInk.descent
    : settings.showDivider
      ? relativeDividerY + dividerThickness
      : relativeActiveBaseline + activeHeadlineInk.descent;
  const isDouyinCanvas = height / width > 1.5;
  const cropTop = isDouyinCanvas ? DOUYIN_HOME_GRID_SAFE_AREA.cropTop * geometryScale : 0;
  const cropBottom = isDouyinCanvas ? DOUYIN_HOME_GRID_SAFE_AREA.cropBottom * geometryScale : height;
  const usableTop = cropTop + DOUYIN_HOME_GRID_SAFE_AREA.verticalInset * geometryScale;
  const playCountReserve = isDouyinCanvas ? DOUYIN_HOME_GRID_SAFE_AREA.playCountReserve * geometryScale : 0;
  const usableBottom = cropBottom - playCountReserve - DOUYIN_HOME_GRID_SAFE_AREA.verticalInset * geometryScale;
  const watermarkBounds = watermark ? getWatermarkVisibleBounds(watermark) : null;
  const fixedWatermarkScale = watermarkBounds ? getWatermarkVisibleHeight(width) / Math.max(1, watermarkBounds.bottom - watermarkBounds.top) : 0;
  const watermarkEdgeGap = getWatermarkBottomGap(width);
  const watermarkBottom = cropBottom - playCountReserve - watermarkEdgeGap;
  const watermarkTop = watermark
    ? watermarkBottom - ((watermarkBounds?.bottom ?? 0) - (watermarkBounds?.top ?? 0)) * fixedWatermarkScale
    : Number.POSITIVE_INFINITY;
  const bottomTextLimit = Math.min(usableBottom, watermarkTop - fixedVerticalGap);
  const requestedY = settings.templateId.startsWith("top-")
    ? usableTop - blockTop
    : settings.templateId.startsWith("bottom-")
      ? bottomTextLimit - blockBottom
      : (cropTop + cropBottom) / 2 - blockTop;
  const y = Math.round(Math.max(usableTop - blockTop, Math.min(requestedY, bottomTextLimit - blockBottom)));
  const secondBaseline = y + lineGap;
  const activeHeadlineBaseline = hasBottomText ? secondBaseline : y;
  const dividerY = y + relativeDividerY;
  const subtitleBaseline = y + relativeSubtitleBaseline;

  context.fillStyle = settings.topColor;
  context.font = `900 ${topFontSize}px sans-serif`;
  if (textStroke > 0) context.strokeText(settings.topText || "上行标题", x, y, maxWidth);
  context.fillText(settings.topText || "上行标题", x, y, maxWidth);

  if (settings.bottomText.trim()) {
    context.fillStyle = settings.bottomColor;
    context.font = `900 ${bottomFontSize}px sans-serif`;
    if (textStroke > 0) context.strokeText(settings.bottomText, x, secondBaseline, maxWidth);
    context.fillText(settings.bottomText, x, secondBaseline, maxWidth);
  }

  if (settings.showDivider) {
    const dividerWidth = activeHeadlineFontSize;
    const dividerX = isRight ? x - dividerWidth : isCenter ? x - dividerWidth / 2 : x;
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = 0;
    const dividerGradient = context.createLinearGradient(dividerX, 0, dividerX + dividerWidth, 0);
    dividerGradient.addColorStop(0, colorWithAlpha(settings.dividerColor, 0));
    dividerGradient.addColorStop(0.18, colorWithAlpha(settings.dividerColor, 1));
    dividerGradient.addColorStop(0.82, colorWithAlpha(settings.dividerColor, 1));
    dividerGradient.addColorStop(1, colorWithAlpha(settings.dividerColor, 0));
    context.fillStyle = dividerGradient;
    context.fillRect(Math.round(dividerX), dividerY, Math.round(dividerWidth), dividerThickness);
  }

  if (settings.subtitle.trim()) {
    context.shadowColor = `rgba(0,0,0,${0.78 * textShadow})`;
    context.shadowBlur = width * 0.024 * textShadow;
    context.shadowOffsetX = width * 0.004 * textShadow;
    context.shadowOffsetY = width * 0.006 * textShadow;
    context.fillStyle = settings.subtitleColor;
    context.font = `400 ${subtitleFontSize}px sans-serif`;
    drawWrappedText(
      context,
      settings.subtitle,
      x,
      settings.showDivider ? subtitleBaseline : activeHeadlineBaseline + activeHeadlineInk.descent + fixedVerticalGap + subtitleInk.ascent,
      maxWidth,
      subtitleLineHeight,
      textAlign,
    );
  }

  context.font = `900 ${topFontSize}px sans-serif`;
  const topWidth = Math.min(maxWidth, context.measureText(settings.topText || "上行标题").width);
  context.font = `900 ${bottomFontSize}px sans-serif`;
  const bottomWidth = hasBottomText ? Math.min(maxWidth, context.measureText(settings.bottomText).width) : 0;
  context.font = `400 ${subtitleFontSize}px sans-serif`;
  const subtitleWidth = getWrappedTextWidth(context, settings.subtitle, maxWidth);
  const contentWidth = Math.max(topWidth, bottomWidth, settings.showDivider ? activeHeadlineFontSize : 0, subtitleWidth);
  const left = isRight ? x - contentWidth : isCenter ? x - contentWidth / 2 : x;
  const bounds = {
    left,
    right: left + contentWidth,
    top: y + blockTop,
    bottom: y + blockBottom,
  };
  context.restore();
  return bounds;
}

function drawWatermark(
  context: CanvasRenderingContext2D,
  watermark: HTMLImageElement,
  settings: CoverSettings,
  width: number,
  height: number,
) {
  // The transparent PNG canvas is the positioning contract. Fit that complete
  // canvas to the cover instead of sizing from the visible logo pixels.
  const bounds = getWatermarkVisibleBounds(watermark);
  const scale = getWatermarkVisibleHeight(width) / Math.max(1, bounds.bottom - bounds.top);
  const drawWidth = watermark.naturalWidth * scale;
  const drawHeight = watermark.naturalHeight * scale;
  const safeInset = DOUYIN_HOME_GRID_SAFE_AREA.horizontalInset * (width / 1080);
  const watermarkEdgeGap = getWatermarkBottomGap(width);
  const x = settings.watermarkAlign === "left"
    ? safeInset - bounds.left * scale
    : settings.watermarkAlign === "right"
      ? width - safeInset - bounds.right * scale
      : width / 2 - ((bounds.left + bounds.right) / 2) * scale;
  const isDouyinCanvas = height / width > 1.5;
  const cropBottom = isDouyinCanvas ? DOUYIN_HOME_GRID_SAFE_AREA.cropBottom * (width / 1080) : height;
  const playCountReserve = isDouyinCanvas ? DOUYIN_HOME_GRID_SAFE_AREA.playCountReserve * (width / 1080) : 0;
  const y = cropBottom - playCountReserve - watermarkEdgeGap - bounds.bottom * scale;
  context.save();
  context.globalAlpha = settings.watermarkOpacity / 100;
  context.drawImage(watermark, x, y, drawWidth, drawHeight);
  context.restore();
}

const watermarkBoundsCache = new WeakMap<HTMLImageElement, { left: number; right: number; top: number; bottom: number }>();

function getWatermarkVisibleBounds(watermark: HTMLImageElement) {
  const cached = watermarkBoundsCache.get(watermark);
  if (cached) return cached;
  const sampleWidth = Math.min(1600, watermark.naturalWidth);
  const sampleHeight = Math.max(1, Math.round(watermark.naturalHeight * sampleWidth / watermark.naturalWidth));
  const sample = document.createElement("canvas");
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return { left: 0, right: watermark.naturalWidth, top: 0, bottom: watermark.naturalHeight };
  sampleContext.drawImage(watermark, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let left = sampleWidth;
  let right = -1;
  let top = sampleHeight;
  let bottom = -1;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] <= 8) continue;
    const x = ((index - 3) / 4) % sampleWidth;
    const y = Math.floor(((index - 3) / 4) / sampleWidth);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  const ratioX = watermark.naturalWidth / sampleWidth;
  const ratioY = watermark.naturalHeight / sampleHeight;
  const bounds = right < left
    ? { left: 0, right: watermark.naturalWidth, top: 0, bottom: watermark.naturalHeight }
    : { left: left * ratioX, right: (right + 1) * ratioX, top: top * ratioY, bottom: (bottom + 1) * ratioY };
  watermarkBoundsCache.set(watermark, bounds);
  return bounds;
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  startingSize: number,
  maxWidth: number,
) {
  let size = startingSize;
  const safeText = text || "标题";
  while (size > startingSize * 0.58) {
    context.font = `900 ${size}px sans-serif`;
    if (context.measureText(safeText).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function measureInkBounds(context: CanvasRenderingContext2D, text: string) {
  const characters = Array.from(text || "国");
  const fallbackSize = Number(context.font.match(/([\d.]+)px/)?.[1] || 16);
  let ascent = 0;
  let descent = 0;
  characters.forEach((character) => {
    const metrics = context.measureText(character);
    ascent = Math.max(ascent, metrics.actualBoundingBoxAscent || 0);
    descent = Math.max(descent, metrics.actualBoundingBoxDescent || 0);
  });
  return {
    ascent: ascent || fallbackSize * 0.78,
    descent: descent || fallbackSize * 0.22,
  };
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign,
) {
  const characters = Array.from(text);
  const lines = Array.from({ length: Math.ceil(characters.length / 12) }, (_, index) =>
    characters.slice(index * 12, index * 12 + 12).join(""),
  );

  context.textAlign = align;
  lines.slice(0, 2).forEach((line, index) => {
    const lineY = y + index * lineHeight;
    if (Array.from(line).length !== 12) {
      if (context.lineWidth > 0) context.strokeText(line, x, lineY, maxWidth);
      context.fillText(line, x, lineY, maxWidth);
      return;
    }
    const left = align === "right" ? x - maxWidth : align === "center" ? x - maxWidth / 2 : x;
    const glyphs = Array.from(line).map((character) => ({ character, metrics: context.measureText(character) }));
    const widths = glyphs.map(({ metrics }) =>
      (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || metrics.width),
    );
    const gap = Math.max(0, (maxWidth - widths.reduce((sum, width) => sum + width, 0)) / 11);
    let cursor = left;
    context.textAlign = "left";
    glyphs.forEach(({ character, metrics }, glyphIndex) => {
      if (context.lineWidth > 0) context.strokeText(character, cursor + (metrics.actualBoundingBoxLeft || 0), lineY);
      context.fillText(character, cursor + (metrics.actualBoundingBoxLeft || 0), lineY);
      cursor += widths[glyphIndex] + gap;
    });
    context.textAlign = align;
  });
}

function countWrappedLines(text: string) {
  if (!text.trim()) return 0;
  return Math.min(Math.ceil(Array.from(text).length / 12), 2);
}

function getWrappedTextWidth(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (!text.trim()) return 0;
  const characters = Array.from(text);
  return Math.max(...Array.from({ length: Math.min(2, Math.ceil(characters.length / 12)) }, (_, index) => {
    const line = characters.slice(index * 12, index * 12 + 12).join("");
    return line.length === 12 ? maxWidth : Math.min(maxWidth, context.measureText(line).width);
  }));
}
