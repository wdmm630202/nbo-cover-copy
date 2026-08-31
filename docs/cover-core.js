var NBOCoverCore = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region app/cover/core/export-core.ts
	var CoverExportError = class extends Error {
		constructor(code, message, cause) {
			super(message);
			this.name = "CoverExportError";
			this.code = code;
			this.cause = cause;
		}
	};
	var MOBILE_EXPORT_LIMITS = [
		{
			maxPixels: 8e6,
			maxSide: 4096
		},
		{
			maxPixels: 6e6,
			maxSide: 4096
		},
		{
			maxPixels: 4e6,
			maxSide: 4096
		},
		{
			maxPixels: 21e5,
			maxSide: 4096
		}
	];
	var ORIGINAL_PIXEL_JPEG_QUALITIES = [
		.98,
		.91,
		.84,
		.77,
		.7,
		.63,
		.56
	];
	var ORIGINAL_PIXEL_JPEG_MAX_BYTES = 19.9 * 1024 * 1024;
	function formatExportTimestamp(date = /* @__PURE__ */ new Date()) {
		const pad = (value) => String(value).padStart(2, "0");
		return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
	}
	function normalizeFileStem(fileStem) {
		return fileStem.replace(/\.[^.]+$/, "") || "南铂封面";
	}
	function getExportFileName(fileStem, variant, platformLabel, ratio, format, date = /* @__PURE__ */ new Date()) {
		const extension = format === "png" ? "png" : "jpg";
		return `${normalizeFileStem(fileStem)}_${variant}_${platformLabel}_${ratio.replace(":", "x")}_${formatExportTimestamp(date)}.${extension}`;
	}
	function getOriginalPixelExportPlan(source, preset, format) {
		const sourceWidth = Math.max(1, Math.round(source.width));
		const sourceHeight = Math.max(1, Math.round(source.height));
		const targetRatio = Math.max(1, preset.width) / Math.max(1, preset.height);
		return {
			...sourceWidth / sourceHeight >= targetRatio ? {
				width: Math.max(1, Math.round(sourceHeight * targetRatio)),
				height: sourceHeight
			} : {
				width: sourceWidth,
				height: Math.max(1, Math.round(sourceWidth / targetRatio))
			},
			quality: format === "jpeg" ? .98 : null
		};
	}
	function constrainExportSize(size, maxPixels, maxSide) {
		const scale = Math.min(1, Math.sqrt(maxPixels / (size.width * size.height)), maxSide / size.width, maxSide / size.height);
		return {
			width: Math.max(1, Math.round(size.width * scale)),
			height: Math.max(1, Math.round(size.height * scale))
		};
	}
	function getExportAttemptSizes(source, preset, format, mobile) {
		const plan = getOriginalPixelExportPlan(source, preset, format);
		const original = {
			width: plan.width,
			height: plan.height
		};
		if (!mobile) return [original];
		const candidates = [original, ...MOBILE_EXPORT_LIMITS.map(({ maxPixels, maxSide }) => constrainExportSize(original, maxPixels, maxSide))];
		return candidates.filter((candidate, index) => candidates.findIndex((item) => item.width === candidate.width && item.height === candidate.height) === index);
	}
	function getOriginalPixelJpegQualities() {
		return [...ORIGINAL_PIXEL_JPEG_QUALITIES];
	}
	function getOriginalPixelJpegMaxBytes() {
		return ORIGINAL_PIXEL_JPEG_MAX_BYTES;
	}
	function getPreset(render) {
		return render.preset;
	}
	function encodeCanvas(canvas, mimeType, quality) {
		return new Promise((resolve) => {
			try {
				canvas.toBlob(resolve, mimeType, quality);
			} catch {
				resolve(null);
			}
		});
	}
	var browserRuntime = null;
	function configureCoverExportRuntime(runtime) {
		browserRuntime = runtime;
	}
	async function createCoverExportAssetWithRuntime(request, runtime) {
		const cancellationError = () => new CoverExportError("EXPORT_CANCELLED", "导出任务已失效");
		if (request.isCancelled?.()) throw cancellationError();
		const { image } = request.render;
		if (!image?.naturalWidth || !image.naturalHeight) throw new CoverExportError("SOURCE_IMAGE_MISSING", "请先上传一张照片");
		const attempts = getExportAttemptSizes({
			width: image.naturalWidth,
			height: image.naturalHeight
		}, getPreset(request.render), request.format, request.mobile);
		const originalOutputSize = attempts[0];
		const mimeType = request.format === "png" ? "image/png" : "image/jpeg";
		let lastFailure = new CoverExportError("CANVAS_EXPORT_FAILED", "浏览器无法生成这张图片");
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
			let blob = null;
			try {
				runtime.drawCover({
					...request.render,
					canvas,
					includeGuide: false,
					outputSize,
					photoOnly: request.photoOnly
				});
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
				lastFailure = exceededLimit ? new CoverExportError("JPEG_SIZE_LIMIT", "无法在保留候选像素的同时把 JPG 控制在 19.9MB 内") : new CoverExportError("CANVAS_EXPORT_FAILED", "浏览器无法编码 JPG");
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
				const fileName = getExportFileName(request.fileStem, request.photoOnly ? "原图" : "设计", preset.label, preset.ratio, request.format, request.now);
				const file = runtime.createFile(blob, fileName, { type: blob.type || mimeType });
				return {
					blob,
					file,
					outputSize,
					originalOutputSize,
					usedMobileFallback: outputSize.width !== originalOutputSize.width || outputSize.height !== originalOutputSize.height
				};
			}
			release();
			if (index < attempts.length - 1) await runtime.waitForNextAttempt();
		}
		throw lastFailure;
	}
	function createCoverExportAsset(request) {
		if (!browserRuntime) throw new Error("Cover export runtime has not been configured");
		return createCoverExportAssetWithRuntime(request, browserRuntime);
	}
	//#endregion
	//#region app/cover/cover-config.ts
	var PLATFORM_PRESETS = [
		{
			id: "douyin",
			label: "抖音",
			ratio: "9:16",
			width: 1080,
			height: 1920,
			note: "竖屏封面，带居中 3:4 主页安全区"
		},
		{
			id: "xiaohongshu",
			label: "小红书",
			ratio: "3:4",
			width: 1080,
			height: 1440,
			note: "适合图文与竖版内容封面"
		},
		{
			id: "shipinhao",
			label: "视频号",
			ratio: "3:4",
			width: 1080,
			height: 1440,
			note: "竖版内容常用工作尺寸"
		}
	];
	var COVER_TEMPLATES = [
		{
			id: "top-left",
			name: "上方左题",
			hint: "上方区域，左侧对齐",
			number: "01"
		},
		{
			id: "top-center",
			name: "上方居中",
			hint: "上方区域，中轴对齐",
			number: "02"
		},
		{
			id: "top-right",
			name: "上方右题",
			hint: "上方区域，右侧对齐",
			number: "03"
		},
		{
			id: "middle-left",
			name: "居中左题",
			hint: "居中区域，左侧对齐",
			number: "04"
		},
		{
			id: "middle-center",
			name: "居中",
			hint: "居中区域，中轴对齐",
			number: "05"
		},
		{
			id: "middle-right",
			name: "居中右题",
			hint: "居中区域，右侧对齐",
			number: "06"
		},
		{
			id: "bottom-left",
			name: "下方左题",
			hint: "下方区域，左侧对齐",
			number: "07"
		},
		{
			id: "bottom-center",
			name: "下方居中",
			hint: "下方区域，中轴对齐",
			number: "08"
		},
		{
			id: "bottom-right",
			name: "下方右题",
			hint: "下方区域，右侧对齐",
			number: "09"
		}
	];
	var DOUYIN_HOME_GRID_SAFE_AREA = {
		cropTop: 240,
		cropBottom: 1680,
		horizontalInset: 54,
		verticalInset: 54,
		playCountReserve: 144
	};
	//#endregion
	//#region app/cover/compare-layout.ts
	var COMPARISON_PHOTO_DEFAULTS = {
		zoom: 100,
		offsetX: 0,
		offsetY: 0,
		rotation: 0,
		brightness: 100,
		shade: 0,
		bottomShade: 100
	};
	function comparisonNumber(value, fallback, min, max) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
	}
	function normalizeComparisonPhotoAdjustments(value = {}) {
		const source = value ?? {};
		return {
			zoom: comparisonNumber(source.zoom, COMPARISON_PHOTO_DEFAULTS.zoom, 100, 300),
			offsetX: comparisonNumber(source.offsetX, COMPARISON_PHOTO_DEFAULTS.offsetX, -100, 100),
			offsetY: comparisonNumber(source.offsetY, COMPARISON_PHOTO_DEFAULTS.offsetY, -100, 100),
			rotation: comparisonNumber(source.rotation, COMPARISON_PHOTO_DEFAULTS.rotation, -180, 180),
			brightness: comparisonNumber(source.brightness, COMPARISON_PHOTO_DEFAULTS.brightness, 0, 200),
			shade: comparisonNumber(source.shade, COMPARISON_PHOTO_DEFAULTS.shade, 0, 100),
			bottomShade: comparisonNumber(source.bottomShade, COMPARISON_PHOTO_DEFAULTS.bottomShade, 0, 100)
		};
	}
	function getComparisonPhotoTransform(image, frame, value = {}) {
		const settings = normalizeComparisonPhotoAdjustments(value);
		const rotationRadians = settings.rotation * Math.PI / 180;
		const cosine = Math.abs(Math.cos(rotationRadians));
		const sine = Math.abs(Math.sin(rotationRadians));
		const naturalWidth = Math.max(1, image.width);
		const naturalHeight = Math.max(1, image.height);
		const coverScale = Math.max((frame.width * cosine + frame.height * sine) / naturalWidth, (frame.width * sine + frame.height * cosine) / naturalHeight) * settings.zoom / 100;
		return {
			drawWidth: naturalWidth * coverScale,
			drawHeight: naturalHeight * coverScale,
			centerX: frame.x + frame.width / 2 + settings.offsetX / 100 * frame.width,
			centerY: frame.y + frame.height / 2 + settings.offsetY / 100 * frame.height,
			rotationRadians
		};
	}
	function getComparisonSafeRect(canvas) {
		const safeHeight = Math.min(canvas.height, Math.round(canvas.width / 3 * 4));
		return {
			x: 0,
			y: Math.round((canvas.height - safeHeight) / 2),
			width: canvas.width,
			height: safeHeight
		};
	}
	function normalizeComparisonFrameScale(value) {
		return comparisonNumber(value, 100, 100, 120);
	}
	function getComparisonEvidenceLayout(canvas, frameScale = 100) {
		const safe = getComparisonSafeRect(canvas);
		const scale = normalizeComparisonFrameScale(frameScale) / 100;
		const defaultWidth = Math.round(safe.width * .39);
		const defaultHeight = Math.round(safe.height * .42);
		const defaultRight = safe.x + safe.width - Math.round(safe.width * .027);
		const defaultBottom = safe.y + safe.height - Math.round(safe.height * .0194);
		const width = Math.round(defaultWidth * scale);
		const height = Math.round(defaultHeight * scale);
		return {
			safe,
			frame: {
				x: defaultRight - width,
				y: defaultBottom - height,
				width,
				height,
				radius: Math.round(safe.width * .0278 * scale)
			},
			imageInset: 4
		};
	}
	function getComparisonLabelLayout(canvas, frameScale = 100) {
		const { safe, frame } = getComparisonEvidenceLayout(canvas, frameScale);
		const scale = canvas.width / 1080;
		const width = 104 * scale;
		const height = 54 * scale;
		const capsule = {
			width,
			height,
			radius: height / 2
		};
		const afterCenterY = safe.y + 75 * scale;
		const beforeInset = 20 * scale;
		return {
			after: {
				right: safe.x + safe.width - Math.round(48 * scale),
				y: afterCenterY - height / 2,
				...capsule
			},
			before: {
				right: frame.x + frame.width - beforeInset,
				y: frame.y + beforeInset,
				...capsule
			}
		};
	}
	function capsulePath(context, x, y, width, height) {
		const radius = Math.min(height / 2, width / 2);
		const centerY = y + height / 2;
		context.beginPath();
		context.moveTo(x + radius, y);
		context.lineTo(x + width - radius, y);
		context.arc(x + width - radius, centerY, radius, -Math.PI / 2, Math.PI / 2);
		context.lineTo(x + radius, y + height);
		context.arc(x + radius, centerY, radius, Math.PI / 2, Math.PI * 1.5);
		context.closePath();
	}
	function drawComparisonCapsule(context, capsule, word, outputScale) {
		const x = capsule.right - capsule.width;
		const onePhysicalPixel = 1 / Math.max(.01, outputScale);
		context.save();
		context.shadowColor = "rgba(0,0,0,.24)";
		context.shadowBlur = Math.max(3, 8 * outputScale);
		context.shadowOffsetY = Math.max(1, 2 * outputScale);
		capsulePath(context, x, capsule.y, capsule.width, capsule.height);
		const shellGradient = context.createLinearGradient(0, capsule.y, 0, capsule.y + capsule.height);
		shellGradient.addColorStop(0, "rgba(120,120,124,.58)");
		shellGradient.addColorStop(.14, "rgba(70,70,74,.78)");
		shellGradient.addColorStop(.62, "rgba(43,43,46,.78)");
		shellGradient.addColorStop(1, "rgba(28,28,31,.72)");
		context.fillStyle = shellGradient;
		context.fill();
		context.shadowColor = "transparent";
		context.lineWidth = Math.max(1.1, onePhysicalPixel);
		context.strokeStyle = "rgba(255,255,255,.34)";
		context.stroke();
		context.shadowColor = "rgba(255,255,255,.3)";
		context.shadowBlur = Math.max(2, 6 * outputScale);
		context.shadowOffsetY = -Math.max(1, 2 * outputScale);
		context.lineWidth = Math.max(1.5, onePhysicalPixel);
		context.strokeStyle = "rgba(255,255,255,.48)";
		context.stroke();
		const circleRadius = capsule.width * (19 / 104);
		const circleX = x + capsule.width * (76.5 / 104);
		const circleY = capsule.y + capsule.height / 2;
		context.shadowColor = "rgba(0,0,0,.2)";
		context.shadowBlur = Math.max(2, 4 * outputScale);
		context.shadowOffsetY = Math.max(.5, outputScale);
		context.beginPath();
		context.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
		const buttonGradient = context.createLinearGradient(0, circleY - circleRadius, 0, circleY + circleRadius);
		buttonGradient.addColorStop(0, "rgba(255,255,255,.99)");
		buttonGradient.addColorStop(.55, "rgba(239,239,241,.98)");
		buttonGradient.addColorStop(1, "rgba(205,205,208,.97)");
		context.fillStyle = buttonGradient;
		context.fill();
		context.shadowColor = "transparent";
		context.lineWidth = Math.max(1.2, onePhysicalPixel);
		context.strokeStyle = "rgba(255,255,255,.9)";
		context.stroke();
		context.textBaseline = "middle";
		context.textAlign = "center";
		context.font = `700 ${Math.round(capsule.width * (18 / 104))}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
		const textY = circleY - capsule.width * (.5 / 104);
		context.fillStyle = "rgba(248,248,250,.92)";
		context.fillText("拍", x + capsule.width * (20.5 / 104), textY);
		context.fillText("摄", x + capsule.width * (40.35 / 104), textY);
		context.font = `800 ${Math.round(capsule.width * (22 / 104))}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
		context.fillStyle = "#252527";
		context.fillText(word, circleX, textY);
		context.restore();
	}
	function drawComparisonEditorialOverlay(context, canvas, roundedRectPath, frameScale = 100) {
		const scale = canvas.width / 1080;
		const baseCanvas = {
			width: 1080,
			height: canvas.height / scale
		};
		const safe = getComparisonSafeRect(baseCanvas);
		const { frame } = getComparisonEvidenceLayout(baseCanvas, frameScale);
		const labels = getComparisonLabelLayout(baseCanvas, frameScale);
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
		drawComparisonCapsule(context, labels.after, "后", scale);
		drawComparisonCapsule(context, labels.before, "前", scale);
		context.restore();
	}
	function getComparisonFadeStops() {
		return [
			[0, 0],
			[.04, .78],
			[.08, 1],
			[.92, 1],
			[.96, .78],
			[1, 0]
		];
	}
	//#endregion
	//#region app/cover/core/retouch-core.ts
	function getRetouchBrushGeometry(size, featherValue, canvasWidth) {
		const radius = Math.max(1, size * canvasWidth / 2160);
		const feather = Math.max(0, Math.min(1, featherValue / 100));
		return {
			radius,
			coreRadius: radius * (1 - feather * .92),
			blurRadius: radius * feather * .58
		};
	}
	function mapRetouchPoint(point, width, height) {
		return {
			x: point.x * width,
			y: point.y * height
		};
	}
	function eraseShadeWithBrush(context, strokeCanvas, width, height, strokes) {
		if (!strokes.length) return;
		const strokeContext = strokeCanvas.getContext("2d");
		if (!strokeContext) return;
		for (const stroke of strokes) {
			const { coreRadius, blurRadius } = getRetouchBrushGeometry(stroke.size, stroke.feather, width);
			const strength = Math.max(0, Math.min(1, stroke.strength / 100));
			if (!stroke.points.length) continue;
			strokeContext.clearRect(0, 0, width, height);
			strokeContext.lineCap = "round";
			strokeContext.lineJoin = "round";
			strokeContext.lineWidth = Math.max(1, coreRadius * 2);
			strokeContext.strokeStyle = `rgba(255,255,255,${strength})`;
			strokeContext.fillStyle = `rgba(255,255,255,${strength})`;
			const first = mapRetouchPoint(stroke.points[0], width, height);
			strokeContext.beginPath();
			strokeContext.moveTo(first.x, first.y);
			if (stroke.points.length === 1) {
				strokeContext.arc(first.x, first.y, coreRadius, 0, Math.PI * 2);
				strokeContext.fill();
			} else {
				for (let index = 1; index < stroke.points.length - 1; index += 1) {
					const point = stroke.points[index];
					const next = stroke.points[index + 1];
					strokeContext.quadraticCurveTo(point.x * width, point.y * height, (point.x + next.x) / 2 * width, (point.y + next.y) / 2 * height);
				}
				const last = mapRetouchPoint(stroke.points[stroke.points.length - 1], width, height);
				strokeContext.lineTo(last.x, last.y);
				strokeContext.stroke();
			}
			context.save();
			context.globalCompositeOperation = "destination-out";
			context.filter = `blur(${blurRadius}px)`;
			context.drawImage(strokeCanvas, 0, 0);
			context.restore();
		}
	}
	//#endregion
	//#region app/cover/core/render-core.ts
	var coverScratch = /* @__PURE__ */ new WeakMap();
	function getCoverScratch(canvas, kind, width, height) {
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
	function releaseCoverScratch(canvas, kind) {
		const scratch = coverScratch.get(canvas);
		const item = scratch?.[kind];
		if (!scratch || !item) return;
		item.width = item.height = 1;
		delete scratch[kind];
		if (!Object.keys(scratch).length) coverScratch.delete(canvas);
	}
	function releaseCoverScratchCanvases(canvas) {
		const scratch = coverScratch.get(canvas);
		if (scratch) {
			Object.values(scratch).forEach((item) => {
				item.width = item.height = 1;
			});
			coverScratch.delete(canvas);
		}
	}
	function releaseCoverCanvas(canvas) {
		releaseCoverScratchCanvases(canvas);
		canvas.width = canvas.height = 1;
	}
	var WATERMARK_VISIBLE_HEIGHT_AT_1080 = 32;
	var WATERMARK_BOTTOM_GAP_AT_1080 = 36;
	var getWatermarkVisibleHeight = (width) => Math.round(WATERMARK_VISIBLE_HEIGHT_AT_1080 * (width / 1080));
	var getWatermarkBottomGap = (width) => Math.round(WATERMARK_BOTTOM_GAP_AT_1080 * (width / 1080));
	function roundedRectPath(context, x, y, width, height, radius) {
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
	function getBeforeOffsetLimits(beforeImage, frame, beforeZoom, beforeRotation = 0) {
		if (!beforeImage || !beforeImage.naturalWidth || !beforeImage.naturalHeight) return {
			x: 0,
			y: 0
		};
		const transform = getComparisonPhotoTransform({
			width: beforeImage.naturalWidth,
			height: beforeImage.naturalHeight
		}, {
			x: 0,
			y: 0,
			width: frame.width,
			height: frame.height
		}, {
			zoom: beforeZoom,
			rotation: beforeRotation
		});
		const cosine = Math.abs(Math.cos(transform.rotationRadians));
		const sine = Math.abs(Math.sin(transform.rotationRadians));
		const drawWidth = transform.drawWidth * cosine + transform.drawHeight * sine;
		const drawHeight = transform.drawWidth * sine + transform.drawHeight * cosine;
		return {
			x: Math.min(100, Math.max(0, (drawWidth - frame.width) / 2 / frame.width * 100)),
			y: Math.min(100, Math.max(0, (drawHeight - frame.height) / 2 / frame.height * 100))
		};
	}
	function getBeforeImageFrame(canvas, frameScale = 100) {
		const { frame, imageInset } = getComparisonEvidenceLayout(canvas, frameScale);
		const inset = Math.max(2, Math.round(imageInset * canvas.width / 1080));
		return {
			x: frame.x + inset,
			y: frame.y + inset,
			width: frame.width - inset * 2,
			height: frame.height - inset * 2,
			radius: Math.max(1, frame.radius - inset)
		};
	}
	function applyComparisonFadeMask(context, frame) {
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
	function drawComparisonEvidence(context, ownerCanvas, beforeImage, settings, width, height, beforeRetouchStrokes) {
		const { frame } = getComparisonEvidenceLayout({
			width,
			height
		}, settings.beforeFrameScale);
		const imageFrame = getBeforeImageFrame({
			width,
			height
		}, settings.beforeFrameScale);
		if (!beforeImage) {
			context.save();
			roundedRectPath(context, imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, imageFrame.radius);
			context.clip();
			context.fillStyle = "rgba(28,28,28,.66)";
			context.fillRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
			context.fillStyle = "rgba(238,238,238,.86)";
			context.font = `600 ${Math.max(12, Math.round(width * .018))}px sans-serif`;
			context.textAlign = "center";
			context.textBaseline = "middle";
			context.fillText("请添加拍摄前素颜照", frame.x + frame.width / 2, frame.y + frame.height / 2, frame.width * .82);
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
		const transform = getComparisonPhotoTransform({
			width: beforeImage.naturalWidth,
			height: beforeImage.naturalHeight
		}, imageFrame, {
			zoom: settings.beforeZoom,
			offsetX,
			offsetY,
			rotation: settings.beforeRotation
		});
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
				shadeContext.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(.9, settings.beforeShade / 100))})`;
				shadeContext.fillRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
			}
			if (settings.beforeBottomShade > 0) {
				const bottomAlpha = Math.max(0, Math.min(.9, settings.beforeBottomShade / 100));
				const bottomGradient = shadeContext.createLinearGradient(0, imageFrame.y + imageFrame.height * .35, 0, imageFrame.y + imageFrame.height);
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
	function drawCover({ canvas, image, beforeImage, watermark, settings, preset, includeGuide, outputSize, photoOnly = false, retouchStrokes = [], beforeRetouchStrokes = [] }) {
		const context = canvas.getContext("2d");
		if (!context) return;
		const { width, height } = outputSize ?? preset;
		if (!settings.compareEnabled || photoOnly) releaseCoverScratch(canvas, "compare");
		if (!retouchStrokes.length && !beforeRetouchStrokes.length || photoOnly) {
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
			const scale = Math.max(width / rotatedWidth, height / rotatedHeight) * settings.zoom / 100;
			const imageWidth = image.naturalWidth * scale;
			const imageHeight = image.naturalHeight * scale;
			context.save();
			context.filter = `brightness(${settings.brightness}%)`;
			context.translate(width / 2 + settings.offsetX / 100 * width, height / 2 + settings.offsetY / 100 * height);
			context.rotate(radians);
			context.drawImage(image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
			context.restore();
		} else {
			const placeholder = context.createLinearGradient(0, 0, width, height);
			placeholder.addColorStop(0, "#161616");
			placeholder.addColorStop(.58, "#2b2725");
			placeholder.addColorStop(1, "#0d0d0d");
			context.fillStyle = placeholder;
			context.fillRect(0, 0, width, height);
			context.fillStyle = "rgba(255,255,255,.36)";
			context.font = `600 ${Math.round(width * .034)}px sans-serif`;
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
			} else drawTemplateShade(context, settings.templateId, width, height, settings.shade, settings.bottomShade);
			if (settings.compareEnabled) drawComparisonEvidence(context, canvas, beforeImage, settings, width, height, beforeRetouchStrokes);
			drawCoverText(context, settings, width, height, watermark);
			if (settings.compareEnabled) drawComparisonEditorialOverlay(context, {
				width,
				height
			}, roundedRectPath, settings.beforeFrameScale);
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
			context.font = `700 ${Math.round(width * .024)}px sans-serif`;
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
	function drawTemplateShade(context, templateId, width, height, shade, bottomShade) {
		const alpha = Math.max(0, Math.min(.9, shade / 100));
		let gradient;
		if (templateId.startsWith("bottom-")) {
			gradient = context.createLinearGradient(0, height * .35, 0, height);
			gradient.addColorStop(0, "rgba(0,0,0,0)");
			gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
		} else if (templateId.endsWith("-right")) {
			gradient = context.createLinearGradient(width * .18, 0, width, 0);
			gradient.addColorStop(0, "rgba(0,0,0,0)");
			gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
		} else if (templateId === "middle-center") {
			gradient = context.createLinearGradient(0, 0, 0, height);
			gradient.addColorStop(0, `rgba(0,0,0,${alpha * .3})`);
			gradient.addColorStop(.5, `rgba(0,0,0,${alpha * .12})`);
			gradient.addColorStop(1, `rgba(0,0,0,${alpha * .72})`);
		} else {
			gradient = context.createLinearGradient(0, 0, width * .82, 0);
			gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
			gradient.addColorStop(.68, `rgba(0,0,0,${alpha * .36})`);
			gradient.addColorStop(1, "rgba(0,0,0,0)");
		}
		context.fillStyle = gradient;
		context.fillRect(0, 0, width, height);
		if (bottomShade > 0) {
			const bottomAlpha = Math.max(0, Math.min(.9, bottomShade / 100));
			const bottomGradient = context.createLinearGradient(0, height * .35, 0, height);
			bottomGradient.addColorStop(0, "rgba(0,0,0,0)");
			bottomGradient.addColorStop(1, `rgba(0,0,0,${bottomAlpha})`);
			context.fillStyle = bottomGradient;
			context.fillRect(0, 0, width, height);
		}
	}
	function colorWithAlpha(color, alpha) {
		const value = Number.parseInt(color.replace("#", ""), 16);
		return `rgba(${value >> 16},${value >> 8 & 255},${value & 255},${alpha})`;
	}
	function drawCoverText(context, settings, width, height, watermark) {
		const isRight = settings.templateId.endsWith("-right");
		const isCenter = settings.templateId.endsWith("-center");
		const textAlign = isRight ? "right" : isCenter ? "center" : "left";
		const geometryScale = width / 1080;
		const horizontalInset = DOUYIN_HOME_GRID_SAFE_AREA.horizontalInset * geometryScale;
		const x = isRight ? width - horizontalInset : isCenter ? width / 2 : horizontalInset;
		const maxWidth = width - horizontalInset * 2;
		const topBaseFont = Math.max(1, Math.round(width * .074 * 2.1 * (settings.textScale / 100)));
		const bottomBaseFont = Math.max(1, Math.round(width * .074 * 2.1 * (settings.bottomTextScale / 100)));
		context.save();
		context.textAlign = textAlign;
		const textStroke = Math.max(0, Math.min(1, settings.textStroke / 100));
		const textShadow = Math.max(0, Math.min(1, settings.textShadow / 100));
		context.lineJoin = "round";
		context.strokeStyle = `rgba(0,0,0,${.92 * textStroke})`;
		context.lineWidth = width * .012 * textStroke;
		context.shadowColor = `rgba(0,0,0,${.78 * textShadow})`;
		context.shadowBlur = width * .024 * textShadow;
		context.shadowOffsetX = width * .004 * textShadow;
		context.shadowOffsetY = width * .006 * textShadow;
		const hasBottomText = Boolean(settings.bottomText.trim());
		const topFit = fitText(context, settings.topText, topBaseFont, maxWidth);
		const bottomFit = hasBottomText ? fitText(context, settings.bottomText, settings.textScaleLinked ? topBaseFont : bottomBaseFont, maxWidth) : topFit;
		const linkedFontSize = Math.min(topFit, bottomFit);
		const topFontSize = settings.textScaleLinked ? linkedFontSize : topFit;
		const bottomFontSize = settings.textScaleLinked ? linkedFontSize : bottomFit;
		const subtitleFontSize = Math.round(width * .061 * (settings.subtitleScale / 100));
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
		const blockBottom = settings.subtitle.trim() ? relativeSubtitleBaseline + (subtitleLines - 1) * subtitleLineHeight + subtitleInk.descent : settings.showDivider ? relativeDividerY + dividerThickness : relativeActiveBaseline + activeHeadlineInk.descent;
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
		const watermarkTop = watermark ? watermarkBottom - ((watermarkBounds?.bottom ?? 0) - (watermarkBounds?.top ?? 0)) * fixedWatermarkScale : Number.POSITIVE_INFINITY;
		const bottomTextLimit = Math.min(usableBottom, watermarkTop - fixedVerticalGap);
		const requestedY = settings.templateId.startsWith("top-") ? usableTop - blockTop : settings.templateId.startsWith("bottom-") ? bottomTextLimit - blockBottom : (cropTop + cropBottom) / 2 - blockTop;
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
			dividerGradient.addColorStop(.18, colorWithAlpha(settings.dividerColor, 1));
			dividerGradient.addColorStop(.82, colorWithAlpha(settings.dividerColor, 1));
			dividerGradient.addColorStop(1, colorWithAlpha(settings.dividerColor, 0));
			context.fillStyle = dividerGradient;
			context.fillRect(Math.round(dividerX), dividerY, Math.round(dividerWidth), dividerThickness);
		}
		if (settings.subtitle.trim()) {
			context.shadowColor = `rgba(0,0,0,${.78 * textShadow})`;
			context.shadowBlur = width * .024 * textShadow;
			context.shadowOffsetX = width * .004 * textShadow;
			context.shadowOffsetY = width * .006 * textShadow;
			context.fillStyle = settings.subtitleColor;
			context.font = `400 ${subtitleFontSize}px sans-serif`;
			drawWrappedText(context, settings.subtitle, x, settings.showDivider ? subtitleBaseline : activeHeadlineBaseline + activeHeadlineInk.descent + fixedVerticalGap + subtitleInk.ascent, maxWidth, subtitleLineHeight, textAlign);
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
			bottom: y + blockBottom
		};
		context.restore();
		return bounds;
	}
	function drawWatermark(context, watermark, settings, width, height) {
		const bounds = getWatermarkVisibleBounds(watermark);
		const scale = getWatermarkVisibleHeight(width) / Math.max(1, bounds.bottom - bounds.top);
		const drawWidth = watermark.naturalWidth * scale;
		const drawHeight = watermark.naturalHeight * scale;
		const safeInset = DOUYIN_HOME_GRID_SAFE_AREA.horizontalInset * (width / 1080);
		const watermarkEdgeGap = getWatermarkBottomGap(width);
		const x = settings.watermarkAlign === "left" ? safeInset - bounds.left * scale : settings.watermarkAlign === "right" ? width - safeInset - bounds.right * scale : width / 2 - (bounds.left + bounds.right) / 2 * scale;
		const isDouyinCanvas = height / width > 1.5;
		const y = (isDouyinCanvas ? DOUYIN_HOME_GRID_SAFE_AREA.cropBottom * (width / 1080) : height) - (isDouyinCanvas ? DOUYIN_HOME_GRID_SAFE_AREA.playCountReserve * (width / 1080) : 0) - watermarkEdgeGap - bounds.bottom * scale;
		context.save();
		context.globalAlpha = settings.watermarkOpacity / 100;
		context.drawImage(watermark, x, y, drawWidth, drawHeight);
		context.restore();
	}
	var watermarkBoundsCache = /* @__PURE__ */ new WeakMap();
	function getWatermarkVisibleBounds(watermark) {
		const cached = watermarkBoundsCache.get(watermark);
		if (cached) return cached;
		const sampleWidth = Math.min(1600, watermark.naturalWidth);
		const sampleHeight = Math.max(1, Math.round(watermark.naturalHeight * sampleWidth / watermark.naturalWidth));
		const sample = document.createElement("canvas");
		sample.width = sampleWidth;
		sample.height = sampleHeight;
		const sampleContext = sample.getContext("2d", { willReadFrequently: true });
		if (!sampleContext) return {
			left: 0,
			right: watermark.naturalWidth,
			top: 0,
			bottom: watermark.naturalHeight
		};
		sampleContext.drawImage(watermark, 0, 0, sampleWidth, sampleHeight);
		const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
		let left = sampleWidth;
		let right = -1;
		let top = sampleHeight;
		let bottom = -1;
		for (let index = 3; index < pixels.length; index += 4) {
			if (pixels[index] <= 8) continue;
			const x = (index - 3) / 4 % sampleWidth;
			const y = Math.floor((index - 3) / 4 / sampleWidth);
			left = Math.min(left, x);
			right = Math.max(right, x);
			top = Math.min(top, y);
			bottom = Math.max(bottom, y);
		}
		const ratioX = watermark.naturalWidth / sampleWidth;
		const ratioY = watermark.naturalHeight / sampleHeight;
		const bounds = right < left ? {
			left: 0,
			right: watermark.naturalWidth,
			top: 0,
			bottom: watermark.naturalHeight
		} : {
			left: left * ratioX,
			right: (right + 1) * ratioX,
			top: top * ratioY,
			bottom: (bottom + 1) * ratioY
		};
		watermarkBoundsCache.set(watermark, bounds);
		return bounds;
	}
	function fitText(context, text, startingSize, maxWidth) {
		let size = startingSize;
		const safeText = text || "标题";
		while (size > startingSize * .58) {
			context.font = `900 ${size}px sans-serif`;
			if (context.measureText(safeText).width <= maxWidth) break;
			size -= 2;
		}
		return size;
	}
	function measureInkBounds(context, text) {
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
			ascent: ascent || fallbackSize * .78,
			descent: descent || fallbackSize * .22
		};
	}
	function drawWrappedText(context, text, x, y, maxWidth, lineHeight, align) {
		const characters = Array.from(text);
		const lines = Array.from({ length: Math.ceil(characters.length / 12) }, (_, index) => characters.slice(index * 12, index * 12 + 12).join(""));
		context.textAlign = align;
		lines.slice(0, 2).forEach((line, index) => {
			const lineY = y + index * lineHeight;
			if (Array.from(line).length !== 12) {
				if (context.lineWidth > 0) context.strokeText(line, x, lineY, maxWidth);
				context.fillText(line, x, lineY, maxWidth);
				return;
			}
			const left = align === "right" ? x - maxWidth : align === "center" ? x - maxWidth / 2 : x;
			const glyphs = Array.from(line).map((character) => ({
				character,
				metrics: context.measureText(character)
			}));
			const widths = glyphs.map(({ metrics }) => (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || metrics.width));
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
	function countWrappedLines(text) {
		if (!text.trim()) return 0;
		return Math.min(Math.ceil(Array.from(text).length / 12), 2);
	}
	function getWrappedTextWidth(context, text, maxWidth) {
		if (!text.trim()) return 0;
		const characters = Array.from(text);
		return Math.max(...Array.from({ length: Math.min(2, Math.ceil(characters.length / 12)) }, (_, index) => {
			const line = characters.slice(index * 12, index * 12 + 12).join("");
			return line.length === 12 ? maxWidth : Math.min(maxWidth, context.measureText(line).width);
		}));
	}
	//#endregion
	//#region app/cover/core/editor-settings.ts
	var DEFAULT_COVER_SETTINGS = {
		platformId: "douyin",
		templateId: "middle-left",
		topText: "男人的",
		bottomText: "高级感",
		subtitle: "不被定义的自己",
		topColor: "#FFFFFF",
		bottomColor: "#FFFFFF",
		dividerColor: "#C9A77A",
		showDivider: true,
		subtitleColor: "#FFFFFF",
		subtitleScale: 100,
		brightness: 100,
		zoom: 100,
		offsetX: 0,
		offsetXRangeVersion: 2,
		offsetY: 0,
		rotation: 0,
		textScale: 100,
		bottomTextScale: 100,
		textScaleLinked: true,
		textStroke: 0,
		textShadow: 50,
		textShadowDefaultVersion: 1,
		titleScaleVersion: 3,
		shade: 0,
		bottomShade: 100,
		showSafeArea: true,
		compareEnabled: false,
		beforeZoom: 100,
		beforeOffsetX: 0,
		beforeOffsetY: 0,
		beforeRotation: 0,
		beforeBrightness: 100,
		beforeShade: 0,
		beforeBottomShade: 100,
		beforeFrameScale: 100,
		watermarkScale: 100,
		watermarkAlign: "left",
		watermarkOpacity: 50,
		watermarkEnabled: false,
		watermarkDefaultVersion: 1
	};
	var STATIC_SETTING_ALIASES = {
		platform: "platformId",
		template: "templateId",
		divider: "showDivider",
		safe: "showSafeArea"
	};
	function hasOwn(source, key) {
		return Object.prototype.hasOwnProperty.call(source, key);
	}
	function inferProfile(source) {
		return Object.keys(STATIC_SETTING_ALIASES).some((key) => hasOwn(source, key)) ? "static-storage" : "canonical";
	}
	function applyStaticAliases(source) {
		for (const [legacyKey, canonicalKey] of Object.entries(STATIC_SETTING_ALIASES)) if (hasOwn(source, legacyKey)) source[canonicalKey] = source[legacyKey];
	}
	function normalizeTemplateId(value, fallback = DEFAULT_COVER_SETTINGS.templateId) {
		const legacy = {
			left: "top-left",
			bottom: "top-center",
			badge: "middle-left",
			center: "middle-center",
			clean: "bottom-left",
			right: "bottom-right"
		};
		const id = typeof value === "string" ? value : "";
		if (legacy[id]) return legacy[id];
		return COVER_TEMPLATES.some((template) => template.id === id) ? id : fallback;
	}
	function normalizeCoverSettings(value, requestedProfile, baseSettings) {
		const patch = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
		const source = baseSettings ? {
			...baseSettings,
			...patch
		} : patch;
		const profile = requestedProfile ?? inferProfile(source);
		if (profile !== "canonical") applyStaticAliases(source);
		if (!Object.keys(DEFAULT_COVER_SETTINGS).some((key) => hasOwn(source, key))) return { ...DEFAULT_COVER_SETTINGS };
		const numberValue = (key, min, max) => {
			const parsed = Number(source[key]);
			return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : DEFAULT_COVER_SETTINGS[key];
		};
		const booleanValue = (key) => typeof source[key] === "boolean" ? source[key] : DEFAULT_COVER_SETTINGS[key];
		const textValue = (key, maxLength) => typeof source[key] === "string" ? source[key].slice(0, maxLength) : DEFAULT_COVER_SETTINGS[key];
		const colorValue = (key) => {
			const color = typeof source[key] === "string" ? source[key].toUpperCase() : "";
			return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_COVER_SETTINGS[key];
		};
		if (source.bottomColor === "#FEE800") source.bottomColor = "#FFFFFF";
		if (Number(source.watermarkOpacity) === 92) source.watermarkOpacity = 50;
		if (Number(source.watermarkScale) <= 42) source.watermarkScale = 100;
		if (profile !== "static-memory" && Number(source.shade) === 62) source.shade = 0;
		if (profile !== "static-memory" && source.watermarkDefaultVersion !== 1) {
			source.watermarkEnabled = false;
			source.watermarkDefaultVersion = 1;
		}
		if (Number(source.titleScaleVersion ?? 0) < 2) source.textScale = Math.round(Number(source.textScale || 100) / 1.8);
		if (Number(source.titleScaleVersion ?? 0) < 3) {
			source.bottomTextScale = Number(source.textScale || 100);
			source.textScaleLinked = true;
			source.titleScaleVersion = 3;
		}
		if (source.textShadowDefaultVersion !== 1) {
			source.textShadow = 50;
			source.textShadowDefaultVersion = 1;
		}
		if (source.offsetXRangeVersion !== 2) {
			const previousOffsetX = Number(source.offsetX ?? (source.offsetXRangeVersion === 1 ? 100 : 0));
			source.offsetX = Math.max(-200, Math.min(200, source.offsetXRangeVersion === 1 ? previousOffsetX - 100 : previousOffsetX));
			source.offsetXRangeVersion = 2;
		}
		if (source.bottomText === "藏在自然状态里") source.bottomText = "藏在自然状态";
		const platformId = typeof source.platformId === "string" && PLATFORM_PRESETS.some((item) => item.id === source.platformId) ? source.platformId : DEFAULT_COVER_SETTINGS.platformId;
		const watermarkAlign = source.watermarkAlign === "left" || source.watermarkAlign === "center" || source.watermarkAlign === "right" ? source.watermarkAlign : DEFAULT_COVER_SETTINGS.watermarkAlign;
		const staticTemplateFallback = profile === "canonical" ? DEFAULT_COVER_SETTINGS.templateId : "top-left";
		const staticWatermarkDefaultVersion = Number(source.watermarkDefaultVersion);
		return {
			platformId,
			templateId: normalizeTemplateId(source.templateId, staticTemplateFallback),
			topText: textValue("topText", 18),
			bottomText: textValue("bottomText", 18),
			subtitle: textValue("subtitle", 38),
			topColor: colorValue("topColor"),
			bottomColor: colorValue("bottomColor"),
			dividerColor: colorValue("dividerColor"),
			showDivider: booleanValue("showDivider"),
			subtitleColor: colorValue("subtitleColor"),
			subtitleScale: numberValue("subtitleScale", 60, 160),
			brightness: numberValue("brightness", 0, 200),
			zoom: numberValue("zoom", 0, 400),
			offsetX: numberValue("offsetX", -200, 200),
			offsetXRangeVersion: 2,
			offsetY: numberValue("offsetY", -200, 200),
			rotation: numberValue("rotation", -180, 180),
			textScale: numberValue("textScale", 0, 200),
			bottomTextScale: numberValue("bottomTextScale", 0, 200),
			textScaleLinked: booleanValue("textScaleLinked"),
			textStroke: numberValue("textStroke", 0, 100),
			textShadow: numberValue("textShadow", 0, 100),
			textShadowDefaultVersion: 1,
			titleScaleVersion: 3,
			shade: numberValue("shade", 0, 100),
			bottomShade: numberValue("bottomShade", 0, 100),
			showSafeArea: booleanValue("showSafeArea"),
			compareEnabled: booleanValue("compareEnabled"),
			beforeZoom: numberValue("beforeZoom", 100, 300),
			beforeOffsetX: numberValue("beforeOffsetX", -100, 100),
			beforeOffsetY: numberValue("beforeOffsetY", -100, 100),
			beforeRotation: numberValue("beforeRotation", -180, 180),
			beforeBrightness: numberValue("beforeBrightness", 0, 200),
			beforeShade: numberValue("beforeShade", 0, 100),
			beforeBottomShade: numberValue("beforeBottomShade", 0, 100),
			beforeFrameScale: numberValue("beforeFrameScale", 100, 120),
			watermarkScale: numberValue("watermarkScale", 0, 300),
			watermarkAlign,
			watermarkOpacity: numberValue("watermarkOpacity", 0, 100),
			watermarkEnabled: booleanValue("watermarkEnabled"),
			watermarkDefaultVersion: profile === "static-memory" && Number.isFinite(staticWatermarkDefaultVersion) ? staticWatermarkDefaultVersion : 1
		};
	}
	function updateCoverSetting(settings, key, value) {
		return normalizeCoverSettings({
			...settings,
			[key]: value
		});
	}
	function serializeStaticCoverSettings(settings) {
		return {
			...Object.fromEntries(Object.keys(DEFAULT_COVER_SETTINGS).map((key) => [key, settings[key]])),
			platform: settings.platformId,
			template: settings.templateId,
			divider: settings.showDivider,
			safe: settings.showSafeArea
		};
	}
	//#endregion
	//#region app/cover/core/interaction-core.ts
	function resolveCanvasInteractionMode(input) {
		if (input.brushMode) return "brush";
		if (input.rotationMode) return "rotate";
		return "transform";
	}
	function appendRetouchPoint(stroke, point) {
		return {
			...stroke,
			points: [...stroke.points, point]
		};
	}
	//#endregion
	//#region app/cover/core/mobile-tool-behavior.ts
	function applyMobileSyncedCopy(current, syncedCopy, field) {
		return {
			...current,
			topText: field === "bottomText" ? current.topText : syncedCopy.topText,
			bottomText: field === "topText" ? current.bottomText : syncedCopy.bottomText
		};
	}
	function resetMobileToolSetting(current, tool) {
		if (!tool.settingKey || tool.defaultValue === void 0) return current;
		return {
			...current,
			[tool.settingKey]: tool.defaultValue
		};
	}
	function isMobileToolDisabled(tool, state) {
		return tool.id === "bottomTextScale" && state.textScaleLinked;
	}
	function getMobileRetouchTargetChoices(hasBeforeImage) {
		return [{
			value: "after",
			label: "主照片记录"
		}, ...hasBeforeImage ? [{
			value: "before",
			label: "拍摄前记录"
		}] : []];
	}
	function revealCoverRules(options) {
		const reveal = () => {
			const target = options.getTarget();
			if (!target) return;
			target.scrollIntoView({
				behavior: "smooth",
				block: "start"
			});
			target.focus({ preventScroll: true });
		};
		if (!options.compactOpen) return reveal();
		options.closeCompact();
		options.afterLayout(reveal);
	}
	//#endregion
	//#region app/cover/core/responsive-layout.ts
	var MOBILE_KEYBOARD_THRESHOLD = 140;
	var MOBILE_VIEWPORT_WIDTH_RESET_MIN = 8;
	var MOBILE_VIEWPORT_WIDTH_RESET_RATIO = 0.03;
	function updateMobileKeyboardViewport(current, input) {
		const width = Number.isFinite(input.width) ? Math.max(0, input.width) : 0;
		const height = Number.isFinite(input.height) ? Math.max(0, input.height) : 0;
		const orientation = input.orientation;
		if (!current) return {
			baselineWidth: width,
			baselineHeight: height,
			orientation,
			open: false,
			keyboardHeight: 0
		};
		const substantiveWidthChange = Math.abs(current.baselineWidth - width) >= Math.max(MOBILE_VIEWPORT_WIDTH_RESET_MIN, current.baselineWidth * MOBILE_VIEWPORT_WIDTH_RESET_RATIO);
		const resetBaseline = current.orientation !== orientation || substantiveWidthChange;
		if (!input.active || !input.focused || resetBaseline || height >= current.baselineHeight) return {
			baselineWidth: width,
			baselineHeight: height,
			orientation,
			open: false,
			keyboardHeight: 0
		};
		const keyboardHeight = Math.max(0, current.baselineHeight - height);
		const open = keyboardHeight >= 140;
		return {
			...current,
			open,
			keyboardHeight: open ? Math.round(keyboardHeight) : 0
		};
	}
	function resolveCoverLayoutMode({ width, height, pointer }) {
		if (pointer === "fine" && width >= 1180) return "desktop";
		if (width >= 680 && (width > height || pointer === "fine")) return "split";
		return "compact";
	}
	//#endregion
	//#region app/cover/core/tool-registry.ts
	function deepFreeze(value) {
		if (value && typeof value === "object") {
			for (const child of Object.values(value)) deepFreeze(child);
			Object.freeze(value);
		}
		return value;
	}
	function immutableTools(tools) {
		return deepFreeze(tools.map((tool) => ({ ...tool })));
	}
	var EMPTY_TOOLS = deepFreeze([]);
	var PRIMARY_TOOLS = deepFreeze([
		{
			id: "photo",
			label: "照片"
		},
		{
			id: "compose",
			label: "构图"
		},
		{
			id: "text",
			label: "文字"
		},
		{
			id: "image",
			label: "画面"
		},
		{
			id: "retouch",
			label: "涂抹"
		},
		{
			id: "layout",
			label: "版式"
		},
		{
			id: "more",
			label: "更多"
		}
	]);
	var SECONDARY_TOOLS = deepFreeze({
		photo: [
			{
				id: "uploadMain",
				primary: "photo",
				label: "精修图上传/更换",
				kind: "action"
			},
			{
				id: "uploadBefore",
				primary: "photo",
				label: "拍摄前照片上传/更换",
				kind: "action"
			},
			{
				id: "comparison",
				primary: "photo",
				label: "前后对比",
				kind: "toggle",
				settingKey: "compareEnabled",
				defaultValue: false
			},
			{
				id: "safeArea",
				primary: "photo",
				label: "安全区",
				kind: "toggle",
				settingKey: "showSafeArea",
				defaultValue: true
			},
			{
				id: "syncCover",
				primary: "photo",
				label: "同步封面",
				kind: "action"
			}
		],
		compose: [
			{
				id: "target",
				primary: "compose",
				label: "主照片与文字 / 拍摄前照片",
				kind: "choice"
			},
			{
				id: "zoom",
				primary: "compose",
				label: "照片缩放",
				kind: "range",
				settingKey: "zoom",
				min: 0,
				max: 400,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "offsetX",
				primary: "compose",
				label: "左右位置",
				kind: "range",
				settingKey: "offsetX",
				min: -200,
				max: 200,
				defaultValue: 0
			},
			{
				id: "offsetY",
				primary: "compose",
				label: "上下位置",
				kind: "range",
				settingKey: "offsetY",
				min: -200,
				max: 200,
				defaultValue: 0
			},
			{
				id: "rotation",
				primary: "compose",
				label: "自由旋转",
				kind: "range",
				settingKey: "rotation",
				min: -180,
				max: 180,
				defaultValue: 0,
				suffix: "°"
			},
			{
				id: "beforeZoom",
				primary: "compose",
				label: "拍摄前照片缩放",
				kind: "range",
				settingKey: "beforeZoom",
				min: 100,
				max: 300,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "beforeOffsetX",
				primary: "compose",
				label: "拍摄前左右位置",
				kind: "range",
				settingKey: "beforeOffsetX",
				defaultValue: 0,
				dynamicBounds: "beforeOffsetLimits.x"
			},
			{
				id: "beforeOffsetY",
				primary: "compose",
				label: "拍摄前上下位置",
				kind: "range",
				settingKey: "beforeOffsetY",
				defaultValue: 0,
				dynamicBounds: "beforeOffsetLimits.y"
			},
			{
				id: "beforeRotation",
				primary: "compose",
				label: "拍摄前自由旋转",
				kind: "range",
				settingKey: "beforeRotation",
				min: -180,
				max: 180,
				defaultValue: 0,
				suffix: "°"
			},
			{
				id: "alignBefore",
				primary: "compose",
				label: "尝试对齐",
				kind: "action"
			},
			{
				id: "resetBeforeFrame",
				primary: "compose",
				label: "恢复对比图默认尺寸",
				kind: "action"
			}
		],
		text: [
			{
				id: "topText",
				primary: "text",
				label: "上行主标题",
				kind: "text",
				settingKey: "topText",
				max: 18
			},
			{
				id: "bottomText",
				primary: "text",
				label: "下行主标题",
				kind: "text",
				settingKey: "bottomText",
				max: 18
			},
			{
				id: "subtitle",
				primary: "text",
				label: "补充小字",
				kind: "text",
				settingKey: "subtitle",
				max: 38
			},
			{
				id: "topColor",
				primary: "text",
				label: "上行颜色",
				kind: "color",
				settingKey: "topColor",
				defaultValue: "#FFFFFF"
			},
			{
				id: "bottomColor",
				primary: "text",
				label: "下行颜色",
				kind: "color",
				settingKey: "bottomColor",
				defaultValue: "#FFFFFF"
			},
			{
				id: "subtitleColor",
				primary: "text",
				label: "小字颜色",
				kind: "color",
				settingKey: "subtitleColor",
				defaultValue: "#FFFFFF"
			},
			{
				id: "dividerColor",
				primary: "text",
				label: "横线颜色",
				kind: "color",
				settingKey: "dividerColor",
				defaultValue: "#C9A77A"
			},
			{
				id: "textScale",
				primary: "text",
				label: "上行标题大小",
				kind: "range",
				settingKey: "textScale",
				min: 0,
				max: 200,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "bottomTextScale",
				primary: "text",
				label: "下行标题大小",
				kind: "range",
				settingKey: "bottomTextScale",
				min: 0,
				max: 200,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "subtitleScale",
				primary: "text",
				label: "小字大小",
				kind: "range",
				settingKey: "subtitleScale",
				min: 60,
				max: 160,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "textScaleLinked",
				primary: "text",
				label: "上下行大小联动",
				kind: "toggle",
				settingKey: "textScaleLinked",
				defaultValue: true
			},
			{
				id: "showDivider",
				primary: "text",
				label: "显示标题横线",
				kind: "toggle",
				settingKey: "showDivider",
				defaultValue: true
			},
			{
				id: "textStroke",
				primary: "text",
				label: "字体描边",
				kind: "range",
				settingKey: "textStroke",
				min: 0,
				max: 100,
				defaultValue: 0,
				suffix: "%"
			},
			{
				id: "textShadow",
				primary: "text",
				label: "字体阴影",
				kind: "range",
				settingKey: "textShadow",
				min: 0,
				max: 100,
				defaultValue: 50,
				suffix: "%"
			},
			{
				id: "syncCopy",
				primary: "text",
				label: "文案同步",
				kind: "action"
			}
		],
		image: [
			{
				id: "brightness",
				primary: "image",
				label: "亮度",
				kind: "range",
				settingKey: "brightness",
				min: 0,
				max: 200,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "shade",
				primary: "image",
				label: "压暗强度",
				kind: "range",
				settingKey: "shade",
				min: 0,
				max: 100,
				defaultValue: 0,
				suffix: "%"
			},
			{
				id: "bottomShade",
				primary: "image",
				label: "底部向上压暗",
				kind: "range",
				settingKey: "bottomShade",
				min: 0,
				max: 100,
				defaultValue: 100,
				suffix: "%"
			}
		],
		retouch: [
			{
				id: "retouchEnabled",
				primary: "retouch",
				label: "开启/退出涂抹",
				kind: "toggle",
				defaultValue: false
			},
			{
				id: "retouchTarget",
				primary: "retouch",
				label: "主照片记录 / 拍摄前记录",
				kind: "choice"
			},
			{
				id: "brushSize",
				primary: "retouch",
				label: "画笔大小",
				kind: "range",
				min: 20,
				max: 400,
				defaultValue: 120
			},
			{
				id: "brushFeather",
				primary: "retouch",
				label: "羽化",
				kind: "range",
				min: 0,
				max: 100,
				defaultValue: 70,
				suffix: "%"
			},
			{
				id: "brushStrength",
				primary: "retouch",
				label: "涂抹强度",
				kind: "range",
				min: 0,
				max: 100,
				defaultValue: 100,
				suffix: "%"
			},
			{
				id: "retouchBefore",
				primary: "retouch",
				label: "涂抹前",
				kind: "action"
			},
			{
				id: "retouchAfter",
				primary: "retouch",
				label: "涂抹后",
				kind: "action"
			},
			{
				id: "undoRetouch",
				primary: "retouch",
				label: "撤销一步",
				kind: "action"
			},
			{
				id: "clearRetouch",
				primary: "retouch",
				label: "全部清除",
				kind: "action"
			}
		],
		layout: [{
			id: "template",
			primary: "layout",
			label: "9 个标题位置模板",
			kind: "choice"
		}, {
			id: "platform",
			primary: "layout",
			label: "抖音 / 小红书 / 视频号",
			kind: "choice"
		}],
		more: [
			{
				id: "watermarkEnabled",
				primary: "more",
				label: "使用 / 不使用水印",
				kind: "choice",
				settingKey: "watermarkEnabled",
				defaultValue: false
			},
			{
				id: "replaceWatermark",
				primary: "more",
				label: "更换水印",
				kind: "action"
			},
			{
				id: "removeWatermark",
				primary: "more",
				label: "移除临时水印并恢复固定水印",
				kind: "action"
			},
			{
				id: "watermarkAlign",
				primary: "more",
				label: "左 / 中 / 右",
				kind: "choice",
				settingKey: "watermarkAlign",
				defaultValue: "left"
			},
			{
				id: "watermarkOpacity",
				primary: "more",
				label: "水印透明度",
				kind: "range",
				settingKey: "watermarkOpacity",
				min: 0,
				max: 100,
				defaultValue: 50,
				suffix: "%"
			},
			{
				id: "memory1",
				primary: "more",
				label: "记忆 1",
				kind: "action"
			},
			{
				id: "memory2",
				primary: "more",
				label: "记忆 2",
				kind: "action"
			},
			{
				id: "memory3",
				primary: "more",
				label: "记忆 3",
				kind: "action"
			},
			{
				id: "resetSettings",
				primary: "more",
				label: "恢复默认",
				kind: "action"
			},
			{
				id: "factoryReset",
				primary: "more",
				label: "彻底重置",
				kind: "action"
			},
			{
				id: "coverRules",
				primary: "more",
				label: "长期规范",
				kind: "action"
			}
		]
	});
	var beforeComposeIds = new Set([
		"beforeZoom",
		"beforeOffsetX",
		"beforeOffsetY",
		"beforeRotation",
		"alignBefore",
		"resetBeforeFrame"
	]);
	var beforeImageSettingKeys = {
		brightness: "beforeBrightness",
		shade: "beforeShade",
		bottomShade: "beforeBottomShade"
	};
	function getSecondaryTools(primary, context) {
		if (primary === "photo") return immutableTools(context.comparisonEnabled ? SECONDARY_TOOLS.photo : SECONDARY_TOOLS.photo.filter((tool) => tool.id !== "uploadBefore"));
		if (primary === "compose") {
			if (context.target === "before") {
				if (!context.comparisonEnabled) return EMPTY_TOOLS;
				return immutableTools(SECONDARY_TOOLS.compose.filter((tool) => tool.id === "target" || beforeComposeIds.has(tool.id)));
			}
			return immutableTools(SECONDARY_TOOLS.compose.filter((tool) => tool.id === "target" || !beforeComposeIds.has(tool.id)));
		}
		if (primary === "image") {
			if (context.target === "before") {
				if (!context.comparisonEnabled) return EMPTY_TOOLS;
				return immutableTools(SECONDARY_TOOLS.image.map((tool) => ({
					...tool,
					settingKey: beforeImageSettingKeys[tool.id]
				})));
			}
			return immutableTools(SECONDARY_TOOLS.image);
		}
		return immutableTools(primary === "retouch" && !context.comparisonEnabled ? SECONDARY_TOOLS.retouch.filter((tool) => tool.id !== "retouchTarget") : SECONDARY_TOOLS[primary]);
	}
	//#endregion
	//#region app/cover/core/static-entry.ts
	configureCoverExportRuntime({
		createCanvas: () => document.createElement("canvas"),
		drawCover,
		releaseCoverScratchCanvases,
		releaseCoverCanvas,
		waitForNextAttempt: () => new Promise((resolve) => window.setTimeout(resolve, 0)),
		createFile: (blob, name, options) => new File([blob], name, options)
	});
	//#endregion
	exports.CoverExportError = CoverExportError;
	exports.DEFAULT_COVER_SETTINGS = DEFAULT_COVER_SETTINGS;
	exports.MOBILE_KEYBOARD_THRESHOLD = MOBILE_KEYBOARD_THRESHOLD;
	exports.PRIMARY_TOOLS = PRIMARY_TOOLS;
	exports.SECONDARY_TOOLS = SECONDARY_TOOLS;
	exports.appendRetouchPoint = appendRetouchPoint;
	exports.applyMobileSyncedCopy = applyMobileSyncedCopy;
	exports.configureCoverExportRuntime = configureCoverExportRuntime;
	exports.createCoverExportAsset = createCoverExportAsset;
	exports.createCoverExportAssetWithRuntime = createCoverExportAssetWithRuntime;
	exports.drawCover = drawCover;
	exports.drawCoverText = drawCoverText;
	exports.eraseShadeWithBrush = eraseShadeWithBrush;
	exports.formatExportTimestamp = formatExportTimestamp;
	exports.getBeforeImageFrame = getBeforeImageFrame;
	exports.getBeforeOffsetLimits = getBeforeOffsetLimits;
	exports.getExportAttemptSizes = getExportAttemptSizes;
	exports.getExportFileName = getExportFileName;
	exports.getMobileRetouchTargetChoices = getMobileRetouchTargetChoices;
	exports.getOriginalPixelExportPlan = getOriginalPixelExportPlan;
	exports.getOriginalPixelJpegMaxBytes = getOriginalPixelJpegMaxBytes;
	exports.getOriginalPixelJpegQualities = getOriginalPixelJpegQualities;
	exports.getRetouchBrushGeometry = getRetouchBrushGeometry;
	exports.getSecondaryTools = getSecondaryTools;
	exports.isMobileToolDisabled = isMobileToolDisabled;
	exports.mapRetouchPoint = mapRetouchPoint;
	exports.normalizeCoverSettings = normalizeCoverSettings;
	exports.releaseCoverCanvas = releaseCoverCanvas;
	exports.releaseCoverScratchCanvases = releaseCoverScratchCanvases;
	exports.resetMobileToolSetting = resetMobileToolSetting;
	exports.resolveCanvasInteractionMode = resolveCanvasInteractionMode;
	exports.resolveCoverLayoutMode = resolveCoverLayoutMode;
	exports.revealCoverRules = revealCoverRules;
	exports.serializeStaticCoverSettings = serializeStaticCoverSettings;
	exports.updateCoverSetting = updateCoverSetting;
	exports.updateMobileKeyboardViewport = updateMobileKeyboardViewport;
	return exports;
})({});
