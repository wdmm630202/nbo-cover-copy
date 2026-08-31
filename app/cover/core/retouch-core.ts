export type RetouchPoint = { x: number; y: number };

export type RetouchStroke = {
  points: RetouchPoint[];
  size: number;
  feather: number;
  strength: number;
};

export type RetouchBrushGeometry = {
  radius: number;
  coreRadius: number;
  blurRadius: number;
};

export function getRetouchBrushGeometry(
  size: number,
  featherValue: number,
  canvasWidth: number,
): RetouchBrushGeometry {
  const radius = Math.max(1, size * canvasWidth / 2160);
  const feather = Math.max(0, Math.min(1, featherValue / 100));
  return {
    radius,
    coreRadius: radius * (1 - feather * 0.92),
    blurRadius: radius * feather * 0.58,
  };
}

export function mapRetouchPoint(point: RetouchPoint, width: number, height: number) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

export function eraseShadeWithBrush(
  context: CanvasRenderingContext2D,
  strokeCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  strokes: RetouchStroke[],
) {
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
        strokeContext.quadraticCurveTo(
          point.x * width,
          point.y * height,
          (point.x + next.x) / 2 * width,
          (point.y + next.y) / 2 * height,
        );
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
