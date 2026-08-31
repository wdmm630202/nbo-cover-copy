import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

export const BASE_RENDER_COMMIT = "0651625c7bde2f6c17bac67ffa35540f1b5718fc";

export const TRACKED_CONTEXT_PROPERTIES = [
  "fillStyle",
  "strokeStyle",
  "filter",
  "globalCompositeOperation",
  "globalAlpha",
  "font",
  "textAlign",
  "textBaseline",
  "lineWidth",
  "lineCap",
  "lineJoin",
  "shadowColor",
  "shadowBlur",
  "shadowOffsetX",
  "shadowOffsetY",
];

const DEFAULT_CONTEXT_STATE = {
  fillStyle: "#000000",
  strokeStyle: "#000000",
  filter: "none",
  globalCompositeOperation: "source-over",
  globalAlpha: 1,
  font: "10px sans-serif",
  textAlign: "start",
  textBaseline: "alphabetic",
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  shadowColor: "rgba(0, 0, 0, 0)",
  shadowBlur: 0,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
};

function serializeTraceValue(value) {
  if (value instanceof TraceGradient) return { gradient: value.id };
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

class TraceGradient {
  constructor(recorder) {
    this.recorder = recorder;
    this.id = `gradient-${recorder.gradientIndex++}`;
  }

  addColorStop(stop, color) {
    this.recorder.log.push(["gradient.addColorStop", this.id, serializeTraceValue(stop), color]);
  }
}

export class TraceContext {
  constructor(recorder) {
    this.recorder = recorder;
    this.state = { ...DEFAULT_CONTEXT_STATE };
    this.stack = [];
  }

  resetState() {
    this.state = { ...DEFAULT_CONTEXT_STATE };
    this.stack = [];
  }

  record(name, ...args) {
    this.recorder.log.push([name, ...args.map(serializeTraceValue)]);
  }

  clearRect(...args) { this.record("clearRect", ...args); }
  fillRect(...args) { this.record("fillRect", ...args); }
  strokeRect(...args) { this.record("strokeRect", ...args); }
  fillText(...args) { this.record("fillText", ...args); }
  strokeText(...args) { this.record("strokeText", ...args); }
  drawImage(source, ...args) { this.record("drawImage", source?.__name ?? "canvas", ...args); }
  translate(...args) { this.record("translate", ...args); }
  rotate(...args) { this.record("rotate", ...args); }
  scale(...args) { this.record("scale", ...args); }
  setTransform(...args) { this.record("setTransform", ...args); }
  resetTransform() { this.record("resetTransform"); }
  beginPath() { this.record("beginPath"); }
  closePath() { this.record("closePath"); }
  moveTo(...args) { this.record("moveTo", ...args); }
  lineTo(...args) { this.record("lineTo", ...args); }
  quadraticCurveTo(...args) { this.record("quadraticCurveTo", ...args); }
  bezierCurveTo(...args) { this.record("bezierCurveTo", ...args); }
  arc(...args) { this.record("arc", ...args); }
  arcTo(...args) { this.record("arcTo", ...args); }
  rect(...args) { this.record("rect", ...args); }
  clip(...args) { this.record("clip", ...args); }
  fill(...args) { this.record("fill", ...args); }
  stroke(...args) { this.record("stroke", ...args); }
  setLineDash(value) { this.record("setLineDash", ...value); }

  save() {
    this.record("save");
    this.stack.push({ ...this.state });
  }

  restore() {
    this.record("restore");
    const restored = this.stack.pop();
    if (restored) this.state = restored;
  }

  createLinearGradient(...args) {
    const gradient = new TraceGradient(this.recorder);
    this.record("createLinearGradient", gradient.id, ...args);
    return gradient;
  }

  createRadialGradient(...args) {
    const gradient = new TraceGradient(this.recorder);
    this.record("createRadialGradient", gradient.id, ...args);
    return gradient;
  }

  measureText(text) {
    this.record("measureText", text);
    const size = Number(this.font.match(/([\d.]+)px/)?.[1] || 10);
    return {
      width: Array.from(text).length * size * 0.55,
      actualBoundingBoxAscent: size * 0.78,
      actualBoundingBoxDescent: size * 0.22,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: size * 0.55,
    };
  }

  getImageData(x, y, width, height) {
    this.record("getImageData", x, y, width, height);
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 3; index < data.length; index += 4) data[index] = 255;
    return { data };
  }
}

for (const property of TRACKED_CONTEXT_PROPERTIES) {
  Object.defineProperty(TraceContext.prototype, property, {
    configurable: true,
    get() {
      return this.state[property];
    },
    set(value) {
      this.state[property] = value;
      this.record(`set.${property}`, value);
    },
  });
}

export class TraceCanvas {
  constructor(recorder, name = "canvas") {
    this.__name = name;
    this.recorder = recorder;
    this.context = new TraceContext(recorder);
    this.internalWidth = 0;
    this.internalHeight = 0;
  }

  get width() { return this.internalWidth; }
  set width(value) {
    this.internalWidth = value;
    this.context.resetState();
  }

  get height() { return this.internalHeight; }
  set height(value) {
    this.internalHeight = value;
    this.context.resetState();
  }

  getContext(type) {
    assert.equal(type, "2d");
    return this.context;
  }
}

export function createTraceEnvironment() {
  const recorder = { log: [], gradientIndex: 0 };
  const createdCanvases = [];
  return {
    recorder,
    createdCanvases,
    createCanvas(name) {
      const canvas = new TraceCanvas(recorder, name);
      createdCanvases.push(canvas);
      return canvas;
    },
    document: {
      createElement(tag) {
        assert.equal(tag, "canvas");
        const canvas = new TraceCanvas(recorder);
        createdCanvases.push(canvas);
        return canvas;
      },
    },
  };
}

export const TRACE_CASES = [
  {
    id: "top-left-comparison-full",
    photoOnly: false,
    includeGuide: true,
    settings: {
      templateId: "top-left",
      zoom: 127,
      offsetX: 7,
      offsetY: -4,
      rotation: 17,
      brightness: 113,
      shade: 48,
      bottomShade: 37,
      compareEnabled: true,
      beforeFrameScale: 116,
      beforeZoom: 143,
      beforeOffsetX: 3,
      beforeOffsetY: -2,
      beforeRotation: -13,
      beforeBrightness: 91,
      beforeShade: 44,
      beforeBottomShade: 52,
      topText: "真实男人拍照",
      bottomText: "高级感也自然",
      subtitle: "不被定义的自己也能拍得自然",
      textScale: 87,
      bottomTextScale: 95,
      textScaleLinked: false,
      textStroke: 42,
      textShadow: 58,
      showDivider: true,
      topColor: "#F8F4ED",
      bottomColor: "#FFFFFF",
      subtitleColor: "#E7E2DA",
      dividerColor: "#C9A77D",
      subtitleScale: 92,
      watermarkEnabled: true,
      watermarkOpacity: 63,
      watermarkAlign: "right",
      showSafeArea: true,
    },
    retouchStrokes: [{
      points: [{ x: 0.18, y: 0.22 }, { x: 0.24, y: 0.29 }, { x: 0.31, y: 0.34 }],
      size: 148,
      feather: 64,
      strength: 83,
    }],
    beforeRetouchStrokes: [{
      points: [{ x: 0.78, y: 0.66 }, { x: 0.81, y: 0.71 }],
      size: 96,
      feather: 72,
      strength: 67,
    }],
  },
  {
    id: "middle-center-text",
    photoOnly: false,
    includeGuide: false,
    settings: {
      templateId: "middle-center",
      zoom: 109,
      offsetX: -5,
      offsetY: 6,
      rotation: -8,
      brightness: 97,
      shade: 61,
      bottomShade: 18,
      compareEnabled: false,
      topText: "男人的",
      bottomText: "高级感",
      subtitle: "不被定义的自己",
      textScale: 104,
      bottomTextScale: 104,
      textScaleLinked: true,
      textStroke: 0,
      textShadow: 36,
      showDivider: true,
      watermarkEnabled: false,
      showSafeArea: false,
    },
    retouchStrokes: [],
    beforeRetouchStrokes: [],
  },
  {
    id: "bottom-right-text",
    photoOnly: false,
    includeGuide: false,
    settings: {
      templateId: "bottom-right",
      zoom: 118,
      offsetX: 2,
      offsetY: -7,
      rotation: 5,
      brightness: 105,
      shade: 72,
      bottomShade: 66,
      compareEnabled: false,
      topText: "拍照不尴尬",
      bottomText: "动作更自然",
      subtitle: "真实到店客片",
      textScale: 78,
      bottomTextScale: 84,
      textScaleLinked: false,
      textStroke: 31,
      textShadow: 49,
      showDivider: true,
      watermarkEnabled: true,
      watermarkOpacity: 48,
      watermarkAlign: "left",
      showSafeArea: false,
    },
    retouchStrokes: [],
    beforeRetouchStrokes: [],
  },
  {
    id: "photo-only-1080x1920",
    photoOnly: true,
    includeGuide: true,
    settings: {
      templateId: "top-left",
      zoom: 132,
      offsetX: -9,
      offsetY: 11,
      rotation: 21,
      brightness: 88,
      shade: 80,
      bottomShade: 100,
      compareEnabled: true,
      watermarkEnabled: true,
      showSafeArea: true,
    },
    retouchStrokes: [{
      points: [{ x: 0.5, y: 0.5 }],
      size: 120,
      feather: 70,
      strength: 100,
    }],
    beforeRetouchStrokes: [{
      points: [{ x: 0.8, y: 0.7 }],
      size: 120,
      feather: 70,
      strength: 100,
    }],
  },
];

export function makeTraceAssets() {
  return {
    image: { __name: "main", naturalWidth: 2400, naturalHeight: 3600 },
    beforeImage: { __name: "before", naturalWidth: 1800, naturalHeight: 2400 },
    watermark: { __name: "watermark", naturalWidth: 40, naturalHeight: 20 },
  };
}

export function sourceHash(source) {
  return createHash("sha256").update(source).digest("hex");
}

function gitShow(repoRoot, revisionPath) {
  return execFileSync("git", ["show", revisionPath], { cwd: repoRoot, encoding: "utf8" });
}

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.ok(startIndex >= 0, `基线源码缺少起点：${start}`);
  assert.ok(endIndex > startIndex, `基线源码缺少终点：${end}`);
  return source.slice(startIndex, endIndex);
}

export function readBaselineSources(repoRoot) {
  return {
    cover: gitShow(repoRoot, `${BASE_RENDER_COMMIT}:docs/cover.js`),
    core: gitShow(repoRoot, `${BASE_RENDER_COMMIT}:docs/cover-core.js`),
    compare: gitShow(repoRoot, `${BASE_RENDER_COMMIT}:docs/compare-layout.js`),
  };
}

function createVmEnvironment(traceEnvironment) {
  const context = vm.createContext({
    console,
    document: traceEnvironment.document,
    navigator: { deviceMemory: 8, hardwareConcurrency: 8 },
    Uint8ClampedArray,
  });
  context.window = context;
  return context;
}

function installBaselineRenderer(context, sources, state, retouch, outputCanvas) {
  vm.runInContext(sources.core, context);
  vm.runInContext(sources.compare, context);
  const core = vm.runInContext("NBOCoverCore", context);
  const compare = context.NBOCompareLayout;
  Object.assign(context, {
    state,
    retouch,
    canvas: { __name: "unused-preview-canvas" },
    previewScratch: { shade: null, stroke: null, compare: null },
    clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
    activeRetouchTarget: () => "after",
    eraseShadeWithBrush: core.eraseShadeWithBrush,
    getVisibleRetouchStrokes: compare.getVisibleRetouchStrokes,
    getComparisonEvidenceLayout: compare.getComparisonEvidenceLayout,
    getComparisonFadeStops: compare.getComparisonFadeStops,
    getComparisonPhotoTransform: compare.getComparisonPhotoTransform,
    drawComparisonEditorialOverlay: compare.drawComparisonEditorialOverlay,
  });
  const extractedRenderer = [
    section(sources.cover, "const WATERMARK_VISIBLE_HEIGHT_AT_1080", "const formatExportTimestamp"),
    section(sources.cover, "const PRESETS =", "const {\n  DEFAULT_COVER_SETTINGS"),
    section(sources.cover, "const DOUYIN_HOME_SAFE =", "const $ ="),
    section(sources.cover, "function preset()", "function currentBeforeOffsetLimits"),
    section(sources.cover, "function roundedRectPath", "function setExportReady"),
    "globalThis.__drawBaseline = () => drawNow(true, globalThis.__outputCanvas, { width: 1080, height: 1920 }, globalThis.__photoOnly);",
  ].join("\n");
  context.__outputCanvas = outputCanvas;
  vm.runInContext(extractedRenderer, context);
  return core;
}

export function traceBaselineCase(sources, traceCase) {
  const traceEnvironment = createTraceEnvironment();
  const outputCanvas = traceEnvironment.createCanvas("output");
  const assets = makeTraceAssets();
  const bootstrapContext = createVmEnvironment(traceEnvironment);
  vm.runInContext(sources.core, bootstrapContext);
  const bootstrapCore = vm.runInContext("NBOCoverCore", bootstrapContext);
  const state = {
    ...bootstrapCore.DEFAULT_COVER_SETTINGS,
    ...traceCase.settings,
    ...assets,
    platformId: "douyin",
  };
  const retouch = {
    strokes: traceCase.retouchStrokes,
    beforeStrokes: traceCase.beforeRetouchStrokes,
    compareBefore: false,
  };
  const context = createVmEnvironment(traceEnvironment);
  installBaselineRenderer(context, sources, state, retouch, outputCanvas);
  context.__photoOnly = traceCase.photoOnly;
  vm.runInContext("__drawBaseline()", context);
  return traceEnvironment.recorder.log;
}

export function loadCurrentCore(source, traceEnvironment) {
  const context = createVmEnvironment(traceEnvironment);
  vm.runInContext(source, context);
  return vm.runInContext("NBOCoverCore", context);
}

export function traceCurrentCase(coreSource, traceCase) {
  const traceEnvironment = createTraceEnvironment();
  const outputCanvas = traceEnvironment.createCanvas("output");
  const core = loadCurrentCore(coreSource, traceEnvironment);
  const assets = makeTraceAssets();
  core.drawCover({
    canvas: outputCanvas,
    image: assets.image,
    beforeImage: assets.beforeImage,
    watermark: traceCase.settings.watermarkEnabled ? assets.watermark : null,
    settings: { ...core.DEFAULT_COVER_SETTINGS, ...traceCase.settings },
    preset: { id: "douyin", label: "抖音", ratio: "9:16", width: 1080, height: 1920, note: "" },
    includeGuide: traceCase.includeGuide,
    outputSize: { width: 1080, height: 1920 },
    photoOnly: traceCase.photoOnly,
    retouchStrokes: traceCase.retouchStrokes,
    beforeRetouchStrokes: traceCase.beforeRetouchStrokes,
  });
  return traceEnvironment.recorder.log;
}

export function buildBaselineFixture(repoRoot) {
  const sources = readBaselineSources(repoRoot);
  return {
    schemaVersion: 1,
    provenance: {
      commit: BASE_RENDER_COMMIT,
      sourcePaths: ["docs/cover.js", "docs/cover-core.js", "docs/compare-layout.js"],
      sha256: {
        "docs/cover.js": sourceHash(sources.cover),
        "docs/cover-core.js": sourceHash(sources.core),
        "docs/compare-layout.js": sourceHash(sources.compare),
      },
      extraction: "Renderer sections are selected by source markers from git show; no drawing constants are copied into the fixture generator.",
    },
    traceContract: {
      output: { width: 1080, height: 1920 },
      contextProperties: TRACKED_CONTEXT_PROPERTIES,
      calls: "All drawing, path, gradient, text measurement and pixel-read calls are recorded in execution order.",
      surfaceIdentity: "Offscreen canvas allocation identities are normalized; operation order, properties and arguments remain exact.",
      metrics: "Deterministic text metrics: glyph width .55em, ascent .78em, descent .22em.",
    },
    cases: TRACE_CASES.map((traceCase) => ({
      id: traceCase.id,
      input: traceCase,
      trace: traceBaselineCase(sources, traceCase),
    })),
  };
}
