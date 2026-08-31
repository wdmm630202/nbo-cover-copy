import type { PlatformPreset } from "../cover-config";
import type { CoverRenderInput } from "./render-core";

export type CoverExportFormat = "png" | "jpeg";
export type CoverExportSize = { width: number; height: number };

export type CoverExportAsset = {
  blob: Blob;
  file: File;
  outputSize: CoverExportSize;
  originalOutputSize: CoverExportSize;
  usedMobileFallback: boolean;
};

export type CoverExportRequest = {
  render: Omit<CoverRenderInput, "canvas" | "includeGuide" | "outputSize">;
  format: CoverExportFormat;
  photoOnly: boolean;
  mobile: boolean;
  fileStem: string;
  now?: Date;
  isCancelled?: () => boolean;
};

export type CoverExportErrorCode =
  | "SOURCE_IMAGE_MISSING"
  | "EXPORT_CANCELLED"
  | "CANVAS_RENDER_FAILED"
  | "CANVAS_EXPORT_FAILED"
  | "JPEG_SIZE_LIMIT";

export class CoverExportError extends Error {
  readonly code: CoverExportErrorCode;
  readonly cause?: unknown;

  constructor(code: CoverExportErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "CoverExportError";
    this.code = code;
    this.cause = cause;
  }
}

export type CoverExportRuntime = {
  createCanvas: () => HTMLCanvasElement;
  drawCover: (input: CoverRenderInput) => void;
  releaseCoverScratchCanvases: (canvas: HTMLCanvasElement) => void;
  releaseCoverCanvas: (canvas: HTMLCanvasElement) => void;
  waitForNextAttempt: () => Promise<void>;
  createFile: (blob: Blob, name: string, options: FilePropertyBag) => File;
};

const MOBILE_EXPORT_LIMITS = [
  { maxPixels: 8_000_000, maxSide: 4096 },
  { maxPixels: 6_000_000, maxSide: 4096 },
  { maxPixels: 4_000_000, maxSide: 4096 },
  { maxPixels: 2_100_000, maxSide: 4096 },
] as const;

const ORIGINAL_PIXEL_JPEG_QUALITIES = [0.98, 0.91, 0.84, 0.77, 0.7, 0.63, 0.56] as const;
const ORIGINAL_PIXEL_JPEG_MAX_BYTES = 19.9 * 1024 * 1024;

export function formatExportTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function normalizeFileStem(fileStem: string) {
  return fileStem.replace(/\.[^.]+$/, "") || "南铂封面";
}

export function getExportFileName(
  fileStem: string,
  variant: "设计" | "原图",
  platformLabel: string,
  ratio: string,
  format: CoverExportFormat,
  date = new Date(),
) {
  const extension = format === "png" ? "png" : "jpg";
  return `${normalizeFileStem(fileStem)}_${variant}_${platformLabel}_${ratio.replace(":", "x")}_${formatExportTimestamp(date)}.${extension}`;
}

export function getOriginalPixelExportPlan(
  source: CoverExportSize,
  preset: CoverExportSize,
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

function constrainExportSize(size: CoverExportSize, maxPixels: number, maxSide: number) {
  const scale = Math.min(
    1,
    Math.sqrt(maxPixels / (size.width * size.height)),
    maxSide / size.width,
    maxSide / size.height,
  );
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

export function getExportAttemptSizes(
  source: CoverExportSize,
  preset: CoverExportSize,
  format: CoverExportFormat,
  mobile: boolean,
) {
  const plan = getOriginalPixelExportPlan(source, preset, format);
  const original = { width: plan.width, height: plan.height };
  if (!mobile) return [original];
  const candidates = [original, ...MOBILE_EXPORT_LIMITS.map(({ maxPixels, maxSide }) =>
    constrainExportSize(original, maxPixels, maxSide))];
  return candidates.filter((candidate, index) => candidates.findIndex((item) =>
    item.width === candidate.width && item.height === candidate.height) === index);
}

export function getOriginalPixelJpegQualities() {
  return [...ORIGINAL_PIXEL_JPEG_QUALITIES];
}

export function getOriginalPixelJpegMaxBytes() {
  return ORIGINAL_PIXEL_JPEG_MAX_BYTES;
}

function getPreset(render: CoverExportRequest["render"]): PlatformPreset {
  return render.preset;
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
) {
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob(resolve, mimeType, quality);
    } catch {
      resolve(null);
    }
  });
}

let browserRuntime: CoverExportRuntime | null = null;
let renderRequestObserver: ((request: CoverRenderInput) => void) | null = null;

export function configureCoverExportRuntime(runtime: CoverExportRuntime) {
  browserRuntime = runtime;
}

/** Test/diagnostic seam on the real export path. Null in normal production use. */
export function setCoverExportRenderRequestObserver(observer: ((request: CoverRenderInput) => void) | null) {
  renderRequestObserver = observer;
}

export async function createCoverExportAssetWithRuntime(
  request: CoverExportRequest,
  runtime: CoverExportRuntime,
): Promise<CoverExportAsset> {
  const cancellationError = () => new CoverExportError("EXPORT_CANCELLED", "导出任务已失效");
  if (request.isCancelled?.()) throw cancellationError();
  const { image } = request.render;
  if (!image?.naturalWidth || !image.naturalHeight) {
    throw new CoverExportError("SOURCE_IMAGE_MISSING", "请先上传一张照片");
  }

  const attempts = getExportAttemptSizes(
    { width: image.naturalWidth, height: image.naturalHeight },
    getPreset(request.render),
    request.format,
    request.mobile,
  );
  const originalOutputSize = attempts[0];
  const mimeType = request.format === "png" ? "image/png" : "image/jpeg";
  let lastFailure: CoverExportError = new CoverExportError(
    "CANVAS_EXPORT_FAILED",
    "浏览器无法生成这张图片",
  );

  for (let index = 0; index < attempts.length; index += 1) {
    if (request.isCancelled?.()) throw cancellationError();
    const outputSize = attempts[index];
    const canvas = runtime.createCanvas();
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      runtime.releaseCoverCanvas(canvas);
    };
    let blob: Blob | null = null;
    try {
      const renderRequest: CoverRenderInput = {
        ...request.render,
        canvas,
        includeGuide: false,
        outputSize,
        photoOnly: request.photoOnly,
      };
      renderRequestObserver?.(renderRequest);
      runtime.drawCover(renderRequest);
      if (request.isCancelled?.()) {
        release();
        throw cancellationError();
      }
      runtime.releaseCoverScratchCanvases(canvas);
    } catch (error) {
      if (error instanceof CoverExportError && error.code === "EXPORT_CANCELLED") throw error;
      lastFailure = new CoverExportError("CANVAS_RENDER_FAILED", "浏览器无法按候选像素绘制图片", error);
      release();
      if (index < attempts.length - 1) await runtime.waitForNextAttempt();
      continue;
    }

    if (request.format === "jpeg") {
      let exceededLimit = false;
      for (const quality of ORIGINAL_PIXEL_JPEG_QUALITIES) {
        blob = await encodeCanvas(canvas, mimeType, quality);
        if (request.isCancelled?.()) {
          release();
          throw cancellationError();
        }
        if (!blob) break;
        if (blob.size <= ORIGINAL_PIXEL_JPEG_MAX_BYTES) {
          exceededLimit = false;
          break;
        }
        exceededLimit = true;
      }
      if (blob && blob.size > ORIGINAL_PIXEL_JPEG_MAX_BYTES) blob = null;
      lastFailure = exceededLimit
        ? new CoverExportError("JPEG_SIZE_LIMIT", "无法在保留候选像素的同时把 JPG 控制在 19.9MB 内")
        : new CoverExportError("CANVAS_EXPORT_FAILED", "浏览器无法编码 JPG");
    } else {
      blob = await encodeCanvas(canvas, mimeType);
      if (request.isCancelled?.()) {
        release();
        throw cancellationError();
      }
      lastFailure = new CoverExportError("CANVAS_EXPORT_FAILED", "浏览器无法编码 PNG");
    }

    if (blob) {
      release();
      const preset = getPreset(request.render);
      const fileName = getExportFileName(
        request.fileStem,
        request.photoOnly ? "原图" : "设计",
        preset.label,
        preset.ratio,
        request.format,
        request.now,
      );
      const file = runtime.createFile(blob, fileName, { type: blob.type || mimeType });
      return {
        blob,
        file,
        outputSize,
        originalOutputSize,
        usedMobileFallback: outputSize.width !== originalOutputSize.width
          || outputSize.height !== originalOutputSize.height,
      };
    }

    release();
    if (index < attempts.length - 1) await runtime.waitForNextAttempt();
  }

  throw lastFailure;
}

export function createCoverExportAsset(request: CoverExportRequest) {
  if (!browserRuntime) {
    throw new Error("Cover export runtime has not been configured");
  }
  return createCoverExportAssetWithRuntime(request, browserRuntime);
}
