import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BASE_RENDER_COMMIT,
  TRACE_CASES,
  buildBaselineFixture,
  createTraceEnvironment,
  loadCurrentCore,
  readBaselineSources,
  sourceHash,
  traceCurrentCase,
} from "./helpers/render-trace-harness.mjs";

const coreUrl = new URL("../docs/cover-core.js", import.meta.url);
const fixtureUrl = new URL("./fixtures/render-baseline-trace.json", import.meta.url);

async function loadCore() {
  const source = await readFile(coreUrl, "utf8");
  const environment = createTraceEnvironment();
  return {
    core: loadCurrentCore(source, environment),
    environment,
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
  const { core, environment } = await loadCore();
  const canvas = environment.createCanvas("output");
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
  const operations = environment.recorder.log.map(([name]) => name);
  const background = operations.indexOf("fillRect");
  const placeholder = environment.recorder.log.findIndex(([name, value]) => name === "fillText" && value === "上传照片后在这里预览");
  const headline = environment.recorder.log.findIndex(([name, value]) => name === "fillText" && value === "男人的");
  const guide = operations.indexOf("strokeRect");
  assert.ok(background >= 0 && placeholder > background);
  assert.ok(headline > placeholder);
  assert.ok(guide > headline);
});

test("共享绘制核心复用并释放涂抹临时画布", async () => {
  const { core, environment } = await loadCore();
  const canvas = environment.createCanvas("output");
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

  const scratchCanvases = environment.createdCanvases.slice(1);
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
  const { core, environment } = await loadCore();
  const canvas = environment.createCanvas("output");
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

  const log = environment.recorder.log;
  const mainPhoto = log.findIndex(([name, source]) => name === "drawImage" && source === "main");
  const afterCapsule = log.findIndex(([name, value]) => name === "fillText" && value === "后");
  const beforeCapsule = log.findIndex(([name, value]) => name === "fillText" && value === "前");
  const watermarkDraw = log.findLastIndex(([name, source]) => name === "drawImage" && source === "watermark");
  const guide = log.findIndex(([name]) => name === "strokeRect");
  assert.ok(mainPhoto >= 0);
  assert.ok(afterCapsule > mainPhoto && beforeCapsule > afterCapsule);
  assert.ok(watermarkDraw > beforeCapsule);
  assert.ok(guide > watermarkDraw);
});

test("无文字原图路径只绘制主照片", async () => {
  const { core, environment } = await loadCore();
  const canvas = environment.createCanvas("output");
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

  const log = environment.recorder.log;
  assert.ok(log.some(([name, source]) => name === "drawImage" && source === "main"));
  assert.equal(log.some(([name, source]) => name === "drawImage" && source === "before"), false);
  assert.equal(log.some(([name, source]) => name === "drawImage" && source === "watermark"), false);
  assert.equal(log.some(([name]) => name === "strokeRect"), false);
  assert.equal(log.some(([name, value]) => name === "fillText" && ["男人的", "前", "后"].includes(value)), false);
});

test("冻结 trace 的来源严格绑定任务基线发布文件", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const repoRoot = new URL("../", import.meta.url);
  const sources = readBaselineSources(repoRoot);
  assert.equal(fixture.provenance.commit, BASE_RENDER_COMMIT);
  assert.deepEqual(fixture.provenance.sha256, {
    "docs/cover.js": sourceHash(sources.cover),
    "docs/cover-core.js": sourceHash(sources.core),
    "docs/compare-layout.js": sourceHash(sources.compare),
  });
  assert.deepEqual(fixture.cases.map(({ id }) => id), TRACE_CASES.map(({ id }) => id));
  assert.deepEqual(fixture, buildBaselineFixture(repoRoot));
});

test("冻结 trace 明确覆盖全部关键视觉属性和绘制分支", async () => {
  const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
  const full = fixture.cases.find(({ id }) => id === "top-left-comparison-full").trace;
  const photoOnly = fixture.cases.find(({ id }) => id === "photo-only-1080x1920").trace;
  const operationNames = new Set(full.map(([name]) => name));
  [
    "set.fillStyle", "set.strokeStyle", "set.filter", "set.globalCompositeOperation",
    "set.globalAlpha", "set.font", "set.textAlign", "set.textBaseline",
    "set.lineWidth", "set.shadowColor", "set.shadowBlur", "set.shadowOffsetX",
    "set.shadowOffsetY", "createLinearGradient", "gradient.addColorStop",
    "drawImage", "fillText", "strokeText", "fillRect", "strokeRect", "beginPath",
    "moveTo", "lineTo", "quadraticCurveTo", "arc", "rect", "clip", "fill", "stroke",
  ].forEach((operation) => assert.ok(operationNames.has(operation), `冻结基线缺少 ${operation}`));
  assert.ok(full.some(([name, value]) => name === "set.filter" && value === "brightness(113%)"));
  assert.ok(full.some(([name, value]) => name === "set.filter" && value === "brightness(91%)"));
  assert.ok(full.some(([name, value]) => name === "set.globalCompositeOperation" && value === "destination-out"));
  assert.ok(full.some(([name, value]) => name === "set.globalCompositeOperation" && value === "destination-in"));
  assert.ok(full.some(([name, source]) => name === "drawImage" && source === "main"));
  assert.ok(full.some(([name, source]) => name === "drawImage" && source === "before"));
  assert.ok(full.some(([name, source]) => name === "drawImage" && source === "watermark"));
  assert.deepEqual([...new Set(fixture.cases.slice(0, 3).map(({ input }) => input.settings.templateId))], [
    "top-left", "middle-center", "bottom-right",
  ]);
  assert.deepEqual(photoOnly.filter(([name]) => name === "drawImage").map(([, source]) => source), ["main"]);
});

for (const traceCase of TRACE_CASES) {
  test(`共享核心完整 Canvas trace 与发布基线一致：${traceCase.id}`, async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
    const expected = fixture.cases.find(({ id }) => id === traceCase.id)?.trace;
    assert.ok(expected, `冻结基线缺少场景：${traceCase.id}`);
    const currentCore = await readFile(coreUrl, "utf8");
    assert.deepEqual(traceCurrentCase(currentCore, traceCase), expected);
  });
}

test("同一固定编辑状态在 Compact Split Desktop 使用相同维度与 Canvas trace", async () => {
  const source = await readFile(coreUrl, "utf8");
  const fixed = TRACE_CASES.find(({ id }) => id === "top-left-comparison-full");
  const traces = [];
  const dimensions = [];
  for (const shell of ["compact", "split", "desktop"]) {
    const environment = createTraceEnvironment();
    const core = loadCurrentCore(source, environment);
    const canvas = environment.createCanvas(shell);
    core.drawCover({
      canvas,
      image: { __name: "main", naturalWidth: 3375, naturalHeight: 6000 },
      beforeImage: { __name: "before", naturalWidth: 3024, naturalHeight: 4032 },
      watermark: { __name: "watermark", naturalWidth: 1200, naturalHeight: 400 },
      settings: { ...core.DEFAULT_COVER_SETTINGS, ...fixed.settings },
      preset,
      includeGuide: false,
      outputSize: { width: 1080, height: 1920 },
      retouchStrokes: fixed.retouchStrokes,
      beforeRetouchStrokes: fixed.beforeRetouchStrokes,
    });
    dimensions.push([canvas.width, canvas.height]);
    traces.push(environment.recorder.log);
  }
  assert.deepEqual(dimensions, [[1080, 1920], [1080, 1920], [1080, 1920]]);
  assert.deepEqual(traces[1], traces[0]);
  assert.deepEqual(traces[2], traces[0]);
  assert.ok(traces[0].some(([name, sourceName]) => name === "drawImage" && sourceName === "before"));
  assert.ok(traces[0].some(([name, value]) => name === "fillText" && value === "前"));
  assert.ok(traces[0].some(([name, value]) => name === "fillText" && value === "后"));
  assert.ok(traces[0].some(([name]) => name === "createLinearGradient"));
  assert.ok(traces[0].some(([name, value]) => name === "set.globalCompositeOperation" && value === "destination-out"));
});
