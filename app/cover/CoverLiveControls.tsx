"use client";
import { useEffect, useRef } from "react";
import type { CoverRenderInput } from "./core/render-core";
import { getLiveMotionState } from "./core/live-layout";

type LivePresentation = NonNullable<CoverRenderInput["live"]>;
export type LiveController = {
  presentation(time?: number): LivePresentation | undefined;
  setEnabled(enabled: boolean): void;
  destroy(): void;
};
type Props = {
  onController(controller: LiveController | null): void;
  onToggle(enabled: boolean): void;
  onRefresh(): void;
  onAssetsChanged(): void;
  captureRender(): { width: number; height: number; render(canvas: HTMLCanvasElement, live: LivePresentation): void; createPoster(live: LivePresentation): Promise<{blob:Blob;outputSize:{width:number;height:number}}> };
};

export default function CoverLiveControls(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  const mounted = useRef(true);
  const controllerRef = useRef<LiveController | null>(null);
  useEffect(() => { callbacks.current = props; });
  useEffect(() => {
    mounted.current = true;
    const onController = props.onController;
    return () => { mounted.current = false; controllerRef.current?.destroy(); controllerRef.current = null; onController(null); };
  }, [props.onController]);
  const start = async () => {
    const host = hostRef.current;
    if (!host) return;
    const button = host.querySelector("button")!;
    button.disabled = true;
    try {
      const assetBase = new URL("/live/", window.location.origin);
      const liveModule = await import(/* @vite-ignore */ new URL("controls.js?v=20260908-card-pair", assetBase).href);
      if (!mounted.current || !hostRef.current) return;
      const controller = liveModule.mountLiveControls({ host, assetBase,
        motionAt: getLiveMotionState,
        onAssetsChanged: () => callbacks.current.onAssetsChanged(),
        onToggle: (enabled: boolean) => callbacks.current.onToggle(enabled),
        onRefresh: () => callbacks.current.onRefresh(),
        captureRender: () => callbacks.current.captureRender(),
      }) as LiveController;
      controllerRef.current = controller;
      callbacks.current.onController(controller);
      controller.setEnabled(true);
    } catch {
      if (mounted.current) { button.disabled = false; button.textContent = "加载失败，重试"; }
    }
  };
  return <div ref={hostRef} className="live-control-host"><button type="button" className="live-toggle" aria-pressed="false" onClick={start}>制作 Live</button></div>;
}
