(function attachComparisonLayout(global) {
  const comparisonPhotoDefaults = {
    zoom: 100,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    brightness: 100,
    shade: 0,
    bottomShade: 100,
  };

  function comparisonNumber(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  }

  function normalizeComparisonPhotoAdjustments(value = {}) {
    const source = value || {};
    return {
      zoom: comparisonNumber(source.zoom, comparisonPhotoDefaults.zoom, 100, 300),
      offsetX: comparisonNumber(source.offsetX, comparisonPhotoDefaults.offsetX, -100, 100),
      offsetY: comparisonNumber(source.offsetY, comparisonPhotoDefaults.offsetY, -100, 100),
      rotation: comparisonNumber(source.rotation, comparisonPhotoDefaults.rotation, -180, 180),
      brightness: comparisonNumber(source.brightness, comparisonPhotoDefaults.brightness, 0, 200),
      shade: comparisonNumber(source.shade, comparisonPhotoDefaults.shade, 0, 100),
      bottomShade: comparisonNumber(source.bottomShade, comparisonPhotoDefaults.bottomShade, 0, 100),
    };
  }

  function getComparisonPhotoTransform(image, frame, value = {}) {
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

  function resolveRetouchTarget(target, comparisonEnabled, hasBeforeImage) {
    return target === "before" && comparisonEnabled && hasBeforeImage ? "before" : "after";
  }

  function getVisibleRetouchStrokes(strokes, target, showBefore) {
    return showBefore ? [] : strokes[target];
  }

  function isPointInComparisonPhotoFrame(point, canvas, frameScale = 100) {
    const { frame, imageInset } = getComparisonEvidenceLayout(canvas, frameScale);
    const inset = Math.max(2, Math.round(imageInset * canvas.width / 1080));
    const x = point.x * canvas.width;
    const y = point.y * canvas.height;
    return x >= frame.x + inset
      && x <= frame.x + frame.width - inset
      && y >= frame.y + inset
      && y <= frame.y + frame.height - inset;
  }

  function resolveRetouchTargetFromPoint(point, canvas, comparisonEnabled, hasBeforeImage, frameScale = 100) {
    return comparisonEnabled && hasBeforeImage && isPointInComparisonPhotoFrame(point, canvas, frameScale)
      ? "before"
      : "after";
  }

  function resolvePhotoInteractionTargetFromPoint(point, canvas, comparisonEnabled, hasBeforeImage, frameScale = 100) {
    return resolveRetouchTargetFromPoint(point, canvas, comparisonEnabled, hasBeforeImage, frameScale);
  }

  function getAdjustmentPanelVisibility(comparisonEnabled, target) {
    const before = comparisonEnabled && target === "before";
    return { selector: comparisonEnabled, after: !before, before };
  }

  function getComparisonSafeRect(canvas) {
    const safeHeight = Math.min(canvas.height, Math.round(canvas.width / 3 * 4));
    return {
      x: 0,
      y: Math.round((canvas.height - safeHeight) / 2),
      width: canvas.width,
      height: safeHeight,
    };
  }

  function normalizeComparisonFrameScale(value) {
    return comparisonNumber(value, 100, 100, 120);
  }

  function getComparisonEvidenceLayout(canvas, frameScale = 100) {
    const safe = getComparisonSafeRect(canvas);
    const scale = normalizeComparisonFrameScale(frameScale) / 100;
    const defaultWidth = Math.round(safe.width * 0.39);
    const defaultHeight = Math.round(safe.height * 0.42);
    const defaultRight = safe.x + safe.width - Math.round(safe.width * 0.027);
    const defaultBottom = safe.y + safe.height - Math.round(safe.height * 0.0194);
    const width = Math.round(defaultWidth * scale);
    const height = Math.round(defaultHeight * scale);
    return {
      safe,
      frame: {
        x: defaultRight - width,
        y: defaultBottom - height,
        width,
        height,
        radius: Math.round(safe.width * 0.0278 * scale),
      },
      imageInset: 4,
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
      radius: height / 2,
    };
    const afterCenterY = safe.y + 75 * scale;
    const beforeInset = 20 * scale;
    return {
      after: { right: safe.x + safe.width - Math.round(48 * scale), y: afterCenterY - height / 2, ...capsule },
      before: { right: frame.x + frame.width - beforeInset, y: frame.y + beforeInset, ...capsule },
    };
  }

  function getComparisonAlignmentPlan(canvas, textBounds, options = {}) {
    const currentScale = normalizeComparisonFrameScale(options.currentScale ?? 100);
    const current = getComparisonEvidenceLayout(canvas, currentScale);
    const original = getComparisonEvidenceLayout(canvas, 100);
    const originalBottom = original.frame.y + original.frame.height;
    const requiredScale = (originalBottom - textBounds.top) / original.frame.height * 100;
    if (requiredScale < currentScale - .05) {
      return { ok: false, scale: currentScale, frame: current.frame, reason: "needs-shrink" };
    }
    if (requiredScale > 120.05) {
      return { ok: false, scale: currentScale, frame: current.frame, reason: "too-large" };
    }
    const proposedScale = normalizeComparisonFrameScale(Math.round(requiredScale * 10) / 10);
    const proposed = getComparisonEvidenceLayout(canvas, proposedScale);
    const minimumGap = options.minGap ?? 36 * canvas.width / 1080;
    if (proposed.frame.x - textBounds.right < minimumGap) {
      return { ok: false, scale: currentScale, frame: current.frame, reason: "overlap" };
    }
    const safeRight = proposed.safe.x + proposed.safe.width;
    const safeBottom = proposed.safe.y + proposed.safe.height;
    if (
      proposed.frame.x < proposed.safe.x
      || proposed.frame.y < proposed.safe.y
      || proposed.frame.x + proposed.frame.width > safeRight
      || proposed.frame.y + proposed.frame.height > safeBottom
    ) {
      return { ok: false, scale: currentScale, frame: current.frame, reason: "outside-safe" };
    }
    return { ok: true, scale: proposedScale, frame: proposed.frame };
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
    const labelFontSize = Math.round(capsule.width * (18 / 104));
    context.font = `700 ${labelFontSize}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
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
    const baseCanvas = { width: 1080, height: canvas.height / scale };
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
    return [[0, 0], [0.04, 0.78], [0.08, 1], [0.92, 1], [0.96, 0.78], [1, 0]];
  }

  function getComparisonExportError(enabled, hasBeforeImage) {
    return enabled && !hasBeforeImage ? "请先添加拍摄前素颜照，或关闭前后对比" : "";
  }

  function getComparisonOverlapWarning(enabled, templateId) {
    if (!enabled || String(templateId).endsWith("-left")) return "";
    return "当前版式可能与右侧对比照重叠，建议选择左侧版式";
  }

  function getOriginalPixelExportPlan(source, preset, format) {
    const sourceWidth = Math.max(1, Math.round(source.width));
    const sourceHeight = Math.max(1, Math.round(source.height));
    const targetRatio = Math.max(1, preset.width) / Math.max(1, preset.height);
    const sourceRatio = sourceWidth / sourceHeight;
    const output = sourceRatio >= targetRatio
      ? { width: Math.max(1, Math.round(sourceHeight * targetRatio)), height: sourceHeight }
      : { width: sourceWidth, height: Math.max(1, Math.round(sourceWidth / targetRatio)) };
    return { ...output, quality: format === "jpeg" ? .98 : null };
  }

  const MOBILE_EXPORT_LIMITS = [
    { maxPixels: 8_000_000, maxSide: 4096 },
    { maxPixels: 6_000_000, maxSide: 4096 },
    { maxPixels: 4_000_000, maxSide: 4096 },
    { maxPixels: 2_100_000, maxSide: 4096 },
  ];

  function constrainExportSize(size, maxPixels, maxSide) {
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

  function getExportAttemptSizes(source, preset, format, mobile) {
    const plan = getOriginalPixelExportPlan(source, preset, format);
    const original = { width: plan.width, height: plan.height };
    if (!mobile) return [original];
    const candidates = [original, ...MOBILE_EXPORT_LIMITS.map(({ maxPixels, maxSide }) =>
      constrainExportSize(original, maxPixels, maxSide))];
    return candidates.filter((candidate, index) => candidates.findIndex((item) =>
      item.width === candidate.width && item.height === candidate.height) === index);
  }

  function getOriginalPixelJpegQualities() {
    return [.98, .91, .84, .77, .7, .63, .56];
  }

  function getOriginalPixelJpegMaxBytes() {
    return 19.9 * 1024 * 1024;
  }

  global.NBOCompareLayout = {
    normalizeComparisonPhotoAdjustments,
    getComparisonPhotoTransform,
    resolveRetouchTarget,
    getVisibleRetouchStrokes,
    isPointInComparisonPhotoFrame,
    resolveRetouchTargetFromPoint,
    resolvePhotoInteractionTargetFromPoint,
    getAdjustmentPanelVisibility,
    getComparisonSafeRect,
    normalizeComparisonFrameScale,
    getComparisonEvidenceLayout,
    getComparisonLabelLayout,
    getComparisonAlignmentPlan,
    drawComparisonEditorialOverlay,
    getComparisonFadeStops,
    getComparisonExportError,
    getComparisonOverlapWarning,
    getOriginalPixelExportPlan,
    getExportAttemptSizes,
    getOriginalPixelJpegQualities,
    getOriginalPixelJpegMaxBytes,
  };
})(window);
