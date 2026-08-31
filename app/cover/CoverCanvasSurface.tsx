"use client";

import {
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  useEffect,
} from "react";
import type { PlatformPreset } from "./cover-config";
import {
  resolvePhotoInteractionTargetFromPoint,
  resolveRetouchTargetFromPoint,
  type RetouchTarget,
} from "./compare-layout";
import type { CoverSettings } from "./core/editor-settings";
import {
  appendRetouchPoint,
  resolveCanvasInteractionMode,
} from "./core/interaction-core";
import type { RetouchStroke } from "./core/retouch-core";
import { getBeforeImageFrame, getBeforeOffsetLimits } from "./core/render-core";

type BrushCursor = { x: number; y: number; visible: boolean };
type BrushSettings = { size: number; feather: number; strength: number };
type SnapResult = {
  value: number;
  guide: "horizontal" | "vertical" | null;
};

export type CoverCanvasSurfaceProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canvasShellRef: RefObject<HTMLDivElement | null>;
  mobileTouchZoneRef: RefObject<HTMLSpanElement | null>;
  transformHudRef: RefObject<HTMLSpanElement | null>;
  snapHorizontalRef: RefObject<HTMLSpanElement | null>;
  snapVerticalRef: RefObject<HTMLSpanElement | null>;
  mobileGestureCancelRef: MutableRefObject<() => void>;
  preset: PlatformPreset;
  image: HTMLImageElement | null;
  mobileTouchActive: boolean;
  beforeImageRef: MutableRefObject<HTMLImageElement | null>;
  settingsRef: MutableRefObject<CoverSettings>;
  rotationMode: boolean;
  rotationModeRef: MutableRefObject<boolean>;
  brushMode: boolean;
  brushModeRef: MutableRefObject<boolean>;
  brushSettingsRef: MutableRefObject<BrushSettings>;
  brushCursor: BrushCursor;
  brushSize: number;
  setSettings: Dispatch<SetStateAction<CoverSettings>>;
  setRotationMode: Dispatch<SetStateAction<boolean>>;
  setBrushCursor: Dispatch<SetStateAction<BrushCursor>>;
  setRetouchTarget: Dispatch<SetStateAction<RetouchTarget>>;
  setAdjustmentTarget: Dispatch<SetStateAction<RetouchTarget>>;
  setRetouchStrokes: Dispatch<SetStateAction<RetouchStroke[]>>;
  setBeforeRetouchStrokes: Dispatch<SetStateAction<RetouchStroke[]>>;
  setShowRetouchBefore: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string>>;
  snapRotation: (value: number) => SnapResult;
  showTransformHint: (text: string, guide?: "horizontal" | "vertical" | null) => void;
};

export default function CoverCanvasSurface({
  canvasRef,
  canvasShellRef,
  mobileTouchZoneRef,
  transformHudRef,
  snapHorizontalRef,
  snapVerticalRef,
  mobileGestureCancelRef,
  preset,
  image,
  mobileTouchActive,
  beforeImageRef,
  settingsRef,
  rotationMode,
  rotationModeRef,
  brushMode,
  brushModeRef,
  brushSettingsRef,
  brushCursor,
  brushSize,
  setSettings,
  setRotationMode,
  setBrushCursor,
  setRetouchTarget,
  setAdjustmentTarget,
  setRetouchStrokes,
  setBeforeRetouchStrokes,
  setShowRetouchBefore,
  setNotice,
  snapRotation,
  showTransformHint,
}: CoverCanvasSurfaceProps) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    let drag: { pointerId: number; target: RetouchTarget; x: number; y: number; offsetX: number; offsetY: number; rotation: number } | null = null;
    let brushPointer: { pointerId: number; target: RetouchTarget } | null = null;
    let pointerMoveFrame = 0;
    let pendingPointerMove: { pointerId: number; clientX: number; clientY: number } | null = null;
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    const currentMode = () => resolveCanvasInteractionMode({
      brushMode: brushModeRef.current,
      rotationMode: rotationModeRef.current,
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const mode = currentMode();
      if (mode === "brush") {
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
      setNotice(mode === "rotate"
        ? target === "before" ? "正在旋转拍摄前照片" : "正在旋转主照片"
        : target === "before" ? "正在移动拍摄前照片" : "正在移动主照片");
      canvas.setPointerCapture(event.pointerId);
    };
    const applyPointerMove = () => {
      pointerMoveFrame = 0;
      const event = pendingPointerMove;
      pendingPointerMove = null;
      if (!event) return;
      const mode = currentMode();
      if (mode === "brush") {
        const rect = canvas.getBoundingClientRect();
        const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
        setBrushCursor({ ...point, visible: true });
      }
      if (brushPointer?.pointerId === event.pointerId) {
        const rect = canvas.getBoundingClientRect();
        const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
        const appendPoint = (current: RetouchStroke[]) => current.map((stroke, index) =>
          index === current.length - 1 ? appendRetouchPoint(stroke, point) : stroke,
        );
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
      if (mode === "rotate") {
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
    const finishPointer = (event: PointerEvent) => {
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
      if (currentMode() === "brush") return;
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
      if (currentMode() === "brush") return;
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
      if (currentMode() === "brush") setBrushCursor((current) => ({ ...current, visible: false }));
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", finishPointer);
    canvas.addEventListener("pointercancel", finishPointer);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("dblclick", handleDoubleClick);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    return () => {
      if (pointerMoveFrame) window.cancelAnimationFrame(pointerMoveFrame);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", finishPointer);
      canvas.removeEventListener("pointercancel", finishPointer);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("dblclick", handleDoubleClick);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    };
  // The native listener set is intentionally rebound only when the owned image changes;
  // live editor values are read through stable refs and state dispatchers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Preserve the existing gesture lifetime: layout renders do not reset an active session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  return (
    <div ref={canvasShellRef} className={`studio-canvas-shell ratio-${preset.ratio.replace(":", "-")} ${image ? "has-image" : ""} ${rotationMode ? "is-rotating" : ""} ${brushMode ? "is-brushing" : ""}`}>
      <canvas ref={canvasRef} aria-label="封面实时预览，可拖动照片；开启涂抹后可局部擦开压暗层" />
      <span ref={mobileTouchZoneRef} className={`studio-mobile-touch-zone ${mobileTouchActive ? "is-active" : ""}`} aria-hidden="true" />
      <span ref={transformHudRef} className="studio-transform-hud" aria-live="polite" />
      <span ref={snapHorizontalRef} className="studio-snap-guide is-horizontal" aria-hidden="true" />
      <span ref={snapVerticalRef} className="studio-snap-guide is-vertical" aria-hidden="true" />
      <span
        className={`studio-brush-cursor ${brushCursor.visible && brushMode ? "is-visible" : ""}`}
        style={{ left: `${brushCursor.x * 100}%`, top: `${brushCursor.y * 100}%`, width: `${brushSize / 10.8}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
