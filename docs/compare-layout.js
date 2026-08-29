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

  function isPointInComparisonPhotoFrame(point, canvas) {
    const { frame, imageInset } = getComparisonEvidenceLayout(canvas);
    const inset = Math.max(2, Math.round(imageInset * canvas.width / 1080));
    const x = point.x * canvas.width;
    const y = point.y * canvas.height;
    return x >= frame.x + inset
      && x <= frame.x + frame.width - inset
      && y >= frame.y + inset
      && y <= frame.y + frame.height - inset;
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

  function getComparisonEvidenceLayout(canvas) {
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

  function getComparisonLabelLayout(canvas) {
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

  function drawComparisonCapsule(context, capsule, word, roundedRectPath) {
    const x = capsule.right - capsule.width;
    context.save();
    context.shadowColor = "rgba(0,0,0,.28)";
    context.shadowBlur = 14;
    context.shadowOffsetY = 4;
    roundedRectPath(context, x, capsule.y, capsule.width, capsule.height, capsule.radius);
    context.fillStyle = "rgba(57,57,59,.88)";
    context.fill();
    context.shadowColor = "transparent";
    const circleRadius = capsule.height * .37;
    const circleX = x + capsule.width - capsule.height / 2;
    const circleY = capsule.y + capsule.height / 2;
    context.beginPath();
    context.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
    context.fillStyle = "rgba(238,238,240,.94)";
    context.fill();
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.font = `650 ${Math.round(capsule.height * .34)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    context.fillStyle = "rgba(248,248,250,.96)";
    context.fillText("拍摄", x + (capsule.width - capsule.height) * .48, circleY);
    context.font = `750 ${Math.round(capsule.height * .48)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    context.fillStyle = "#454547";
    context.fillText(word, circleX, circleY + .5);
    context.restore();
  }

  function drawComparisonEditorialOverlay(context, canvas, roundedRectPath) {
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
    drawComparisonCapsule(context, labels.after, "后", roundedRectPath);
    drawComparisonCapsule(context, labels.before, "前", roundedRectPath);
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

  global.NBOCompareLayout = {
    normalizeComparisonPhotoAdjustments,
    getComparisonPhotoTransform,
    resolveRetouchTarget,
    getVisibleRetouchStrokes,
    isPointInComparisonPhotoFrame,
    getComparisonSafeRect,
    getComparisonEvidenceLayout,
    getComparisonLabelLayout,
    drawComparisonEditorialOverlay,
    getComparisonFadeStops,
    getComparisonExportError,
    getComparisonOverlapWarning,
  };
})(window);
