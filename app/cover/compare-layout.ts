export type CompareCanvasSize = { width: number; height: number };
export type CompareRect = { x: number; y: number; width: number; height: number };

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
