import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import CoverCanvasSurface from "../../app/cover/CoverCanvasSurface";
import CoverSplitShell from "../../app/cover/CoverSplitShell";
import { DEFAULT_COVER_SETTINGS } from "../../app/cover/core/editor-settings";
import type { CoverLayoutMode } from "../../app/cover/core/responsive-layout";

declare global {
  interface Window {
    __task12Ready?: boolean;
    __runTask12Lifecycle?: () => Promise<Record<string, unknown>>;
  }
}

const mainImage = new Image();
const beforeImage = new Image();
let decodeCount = 0;
mainImage.decode = async () => { decodeCount += 1; };
await mainImage.decode();

const initial = {
  photos: { main: mainImage, before: beforeImage },
  settings: { ...DEFAULT_COVER_SETTINGS, zoom: 137, compareEnabled: true },
  mainStrokes: [{ points: [{ x: .1, y: .2 }] }],
  beforeStrokes: [{ points: [{ x: .8, y: .7 }] }],
  memories: [{ name: "记忆 1", settings: { zoom: 137 } }],
  exportCache: { jpeg: { generation: 8 } },
};

let surfaceMounts = 0;
let surfaceCleanups = 0;
let canvasListenerRemovals = 0;
let observedCanvas: HTMLCanvasElement | null = null;
const snapshots: Array<Record<string, unknown>> = [];
const originalRemoveEventListener = HTMLCanvasElement.prototype.removeEventListener;
HTMLCanvasElement.prototype.removeEventListener = function (
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions,
) {
  if (this === observedCanvas) canvasListenerRemovals += 1;
  return originalRemoveEventListener.call(this, type, listener, options);
};

function SurfaceMountProbe({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    surfaceMounts += 1;
    return () => { surfaceCleanups += 1; };
  }, []);
  return children;
}

function CoverStudioLifecycleHost({ mode }: { mode: CoverLayoutMode }) {
  const [photos] = useState(() => initial.photos);
  const [settings] = useState(() => initial.settings);
  const [mainStrokes] = useState(() => initial.mainStrokes);
  const [beforeStrokes] = useState(() => initial.beforeStrokes);
  const [memories] = useState(() => initial.memories);
  const exportCache = useRef(initial.exportCache);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const mobileTouchZoneRef = useRef<HTMLSpanElement>(null);
  const transformHudRef = useRef<HTMLSpanElement>(null);
  const snapHorizontalRef = useRef<HTMLSpanElement>(null);
  const snapVerticalRef = useRef<HTMLSpanElement>(null);
  const mobileGestureCancelRef = useRef<() => void>(() => {});
  const beforeImageRef = useRef<HTMLImageElement | null>(photos.before);
  const settingsRef = useRef(settings);
  const rotationModeRef = useRef(false);
  const brushModeRef = useRef(false);
  const brushSettingsRef = useRef({ size: 120, feather: 70, strength: 100 });
  useLayoutEffect(() => {
    snapshots.push({ photos, settings, mainStrokes, beforeStrokes, memories, exportCache: exportCache.current, canvas: canvasRef.current });
  }, [mode, photos, settings, mainStrokes, beforeStrokes, memories]);
  const noop = () => {};
  const surface = (
    <SurfaceMountProbe>
      <CoverCanvasSurface
        canvasRef={canvasRef}
        canvasShellRef={canvasShellRef}
        mobileTouchZoneRef={mobileTouchZoneRef}
        transformHudRef={transformHudRef}
        snapHorizontalRef={snapHorizontalRef}
        snapVerticalRef={snapVerticalRef}
        mobileGestureCancelRef={mobileGestureCancelRef}
        preset={{ id: "douyin", label: "抖音", ratio: "9:16", width: 1080, height: 1920, note: "" }}
        image={photos.main}
        mobileTouchActive={false}
        beforeImageRef={beforeImageRef}
        settingsRef={settingsRef}
        rotationMode={false}
        rotationModeRef={rotationModeRef}
        brushMode={false}
        brushModeRef={brushModeRef}
        brushSettingsRef={brushSettingsRef}
        brushCursor={{ x: .5, y: .5, visible: false }}
        brushSize={120}
        setSettings={noop}
        setRotationMode={noop}
        setBrushCursor={noop}
        setRetouchTarget={noop}
        setAdjustmentTarget={noop}
        setRetouchStrokes={noop}
        setBeforeRetouchStrokes={noop}
        setShowRetouchBefore={noop}
        setNotice={noop}
        snapRotation={(value) => ({ value, guide: null })}
        showTransformHint={noop}
      />
    </SurfaceMountProbe>
  );
  const dock = <nav data-main-strokes={mainStrokes.length} data-before-strokes={beforeStrokes.length} />;
  return <CoverSplitShell mode={mode} open={false} onClose={noop} onOpenExport={noop} keyboardOpen={false} brushMode={false} brushTarget="after" canvas={surface} dock={dock} />;
}

const container = document.getElementById("react-root")!;
const root = createRoot(container);
const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

window.__runTask12Lifecycle = async () => {
  const canvasIdentity: HTMLCanvasElement[] = [];
  for (const mode of ["compact", "split", "desktop"] as CoverLayoutMode[]) {
    flushSync(() => root.render(<CoverStudioLifecycleHost mode={mode} />));
    await nextFrame();
    const canvas = container.querySelector("canvas")!;
    if (!observedCanvas) observedCanvas = canvas;
    canvasIdentity.push(canvas);
  }
  const first = snapshots[0];
  const stateStable = snapshots.length === 3 && snapshots.slice(1).every((snapshot) =>
    snapshot.photos === first.photos
    && snapshot.settings === first.settings
    && snapshot.mainStrokes === first.mainStrokes
    && snapshot.beforeStrokes === first.beforeStrokes
    && snapshot.memories === first.memories
    && snapshot.exportCache === first.exportCache
    && snapshot.canvas === first.canvas);
  const beforeUnmount = {
    canvasStable: canvasIdentity.every((canvas) => canvas === canvasIdentity[0]),
    surfaceMounts,
    surfaceCleanups,
    canvasListenerRemovals,
    decodeCount,
    stateStable,
  };
  flushSync(() => root.unmount());
  await nextFrame();
  const staticLayout = document.getElementById("static-layout")!;
  const staticHeader = document.getElementById("static-split-header")!;
  staticLayout.dataset.coverLayout = "compact";
  const compactHeaderDisplay = getComputedStyle(staticHeader).display;
  staticLayout.dataset.coverLayout = "split";
  const splitHeaderDisplay = getComputedStyle(staticHeader).display;
  return {
    ...beforeUnmount,
    finalSurfaceCleanups: surfaceCleanups,
    finalCanvasListenerRemovals: canvasListenerRemovals,
    compactHeaderDisplay,
    splitHeaderDisplay,
  };
};
window.__task12Ready = true;
