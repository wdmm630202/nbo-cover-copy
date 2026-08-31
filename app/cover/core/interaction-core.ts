import type { RetouchPoint, RetouchStroke } from "./retouch-core";

export type CanvasInteractionMode = "transform" | "rotate" | "brush";

export function resolveCanvasInteractionMode(input: {
  brushMode: boolean;
  rotationMode: boolean;
}): CanvasInteractionMode {
  if (input.brushMode) return "brush";
  if (input.rotationMode) return "rotate";
  return "transform";
}

export function appendRetouchPoint<T extends RetouchStroke>(
  stroke: T,
  point: RetouchPoint,
): T {
  return {
    ...stroke,
    points: [...stroke.points, point],
  };
}
