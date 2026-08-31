import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

class MockGradient {
  constructor(log) {
    this.log = log;
  }

  addColorStop(stop, color) {
    this.log.push(["addColorStop", stop, color]);
  }
}

class MockContext {
  constructor(log) {
    this.log = log;
    this.font = "10px sans-serif";
    this.lineWidth = 1;
    this.textAlign = "start";
    this.textBaseline = "alphabetic";
  }

  clearRect(...args) { this.log.push(["clearRect", ...args]); }
  fillRect(...args) { this.log.push(["fillRect", ...args]); }
  fillText(...args) { this.log.push(["fillText", ...args]); }
  strokeText(...args) { this.log.push(["strokeText", ...args]); }
  drawImage(source, ...args) { this.log.push(["drawImage", source?.__name ?? "canvas", ...args]); }
  save() { this.log.push(["save"]); }
  restore() { this.log.push(["restore"]); }
  translate(...args) { this.log.push(["translate", ...args]); }
  rotate(...args) { this.log.push(["rotate", ...args]); }
  setTransform(...args) { this.log.push(["setTransform", ...args]); }
  beginPath() { this.log.push(["beginPath"]); }
  moveTo(...args) { this.log.push(["moveTo", ...args]); }
  lineTo(...args) { this.log.push(["lineTo", ...args]); }
  quadraticCurveTo(...args) { this.log.push(["quadraticCurveTo", ...args]); }
  closePath() { this.log.push(["closePath"]); }
  arc(...args) { this.log.push(["arc", ...args]); }
  fill() { this.log.push(["fill"]); }
  stroke() { this.log.push(["stroke"]); }
  clip() { this.log.push(["clip"]); }
  rect(...args) { this.log.push(["rect", ...args]); }
  scale(...args) { this.log.push(["scale", ...args]); }
  strokeRect(...args) { this.log.push(["strokeRect", ...args]); }
  setLineDash(args) { this.log.push(["setLineDash", ...args]); }
  createLinearGradient(...args) {
    this.log.push(["createLinearGradient", ...args]);
    return new MockGradient(this.log);
  }
  measureText(text) {
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
    const data = new Uint8ClampedArray(width * height * 4);
    for (let index = 3; index < data.length; index += 4) data[index] = 255;
    return { data };
  }
}

class MockCanvas {
  constructor(createdCanvases, log = []) {
    this.width = 0;
    this.height = 0;
    this.log = log;
    this.context = new MockContext(log);
    createdCanvases.push(this);
  }

  getContext() {
    return this.context;
  }
}

async function loadCore() {
  const source = await readFile(new URL("../docs/cover-core.js", import.meta.url), "utf8");
  const createdCanvases = [];
  const context = vm.createContext({
    console,
    document: {
      createElement(tag) {
        assert.equal(tag, "canvas");
        return new MockCanvas(createdCanvases);
      },
    },
  });
  vm.runInContext(source, context);
  return {
    core: vm.runInContext("NBOCoverCore", context),
    createdCanvases,
  };
}

const preset = {
  id: "douyin",
  label: "抖音",
  ratio: "9:16",
  width: 1080,
  height: 1920,
  note: "",
};

test("共享绘制核心保持画布尺寸、关键顺序和安全区分支", async () => {
  const { core, createdCanvases } = await loadCore();
  const canvas = new MockCanvas(createdCanvases);
  core.drawCover({
    canvas,
    image: null,
    beforeImage: null,
    watermark: null,
    settings: core.DEFAULT_COVER_SETTINGS,
    preset,
    includeGuide: true,
    outputSize: { width: 540, height: 960 },
  });

  assert.equal(canvas.width, 540);
  assert.equal(canvas.height, 960);
  const operations = canvas.log.map(([name]) => name);
  const background = operations.indexOf("clearRect");
  const placeholder = canvas.log.findIndex(([name, value]) => name === "fillText" && value === "上传照片后在这里预览");
  const headline = canvas.log.findIndex(([name, value]) => name === "fillText" && value === "男人的");
  const guide = operations.indexOf("strokeRect");
  assert.ok(background >= 0 && placeholder > background);
  assert.ok(headline > placeholder);
  assert.ok(guide > headline);
});

test("共享绘制核心复用并释放涂抹临时画布", async () => {
  const { core, createdCanvases } = await loadCore();
  const canvas = new MockCanvas(createdCanvases);
  core.drawCover({
    canvas,
    image: null,
    beforeImage: null,
    watermark: null,
    settings: core.DEFAULT_COVER_SETTINGS,
    preset,
    includeGuide: false,
    outputSize: { width: 540, height: 960 },
    retouchStrokes: [{
      points: [{ x: 0.5, y: 0.5 }],
      size: 120,
      feather: 70,
      strength: 100,
    }],
  });

  const scratchCanvases = createdCanvases.slice(1);
  assert.equal(scratchCanvases.length, 2);
  assert.ok(scratchCanvases.every((scratch) => scratch.width === 540 && scratch.height === 960));
  core.releaseCoverScratchCanvases(canvas);
  assert.equal(canvas.width, 540);
  assert.equal(canvas.height, 960);
  assert.ok(scratchCanvases.every((scratch) => scratch.width === 1 && scratch.height === 1));
  core.releaseCoverCanvas(canvas);
  assert.equal(canvas.width, 1);
  assert.equal(canvas.height, 1);
});

test("对比图、胶囊、水印与安全区保持发布顺序", async () => {
  const { core, createdCanvases } = await loadCore();
  const canvas = new MockCanvas(createdCanvases);
  const main = { __name: "main", naturalWidth: 1080, naturalHeight: 1920 };
  const before = { __name: "before", naturalWidth: 900, naturalHeight: 1200 };
  const watermark = { __name: "watermark", naturalWidth: 4, naturalHeight: 2 };
  core.drawCover({
    canvas,
    image: main,
    beforeImage: before,
    watermark,
    settings: {
      ...core.DEFAULT_COVER_SETTINGS,
      compareEnabled: true,
      watermarkEnabled: true,
      beforeShade: 30,
    },
    preset,
    includeGuide: true,
    outputSize: { width: 540, height: 960 },
    beforeRetouchStrokes: [{
      points: [{ x: 0.8, y: 0.7 }],
      size: 120,
      feather: 70,
      strength: 100,
    }],
  });

  const mainPhoto = canvas.log.findIndex(([name, source]) => name === "drawImage" && source === "main");
  const afterCapsule = canvas.log.findIndex(([name, value]) => name === "fillText" && value === "后");
  const beforeCapsule = canvas.log.findIndex(([name, value]) => name === "fillText" && value === "前");
  const watermarkDraw = canvas.log.findIndex(([name, source]) => name === "drawImage" && source === "watermark");
  const guide = canvas.log.findIndex(([name]) => name === "strokeRect");
  assert.ok(mainPhoto >= 0);
  assert.ok(afterCapsule > mainPhoto && beforeCapsule > afterCapsule);
  assert.ok(watermarkDraw > beforeCapsule);
  assert.ok(guide > watermarkDraw);
});

test("无文字原图路径只绘制主照片", async () => {
  const { core, createdCanvases } = await loadCore();
  const canvas = new MockCanvas(createdCanvases);
  core.drawCover({
    canvas,
    image: { __name: "main", naturalWidth: 1080, naturalHeight: 1920 },
    beforeImage: { __name: "before", naturalWidth: 900, naturalHeight: 1200 },
    watermark: { __name: "watermark", naturalWidth: 4, naturalHeight: 2 },
    settings: { ...core.DEFAULT_COVER_SETTINGS, compareEnabled: true, watermarkEnabled: true },
    preset,
    includeGuide: true,
    outputSize: { width: 1080, height: 1920 },
    photoOnly: true,
  });

  assert.ok(canvas.log.some(([name, source]) => name === "drawImage" && source === "main"));
  assert.equal(canvas.log.some(([name, source]) => name === "drawImage" && source === "before"), false);
  assert.equal(canvas.log.some(([name, source]) => name === "drawImage" && source === "watermark"), false);
  assert.equal(canvas.log.some(([name]) => name === "strokeRect"), false);
  assert.equal(canvas.log.some(([name, value]) => name === "fillText" && ["男人的", "前", "后"].includes(value)), false);
});
