"use client";

import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  COVER_RULES_VERSION,
  COVER_TEMPLATES,
  DOUYIN_HOME_GRID_SAFE_AREA,
  PLATFORM_PRESETS,
  type CoverTemplate,
  type PlatformPreset,
} from "./cover-config";
import {
  DEFAULT_COVER_SETTINGS,
  normalizeCoverSettings,
  updateCoverSetting,
  type CoverSettings,
} from "./core/editor-settings";
import {
  eraseShadeWithBrush,
  type RetouchStroke,
} from "./core/retouch-core";
// The legacy #FEE800 correction now lives in the shared settings normalizer.
import {
  COVER_COPY_SYNC_CHANNEL,
  COVER_COPY_SYNC_KEY,
  COVER_IMAGE_MESSAGE_TYPE,
  COVER_IMAGE_REQUEST_TYPE,
  CoverCopySync,
  CoverImageSync,
  normalizeCoverCopySync,
  normalizeCoverImageSync,
} from "../workspace-sync";
import {
  drawComparisonEditorialOverlay,
  getComparisonAlignmentPlan,
  getComparisonEvidenceLayout,
  getComparisonExportError,
  getComparisonFadeStops,
  getComparisonOverlapWarning,
  getComparisonPhotoTransform,
  getExportAttemptSizes,
  getOriginalPixelJpegMaxBytes,
  getOriginalPixelJpegQualities,
  getAdjustmentPanelVisibility,
  getVisibleRetouchStrokes,
  resolvePhotoInteractionTargetFromPoint,
  resolveRetouchTarget,
  resolveRetouchTargetFromPoint,
  RetouchTarget,
} from "./compare-layout";
import {
  createImageDropController,
  getImageDropHint,
  type ImageDropTarget,
} from "./drop-upload";

type ExportAsset = {
  blob: Blob;
  file: File;
  outputSize: { width: number; height: number };
  originalOutputSize: { width: number; height: number };
  usedMobileFallback: boolean;
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

function releaseCoverCanvas(canvas: HTMLCanvasElement) {
  const scratch = coverScratch.get(canvas);
  if (scratch) {
    Object.values(scratch).forEach((item) => {
      item.width = item.height = 1;
    });
    coverScratch.delete(canvas);
  }
  canvas.width = canvas.height = 1;
}

function isMobileExportDevice() {
  return /iP(?:hone|ad|od)|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
}

function canShareExportFile(file: File) {
  if (typeof navigator.share !== "function") return false;
  return typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
}

const STORAGE_KEY = "nbo-cover-studio-settings-v1";
const MEMORY_KEY_PREFIX = "nbo-cover-studio-memory-";
const MEMORY_NAMES_KEY = "nbo-cover-studio-memory-names";
const WATERMARK_VISIBLE_HEIGHT_AT_1080 = 32;
const WATERMARK_BOTTOM_GAP_AT_1080 = 36;
const getWatermarkVisibleHeight = (width: number) => Math.round(WATERMARK_VISIBLE_HEIGHT_AT_1080 * (width / 1080));
const getWatermarkBottomGap = (width: number) => Math.round(WATERMARK_BOTTOM_GAP_AT_1080 * (width / 1080));

function formatExportTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

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

function getBeforeOffsetLimits(
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

function getBeforeImageFrame(canvas: { width: number; height: number }, frameScale = 100) {
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

function drawCover(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  beforeImage: HTMLImageElement | null,
  watermark: HTMLImageElement | null,
  settings: CoverSettings,
  preset: PlatformPreset,
  includeGuide: boolean,
  outputSize?: { width: number; height: number },
  photoOnly = false,
  retouchStrokes: RetouchStroke[] = [],
  beforeRetouchStrokes: RetouchStroke[] = [],
) {
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
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#151515";
  context.fillRect(0, 0, width, height);

  if (image) {
    const radians = settings.rotation * Math.PI / 180;
    const rotatedWidth = Math.abs(image.naturalWidth * Math.cos(radians)) + Math.abs(image.naturalHeight * Math.sin(radians));
    const rotatedHeight = Math.abs(image.naturalWidth * Math.sin(radians)) + Math.abs(image.naturalHeight * Math.cos(radians));
    const baseScale = Math.max(width / rotatedWidth, height / rotatedHeight);
    const scale = baseScale * (settings.zoom / 100);
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
    drawTemplateText(context, settings, width, height, watermark);
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

function drawTemplateText(
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
  context.textBaseline = "alphabetic";
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
    ascent: ascent || Math.max(1, fallbackSize * 0.78),
    descent: descent || Math.max(1, fallbackSize * 0.22),
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

const ROTATION_SNAP_ANGLES = [-180, -90, 0, 90, 180];
const ROTATION_SNAP_DISTANCE = 3;

function snapRotation(value: number) {
  const nearest = ROTATION_SNAP_ANGLES.reduce((best, angle) =>
    Math.abs(angle - value) < Math.abs(best - value) ? angle : best,
  );
  const snapped = Math.abs(nearest - value) <= ROTATION_SNAP_DISTANCE;
  return {
    value: snapped ? nearest : value,
    guide: snapped ? (Math.abs(nearest) === 90 ? "vertical" : "horizontal") : null,
  } as const;
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  onReset,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
  onReset?: () => void;
  disabled?: boolean;
}) {
  const commitExactValue = (input: HTMLInputElement) => {
    if (!input.value.trim()) {
      input.value = String(value);
      return;
    }
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) {
      input.value = String(value);
      return;
    }
    onChange(Math.max(min, Math.min(max, Math.round(parsed))));
  };

  return (
    <label className="studio-slider">
      <span>
        {label}
        <span className="studio-slider-value-control">
          <span className="studio-slider-number-wrap">
            <input
              key={`${label}-${value}`}
              className="studio-slider-number"
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={1}
              defaultValue={value}
              disabled={disabled}
              aria-label={`${label}准确数值`}
              onFocus={(event) => event.currentTarget.select()}
              onClick={(event) => event.stopPropagation()}
              onBlur={(event) => commitExactValue(event.currentTarget)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            {suffix ? <i>{suffix}</i> : null}
          </span>
          {onReset ? (
            <button type="button" className="studio-slider-reset" title="恢复这一项默认值" aria-label={`${label}恢复默认`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReset(); }}>
              复位
            </button>
          ) : null}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function CoverStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const mobileTouchZoneRef = useRef<HTMLSpanElement>(null);
  const transformHudRef = useRef<HTMLSpanElement>(null);
  const snapHorizontalRef = useRef<HTMLSpanElement>(null);
  const snapVerticalRef = useRef<HTMLSpanElement>(null);
  const transformHudTimerRef = useRef<number | null>(null);
  const mobileGestureCancelRef = useRef<() => void>(() => {});
  const previewToolsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const beforeFileInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const defaultWatermarkRef = useRef<HTMLImageElement | null>(null);
  const mainDropControllerRef = useRef(createImageDropController("main"));
  const beforeDropControllerRef = useRef(createImageDropController("before"));
  const [settings, setSettings] = useState<CoverSettings>(DEFAULT_COVER_SETTINGS);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [beforeImage, setBeforeImage] = useState<HTMLImageElement | null>(null);
  const [beforeFileName, setBeforeFileName] = useState("");
  const [watermark, setWatermark] = useState<HTMLImageElement | null>(null);
  const [watermarkKind, setWatermarkKind] = useState<"default" | "custom">("default");
  const [exportReady, setExportReady] = useState({ jpeg: false, png: false });
  const exportGenerationRef = useRef(0);
  const exportCacheRef = useRef<{ generation: number; jpeg: ExportAsset | null; png: ExportAsset | null }>({ generation: 0, jpeg: null, png: null });
  const [dragging, setDragging] = useState(false);
  const [beforeDragging, setBeforeDragging] = useState(false);
  const [notice, setNotice] = useState("上传照片后即可制作");
  const [exportFeedback, setExportFeedback] = useState("手机导出后会打开成品预览，可长按存储到照片");
  const [savePreview, setSavePreview] = useState<{ url: string; asset: ExportAsset } | null>(null);
  const [syncedCopy, setSyncedCopy] = useState<CoverCopySync | null>(null);
  const [syncedImage, setSyncedImage] = useState<CoverImageSync | null>(null);
  const [memoryNames, setMemoryNames] = useState(["记忆 1", "记忆 2", "记忆 3"]);
  const [rotationMode, setRotationMode] = useState(false);
  const [brushMode, setBrushMode] = useState(false);
  const [brushSize, setBrushSize] = useState(120);
  const [brushFeather, setBrushFeather] = useState(70);
  const [brushStrength, setBrushStrength] = useState(100);
  const [brushCursor, setBrushCursor] = useState({ x: 0.5, y: 0.5, visible: false });
  const [retouchStrokes, setRetouchStrokes] = useState<RetouchStroke[]>([]);
  const [beforeRetouchStrokes, setBeforeRetouchStrokes] = useState<RetouchStroke[]>([]);
  const [retouchTarget, setRetouchTarget] = useState<RetouchTarget>("after");
  const [adjustmentTarget, setAdjustmentTarget] = useState<RetouchTarget>("after");
  const [showRetouchBefore, setShowRetouchBefore] = useState(false);
  const settingsRef = useRef(settings);
  const beforeImageRef = useRef(beforeImage);
  const rotationModeRef = useRef(rotationMode);
  const brushModeRef = useRef(brushMode);
  const brushSettingsRef = useRef({ size: brushSize, feather: brushFeather, strength: brushStrength });

  const showTransformHint = (text: string, guide: "horizontal" | "vertical" | null = null) => {
    const hud = transformHudRef.current;
    if (!hud) return;
    hud.textContent = text;
    hud.classList.add("is-visible");
    snapHorizontalRef.current?.classList.toggle("is-visible", guide === "horizontal");
    snapVerticalRef.current?.classList.toggle("is-visible", guide === "vertical");
    if (transformHudTimerRef.current) window.clearTimeout(transformHudTimerRef.current);
    transformHudTimerRef.current = window.setTimeout(() => {
      hud.classList.remove("is-visible");
      snapHorizontalRef.current?.classList.remove("is-visible");
      snapVerticalRef.current?.classList.remove("is-visible");
    }, 650);
  };

  useEffect(() => () => {
    if (transformHudTimerRef.current) window.clearTimeout(transformHudTimerRef.current);
  }, []);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>(".cover-studio-header");
    if (!header) return;
    const exitMobileOperations = () => {
      if (!window.matchMedia("(max-width: 780px) and (pointer: coarse)").matches) return;
      mobileGestureCancelRef.current();
      brushModeRef.current = false;
      rotationModeRef.current = false;
      setBrushMode(false);
      setRotationMode(false);
      setShowRetouchBefore(false);
      setBrushCursor((current) => ({ ...current, visible: false }));
      setNotice("已退出全部操作，可正常浏览页面");
    };
    header.addEventListener("click", exitMobileOperations);
    return () => header.removeEventListener("click", exitMobileOperations);
  }, []);

  const preset = useMemo(
    () => PLATFORM_PRESETS.find((item) => item.id === settings.platformId) ?? PLATFORM_PRESETS[0],
    [settings.platformId],
  );
  const comparisonOverlapWarning = useMemo(
    () => getComparisonOverlapWarning(settings.compareEnabled, settings.templateId),
    [settings.compareEnabled, settings.templateId],
  );
  const beforeOffsetLimits = useMemo(() => {
    const frame = getBeforeImageFrame(preset, settings.beforeFrameScale);
    const limits = getBeforeOffsetLimits(beforeImage, frame, settings.beforeZoom, settings.beforeRotation);
    return { x: Math.floor(limits.x), y: Math.floor(limits.y) };
  }, [beforeImage, preset, settings.beforeFrameScale, settings.beforeRotation, settings.beforeZoom]);
  const activeRetouchTarget = resolveRetouchTarget(retouchTarget, settings.compareEnabled, Boolean(beforeImage));
  const activeRetouchStrokes = activeRetouchTarget === "before" ? beforeRetouchStrokes : retouchStrokes;
  const adjustmentPanels = getAdjustmentPanelVisibility(settings.compareEnabled, adjustmentTarget);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          setSettings(normalizeCoverSettings(JSON.parse(saved)));
        }
      } catch {
        setNotice("已使用默认封面设置");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(MEMORY_NAMES_KEY) || "null");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate browser-only saved names after mount
      if (Array.isArray(saved) && saved.length === 3) setMemoryNames(saved);
    } catch {}
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    beforeImageRef.current = beforeImage;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [beforeImage, settings]);

  useEffect(() => {
    rotationModeRef.current = rotationMode;
  }, [rotationMode]);

  useEffect(() => {
    const shell = canvasShellRef.current;
    const tools = previewToolsRef.current;
    if (!shell || !tools) return;
    const syncWidth = () => { tools.style.width = `${shell.getBoundingClientRect().width}px`; };
    const observer = new ResizeObserver(syncWidth);
    observer.observe(shell);
    syncWidth();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    brushModeRef.current = brushMode;
    brushSettingsRef.current = { size: brushSize, feather: brushFeather, strength: brushStrength };
  }, [brushFeather, brushMode, brushSize, brushStrength]);

  useEffect(() => {
    if (!brushMode) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hide the transient cursor when brush mode closes
      setBrushCursor((current) => ({ ...current, visible: false }));
      return;
    }
    const handleBrushShortcut = (event: KeyboardEvent) => {
      if (!event.metaKey) return;
      const smaller = event.code === "BracketLeft" || event.key === "[" || event.key === "【";
      const larger = event.code === "BracketRight" || event.key === "]" || event.key === "】";
      if (!smaller && !larger) return;
      event.preventDefault();
      setBrushSize((current) => Math.max(20, Math.min(400, current + (larger ? 10 : -10))));
    };
    window.addEventListener("keydown", handleBrushShortcut);
    return () => window.removeEventListener("keydown", handleBrushShortcut);
  }, [brushMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    let drag: { pointerId: number; target: RetouchTarget; x: number; y: number; offsetX: number; offsetY: number; rotation: number } | null = null;
    let brushPointer: { pointerId: number; target: RetouchTarget } | null = null;
    let pointerMoveFrame = 0;
    let pendingPointerMove: { pointerId: number; clientX: number; clientY: number } | null = null;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (brushModeRef.current) {
        setShowRetouchBefore(false);
        const rect = canvas.getBoundingClientRect();
        const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
        const target = resolveRetouchTargetFromPoint(
          point,
          { width: canvas.width, height: canvas.height },
          settingsRef.current.compareEnabled,
          Boolean(beforeImageRef.current),
          settingsRef.current.beforeFrameScale,
        );
        const brush = brushSettingsRef.current;
        brushPointer = { pointerId: event.pointerId, target };
        setRetouchTarget(target);
        setNotice(target === "before" ? "正在涂抹拍摄前照片" : "正在涂抹主照片");
        const appendStroke = (current: RetouchStroke[]) => [...current, { points: [point], ...brush }];
        if (target === "before") setBeforeRetouchStrokes(appendStroke);
        else setRetouchStrokes(appendStroke);
        canvas.setPointerCapture(event.pointerId);
        return;
      }
      if (event.pointerType === "touch" && window.matchMedia("(max-width: 780px) and (pointer: coarse)").matches) return;
      const current = settingsRef.current;
      const rect = canvas.getBoundingClientRect();
      const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
      const target = resolvePhotoInteractionTargetFromPoint(
        point,
        { width: canvas.width, height: canvas.height },
        current.compareEnabled,
        Boolean(beforeImageRef.current),
        current.beforeFrameScale,
      );
      setAdjustmentTarget(target);
      drag = {
        pointerId: event.pointerId,
        target,
        x: event.clientX,
        y: event.clientY,
        offsetX: target === "before" ? current.beforeOffsetX : current.offsetX,
        offsetY: target === "before" ? current.beforeOffsetY : current.offsetY,
        rotation: target === "before" ? current.beforeRotation : current.rotation,
      };
      setNotice(rotationModeRef.current
        ? target === "before" ? "正在旋转拍摄前照片" : "正在旋转主照片"
        : target === "before" ? "正在移动拍摄前照片" : "正在移动主照片");
      canvas.setPointerCapture(event.pointerId);
    };
    const applyPointerMove = () => {
      pointerMoveFrame = 0;
      const event = pendingPointerMove;
      pendingPointerMove = null;
      if (!event) return;
      if (brushModeRef.current) {
        const rect = canvas.getBoundingClientRect();
        const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
        setBrushCursor({ ...point, visible: true });
      }
      if (brushPointer?.pointerId === event.pointerId) {
        const rect = canvas.getBoundingClientRect();
        const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
        const appendPoint = (current: RetouchStroke[]) => current.map((stroke, index) => index === current.length - 1 ? { ...stroke, points: [...stroke.points, point] } : stroke);
        if (brushPointer.target === "before") setBeforeRetouchStrokes(appendPoint);
        else setRetouchStrokes(appendPoint);
        return;
      }
      if (!drag || drag.pointerId !== event.pointerId) return;
      const activeDrag = drag;
      const rect = canvas.getBoundingClientRect();
      const beforeFrame = getBeforeImageFrame({ width: canvas.width, height: canvas.height }, settingsRef.current.beforeFrameScale);
      const interactionWidth = activeDrag.target === "before" ? rect.width * beforeFrame.width / canvas.width : rect.width;
      const interactionHeight = activeDrag.target === "before" ? rect.height * beforeFrame.height / canvas.height : rect.height;
      if (rotationModeRef.current) {
        const rawRotation = clamp(Math.round(activeDrag.rotation + (event.clientX - activeDrag.x) / interactionWidth * 180), -180, 180);
        const snapped = snapRotation(rawRotation);
        if (activeDrag.target === "before") {
          setSettings((current) => {
            const limits = getBeforeOffsetLimits(beforeImageRef.current, beforeFrame, current.beforeZoom, snapped.value);
            return {
              ...current,
              beforeRotation: snapped.value,
              beforeOffsetX: clamp(current.beforeOffsetX, -Math.floor(limits.x), Math.floor(limits.x)),
              beforeOffsetY: clamp(current.beforeOffsetY, -Math.floor(limits.y), Math.floor(limits.y)),
            };
          });
          showTransformHint(`拍摄前 ${snapped.value}°`, snapped.guide);
        } else {
          setSettings((current) => ({ ...current, rotation: snapped.value }));
          showTransformHint(`${snapped.value}°`, snapped.guide);
        }
      } else {
        if (activeDrag.target === "before") {
          setSettings((current) => {
            const limits = getBeforeOffsetLimits(beforeImageRef.current, beforeFrame, current.beforeZoom, current.beforeRotation);
            const offsetX = clamp(Math.round(activeDrag.offsetX + (event.clientX - activeDrag.x) / interactionWidth * 100), -Math.floor(limits.x), Math.floor(limits.x));
            const offsetY = clamp(Math.round(activeDrag.offsetY + (event.clientY - activeDrag.y) / interactionHeight * 100), -Math.floor(limits.y), Math.floor(limits.y));
            return { ...current, beforeOffsetX: offsetX, beforeOffsetY: offsetY };
          });
        } else {
          const offsetX = clamp(Math.round(activeDrag.offsetX + (event.clientX - activeDrag.x) / interactionWidth * 100), -200, 200);
          const offsetY = clamp(Math.round(activeDrag.offsetY + (event.clientY - activeDrag.y) / interactionHeight * 100), -200, 200);
          setSettings((current) => ({ ...current, offsetX, offsetY }));
        }
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      pendingPointerMove = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
      if (!pointerMoveFrame) pointerMoveFrame = window.requestAnimationFrame(applyPointerMove);
    };
    const endDrag = (event: PointerEvent) => {
      if (pendingPointerMove?.pointerId === event.pointerId) {
        if (pointerMoveFrame) window.cancelAnimationFrame(pointerMoveFrame);
        applyPointerMove();
      }
      if (brushPointer?.pointerId === event.pointerId) {
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        brushPointer = null;
        return;
      }
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      drag = null;
    };
    const handleWheel = (event: WheelEvent) => {
      if (brushModeRef.current) return;
      event.preventDefault();
      const amount = clamp(-event.deltaY * 0.02, -2, 2);
      const rect = canvas.getBoundingClientRect();
      const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
      const target = resolvePhotoInteractionTargetFromPoint(
        point,
        { width: canvas.width, height: canvas.height },
        settingsRef.current.compareEnabled,
        Boolean(beforeImageRef.current),
        settingsRef.current.beforeFrameScale,
      );
      setAdjustmentTarget(target);
      setSettings((current) => {
        if (target === "before") {
          const beforeZoom = clamp(Math.round((current.beforeZoom + amount) * 10) / 10, 100, 300);
          const frame = getBeforeImageFrame({ width: canvas.width, height: canvas.height }, current.beforeFrameScale);
          const limits = getBeforeOffsetLimits(beforeImageRef.current, frame, beforeZoom, current.beforeRotation);
          showTransformHint(`拍摄前 ${beforeZoom}%`);
          return {
            ...current,
            beforeZoom,
            beforeOffsetX: clamp(current.beforeOffsetX, -Math.floor(limits.x), Math.floor(limits.x)),
            beforeOffsetY: clamp(current.beforeOffsetY, -Math.floor(limits.y), Math.floor(limits.y)),
          };
        }
        const zoom = clamp(Math.round((current.zoom + amount) * 10) / 10, 0, 400);
        showTransformHint(`${zoom}%`);
        return { ...current, zoom };
      });
    };
    const handleDoubleClick = (event: MouseEvent) => {
      if (brushModeRef.current) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
      const target = resolvePhotoInteractionTargetFromPoint(
        point,
        { width: canvas.width, height: canvas.height },
        settingsRef.current.compareEnabled,
        Boolean(beforeImageRef.current),
        settingsRef.current.beforeFrameScale,
      );
      setAdjustmentTarget(target);
      setRotationMode((current) => {
        const next = !current;
        rotationModeRef.current = next;
        setNotice(next
          ? `已进入${target === "before" ? "拍摄前照片" : "主照片"}旋转：按住左右拖动，双击退出`
          : "已退出旋转，可按住照片移动");
        return next;
      });
    };
    const handlePointerLeave = () => {
      if (brushModeRef.current) setBrushCursor((current) => ({ ...current, visible: false }));
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("dblclick", handleDoubleClick);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      if (pointerMoveFrame) window.cancelAnimationFrame(pointerMoveFrame);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", endDrag);
      canvas.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("dblclick", handleDoubleClick);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [image]);

  useEffect(() => {
    const zone = mobileTouchZoneRef.current;
    const canvas = canvasRef.current;
    if (!zone || !canvas || !image) return;
    type Point = { x: number; y: number };
    type Baseline =
      | { mode: "move"; x: number; y: number; offsetX: number; offsetY: number }
      | { mode: "rotate"; angle: number; rotation: number }
      | { mode: "scaleMove"; midX: number; midY: number; distance: number; offsetX: number; offsetY: number; zoom: number };
    const pointers = new Map<number, Point>();
    let holdTimer = 0;
    let active = false;
    let anchorId: number | null = null;
    let holdOrigin: Point | null = null;
    let baseline: Baseline | null = null;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const isMobileTouch = (event: PointerEvent) => event.pointerType === "touch" && window.matchMedia("(max-width: 780px) and (pointer: coarse)").matches;
    const setBaseline = () => {
      const points = [...pointers.values()];
      const current = settingsRef.current;
      if (!points.length) { baseline = null; return; }
      if (points.length === 1) {
        baseline = { mode: "move", x: points[0].x, y: points[0].y, offsetX: current.offsetX, offsetY: current.offsetY };
        return;
      }
      if (points.length === 2) {
        const [a, b] = points;
        baseline = { mode: "rotate", angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, rotation: current.rotation };
        return;
      }
      const [, a, b] = points;
      baseline = { mode: "scaleMove", midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), offsetX: current.offsetX, offsetY: current.offsetY, zoom: current.zoom };
    };
    const updateTransform = (patch: Partial<Pick<CoverSettings, "offsetX" | "offsetY" | "zoom" | "rotation">>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        settingsRef.current = next;
        return next;
      });
    };
    const cancelGesture = () => {
      window.clearTimeout(holdTimer);
      pointers.forEach((_point, pointerId) => {
        if (zone.hasPointerCapture(pointerId)) zone.releasePointerCapture(pointerId);
      });
      pointers.clear();
      active = false;
      anchorId = null;
      holdOrigin = null;
      baseline = null;
      zone.classList.remove("is-gesture-active");
    };
    mobileGestureCancelRef.current = cancelGesture;
    const handlePointerDown = (event: PointerEvent) => {
      if (!isMobileTouch(event) || brushModeRef.current) return;
      if (pointers.size >= 3) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        active = false;
        anchorId = event.pointerId;
        holdOrigin = { x: event.clientX, y: event.clientY };
        baseline = null;
        window.clearTimeout(holdTimer);
        holdTimer = window.setTimeout(() => {
          if (pointers.size !== 1 || anchorId === null) return;
          active = true;
          zone.classList.add("is-gesture-active");
          zone.setPointerCapture(anchorId);
          setBaseline();
          showTransformHint("已锁定照片");
        }, 220);
      } else if (active) {
        event.preventDefault();
        zone.setPointerCapture(event.pointerId);
        setBaseline();
      } else {
        window.clearTimeout(holdTimer);
      }
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!active) {
        if (holdOrigin && Math.hypot(event.clientX - holdOrigin.x, event.clientY - holdOrigin.y) > 8) window.clearTimeout(holdTimer);
        return;
      }
      event.preventDefault();
      if (!active || !baseline) return;
      const points = [...pointers.values()];
      const rect = canvas.getBoundingClientRect();
      if (points.length === 1 && baseline.mode === "move") {
        const offsetX = clamp(Math.round(baseline.offsetX + (points[0].x - baseline.x) / rect.width * 100), -200, 200);
        const offsetY = clamp(Math.round(baseline.offsetY + (points[0].y - baseline.y) / rect.height * 100), -200, 200);
        updateTransform({ offsetX, offsetY });
        showTransformHint(`${offsetX}, ${offsetY}`);
        return;
      }
      if (points.length === 2 && baseline.mode === "rotate") {
        const [a, b] = points;
        const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        const angleDelta = ((angle - baseline.angle + 540) % 360) - 180;
        const snapped = snapRotation(clamp(Math.round(baseline.rotation + angleDelta), -180, 180));
        updateTransform({ rotation: snapped.value });
        showTransformHint(`${snapped.value}°`, snapped.guide);
        return;
      }
      if (points.length === 3 && baseline.mode === "scaleMove") {
        const [, a, b] = points;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        const zoom = clamp(Math.round(baseline.zoom * distance / baseline.distance), 0, 400);
        const offsetX = clamp(Math.round(baseline.offsetX + (midX - baseline.midX) / rect.width * 100), -200, 200);
        const offsetY = clamp(Math.round(baseline.offsetY + (midY - baseline.midY) / rect.height * 100), -200, 200);
        updateTransform({ zoom, offsetX, offsetY });
        showTransformHint(`${zoom}% · ${offsetX}, ${offsetY}`);
        return;
      }
      setBaseline();
    };
    const endGesture = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (zone.hasPointerCapture(event.pointerId)) zone.releasePointerCapture(event.pointerId);
      if (event.pointerId === anchorId && pointers.size) {
        active = false;
        baseline = null;
        zone.classList.remove("is-gesture-active");
      } else if (active && pointers.size) setBaseline();
      else if (!pointers.size) {
        window.clearTimeout(holdTimer);
        active = false;
        anchorId = null;
        holdOrigin = null;
        baseline = null;
        zone.classList.remove("is-gesture-active");
      }
    };
    const stopNativeTouch = (event: TouchEvent) => {
      if (active) event.preventDefault();
    };
    zone.addEventListener("pointerdown", handlePointerDown);
    zone.addEventListener("pointermove", handlePointerMove);
    zone.addEventListener("pointerup", endGesture);
    zone.addEventListener("pointercancel", endGesture);
    zone.addEventListener("touchstart", stopNativeTouch, { passive: false });
    zone.addEventListener("touchmove", stopNativeTouch, { passive: false });
    return () => {
      cancelGesture();
      mobileGestureCancelRef.current = () => {};
      zone.removeEventListener("pointerdown", handlePointerDown);
      zone.removeEventListener("pointermove", handlePointerMove);
      zone.removeEventListener("pointerup", endGesture);
      zone.removeEventListener("pointercancel", endGesture);
      zone.removeEventListener("touchstart", stopNativeTouch);
      zone.removeEventListener("touchmove", stopNativeTouch);
    };
  }, [image]);

  useEffect(() => {
    const acceptSync = (value: unknown, isLiveUpdate = false) => {
      const next = normalizeCoverCopySync(value);
      if (!next) return;
      setSyncedCopy(next);
      if (isLiveUpdate) setNotice("文案页有新方案，可按需同步到封面");
    };
    const acceptImageSync = (value: unknown, isLiveUpdate = false) => {
      const next = normalizeCoverImageSync(value);
      if (!next) return;
      setSyncedImage(next);
      if (isLiveUpdate) setNotice("文案页封面照片已就绪，可按需同步");
    };

    const timer = window.setTimeout(() => {
      try {
        acceptSync(JSON.parse(window.localStorage.getItem(COVER_COPY_SYNC_KEY) || "null"));
      } catch {
        setSyncedCopy(null);
      }
    }, 0);

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== COVER_COPY_SYNC_KEY || !event.newValue) return;
      try {
        acceptSync(JSON.parse(event.newValue), true);
      } catch {
        return;
      }
    };

    const channel = "BroadcastChannel" in window
      ? new BroadcastChannel(COVER_COPY_SYNC_CHANNEL)
      : null;
    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === COVER_IMAGE_MESSAGE_TYPE) {
          acceptImageSync(event.data.payload, true);
          return;
        }
        acceptSync(event.data, true);
      };
      channel.postMessage({ type: COVER_IMAGE_REQUEST_TYPE });
    }
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, []);

  useEffect(() => {
    const defaultWatermark = new Image();
    defaultWatermark.onload = () => {
      defaultWatermarkRef.current = defaultWatermark;
      setWatermark((current) => current ?? defaultWatermark);
    };
    defaultWatermark.onerror = () => setNotice("固定水印暂时无法读取，请刷新页面");
    defaultWatermark.src = "/nanbo-default-watermark.png";
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const frame = window.requestAnimationFrame(() => {
      const device = navigator as Navigator & { deviceMemory?: number };
      const lowPower = (device.deviceMemory ?? 8) <= 4 || (device.hardwareConcurrency ?? 8) <= 4;
      const width = Math.min(lowPower ? 420 : 540, preset.width);
      const previewSize = { width, height: Math.round(width * preset.height / preset.width) };
      const strokeGroups = { after: retouchStrokes, before: beforeRetouchStrokes };
      const visibleAfterStrokes = getVisibleRetouchStrokes(strokeGroups, "after", showRetouchBefore && activeRetouchTarget === "after");
      const visibleBeforeStrokes = getVisibleRetouchStrokes(strokeGroups, "before", showRetouchBefore && activeRetouchTarget === "before");
      drawCover(canvas, image, beforeImage, settings.watermarkEnabled ? watermark : null, settings, preset, true, previewSize, false, visibleAfterStrokes, visibleBeforeStrokes);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeRetouchTarget, beforeImage, beforeRetouchStrokes, image, preset, retouchStrokes, settings, showRetouchBefore, watermark]);

  const buildExportAsset = useCallback(async (
    format: "jpeg" | "png",
    photoOnly = false,
    generation = exportGenerationRef.current,
  ): Promise<ExportAsset | null> => {
    if (!image || generation !== exportGenerationRef.current) return null;
    const attempts = getExportAttemptSizes(
      { width: image.naturalWidth, height: image.naturalHeight },
      preset,
      format,
      isMobileExportDevice(),
    );
    const originalOutputSize = attempts[0];
    const exportCanvas = document.createElement("canvas");
    const toBlob = (quality?: number) => new Promise<Blob | null>((resolve) => {
      try {
        exportCanvas.toBlob(resolve, `image/${format}`, quality);
      } catch {
        resolve(null);
      }
    });
    let blob: Blob | null = null;
    let outputSize = originalOutputSize;
    for (const candidate of attempts) {
      if (generation !== exportGenerationRef.current) {
        releaseCoverCanvas(exportCanvas);
        return null;
      }
      try {
        drawCover(exportCanvas, image, beforeImage, settings.watermarkEnabled ? watermark : null, settings, preset, false, candidate, photoOnly, retouchStrokes, beforeRetouchStrokes);
        if (format === "jpeg") {
          for (const quality of getOriginalPixelJpegQualities()) {
            blob = await toBlob(quality);
            if (!blob || blob.size <= getOriginalPixelJpegMaxBytes()) break;
          }
          if (blob && blob.size > getOriginalPixelJpegMaxBytes()) blob = null;
        } else {
          blob = await toBlob();
        }
      } catch {
        blob = null;
      }
      if (blob) {
        outputSize = candidate;
        break;
      }
      blob = null;
      releaseCoverCanvas(exportCanvas);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
    if (generation !== exportGenerationRef.current) {
      releaseCoverCanvas(exportCanvas);
      return null;
    }
    if (!blob) {
      releaseCoverCanvas(exportCanvas);
      return null;
    }
    if (generation !== exportGenerationRef.current) {
      releaseCoverCanvas(exportCanvas);
      return null;
    }
    const safeName = fileName.replace(/\.[^.]+$/, "") || "南铂封面";
    const exportName = `${safeName}_${preset.label}_${preset.ratio.replace(":", "x")}.${format === "png" ? "png" : "jpg"}`;
    const asset = {
      blob,
      file: new File([blob], exportName, { type: blob.type }),
      outputSize,
      originalOutputSize,
      usedMobileFallback: outputSize.width !== originalOutputSize.width || outputSize.height !== originalOutputSize.height,
    };
    releaseCoverCanvas(exportCanvas);
    return asset;
  }, [beforeImage, beforeRetouchStrokes, fileName, image, preset, retouchStrokes, settings, watermark]);

  useEffect(() => {
    const generation = exportGenerationRef.current + 1;
    exportGenerationRef.current = generation;
    exportCacheRef.current = { generation, jpeg: null, png: null };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a changed source invalidates both export readiness flags
    setExportReady({ jpeg: true, png: true });
  }, [buildExportAsset]);

  const updateSetting = useCallback(
    <Key extends keyof CoverSettings>(key: Key, value: CoverSettings[Key]) => {
      setSettings((current) => updateCoverSetting(current, key, value));
    },
    [],
  );

  const alignBeforeFrame = useCallback(() => {
    if (!settings.compareEnabled || !beforeImage) {
      setNotice("请先开启前后对比并添加拍摄前素颜照");
      return;
    }
    const scratch = document.createElement("canvas");
    scratch.width = preset.width;
    scratch.height = preset.height;
    const context = scratch.getContext("2d");
    if (!context) {
      setNotice("暂时无法计算对齐，请刷新后重试");
      return;
    }
    const textBounds = drawTemplateText(
      context,
      settings,
      preset.width,
      preset.height,
      settings.watermarkEnabled ? watermark : null,
    );
    const plan = getComparisonAlignmentPlan(preset, textBounds, { currentScale: settings.beforeFrameScale });
    scratch.width = scratch.height = 1;
    if (!plan.ok) {
      const message = plan.reason === "overlap"
        ? "文字与对比图间距不足，已保留原构图"
        : plan.reason === "too-large"
          ? "需要放大超过120%，已保留原构图"
          : "对齐需要缩小照片，已保留原构图";
      setNotice(message);
      return;
    }
    setSettings((current) => {
      const frame = getBeforeImageFrame(preset, plan.scale);
      const limits = getBeforeOffsetLimits(beforeImage, frame, current.beforeZoom, current.beforeRotation);
      return {
        ...current,
        beforeFrameScale: plan.scale,
        beforeOffsetX: Math.max(-Math.floor(limits.x), Math.min(Math.floor(limits.x), current.beforeOffsetX)),
        beforeOffsetY: Math.max(-Math.floor(limits.y), Math.min(Math.floor(limits.y), current.beforeOffsetY)),
      };
    });
    setNotice("已与左侧文字顶部对齐");
  }, [beforeImage, preset, settings, watermark]);

  const updateTopTextScale = useCallback((value: number) => {
    setSettings((current) => ({
      ...current,
      textScale: value,
      bottomTextScale: current.textScaleLinked ? value : current.bottomTextScale,
    }));
  }, []);

  const toggleTextScaleLink = useCallback(() => {
    setSettings((current) => {
      const linked = !current.textScaleLinked;
      return { ...current, textScaleLinked: linked, bottomTextScale: linked ? current.textScale : current.bottomTextScale };
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_COVER_SETTINGS);
    setRetouchStrokes([]);
    setBeforeRetouchStrokes([]);
    setRetouchTarget("after");
    setShowRetouchBefore(false);
    setBrushMode(false);
    setNotice("已恢复默认构图和颜色");
  }, []);

  const factoryReset = useCallback(() => {
    if (!window.confirm("确定彻底重置吗？\n\n将清空本工具的照片、封面设置、记忆方案和同步记录，登录状态会保留。")) return;

    [STORAGE_KEY, MEMORY_NAMES_KEY, COVER_COPY_SYNC_KEY, ...[1, 2, 3].map((slot) => `${MEMORY_KEY_PREFIX}${slot}`)]
      .forEach((key) => window.localStorage.removeItem(key));
    window.location.replace(`${window.location.pathname}?reset=${Date.now()}`);
  }, []);

  const saveMemory = useCallback((slot: number) => {
    window.localStorage.setItem(`${MEMORY_KEY_PREFIX}${slot}`, JSON.stringify(settings));
    setNotice(`已保存到记忆点 ${slot}`);
  }, [settings]);

  const loadMemory = useCallback((slot: number) => {
    try {
      const saved = window.localStorage.getItem(`${MEMORY_KEY_PREFIX}${slot}`);
      if (!saved) {
        setNotice(`记忆点 ${slot} 还没有保存设置`);
        return;
      }
      setSettings(normalizeCoverSettings(JSON.parse(saved)));
      setNotice(`已应用记忆点 ${slot}`);
    } catch {
      setNotice(`记忆点 ${slot} 读取失败，请重新保存`);
    }
  }, []);

  const renameMemory = useCallback((slot: number) => {
    const name = window.prompt("输入记忆名称", memoryNames[slot - 1]);
    if (!name?.trim()) return;
    const next = [...memoryNames];
    next[slot - 1] = name.trim().slice(0, 12);
    setMemoryNames(next);
    window.localStorage.setItem(MEMORY_NAMES_KEY, JSON.stringify(next));
  }, [memoryNames]);

  const applySyncedCopy = useCallback((field: "topText" | "bottomText" | "all") => {
    if (!syncedCopy) {
      setNotice("请先在文案页完成识别并选择一组方案");
      return;
    }

    setSettings((current) => ({
      ...current,
      topText: field === "bottomText" ? current.topText : syncedCopy.topText,
      bottomText: field === "topText" ? current.bottomText : syncedCopy.bottomText,
    }));
    setNotice(
      field === "all"
        ? "两行封面文案已同步，照片和构图保持不变"
        : field === "topText"
          ? "上行文案已同步"
          : "下行文案已同步",
    );
  }, [syncedCopy]);

  const applySyncedImage = useCallback((quiet = false) => {
    if (!syncedImage) {
      setNotice("文案页原图暂不可用，请保持文案页打开并重新上传图片");
      return;
    }

    const nextImage = new Image();
    nextImage.onload = () => {
      setImage(nextImage);
      setRetouchStrokes([]);
      setShowRetouchBefore(false);
      setFileName(syncedImage.fileName);
      if (!quiet) setNotice("文案页封面照片已同步，文字和构图保持不变");
    };
    nextImage.onerror = () => {
      setNotice("封面照片读取没有完成，请在文案页重新上传");
    };
    nextImage.src = syncedImage.dataUrl;
  }, [syncedImage]);

  const applyAllSync = useCallback(() => {
    if (!syncedCopy && !syncedImage) {
      setNotice("请先在文案页上传图片并选择一组方案");
      return;
    }
    if (syncedCopy) {
      setSettings((current) => ({
        ...current,
        topText: syncedCopy.topText,
        bottomText: syncedCopy.bottomText,
      }));
    }
    if (syncedImage) applySyncedImage(true);
    setNotice(
      syncedCopy && syncedImage
        ? "封面照片和两行文案已同步，构图设置保持不变"
        : syncedImage
          ? "封面照片已同步，文字和构图保持不变"
          : "两行封面文案已同步，照片和构图保持不变",
    );
  }, [applySyncedImage, syncedCopy, syncedImage]);

  const loadFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setNotice("请选择 JPG、PNG 或 WEBP 图片");
      return;
    }

    const url = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => {
      setImage(nextImage);
      setRetouchStrokes([]);
      setShowRetouchBefore(false);
      setFileName(file.name);
      setNotice("照片已载入，可以调整构图和文字");
      URL.revokeObjectURL(url);
    };
    nextImage.onerror = () => {
      setNotice("这张图片暂时无法读取，请更换一张");
      URL.revokeObjectURL(url);
    };
    nextImage.src = url;
  }, []);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const loadBeforeFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setNotice("拍摄前照片请选择 JPG、PNG 或 WEBP 图片");
      return;
    }
    const url = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => {
      setBeforeImage(nextImage);
      setBeforeRetouchStrokes([]);
      setShowRetouchBefore(false);
      setSettings((current) => {
        const rawLimits = getBeforeOffsetLimits(nextImage, getBeforeImageFrame(preset, current.beforeFrameScale), current.beforeZoom, current.beforeRotation);
        const limits = { x: Math.floor(rawLimits.x), y: Math.floor(rawLimits.y) };
        return {
          ...current,
          beforeOffsetX: Math.max(-limits.x, Math.min(limits.x, current.beforeOffsetX)),
          beforeOffsetY: Math.max(-limits.y, Math.min(limits.y, current.beforeOffsetY)),
        };
      });
      setBeforeFileName(file.name);
      setNotice("拍摄前素颜照已载入，可独立调整七项参数");
      URL.revokeObjectURL(url);
    };
    nextImage.onerror = () => {
      setNotice("这张拍摄前照片暂时无法读取，请更换一张");
      URL.revokeObjectURL(url);
    };
    nextImage.src = url;
  }, [preset]);

  const dropControllerFor = (target: ImageDropTarget) => (
    target === "main" ? mainDropControllerRef.current : beforeDropControllerRef.current
  );

  const setDropActive = (target: ImageDropTarget, active: boolean) => {
    if (target === "main") setDragging(active);
    else setBeforeDragging(active);
  };

  const handleImageDragEnter = (event: DragEvent<HTMLDivElement>, target: ImageDropTarget) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(target, dropControllerFor(target).enter().active);
  };

  const handleImageDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const handleImageDragLeave = (event: DragEvent<HTMLDivElement>, target: ImageDropTarget) => {
    event.preventDefault();
    setDropActive(target, dropControllerFor(target).leave().active);
  };

  const handleImageDrop = (event: DragEvent<HTMLDivElement>, target: ImageDropTarget) => {
    event.preventDefault();
    const result = dropControllerFor(target).drop(event.dataTransfer.files);
    setDropActive(target, result.active);
    if (!result.selection.ok) {
      setNotice(result.selection.message);
      return;
    }
    if (target === "main") loadFile(result.selection.file);
    else loadBeforeFile(result.selection.file);
  };

  const loadWatermark = useCallback((file: File | undefined) => {
    if (!file) return;
    if (file.type !== "image/png") {
      setNotice("水印请使用透明 PNG 图片");
      return;
    }
    const url = URL.createObjectURL(file);
    const nextWatermark = new Image();
    nextWatermark.onload = () => {
      setWatermark(nextWatermark);
      setWatermarkKind("custom");
      updateSetting("watermarkEnabled", true);
      setNotice("透明水印已加入，导出时会保留");
      URL.revokeObjectURL(url);
    };
    nextWatermark.onerror = () => {
      setNotice("这张水印无法读取，请更换透明 PNG");
      URL.revokeObjectURL(url);
    };
    nextWatermark.src = url;
  }, [updateSetting]);

  const setExportMessage = (message: string) => {
    setNotice(message);
    setExportFeedback(message);
  };

  const describeExportResolution = (asset: ExportAsset) => asset.usedMobileFallback
    ? `原始像素超出当前手机可用内存，已采用可稳定导出的最高像素 ${asset.outputSize.width}×${asset.outputSize.height}`
    : `已保留原始裁切像素 ${asset.outputSize.width}×${asset.outputSize.height}`;

  const exportCover = async (format: "jpeg" | "png", photoOnly = false) => {
    if (!image || !canvasRef.current) {
      setExportMessage("请先上传一张照片");
      return;
    }
    const comparisonError = getComparisonExportError(settings.compareEnabled, Boolean(beforeImage));
    if (!photoOnly && comparisonError) {
      setExportMessage(comparisonError);
      return;
    }
    const generation = exportGenerationRef.current;
    const cached = exportCacheRef.current;
    let asset = photoOnly || cached.generation !== generation ? null : cached[format];
    if (photoOnly) {
      setExportMessage(`正在生成无文字、无水印的${format === "png" ? " PNG" : " JPG"}…`);
      try {
        asset = await buildExportAsset(format, true, generation);
      } catch {
        asset = null;
      }
      if (generation !== exportGenerationRef.current) return;
      if (!asset) return setExportMessage(isMobileExportDevice()
        ? `手机仍无法生成这张${format === "png" ? " PNG" : " JPG"}，请关闭其他页面后再试${format === "jpeg" ? "，或改用 PNG" : ""}`
        : format === "jpeg"
          ? "无法在保留原始像素的同时把 JPG 控制在 19.9MB 内，请改用 PNG 导出"
          : "浏览器无法按原始像素导出，请关闭其他页面后再试");
    } else if (!asset) {
      setExportReady((current) => ({ ...current, [format]: false }));
      setExportMessage(`正在尝试生成原始像素 ${format === "png" ? "PNG" : "JPG"}…`);
      let prepared: ExportAsset | null = null;
      try {
        prepared = await buildExportAsset(format, false, generation);
      } catch {
        prepared = null;
      }
      if (generation !== exportGenerationRef.current) return;
      exportCacheRef.current = { ...exportCacheRef.current, generation, [format]: prepared };
      setExportReady((current) => ({ ...current, [format]: true }));
      if (!prepared) return setExportMessage(isMobileExportDevice()
        ? `手机仍无法生成这张${format === "png" ? " PNG" : " JPG"}，请关闭其他页面后再试${format === "jpeg" ? "，或改用 PNG" : ""}`
        : format === "jpeg"
          ? "无法在保留原始像素的同时把 JPG 控制在 19.9MB 内，请改用 PNG 导出"
          : "浏览器无法按原始像素导出，请关闭其他页面后再试");
      asset = prepared;
    }
    const safeName = fileName.replace(/\.[^.]+$/, "") || "南铂封面";
    const exportName = `${safeName}_${photoOnly ? "原图" : "设计"}_${preset.label}_${preset.ratio.replace(":", "x")}_${formatExportTimestamp()}.${format === "png" ? "png" : "jpg"}`;
    const namedAsset = { ...asset, file: new File([asset.blob], exportName, { type: asset.blob.type }) };
    const isMobile = isMobileExportDevice();
    const resolutionMessage = describeExportResolution(namedAsset);
    setExportMessage(`${resolutionMessage}，成品已生成`);
    if (isMobile) {
      const url = URL.createObjectURL(asset.blob);
      setSavePreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url, asset: namedAsset };
      });
      try {
        if (!canShareExportFile(namedAsset.file)) throw new Error("当前浏览器未开放文件分享");
        await navigator.share({ files: [namedAsset.file], title: "南铂封面" });
        if (generation !== exportGenerationRef.current) return;
        setExportMessage(`${resolutionMessage}；已打开手机分享面板，请点击“存储图像”`);
        return;
      } catch (error) {
        if (generation !== exportGenerationRef.current) return;
        return setExportMessage(error instanceof DOMException && error.name === "AbortError"
          ? `${resolutionMessage}；已取消系统分享，也可以长按成品图保存`
          : `${resolutionMessage}；请在成品预览里长按图片保存`);
      }
    }
    const picker = (window as typeof window & {
      showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void>; abort?: () => Promise<void> }> }>;
    }).showSaveFilePicker;
    if (!isMobile && picker) {
      try {
        const handle = await picker({
          suggestedName: namedAsset.file.name,
          types: [{ description: format === "png" ? "PNG 图片" : "JPG 图片", accept: { [asset.blob.type]: [format === "png" ? ".png" : ".jpg"] } }],
        });
        if (generation !== exportGenerationRef.current) return;
        const writable = await handle.createWritable();
        if (generation !== exportGenerationRef.current) {
          await writable.abort?.();
          return;
        }
        await writable.write(asset.blob);
        if (generation !== exportGenerationRef.current) {
          await writable.abort?.();
          return;
        }
        await writable.close();
        if (generation !== exportGenerationRef.current) return;
        setExportMessage(`已保存高清图片 · ${(asset.blob.size / 1024 / 1024).toFixed(1)}MB`);
        return;
      } catch (error) {
        if (generation !== exportGenerationRef.current) return;
        if (error instanceof DOMException && error.name === "AbortError") return setExportMessage("已取消保存，可再次点击导出");
      }
    }
    if (generation !== exportGenerationRef.current) return;
    const url = URL.createObjectURL(asset.blob);
    setSavePreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { url, asset: namedAsset };
    });
    setExportMessage(`${resolutionMessage}，请长按图片存储到照片`);
  };

  return (
    <section className="cover-studio">
      {savePreview && (
        <div className="save-preview">
          <div className="save-preview-card">
            <strong>高清成品已生成</strong>
            <p>{describeExportResolution(savePreview.asset)}；请长按下面的图片，选择“存储到照片”</p>
            {/* Blob 预览是用户本机刚生成的成品，不能交给 next/image 远程优化。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={savePreview.url} alt="高清封面成品" />
            <div>
              <button type="button" onClick={async () => {
                try {
                  if (!canShareExportFile(savePreview.asset.file)) throw new Error("当前浏览器未开放文件分享");
                  await navigator.share({ files: [savePreview.asset.file], title: "南铂封面" });
                  setExportMessage("已打开手机分享面板，请点击“存储图像”保存到相册");
                } catch (error) {
                  if (!(error instanceof DOMException && error.name === "AbortError")) window.location.href = savePreview.url;
                }
              }}>打开手机分享</button>
              <button type="button" onClick={() => { URL.revokeObjectURL(savePreview.url); setSavePreview(null); }}>关闭</button>
            </div>
          </div>
        </div>
      )}
      <div className={`cover-studio-grid ${settings.compareEnabled ? "is-comparing" : ""}`}>
        <aside className="studio-panel studio-controls">
          <div className="studio-panel-heading">
            <span>01</span>
            <div>
              <strong>照片与文字</strong>
              <small>先放原片，再放两行主文案</small>
            </div>
          </div>

          <div className="studio-status" role="status" aria-live="polite">
            <i />
            {notice}
          </div>

          <div className={`studio-copy-sync ${syncedCopy || syncedImage ? "is-ready" : ""}`}>
            <div>
              <strong title={syncedCopy ? `${syncedCopy.topText} / ${syncedCopy.bottomText}` : undefined}>
                {syncedCopy ? `${syncedCopy.topText} / ${syncedCopy.bottomText}` : "等待文案页方案"}
              </strong>
              <small>
                {syncedCopy
                  ? `${syncedCopy.platform} · 方案 ${String(syncedCopy.selectionIndex + 1).padStart(2, "0")} · ${syncedImage ? "封面照片已就绪" : "等待封面照片"} · 不会自动覆盖`
                  : syncedImage
                    ? "封面照片已就绪，可单独同步"
                    : "识别完成并选择方案后，可同步封面照片与文字"}
              </small>
            </div>
            <button type="button" disabled={!syncedCopy && !syncedImage} onClick={applyAllSync}>
              全部同步
            </button>
          </div>

          <div
            className={`studio-upload ${dragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => handleImageDragEnter(event, "main")}
            onDragOver={handleImageDragOver}
            onDragLeave={(event) => handleImageDragLeave(event, "main")}
            onDrop={(event) => handleImageDrop(event, "main")}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFile}
            />
            <button className="studio-upload-main" type="button" onClick={() => fileInputRef.current?.click()}>
              <b>{dragging ? getImageDropHint("main") : image ? "更换照片" : "上传照片"}</b>
              <span>{dragging ? "支持单张 JPG、PNG、WEBP" : fileName || "支持 JPG、PNG、WEBP"}</span>
            </button>
            <button
              className="studio-image-sync"
              type="button"
              disabled={!syncedImage}
              onClick={() => applySyncedImage()}
            >
              同步封面
            </button>
          </div>

          {settings.compareEnabled ? (
            <div
              className={`studio-before-upload ${beforeDragging ? "is-dragging" : ""}`}
              onDragEnter={(event) => handleImageDragEnter(event, "before")}
              onDragOver={handleImageDragOver}
              onDragLeave={(event) => handleImageDragLeave(event, "before")}
              onDrop={(event) => handleImageDrop(event, "before")}
            >
              <input
                ref={beforeFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  loadBeforeFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <div>
                <strong>拍摄前素颜照</strong>
                <small>照片只存在本机内存，刷新后自动清除</small>
              </div>
              <button type="button" onClick={() => beforeFileInputRef.current?.click()}>
                <b>{beforeDragging ? getImageDropHint("before") : beforeImage ? "更换照片" : "请添加拍摄前素颜照"}</b>
                <span>{beforeDragging ? "支持单张 JPG、PNG、WEBP" : beforeFileName || "支持 JPG、PNG、WEBP"}</span>
              </button>
            </div>
          ) : null}

          <div className="studio-field">
            <div className="studio-field-heading">
              <span>上行主标题 <b>默认纯白·可取色</b></span>
            </div>
            <div className="studio-field-control">
              <input
                aria-label="上行主标题"
                value={settings.topText}
                maxLength={18}
                onChange={(event) => updateSetting("topText", event.target.value)}
                placeholder="例如：男人的"
              />
              <button type="button" disabled={!syncedCopy} onClick={() => applySyncedCopy("topText")}>同步文案</button>
            </div>
          </div>
          <div className="studio-color-row">
            <label><span>上行颜色</span><input type="color" value={settings.topColor} onChange={(event) => updateSetting("topColor", event.target.value.toUpperCase())} /></label>
            <label><span>下行颜色</span><input type="color" value={settings.bottomColor} onChange={(event) => updateSetting("bottomColor", event.target.value.toUpperCase())} /></label>
            <label><span>横线颜色</span><input type="color" value={settings.dividerColor} onChange={(event) => updateSetting("dividerColor", event.target.value.toUpperCase())} /></label>
          </div>
          <label className="studio-check studio-divider-toggle">
            <input type="checkbox" checked={settings.showDivider} onChange={(event) => updateSetting("showDivider", event.target.checked)} />
            <span />
            显示一字长标题横线（下行留空时自动收紧）
          </label>
          <div className="studio-field">
            <div className="studio-field-heading">
              <span>下行主标题 <b>默认纯白·可取色</b></span>
            </div>
            <div className="studio-field-control">
              <input
                aria-label="下行主标题"
                value={settings.bottomText}
                maxLength={18}
                onChange={(event) => updateSetting("bottomText", event.target.value)}
                placeholder="例如：高级感"
              />
              <button type="button" disabled={!syncedCopy} onClick={() => applySyncedCopy("bottomText")}>同步文案</button>
            </div>
          </div>
          <label className="studio-field">
            <span>补充小字 <b>可不填</b></span>
            <textarea
              value={settings.subtitle}
              maxLength={38}
              onChange={(event) => updateSetting("subtitle", event.target.value)}
              placeholder="补充价值点，不编造图片外事实"
            />
          </label>
          <div className="studio-subtitle-tools">
            <label><span>小字颜色</span><input type="color" value={settings.subtitleColor} onChange={(event) => updateSetting("subtitleColor", event.target.value.toUpperCase())} /></label>
            <label><span>小字大小 <b>{settings.subtitleScale}%</b></span><input type="range" min={60} max={160} value={settings.subtitleScale} onChange={(event) => updateSetting("subtitleScale", Number(event.target.value))} /></label>
          </div>
          <div className="studio-watermark-box">
            <input
              ref={watermarkInputRef}
              type="file"
              accept="image/png"
              onChange={(event) => {
                loadWatermark(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="studio-watermark-actions">
              <button type="button" className={settings.watermarkEnabled ? "is-active" : ""} onClick={() => updateSetting("watermarkEnabled", true)}>使用水印</button>
              <button type="button" className={!settings.watermarkEnabled ? "is-active" : ""} onClick={() => updateSetting("watermarkEnabled", false)}>不使用水印</button>
              <button type="button" onClick={() => watermarkInputRef.current?.click()}>换水印</button>
              <button type="button" onClick={() => {
                setWatermark(defaultWatermarkRef.current);
                setWatermarkKind("default");
                updateSetting("watermarkEnabled", true);
                setNotice(watermarkKind === "custom" ? "临时水印已移除，已恢复南铂固定水印" : "已使用南铂固定水印");
              }}>移除</button>
            </div>
          </div>
          <div className="studio-left-watermark-controls">
            <div className="studio-watermark-align">
              <span>水印位置</span>
              <div>
                {(["left", "center", "right"] as const).map((align) => (
                  <button
                    type="button"
                    key={align}
                    className={settings.watermarkAlign === align ? "is-active" : ""}
                    onClick={() => updateSetting("watermarkAlign", align)}
                  >
                    {align === "left" ? "左侧对齐" : align === "center" ? "居中" : "右侧对齐"}
                  </button>
                ))}
              </div>
            </div>
            <Slider
              label="水印透明度"
              value={settings.watermarkOpacity}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => updateSetting("watermarkOpacity", value)}
            />
          </div>

          <div className="studio-platforms" aria-label="选择发布平台">
            {PLATFORM_PRESETS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.id === settings.platformId ? "is-active" : ""}
                onClick={() => updateSetting("platformId", item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.ratio}</span>
              </button>
            ))}
          </div>
          <p className="studio-preset-note">
            {preset.width}×{preset.height} · {preset.note}
          </p>
          <div className="studio-memory">
            {[1, 2, 3].map((slot) => (
              <div key={slot}><b>{memoryNames[slot - 1]}</b><button type="button" onClick={() => renameMemory(slot)}>重命名</button><button type="button" onClick={() => saveMemory(slot)}>保存</button><button type="button" onClick={() => loadMemory(slot)}>应用</button></div>
            ))}
          </div>
        </aside>

        <section className="studio-preview-panel">
          <div className="studio-preview-toolbar">
            <div>
              <strong>实时封面预览</strong>
              <span>{preset.label} · {preset.ratio}</span>
            </div>
            <div className="studio-preview-switches">
              <label className="studio-switch">
                <input
                  type="checkbox"
                  checked={settings.showSafeArea}
                  onChange={(event) => updateSetting("showSafeArea", event.target.checked)}
                />
                <span />
                安全区
              </label>
              <label className="studio-switch">
                <input
                  type="checkbox"
                  checked={settings.compareEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    updateSetting("compareEnabled", enabled);
                    setNotice(enabled
                      ? getComparisonOverlapWarning(true, settings.templateId) || "已开启前后对比，请添加拍摄前素颜照"
                      : "已返回单张封面模式，拍摄前照片仍保留在本机内存");
                  }}
                />
                <span />
                前后对比
              </label>
            </div>
          </div>
          <div ref={canvasShellRef} className={`studio-canvas-shell ratio-${preset.ratio.replace(":", "-")} ${image ? "has-image" : ""} ${rotationMode ? "is-rotating" : ""} ${brushMode ? "is-brushing" : ""}`}>
            <canvas ref={canvasRef} aria-label="封面实时预览，可拖动照片；开启涂抹后可局部擦开压暗层" />
            <span ref={mobileTouchZoneRef} className={`studio-mobile-touch-zone ${image && settings.platformId === "douyin" && !brushMode ? "is-active" : ""}`} aria-hidden="true" />
            <span ref={transformHudRef} className="studio-transform-hud" aria-live="polite" />
            <span ref={snapHorizontalRef} className="studio-snap-guide is-horizontal" aria-hidden="true" />
            <span ref={snapVerticalRef} className="studio-snap-guide is-vertical" aria-hidden="true" />
            <span
              className={`studio-brush-cursor ${brushCursor.visible && brushMode ? "is-visible" : ""}`}
              style={{ left: `${brushCursor.x * 100}%`, top: `${brushCursor.y * 100}%`, width: `${brushSize / 10.8}%` }}
              aria-hidden="true"
            />
          </div>
          <div ref={previewToolsRef} className="studio-preview-tools">
            <div className="studio-template-area">
              <div className="studio-template-grid">
                {COVER_TEMPLATES.map((template) => (
                  <button
                    type="button"
                    key={template.id}
                    className={`studio-template template-${template.id} ${settings.templateId === template.id ? "is-active" : ""}`}
                    onClick={() => setSettings((current) => ({
                      ...current,
                      templateId: template.id,
                      watermarkAlign: template.id.endsWith("-left") ? "left" : template.id.endsWith("-right") ? "right" : "center",
                    }))}
                  >
                    <i>{template.number}</i>
                    <b>{template.name}</b>
                    <span>{template.hint}</span>
                  </button>
                ))}
              </div>
              {comparisonOverlapWarning ? <p className="studio-compare-warning">{comparisonOverlapWarning}</p> : null}
            </div>
            <div className="studio-export-row">
              <p className="studio-export-feedback" role="status" aria-live="polite">{exportFeedback}</p>
              <button type="button" className="export-original" onClick={() => exportCover("png", true)}>导出原图 PNG</button>
              <button type="button" className="export-original" onClick={() => exportCover("jpeg", true)}>导出原图 JPG</button>
              <button type="button" className="export-secondary" disabled={Boolean(image) && !exportReady.png} onClick={() => exportCover("png")}>
                {image && !exportReady.png ? "准备中…" : "导出设计 PNG"}
              </button>
              <button type="button" className="export-primary" disabled={Boolean(image) && !exportReady.jpeg} onClick={() => exportCover("jpeg")}>
                {image && !exportReady.jpeg ? "准备中…" : "导出设计 JPG"}
              </button>
            </div>
          </div>
        </section>

        <aside className="studio-panel studio-design">
          <div className="studio-panel-heading">
            <span>02</span>
            <div>
              <strong>版式与构图</strong>
              <small>参考南铂暗调杂志封面体系</small>
            </div>
          </div>

          <button type="button" className="studio-factory-reset" onClick={factoryReset}>彻底重置</button>
          <button type="button" className="studio-reset" onClick={resetSettings}>恢复默认</button>
          <div className={`studio-retouch${settings.compareEnabled && beforeImage ? " is-comparing" : ""}`}>
            <div className="studio-retouch-heading"><b>局部涂抹提亮</b><span>⌘[ 缩小 · ⌘] 放大</span></div>
            {settings.compareEnabled && beforeImage ? (
              <div className="studio-retouch-target" aria-label="管理涂抹记录">
                <button
                  type="button"
                  className={activeRetouchTarget === "after" ? "is-active" : ""}
                  onClick={() => {
                    setRetouchTarget("after");
                    setShowRetouchBefore(false);
                    setNotice("当前查看主照片的涂抹记录");
                  }}
                >主照片记录</button>
                <button
                  type="button"
                  className={activeRetouchTarget === "before" ? "is-active" : ""}
                  onClick={() => {
                    setRetouchTarget("before");
                    setShowRetouchBefore(false);
                    setNotice("当前查看拍摄前照片的涂抹记录");
                  }}
                >拍摄前记录</button>
              </div>
            ) : null}
            <button
              type="button"
              className={brushMode ? "is-active" : ""}
              onClick={() => {
                setBrushMode((current) => !current);
                setRotationMode(false);
                setNotice(brushMode
                  ? "已退出涂抹，可继续移动照片"
                  : settings.compareEnabled && beforeImage
                    ? "已开启涂抹，落笔位置会自动识别主照片或拍摄前照片"
                    : "已开启主照片涂抹，请在照片上按住绘制");
              }}
            >{brushMode ? "退出涂抹" : "开启涂抹"}</button>
            <Slider label="画笔大小" value={brushSize} min={20} max={400} suffix="" onChange={setBrushSize} onReset={() => setBrushSize(120)} />
            <Slider label="羽化" value={brushFeather} min={0} max={100} suffix="%" onChange={setBrushFeather} onReset={() => setBrushFeather(70)} />
            <Slider label="涂抹强度" value={brushStrength} min={0} max={100} suffix="%" onChange={setBrushStrength} onReset={() => setBrushStrength(100)} />
            <div className="studio-retouch-compare">
              <button type="button" disabled={!activeRetouchStrokes.length} className={showRetouchBefore ? "is-active" : ""} onClick={() => setShowRetouchBefore(true)}>涂抹前</button>
              <button type="button" className={!showRetouchBefore ? "is-active" : ""} onClick={() => setShowRetouchBefore(false)}>涂抹后</button>
            </div>
            <small className="studio-retouch-note">落笔自动识别照片 · 当前管理：{activeRetouchTarget === "before" ? "拍摄前照片" : "主照片"}</small>
            <div className="studio-retouch-actions">
              <button type="button" disabled={!activeRetouchStrokes.length} onClick={() => {
                setShowRetouchBefore(false);
                if (activeRetouchTarget === "before") setBeforeRetouchStrokes((current) => current.slice(0, -1));
                else setRetouchStrokes((current) => current.slice(0, -1));
              }}>撤销一步</button>
              <button type="button" disabled={!activeRetouchStrokes.length} onClick={() => {
                setShowRetouchBefore(false);
                if (activeRetouchTarget === "before") setBeforeRetouchStrokes([]);
                else setRetouchStrokes([]);
              }}>全部清除</button>
            </div>
          </div>

          {adjustmentPanels.selector ? (
            <div className="studio-adjustment-target" aria-label="选择构图控制对象">
              <button
                type="button"
                className={adjustmentTarget === "after" ? "is-active" : ""}
                onClick={() => {
                  setAdjustmentTarget("after");
                  setNotice("当前显示主照片与文字构图控制");
                }}
              >主照片与文字</button>
              <button
                type="button"
                className={adjustmentTarget === "before" ? "is-active" : ""}
                onClick={() => {
                  setAdjustmentTarget("before");
                  setNotice("当前显示拍摄前照片构图控制");
                }}
              >拍摄前照片</button>
            </div>
          ) : null}

          {adjustmentPanels.before ? (
            <div className="studio-before-adjustments">
              <div className="studio-before-adjustments-heading">
                <div><b>拍摄前照片构图</b><span>独立调整右下角素颜照</span></div>
                <button type="button" onClick={() => setSettings((current) => ({
                  ...current,
                  beforeZoom: 100,
                  beforeOffsetX: 0,
                  beforeOffsetY: 0,
                  beforeRotation: 0,
                  beforeBrightness: 100,
                  beforeShade: 0,
                  beforeBottomShade: 100,
                  beforeFrameScale: 100,
                }))}>恢复默认</button>
              </div>
              <div className="studio-before-align-actions">
                <button type="button" onClick={alignBeforeFrame} disabled={!beforeImage}>尝试对齐</button>
                <button type="button" onClick={() => {
                  setSettings((current) => ({ ...current, beforeFrameScale: 100 }));
                  setNotice("已恢复对比图默认尺寸");
                }}>恢复对比图默认尺寸</button>
              </div>
              <Slider
                label="拍摄前照片缩放"
                value={settings.beforeZoom}
                min={100}
                max={300}
                suffix="%"
                onReset={() => setSettings((current) => {
                  const rawLimits = getBeforeOffsetLimits(beforeImage, getBeforeImageFrame(preset, current.beforeFrameScale), 100, current.beforeRotation);
                  const limits = { x: Math.floor(rawLimits.x), y: Math.floor(rawLimits.y) };
                  return {
                    ...current,
                    beforeZoom: 100,
                    beforeOffsetX: Math.max(-limits.x, Math.min(limits.x, current.beforeOffsetX)),
                    beforeOffsetY: Math.max(-limits.y, Math.min(limits.y, current.beforeOffsetY)),
                  };
                })}
                onChange={(value) => setSettings((current) => {
                  const rawLimits = getBeforeOffsetLimits(beforeImage, getBeforeImageFrame(preset, current.beforeFrameScale), value, current.beforeRotation);
                  const limits = { x: Math.floor(rawLimits.x), y: Math.floor(rawLimits.y) };
                  return {
                    ...current,
                    beforeZoom: value,
                    beforeOffsetX: Math.max(-limits.x, Math.min(limits.x, current.beforeOffsetX)),
                    beforeOffsetY: Math.max(-limits.y, Math.min(limits.y, current.beforeOffsetY)),
                  };
                })}
              />
              <Slider
                label="拍摄前左右位置"
                value={Math.max(-beforeOffsetLimits.x, Math.min(beforeOffsetLimits.x, settings.beforeOffsetX))}
                min={-beforeOffsetLimits.x}
                max={beforeOffsetLimits.x}
                suffix=""
                onReset={() => updateSetting("beforeOffsetX", 0)}
                onChange={(value) => updateSetting("beforeOffsetX", Math.max(-beforeOffsetLimits.x, Math.min(beforeOffsetLimits.x, value)))}
              />
              <Slider
                label="拍摄前上下位置"
                value={Math.max(-beforeOffsetLimits.y, Math.min(beforeOffsetLimits.y, settings.beforeOffsetY))}
                min={-beforeOffsetLimits.y}
                max={beforeOffsetLimits.y}
                suffix=""
                onReset={() => updateSetting("beforeOffsetY", 0)}
                onChange={(value) => updateSetting("beforeOffsetY", Math.max(-beforeOffsetLimits.y, Math.min(beforeOffsetLimits.y, value)))}
              />
              <Slider
                label="拍摄前自由旋转"
                value={settings.beforeRotation}
                min={-180}
                max={180}
                suffix="°"
                onReset={() => setSettings((current) => {
                  const rawLimits = getBeforeOffsetLimits(beforeImage, getBeforeImageFrame(preset, current.beforeFrameScale), current.beforeZoom, 0);
                  const limits = { x: Math.floor(rawLimits.x), y: Math.floor(rawLimits.y) };
                  return {
                    ...current,
                    beforeRotation: 0,
                    beforeOffsetX: Math.max(-limits.x, Math.min(limits.x, current.beforeOffsetX)),
                    beforeOffsetY: Math.max(-limits.y, Math.min(limits.y, current.beforeOffsetY)),
                  };
                })}
                onChange={(value) => {
                  const snapped = snapRotation(value);
                  setSettings((current) => {
                    const rawLimits = getBeforeOffsetLimits(beforeImage, getBeforeImageFrame(preset, current.beforeFrameScale), current.beforeZoom, snapped.value);
                    const limits = { x: Math.floor(rawLimits.x), y: Math.floor(rawLimits.y) };
                    return {
                      ...current,
                      beforeRotation: snapped.value,
                      beforeOffsetX: Math.max(-limits.x, Math.min(limits.x, current.beforeOffsetX)),
                      beforeOffsetY: Math.max(-limits.y, Math.min(limits.y, current.beforeOffsetY)),
                    };
                  });
                  showTransformHint(`拍摄前 ${snapped.value}°`, snapped.guide);
                }}
              />
              <Slider
                label="拍摄前亮度"
                value={settings.beforeBrightness}
                min={0}
                max={200}
                suffix="%"
                onReset={() => updateSetting("beforeBrightness", 100)}
                onChange={(value) => updateSetting("beforeBrightness", value)}
              />
              <Slider
                label="拍摄前压暗强度"
                value={settings.beforeShade}
                min={0}
                max={100}
                suffix="%"
                onReset={() => updateSetting("beforeShade", 0)}
                onChange={(value) => updateSetting("beforeShade", value)}
              />
              <Slider
                label="拍摄前底部向上压暗"
                value={settings.beforeBottomShade}
                min={0}
                max={100}
                suffix="%"
                onReset={() => updateSetting("beforeBottomShade", 100)}
                onChange={(value) => updateSetting("beforeBottomShade", value)}
              />
            </div>
          ) : null}

          {adjustmentPanels.after ? <div className="studio-adjustments">
            <Slider
              label="照片缩放"
              value={settings.zoom}
              min={0}
              max={400}
              suffix="%"
              onReset={() => updateSetting("zoom", 100)}
              onChange={(value) => { updateSetting("zoom", value); showTransformHint(`${value}%`); }}
            />
            <Slider
              label="左右位置"
              value={settings.offsetX}
              min={-200}
              max={200}
              suffix=""
              onReset={() => updateSetting("offsetX", 0)}
              onChange={(value) => updateSetting("offsetX", value)}
            />
            <Slider
              label="上下位置"
              value={settings.offsetY}
              min={-200}
              max={200}
              suffix=""
              onReset={() => updateSetting("offsetY", 0)}
              onChange={(value) => updateSetting("offsetY", value)}
            />
            <Slider
              label="自由旋转"
              value={settings.rotation}
              min={-180}
              max={180}
              suffix="°"
              onReset={() => updateSetting("rotation", 0)}
              onChange={(value) => {
                const snapped = snapRotation(value);
                updateSetting("rotation", snapped.value);
                showTransformHint(`${snapped.value}°`, snapped.guide);
              }}
            />
            <Slider
              label="上行标题大小"
              value={settings.textScale}
              min={0}
              max={200}
              suffix="%"
              onReset={() => updateTopTextScale(100)}
              onChange={updateTopTextScale}
            />
            <button
              type="button"
              className={`studio-title-scale-link ${settings.textScaleLinked ? "is-linked" : ""}`}
              aria-pressed={settings.textScaleLinked}
              onClick={toggleTextScaleLink}
            >{settings.textScaleLinked ? "上下行大小联动" : "下行独立调整"}</button>
            <Slider
              label="下行标题大小"
              value={settings.bottomTextScale}
              min={0}
              max={200}
              suffix="%"
              disabled={settings.textScaleLinked}
              onReset={() => settings.textScaleLinked ? updateTopTextScale(100) : updateSetting("bottomTextScale", 100)}
              onChange={(value) => updateSetting("bottomTextScale", value)}
            />
            <Slider
              label="字体描边"
              value={settings.textStroke}
              min={0}
              max={100}
              suffix="%"
              onReset={() => updateSetting("textStroke", 0)}
              onChange={(value) => updateSetting("textStroke", value)}
            />
            <Slider
              label="字体阴影"
              value={settings.textShadow}
              min={0}
              max={100}
              suffix="%"
              onReset={() => updateSetting("textShadow", 50)}
              onChange={(value) => updateSetting("textShadow", value)}
            />
            <Slider
              label="亮度"
              value={settings.brightness}
              min={0}
              max={200}
              suffix="%"
              onReset={() => updateSetting("brightness", 100)}
              onChange={(value) => updateSetting("brightness", value)}
            />
            <Slider
              label="压暗强度"
              value={settings.shade}
              min={0}
              max={100}
              suffix="%"
              onReset={() => updateSetting("shade", 0)}
              onChange={(value) => updateSetting("shade", value)}
            />
            <Slider
              label="底部向上压暗"
              value={settings.bottomShade}
              min={0}
              max={100}
              suffix="%"
              onReset={() => updateSetting("bottomShade", 100)}
              onChange={(value) => updateSetting("bottomShade", value)}
            />
          </div> : null}
        </aside>
      </div>

      <section className="cover-standard-card">
        <div>
          <span>长期规范</span>
          <h2>{COVER_RULES_VERSION}</h2>
        </div>
        <ul>
          <li><b>人物保护</b> 不拉伸、不重绘脸、五官、头发、手和服装</li>
          <li><b>默认颜色</b> 上行 #FFFFFF，下行 #FFFFFF，可按照片取色调整</li>
          <li><b>标题横线</b> 长度随字号同步；下行留空时按单行标题自动收紧</li>
          <li><b>主页安全</b> 抖音 9:16 自动显示居中 3:4 检查框</li>
          <li><b>本机处理</b> 图片不上传、不保存，导出后仍由你掌控</li>
          <li><b>品牌规则</b> 不自动写“南铂摄影”，只叠加你上传的透明 PNG 水印</li>
        </ul>
        <p>平台规则会变化，尺寸预设独立维护；封面制作逻辑不依赖免费 AI 服务，即使智能文案暂时不可用，也能继续制作和导出。</p>
      </section>
    </section>
  );
}
