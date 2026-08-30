import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const appUploadUrl = new URL("../app/cover/drop-upload.ts", import.meta.url);
const staticUploadUrl = new URL("../docs/drop-upload.js", import.meta.url);

async function loadImplementations() {
  let app = {};
  try {
    app = await import(`${appUploadUrl.href}?test=${Date.now()}`);
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  }

  let staticImplementation = {};
  try {
    const source = await readFile(staticUploadUrl, "utf8");
    const context = { window: {} };
    runInNewContext(source, context);
    staticImplementation = context.window.NBODropUpload ?? {};
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  return [app, staticImplementation];
}

test("单张 JPG、PNG 或 WEBP 可以拖入对应照片区域", async () => {
  const files = [
    { name: "after.JPG", type: "image/jpeg" },
    { name: "before.png", type: "image/png" },
    { name: "portrait.webp", type: "image/webp" },
  ];

  for (const implementation of await loadImplementations()) {
    assert.equal(typeof implementation.resolveDroppedImage, "function");
    for (const file of files) {
      const result = implementation.resolveDroppedImage([file], "main");
      assert.equal(result.ok, true);
      assert.equal(result.file, file);
    }
  }
});

test("多个文件不会误选第一张并覆盖现有照片", async () => {
  const files = [
    { name: "one.jpg", type: "image/jpeg" },
    { name: "two.jpg", type: "image/jpeg" },
  ];

  for (const implementation of await loadImplementations()) {
    assert.equal(typeof implementation.resolveDroppedImage, "function");
    assert.deepEqual(
      JSON.parse(JSON.stringify(implementation.resolveDroppedImage(files, "main"))),
      { ok: false, reason: "multiple", message: "精修图每次只能拖入一张照片" },
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(implementation.resolveDroppedImage(files, "before"))),
      { ok: false, reason: "multiple", message: "拍摄前照片每次只能拖入一张照片" },
    );
  }
});

test("文件夹和不支持的文件类型显示对应区域的中文提示", async () => {
  const folder = { name: "客片文件夹", type: "" };
  const gif = { name: "preview.gif", type: "image/gif" };

  for (const implementation of await loadImplementations()) {
    assert.equal(typeof implementation.resolveDroppedImage, "function");
    assert.deepEqual(
      JSON.parse(JSON.stringify(implementation.resolveDroppedImage([folder], "main"))),
      { ok: false, reason: "unsupported", message: "精修图请选择 JPG、PNG 或 WEBP 图片" },
    );
    assert.deepEqual(
      JSON.parse(JSON.stringify(implementation.resolveDroppedImage([gif], "before"))),
      { ok: false, reason: "unsupported", message: "拍摄前照片请选择 JPG、PNG 或 WEBP 图片" },
    );
  }
});

test("拖入时为两个区域提供明确且不串位的操作提示", async () => {
  for (const implementation of await loadImplementations()) {
    assert.equal(typeof implementation.getImageDropHint, "function");
    assert.equal(implementation.getImageDropHint("main"), "松开导入精修图");
    assert.equal(implementation.getImageDropHint("before"), "松开导入拍摄前照片");
  }
});

test("拖过上传框内部子元素时保持高亮，松开后立即结束高亮", async () => {
  const file = { name: "portrait.jpg", type: "image/jpeg" };

  for (const implementation of await loadImplementations()) {
    assert.equal(typeof implementation.createImageDropController, "function");
    const controller = implementation.createImageDropController("before");
    assert.deepEqual(JSON.parse(JSON.stringify(controller.enter())), {
      active: true,
      hint: "松开导入拍摄前照片",
    });
    controller.enter();
    assert.equal(controller.leave().active, true);
    const dropped = controller.drop([file]);
    assert.equal(dropped.active, false);
    assert.equal(dropped.selection.ok, true);
    assert.equal(dropped.selection.file, file);
  }
});
