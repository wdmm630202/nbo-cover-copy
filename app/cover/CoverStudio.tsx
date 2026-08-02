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
  CoverTemplate,
  DOUYIN_HOME_GRID_SAFE_AREA,
  PLATFORM_PRESETS,
  PlatformPreset,
} from "./cover-config";
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

type StudioSettings = {
  platformId: PlatformPreset["id"];
  templateId: CoverTemplate["id"];
  topText: string;
  bottomText: string;
  subtitle: string;
  topColor: string;
  bottomColor: string;
  dividerColor: string;
  showDivider: boolean;
  subtitleColor: string;
  subtitleScale: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  textScale: number;
  titleScaleVersion: number;
  shade: number;
  showSafeArea: boolean;
  watermarkScale: number;
  watermarkAlign: "left" | "center" | "right";
  watermarkOpacity: number;
  watermarkEnabled: boolean;
};

type ExportAsset = {
  blob: Blob;
  file: File;
  outputSize: { width: number; height: number };
};

const STORAGE_KEY = "nbo-cover-studio-settings-v1";
const MEMORY_KEY_PREFIX = "nbo-cover-studio-memory-";

const DEFAULT_SETTINGS: StudioSettings = {
  platformId: "douyin",
  templateId: "top-left",
  topText: "男人的高级感",
  bottomText: "藏在自然状态里",
  subtitle: "不被定义的自己，才是最有张力的表达",
  topColor: "#FFFFFF",
  bottomColor: "#FFFFFF",
  dividerColor: "#C9A77A",
  showDivider: true,
  subtitleColor: "#FFFFFF",
  subtitleScale: 100,
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  textScale: 100,
  titleScaleVersion: 2,
  shade: 0,
  showSafeArea: true,
  watermarkScale: 100,
  watermarkAlign: "left",
  watermarkOpacity: 50,
  watermarkEnabled: true,
};

function normalizeTemplateId(value: unknown): CoverTemplate["id"] {
  const legacy: Record<string, CoverTemplate["id"]> = {
    left: "top-left",
    bottom: "top-center",
    badge: "middle-left",
    center: "middle-center",
    clean: "bottom-left",
    right: "bottom-right",
  };
  const id = typeof value === "string" ? value : "";
  if (legacy[id]) return legacy[id];
  return COVER_TEMPLATES.some((template) => template.id === id)
    ? id as CoverTemplate["id"]
    : DEFAULT_SETTINGS.templateId;
}

function drawCover(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  watermark: HTMLImageElement | null,
  settings: StudioSettings,
  preset: PlatformPreset,
  includeGuide: boolean,
  outputSize?: { width: number; height: number },
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const { width, height } = outputSize ?? preset;
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

  drawTemplateShade(context, settings.templateId, width, height, settings.shade);
  drawTemplateText(context, settings, width, height, watermark);

  if (watermark) drawWatermark(context, watermark, settings, width, height);

  if (includeGuide && settings.showSafeArea && preset.id === "douyin") {
    const safeHeight = width / 3 * 4;
    const safeTop = (height - safeHeight) / 2;
    context.save();
    context.setLineDash([18, 14]);
    context.lineWidth = 4;
    context.strokeStyle = "rgba(254,232,0,.92)";
    context.strokeRect(18, safeTop, width - 36, safeHeight);
    context.setLineDash([]);
    context.fillStyle = "rgba(254,232,0,.94)";
    context.font = `700 ${Math.round(width * 0.024)}px sans-serif`;
    context.textAlign = "right";
    context.fillText("主页 3:4 安全区（导出时自动隐藏）", width - 30, safeTop + 38);
    const reserveTop = DOUYIN_HOME_GRID_SAFE_AREA.cropBottom - DOUYIN_HOME_GRID_SAFE_AREA.playCountReserve;
    context.fillStyle = "rgba(255,45,70,.12)";
    context.fillRect(18, reserveTop, width - 36, DOUYIN_HOME_GRID_SAFE_AREA.playCountReserve);
    context.setLineDash([12, 10]);
    context.strokeStyle = "rgba(255,80,96,.9)";
    context.beginPath();
    context.moveTo(18, reserveTop);
    context.lineTo(width - 18, reserveTop);
    context.stroke();
    context.setLineDash([]);
    context.fillStyle = "rgba(255,110,120,.96)";
    context.textAlign = "left";
    context.fillText("播放量避让区 144px", 30, reserveTop + 38);
    context.restore();
  }
}

function drawTemplateShade(
  context: CanvasRenderingContext2D,
  templateId: CoverTemplate["id"],
  width: number,
  height: number,
  shade: number,
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
}

function drawTemplateText(
  context: CanvasRenderingContext2D,
  settings: StudioSettings,
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
  const baseFont = Math.max(1, Math.round(width * 0.074 * 1.8 * (settings.textScale / 100)));
  const lineGap = Math.round(baseFont * 1.32);

  context.save();
  context.textAlign = textAlign;
  context.textBaseline = "alphabetic";
  context.shadowColor = "rgba(0,0,0,.42)";
  context.shadowBlur = 16;

  const topFontSize = fitText(context, settings.topText, baseFont, maxWidth);
  const bottomFontSize = fitText(context, settings.bottomText, baseFont, maxWidth);
  const subtitleFontSize = Math.round(width * 0.03 * (settings.subtitleScale / 100));
  const hasBottomText = Boolean(settings.bottomText.trim());
  const activeHeadlineFontSize = hasBottomText ? bottomFontSize : topFontSize;
  context.font = `900 ${topFontSize}px sans-serif`;
  const topHeadlineInk = measureInkBounds(context, settings.topText || "国");
  context.font = `900 ${activeHeadlineFontSize}px sans-serif`;
  const activeHeadlineInk = measureInkBounds(context, settings.bottomText || settings.topText || "国");
  context.font = `500 ${subtitleFontSize}px sans-serif`;
  const subtitleInk = measureInkBounds(context, settings.subtitle || "国");
  const opticalGap = Math.ceil(subtitleInk.ascent + subtitleInk.descent);
  const dividerThickness = Math.max(4, Math.round(activeHeadlineFontSize * 0.055));
  const relativeActiveBaseline = hasBottomText ? lineGap : 0;
  const relativeDividerY = Math.round(relativeActiveBaseline + activeHeadlineInk.descent + opticalGap);
  const relativeSubtitleBaseline = Math.round(relativeDividerY + dividerThickness + opticalGap + subtitleInk.ascent);
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.45);
  const subtitleLines = countWrappedLines(context, settings.subtitle, maxWidth);
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
  const matchedWatermarkScale = watermarkBounds ? subtitleFontSize / Math.max(1, watermarkBounds.bottom - watermarkBounds.top) : 0;
  const watermarkEdgeGap = (DOUYIN_HOME_GRID_SAFE_AREA.horizontalInset - 18) * geometryScale;
  const watermarkBottom = cropBottom - playCountReserve - watermarkEdgeGap;
  const watermarkTop = watermark
    ? watermarkBottom - ((watermarkBounds?.bottom ?? 0) - (watermarkBounds?.top ?? 0)) * matchedWatermarkScale
    : Number.POSITIVE_INFINITY;
  const bottomTextLimit = Math.min(usableBottom, watermarkTop - opticalGap);
  const requestedY = settings.templateId.startsWith("top-")
    ? usableTop - blockTop
    : settings.templateId.startsWith("bottom-")
      ? bottomTextLimit - blockBottom
      : (cropTop + cropBottom) / 2 - blockTop;
  const y = Math.round(Math.max(usableTop - blockTop, Math.min(requestedY, usableBottom - blockBottom)));
  const secondBaseline = y + lineGap;
  const activeHeadlineBaseline = hasBottomText ? secondBaseline : y;
  const dividerY = y + relativeDividerY;
  const subtitleBaseline = y + relativeSubtitleBaseline;

  context.fillStyle = settings.topColor;
  context.font = `900 ${topFontSize}px sans-serif`;
  context.fillText(settings.topText || "上行标题", x, y, maxWidth);

  if (settings.bottomText.trim()) {
    context.fillStyle = settings.bottomColor;
    context.font = `900 ${bottomFontSize}px sans-serif`;
    context.fillText(settings.bottomText, x, secondBaseline, maxWidth);
  }

  if (settings.showDivider) {
    const dividerWidth = activeHeadlineFontSize;
    const dividerX = isRight ? x - dividerWidth : isCenter ? x - dividerWidth / 2 : x;
    context.shadowBlur = 8;
    context.fillStyle = settings.dividerColor;
    context.fillRect(Math.round(dividerX), dividerY, Math.round(dividerWidth), dividerThickness);
  }

  if (settings.subtitle.trim()) {
    context.shadowBlur = 10;
    context.fillStyle = settings.subtitleColor;
    context.font = `500 ${subtitleFontSize}px sans-serif`;
    drawWrappedText(
      context,
      settings.subtitle,
      x,
      settings.showDivider ? subtitleBaseline : activeHeadlineBaseline + activeHeadlineInk.descent + opticalGap + subtitleInk.ascent,
      maxWidth,
      subtitleLineHeight,
      textAlign,
    );
  }

  context.restore();
}

function drawWatermark(
  context: CanvasRenderingContext2D,
  watermark: HTMLImageElement,
  settings: StudioSettings,
  width: number,
  height: number,
) {
  // The transparent PNG canvas is the positioning contract. Fit that complete
  // canvas to the cover instead of sizing from the visible logo pixels.
  const bounds = getWatermarkVisibleBounds(watermark);
  const subtitleFontSize = width * 0.03 * (settings.subtitleScale / 100);
  const scale = subtitleFontSize / Math.max(1, bounds.bottom - bounds.top);
  const drawWidth = watermark.naturalWidth * scale;
  const drawHeight = watermark.naturalHeight * scale;
  const safeInset = DOUYIN_HOME_GRID_SAFE_AREA.horizontalInset * (width / 1080);
  const watermarkEdgeGap = (DOUYIN_HOME_GRID_SAFE_AREA.horizontalInset - 18) * (width / 1080);
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
  const lines: string[] = [];
  let current = "";

  characters.forEach((character) => {
    const candidate = current + character;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);

  context.textAlign = align;
  lines.slice(0, 2).forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight, maxWidth);
  });
}

function countWrappedLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (!text.trim()) return 0;
  let lines = 1;
  let current = "";
  Array.from(text).forEach((character) => {
    const candidate = current + character;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines += 1;
      current = character;
    } else current = candidate;
  });
  return Math.min(lines, 2);
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="studio-slider">
      <span>
        {label}
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function CoverStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const defaultWatermarkRef = useRef<HTMLImageElement | null>(null);
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [watermark, setWatermark] = useState<HTMLImageElement | null>(null);
  const [watermarkName, setWatermarkName] = useState("");
  const [watermarkKind, setWatermarkKind] = useState<"default" | "custom">("default");
  const [exportReady, setExportReady] = useState({ jpeg: false, png: false });
  const exportCacheRef = useRef<{ jpeg: ExportAsset | null; png: ExportAsset | null }>({ jpeg: null, png: null });
  const exportGenerationRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("上传照片后即可制作");
  const [savePreview, setSavePreview] = useState<{ url: string; asset: ExportAsset } | null>(null);
  const [syncedCopy, setSyncedCopy] = useState<CoverCopySync | null>(null);
  const [syncedImage, setSyncedImage] = useState<CoverImageSync | null>(null);

  const preset = useMemo(
    () => PLATFORM_PRESETS.find((item) => item.id === settings.platformId) ?? PLATFORM_PRESETS[0],
    [settings.platformId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.bottomColor === "#FEE800") parsed.bottomColor = "#FFFFFF";
          if (Number(parsed.watermarkOpacity) === 92) parsed.watermarkOpacity = 50;
          if (Number(parsed.watermarkScale) <= 42) parsed.watermarkScale = 100;
          if (Number(parsed.shade) === 62) parsed.shade = 0;
          if (parsed.titleScaleVersion !== 2) {
            parsed.textScale = Math.round(Number(parsed.textScale || 100) / 1.8);
            parsed.titleScaleVersion = 2;
          }
          parsed.templateId = normalizeTemplateId(parsed.templateId);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch {
        setNotice("已使用默认封面设置");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

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
      setWatermarkName((current) => current || "南铂固定水印");
    };
    defaultWatermark.onerror = () => setNotice("固定水印暂时无法读取，请刷新页面");
    defaultWatermark.src = "/nanbo-default-watermark.png";
  }, []);

  useEffect(() => {
    if (canvasRef.current) {
      drawCover(canvasRef.current, image, settings.watermarkEnabled ? watermark : null, settings, preset, true);
    }
  }, [image, preset, settings, watermark]);

  const buildExportAsset = useCallback(async (format: "jpeg" | "png"): Promise<ExportAsset | null> => {
    if (!image) return null;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = preset.width / preset.height;
    let outputSize = sourceRatio >= targetRatio
      ? { width: Math.round(image.naturalHeight * targetRatio), height: image.naturalHeight }
      : { width: image.naturalWidth, height: Math.round(image.naturalWidth / targetRatio) };
    const exportCanvas = document.createElement("canvas");
    const toBlob = (quality?: number) => new Promise<Blob | null>((resolve) => exportCanvas.toBlob(resolve, `image/${format}`, quality));
    const maxBytes = 19.9 * 1024 * 1024;
    let quality = format === "jpeg" ? 0.98 : undefined;
    drawCover(exportCanvas, image, settings.watermarkEnabled ? watermark : null, settings, preset, false, outputSize);
    let blob = await toBlob(quality);
    while (blob && blob.size > maxBytes && format === "jpeg" && (quality ?? 0) > 0.56) {
      quality = Math.max(0.56, (quality ?? 0.98) - 0.07);
      blob = await toBlob(quality);
    }
    while (blob && blob.size > maxBytes && outputSize.width > 320) {
      const ratio = Math.min(0.94, Math.sqrt(maxBytes / blob.size) * 0.98);
      outputSize = { width: Math.max(320, Math.round(outputSize.width * ratio)), height: Math.max(1, Math.round(outputSize.height * ratio)) };
      drawCover(exportCanvas, image, settings.watermarkEnabled ? watermark : null, settings, preset, false, outputSize);
      blob = await toBlob(quality);
    }
    if (!blob) return null;
    const safeName = fileName.replace(/\.[^.]+$/, "") || "南铂封面";
    const exportName = `${safeName}_${preset.label}_${preset.ratio.replace(":", "x")}.${format === "png" ? "png" : "jpg"}`;
    return { blob, file: new File([blob], exportName, { type: blob.type }), outputSize };
  }, [fileName, image, preset, settings, watermark]);

  useEffect(() => {
    const generation = ++exportGenerationRef.current;
    exportCacheRef.current = { jpeg: null, png: null };
    const isIPhoneOrIPad = /iP(?:hone|ad|od)/.test(navigator.userAgent);
    setExportReady({ jpeg: false, png: isIPhoneOrIPad });
    if (!image) return;
    const timer = window.setTimeout(async () => {
      const formats = isIPhoneOrIPad ? ["jpeg"] as const : ["jpeg", "png"] as const;
      for (const format of formats) {
        let asset: ExportAsset | null = null;
        try {
          asset = await buildExportAsset(format);
        } catch {
          setNotice("手机生成失败，请更换照片后重试");
        }
        if (generation !== exportGenerationRef.current) return;
        exportCacheRef.current[format] = asset;
        setExportReady((current) => ({ ...current, [format]: true }));
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [buildExportAsset, image]);

  const updateSetting = useCallback(
    <Key extends keyof StudioSettings>(key: Key, value: StudioSettings[Key]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setNotice("已恢复默认构图和颜色");
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
      const parsed = JSON.parse(saved);
      if (parsed.bottomColor === "#FEE800") parsed.bottomColor = "#FFFFFF";
      if (Number(parsed.watermarkOpacity) === 92) parsed.watermarkOpacity = 50;
      if (Number(parsed.watermarkScale) <= 42) parsed.watermarkScale = 100;
      if (parsed.titleScaleVersion !== 2) {
        parsed.textScale = Math.round(Number(parsed.textScale || 100) / 1.8);
        parsed.titleScaleVersion = 2;
      }
      parsed.templateId = normalizeTemplateId(parsed.templateId);
      setSettings({ ...DEFAULT_SETTINGS, ...parsed });
      setNotice(`已应用记忆点 ${slot}`);
    } catch {
      setNotice(`记忆点 ${slot} 读取失败，请重新保存`);
    }
  }, []);

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

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
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
      setWatermarkName(file.name);
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
  }, []);

  const exportCover = async (format: "jpeg" | "png") => {
    if (!image || !canvasRef.current) {
      setNotice("请先上传一张照片");
      return;
    }
    const asset = exportCacheRef.current[format];
    if (!asset) {
      setExportReady((current) => ({ ...current, [format]: false }));
      setNotice(`正在生成原图尺寸 ${format === "png" ? "PNG" : "JPG"}，完成后请再点一次`);
      let prepared: ExportAsset | null = null;
      try {
        prepared = await buildExportAsset(format);
      } catch {
        prepared = null;
      }
      exportCacheRef.current[format] = prepared;
      setExportReady((current) => ({ ...current, [format]: true }));
      return setNotice(prepared ? "原图尺寸文件已准备完成，请再次点击导出" : "这次生成没有完成，请重新上传照片后再试");
    }
    const isMobile = /iP(?:hone|ad|od)|Android/i.test(navigator.userAgent);
    if (isMobile) {
      const url = URL.createObjectURL(asset.blob);
      setSavePreview((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url, asset };
      });
      try {
        if (typeof navigator.share !== "function") throw new Error("当前浏览器未开放系统分享");
        await navigator.share({ files: [asset.file], title: "南铂封面" });
        setNotice("已打开手机分享面板，请点击“存储图像”保存到相册");
        return;
      } catch (error) {
        return setNotice(error instanceof DOMException && error.name === "AbortError" ? "已取消系统分享，也可以长按成品图保存" : "系统分享未打开，请点击“打开手机分享”或长按成品图保存");
      }
    }
    const picker = (window as typeof window & {
      showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
    }).showSaveFilePicker;
    if (!isMobile && picker) {
      try {
        const handle = await picker({
          suggestedName: asset.file.name,
          types: [{ description: format === "png" ? "PNG 图片" : "JPG 图片", accept: { [asset.blob.type]: [format === "png" ? ".png" : ".jpg"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(asset.blob);
        await writable.close();
        setNotice(`已保存高清图片 · ${(asset.blob.size / 1024 / 1024).toFixed(1)}MB`);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return setNotice("已取消保存，可再次点击导出");
      }
    }
    const url = URL.createObjectURL(asset.blob);
    setSavePreview((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { url, asset };
    });
    setNotice(`高清成品已生成 ${asset.outputSize.width}×${asset.outputSize.height}，请长按图片存储到照片`);
  };

  return (
    <section className="cover-studio">
      {savePreview && (
        <div className="save-preview">
          <div className="save-preview-card">
            <strong>高清成品已生成</strong>
            <p>请长按下面的图片，选择“存储到照片”</p>
            <img src={savePreview.url} alt="高清封面成品" />
            <div>
              <button type="button" onClick={async () => {
                try {
                  if (typeof navigator.share !== "function") throw new Error("当前浏览器未开放系统分享");
                  await navigator.share({ files: [savePreview.asset.file], title: "南铂封面" });
                  setNotice("已打开手机分享面板，请点击“存储图像”保存到相册");
                } catch (error) {
                  if (!(error instanceof DOMException && error.name === "AbortError")) window.location.href = savePreview.url;
                }
              }}>打开手机分享</button>
              <button type="button" onClick={() => { URL.revokeObjectURL(savePreview.url); setSavePreview(null); }}>关闭</button>
            </div>
          </div>
        </div>
      )}
      <div className="cover-studio-intro">
        <div>
          <span>配套服务 02</span>
          <h1>南铂封面制作台</h1>
          <p>以大画面、少文字和统一黑金视觉制作封面。不自动添加品牌字样，只使用你上传的透明 PNG 水印。</p>
        </div>
        <div className="studio-status">
          <i />
          {notice}
        </div>
      </div>

      <div className="cover-studio-grid">
        <aside className="studio-panel studio-controls">
          <div className="studio-panel-heading">
            <span>01</span>
            <div>
              <strong>照片与文字</strong>
              <small>先放原片，再放两行主文案</small>
            </div>
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
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFile}
            />
            <button className="studio-upload-main" type="button" onClick={() => fileInputRef.current?.click()}>
              <b>{image ? "更换照片" : "上传照片"}</b>
              <span>{fileName || "支持 JPG、PNG、WEBP"}</span>
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
                placeholder="例如：男人的高级感"
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
                placeholder="例如：藏在自然状态里"
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
                setWatermarkName("南铂固定水印");
                setWatermarkKind("default");
                updateSetting("watermarkEnabled", true);
                setNotice(watermarkKind === "custom" ? "临时水印已移除，已恢复南铂固定水印" : "已使用南铂固定水印");
              }}>移除</button>
            </div>
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
        </aside>

        <section className="studio-preview-panel">
          <div className="studio-preview-toolbar">
            <div>
              <strong>实时封面预览</strong>
              <span>{preset.label} · {preset.ratio}</span>
            </div>
            <label className="studio-switch">
              <input
                type="checkbox"
                checked={settings.showSafeArea}
                onChange={(event) => updateSetting("showSafeArea", event.target.checked)}
              />
              <span />
              安全区
            </label>
          </div>
          <div className={`studio-canvas-shell ratio-${preset.ratio.replace(":", "-")}`}>
            <canvas ref={canvasRef} aria-label="封面实时预览" />
          </div>
          <div className="studio-export-row">
            <div>
              <strong>导出前检查</strong>
              <span>头顶、脸、手势和主标题均在安全区内</span>
            </div>
            <button type="button" className="export-secondary" disabled={Boolean(image) && !exportReady.png} onClick={() => exportCover("png")}>
              {image && !exportReady.png ? "准备中…" : "导出 PNG"}
            </button>
            <button type="button" className="export-primary" disabled={Boolean(image) && !exportReady.jpeg} onClick={() => exportCover("jpeg")}>
              {image && !exportReady.jpeg ? "准备中…" : "导出高清 JPG"}
            </button>
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

          <div className="studio-adjustments">
            <Slider
              label="照片缩放"
              value={settings.zoom}
              min={100}
              max={180}
              suffix="%"
              onChange={(value) => updateSetting("zoom", value)}
            />
            <Slider
              label="左右位置"
              value={settings.offsetX}
              min={-40}
              max={40}
              suffix=""
              onChange={(value) => updateSetting("offsetX", value)}
            />
            <Slider
              label="上下位置"
              value={settings.offsetY}
              min={-40}
              max={40}
              suffix=""
              onChange={(value) => updateSetting("offsetY", value)}
            />
            <Slider
              label="自由旋转"
              value={settings.rotation}
              min={-180}
              max={180}
              suffix="°"
              onChange={(value) => updateSetting("rotation", value)}
            />
            <Slider
              label="标题大小"
              value={settings.textScale}
              min={0}
              max={200}
              suffix="%"
              onChange={(value) => updateSetting("textScale", value)}
            />
            <Slider
              label="压暗强度"
              value={settings.shade}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => updateSetting("shade", value)}
            />
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
          <div className="studio-memory">
            <button type="button" className="studio-reset" onClick={resetSettings}>恢复默认</button>
            {[1, 2, 3].map((slot) => (
              <div key={slot}><b>记忆 {slot}</b><button type="button" onClick={() => saveMemory(slot)}>保存</button><button type="button" onClick={() => loadMemory(slot)}>应用</button></div>
            ))}
          </div>
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
