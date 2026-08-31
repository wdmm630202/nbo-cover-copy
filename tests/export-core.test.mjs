import assert from "node:assert/strict";
import test from "node:test";

import {
  createCoverExportAssetWithRuntime,
  formatExportTimestamp,
  getExportAttemptSizes,
  getExportFileName,
  getOriginalPixelExportPlan,
  getOriginalPixelJpegMaxBytes,
  getOriginalPixelJpegQualities,
  setCoverExportRenderRequestObserver,
} from "../app/cover/core/export-core.ts";

const preset = {
  id: "douyin",
  label: "抖音",
  ratio: "9:16",
  width: 1080,
  height: 1920,
  note: "",
};

function makeRequest(overrides = {}) {
  return {
    render: {
      image: { naturalWidth: 3375, naturalHeight: 6000 },
      beforeImage: null,
      watermark: null,
      settings: {},
      preset,
      retouchStrokes: [],
      beforeRetouchStrokes: [],
    },
    format: "jpeg",
    photoOnly: false,
    mobile: false,
    fileStem: "T62_7263.JPG",
    now: new Date(2026, 7, 31, 9, 8, 7),
    ...overrides,
  };
}

function fakeBlob(size, type) {
  return { size, type };
}

test("导出真实调用路径可被无副作用观察且不改写 render request", async () => {
  const observed = [];
  const { runtime, calls } = makeRuntime();
  setCoverExportRenderRequestObserver((request) => observed.push(request));
  try {
    await createCoverExportAssetWithRuntime(makeRequest({ format: "png" }), runtime);
  } finally {
    setCoverExportRenderRequestObserver(null);
  }
  assert.equal(observed.length, 1);
  assert.strictEqual(observed[0], calls.render[0]);
  assert.deepEqual(observed[0].outputSize, { width: 3375, height: 6000 });
});

function makeRuntime({ encode, render, deferEncode } = {}) {
  const calls = {
    render: [],
    encode: [],
    release: 0,
    releaseScratch: 0,
    waits: 0,
    files: [],
  };
  const canvas = {
    width: 0,
    height: 0,
    toBlob(callback, mimeType, quality) {
      calls.encode.push({ mimeType, quality, width: canvas.width, height: canvas.height });
      if (deferEncode) {
        deferEncode(callback, { mimeType, quality, canvas, calls });
        return;
      }
      try {
        callback(encode ? encode({ mimeType, quality, canvas, calls }) : fakeBlob(1024, mimeType));
      } catch (error) {
        throw error;
      }
    },
  };
  return {
    calls,
    runtime: {
      createCanvas: () => canvas,
      drawCover: (input) => {
        canvas.width = input.outputSize.width;
        canvas.height = input.outputSize.height;
        calls.render.push(input);
        render?.(input, calls);
      },
      releaseCoverScratchCanvases: () => {
        calls.releaseScratch += 1;
      },
      releaseCoverCanvas: () => {
        calls.release += 1;
      },
      waitForNextAttempt: async () => {
        calls.waits += 1;
      },
      createFile: (blob, name, options) => {
        const file = { name, type: options.type, size: blob.size };
        calls.files.push(file);
        return file;
      },
    },
  };
}

test("导出时间戳和文件名在所有外壳保持一致", () => {
  const date = new Date(2026, 7, 31, 9, 8, 7);
  assert.equal(formatExportTimestamp(date), "20260831_090807");
  assert.equal(
    getExportFileName("T62_7263", "设计", "抖音", "9:16", "jpeg", date),
    "T62_7263_设计_抖音_9x16_20260831_090807.jpg",
  );
  assert.equal(
    getExportFileName("portrait.PNG", "原图", "小红书", "3:4", "png", date),
    "portrait_原图_小红书_3x4_20260831_090807.png",
  );
  assert.equal(
    getExportFileName(" portrait .JPG", "设计", "抖音", "9:16", "jpeg", date),
    " portrait _设计_抖音_9x16_20260831_090807.jpg",
  );
  assert.equal(
    getExportFileName(".jpg", "设计", "视频号", "3:4", "jpeg", date),
    "南铂封面_设计_视频号_3x4_20260831_090807.jpg",
  );
});

test("原始裁切像素始终是首个候选，手机才逐级降级", () => {
  assert.deepEqual(
    getOriginalPixelExportPlan({ width: 6000, height: 9000 }, preset, "png"),
    { width: 5063, height: 9000, quality: null },
  );
  assert.deepEqual(
    getOriginalPixelExportPlan({ width: 6000, height: 9000 }, preset, "jpeg"),
    { width: 5063, height: 9000, quality: 0.98 },
  );
  const source = { width: 3375, height: 6000 };
  assert.deepEqual(getExportAttemptSizes(source, preset, "jpeg", false), [
    { width: 3375, height: 6000 },
  ]);
  assert.deepEqual(getExportAttemptSizes(source, preset, "jpeg", true), [
    { width: 3375, height: 6000 },
    { width: 2121, height: 3771 },
    { width: 1837, height: 3266 },
    { width: 1500, height: 2667 },
    { width: 1087, height: 1932 },
  ]);
});

test("PNG 只请求 PNG，保留首个有效的原像素结果", async () => {
  const { runtime, calls } = makeRuntime();
  const asset = await createCoverExportAssetWithRuntime(
    makeRequest({ format: "png" }),
    runtime,
  );

  assert.deepEqual(asset.outputSize, { width: 3375, height: 6000 });
  assert.deepEqual(asset.originalOutputSize, { width: 3375, height: 6000 });
  assert.equal(asset.usedMobileFallback, false);
  assert.deepEqual(calls.encode, [
    { mimeType: "image/png", quality: undefined, width: 3375, height: 6000 },
  ]);
  assert.equal(asset.file.name, "T62_7263_设计_抖音_9x16_20260831_090807.png");
  assert.equal(calls.release, 1);
});

test("JPG 在 19.9MB 内保留原像素和首个质量", async () => {
  const limit = getOriginalPixelJpegMaxBytes();
  const { runtime, calls } = makeRuntime({
    encode: ({ mimeType }) => fakeBlob(limit, mimeType),
  });
  const asset = await createCoverExportAssetWithRuntime(makeRequest(), runtime);

  assert.deepEqual(getOriginalPixelJpegQualities(), [0.98, 0.91, 0.84, 0.77, 0.7, 0.63, 0.56]);
  assert.equal(limit, 19.9 * 1024 * 1024);
  assert.deepEqual(calls.encode.map(({ quality }) => quality), [0.98]);
  assert.deepEqual(asset.outputSize, asset.originalOutputSize);
  assert.equal(asset.blob.size, limit);
});

test("超过 20MB 的 JPG 按原质量顺序压到最多 19.9MB，不改像素不偷换格式", async () => {
  const limit = getOriginalPixelJpegMaxBytes();
  const sizes = [20 * 1024 * 1024 + 1, limit + 1, limit];
  const { runtime, calls } = makeRuntime({
    encode: ({ mimeType }) => fakeBlob(sizes.shift(), mimeType),
  });
  const asset = await createCoverExportAssetWithRuntime(makeRequest(), runtime);

  assert.deepEqual(calls.encode.map(({ quality }) => quality), [0.98, 0.91, 0.84]);
  assert.ok(asset.blob.size <= limit);
  assert.equal(asset.blob.type, "image/jpeg");
  assert.deepEqual(asset.outputSize, { width: 3375, height: 6000 });
});

test("手机在原像素 canvas 失败后按旧候选顺序降级并标记 fallback", async () => {
  let encoded = 0;
  const { runtime, calls } = makeRuntime({
    encode: ({ mimeType }) => {
      encoded += 1;
      return encoded === 1 ? null : fakeBlob(1024, mimeType);
    },
  });
  const asset = await createCoverExportAssetWithRuntime(
    makeRequest({ format: "png", mobile: true }),
    runtime,
  );

  assert.deepEqual(calls.render.map(({ outputSize }) => outputSize), [
    { width: 3375, height: 6000 },
    { width: 2121, height: 3771 },
  ]);
  assert.deepEqual(asset.outputSize, { width: 2121, height: 3771 });
  assert.deepEqual(asset.originalOutputSize, { width: 3375, height: 6000 });
  assert.equal(asset.usedMobileFallback, true);
  assert.equal(calls.waits, 1);
  assert.equal(calls.release, 2);
});

test("异步编码期间 generation 失效会安静中止，不继续绘制后续手机尺寸", async () => {
  let cancelled = false;
  let completeEncode;
  const { runtime, calls } = makeRuntime({
    deferEncode: (callback) => {
      completeEncode = () => callback(null);
    },
  });
  const pending = createCoverExportAssetWithRuntime(
    makeRequest({
      format: "png",
      mobile: true,
      isCancelled: () => cancelled,
    }),
    runtime,
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  cancelled = true;
  completeEncode();
  await assert.rejects(pending, { code: "EXPORT_CANCELLED" });
  assert.equal(calls.render.length, 1);
  assert.deepEqual(calls.render[0].outputSize, { width: 3375, height: 6000 });
  assert.equal(calls.release, 1);
  assert.equal(calls.waits, 0);
});

test("drawCover 每次都关闭辅助线，传入 photoOnly 和当前候选尺寸", async () => {
  let encoded = 0;
  const { runtime, calls } = makeRuntime({
    encode: ({ mimeType }) => (++encoded === 1 ? null : fakeBlob(1024, mimeType)),
  });
  await createCoverExportAssetWithRuntime(
    makeRequest({ format: "png", mobile: true, photoOnly: true }),
    runtime,
  );

  assert.deepEqual(calls.render.map(({ includeGuide, photoOnly, outputSize }) => ({
    includeGuide,
    photoOnly,
    outputSize,
  })), [
    { includeGuide: false, photoOnly: true, outputSize: { width: 3375, height: 6000 } },
    { includeGuide: false, photoOnly: true, outputSize: { width: 2121, height: 3771 } },
  ]);
});

test("成功、toBlob(null)、绘制抛错和最终失败都释放临时 canvas", async (t) => {
  await t.test("成功", async () => {
    const { runtime, calls } = makeRuntime();
    await createCoverExportAssetWithRuntime(makeRequest({ format: "png" }), runtime);
    assert.equal(calls.release, 1);
    assert.equal(calls.releaseScratch, 1);
  });

  await t.test("toBlob(null) 最终失败", async () => {
    const { runtime, calls } = makeRuntime({ encode: () => null });
    await assert.rejects(
      createCoverExportAssetWithRuntime(makeRequest({ format: "png" }), runtime),
      { code: "CANVAS_EXPORT_FAILED" },
    );
    assert.equal(calls.release, 1);
  });

  await t.test("绘制抛错最终失败", async () => {
    const { runtime, calls } = makeRuntime({ render: () => { throw new Error("render boom"); } });
    await assert.rejects(
      createCoverExportAssetWithRuntime(makeRequest({ format: "png" }), runtime),
      { code: "CANVAS_RENDER_FAILED" },
    );
    assert.equal(calls.release, 1);
  });

  await t.test("JPG 全部质量仍超限", async () => {
    const { runtime, calls } = makeRuntime({
      encode: ({ mimeType }) => fakeBlob(getOriginalPixelJpegMaxBytes() + 1, mimeType),
    });
    await assert.rejects(
      createCoverExportAssetWithRuntime(makeRequest(), runtime),
      { code: "JPEG_SIZE_LIMIT" },
    );
    assert.deepEqual(calls.encode.map(({ quality }) => quality), getOriginalPixelJpegQualities());
    assert.equal(calls.release, 1);
  });

  await t.test("手机所有候选全失败，每个候选 canvas 各释放一次", async () => {
    const { runtime, calls } = makeRuntime({ encode: () => null });
    await assert.rejects(
      createCoverExportAssetWithRuntime(makeRequest({ format: "png", mobile: true }), runtime),
      { code: "CANVAS_EXPORT_FAILED" },
    );
    assert.equal(calls.render.length, 5);
    assert.equal(calls.release, 5);
  });
});
