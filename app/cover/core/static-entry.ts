import { configureCoverExportRuntime } from "./export-core";
import { drawCover, releaseCoverCanvas, releaseCoverScratchCanvases } from "./render-core";

configureCoverExportRuntime({
  createCanvas: () => document.createElement("canvas"),
  drawCover,
  releaseCoverScratchCanvases,
  releaseCoverCanvas,
  waitForNextAttempt: () => new Promise<void>((resolve) => window.setTimeout(resolve, 0)),
  createFile: (blob, name, options) => new File([blob], name, options),
});

export * from "./editor-settings";
export * from "./export-core";
export * from "./interaction-core";
export * from "./render-core";
export * from "./retouch-core";
export * from "./responsive-layout";
export * from "./tool-registry";
