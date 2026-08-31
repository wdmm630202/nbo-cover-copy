import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import { createServer } from "vite";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const MATRIX = [
  [320, 568, "coarse", "compact"], [375, 667, "coarse", "compact"],
  [390, 844, "coarse", "compact"], [430, 932, "coarse", "compact"],
  [667, 375, "coarse", "compact"], [844, 390, "coarse", "split"],
  [932, 430, "coarse", "split"], [768, 1024, "coarse", "compact"],
  [834, 1194, "coarse", "compact"], [1024, 1366, "coarse", "compact"],
  [1024, 768, "coarse", "split"], [1194, 834, "coarse", "split"],
  [1366, 1024, "coarse", "split"], [1280, 800, "fine", "desktop"],
  [1440, 900, "fine", "desktop"], [1920, 1080, "fine", "desktop"],
];

async function waitFor(getValue, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await getValue();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(`${label} 超时${lastError ? `: ${lastError.message}` : ""}`);
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error("CDP 连接超时")), 3000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(socket); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP 连接失败")); }, { once: true });
  });
}

function cdpClient(socket) {
  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} 超时`));
    }, 5000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(send, expression, awaitPromise = false) {
  const response = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || "Runtime.evaluate 失败");
  return response.result.value;
}

test("静态真实页在 16 个目标尺寸保持外壳、预览、工具与编辑状态", { timeout: 45000 }, async (t) => {
  try {
    await access(CHROME);
  } catch {
    t.skip("当前环境没有 Google Chrome，跳过受控浏览器设备矩阵");
    return;
  }

  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const profile = await mkdtemp(join(tmpdir(), "nbo-task13-chrome-"));
  const vite = await createServer({
    root: repoRoot,
    configFile: false,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  let chrome;
  let socket;
  try {
    await Promise.race([
      vite.listen(),
      delay(3000).then(() => { throw new Error("Vite 启动超时"); }),
    ]);
    const address = vite.httpServer.address();
    const pageUrl = `http://127.0.0.1:${address.port}/docs/cover.html`;
    chrome = spawn(CHROME, [
      "--headless=new", "--disable-background-networking", "--disable-component-update",
      "--disable-default-apps", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
      "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
    ], { stdio: "ignore" });
    const activePort = await waitFor(async () => {
      const text = await readFile(join(profile, "DevToolsActivePort"), "utf8");
      return Number(text.split("\n")[0]) || null;
    }, 5000, "Chrome DevToolsActivePort");
    const target = await fetch(`http://127.0.0.1:${activePort}/json/new?${encodeURIComponent(pageUrl)}`, {
      method: "PUT",
      signal: AbortSignal.timeout(3000),
    }).then((response) => response.json());
    socket = await connectCdp(target.webSocketDebuggerUrl);
    const send = cdpClient(socket);
    await send("Runtime.enable");
    await send("Page.enable");
    await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await waitFor(() => evaluate(send, "document.readyState === 'complete'"), 7000, "静态封面页");
    await evaluate(send, `localStorage.setItem("nbo_cover_access_until", String(Date.now() + 86400000)); location.reload();`);
    await waitFor(() => evaluate(send, "document.readyState === 'complete' && !document.querySelector('#coverPage').classList.contains('is-hidden')"), 7000, "解锁封面页");

    const uploaded = await evaluate(send, `(async () => {
      const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8AARAwMjDAGDAwMAAA0AAH6FHveAAAAAElFTkSuQmCC"), c => c.charCodeAt(0));
      const file = new File([bytes], "task13.png", { type: "image/png" });
      const transfer = new DataTransfer(); transfer.items.add(file);
      const input = document.querySelector("#fileInput"); input.files = transfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const deadline = Date.now() + 4000;
      while (!document.querySelector("#canvasShell").classList.contains("has-image") && Date.now() < deadline) await new Promise(r => setTimeout(r, 40));
      const top = document.querySelector("#topText"); top.value = "Task13状态"; top.dispatchEvent(new Event("input", { bubbles: true }));
      const zoom = document.querySelector("#zoom"); zoom.value = "137"; zoom.dispatchEvent(new Event("input", { bubbles: true }));
      return document.querySelector("#canvasShell").classList.contains("has-image");
    })()`, true);
    assert.equal(uploaded, true, "受控页必须真实载入测试图片");

    const results = [];
    for (const [width, height, pointer, expected] of MATRIX) {
      await send("Emulation.setTouchEmulationEnabled", { enabled: pointer === "coarse", maxTouchPoints: pointer === "coarse" ? 5 : 1 });
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: pointer === "coarse" });
      const result = await waitFor(async () => {
        const value = await evaluate(send, `(() => {
          const root = document.querySelector(".studio-grid");
          if (root.dataset.coverLayout !== ${JSON.stringify(expected)}) return null;
          const canvas = document.querySelector("#coverCanvas");
          const preview = document.querySelector("#canvasShell");
          const previewRect = preview.getBoundingClientRect();
          const primary = document.querySelector("#mobilePrimaryTools");
          const controls = document.querySelector(".controls");
          const toolRoot = root.dataset.coverLayout === "desktop" ? controls : primary;
          const toolStyle = getComputedStyle(toolRoot);
          const visibleTools = toolStyle.display !== "none" && toolStyle.visibility !== "hidden";
          return {
            width: innerWidth, height: innerHeight, mode: root.dataset.coverLayout,
            overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
            previewVisible: previewRect.width > 0 && previewRect.height > 0 && previewRect.bottom > 0 && previewRect.top < innerHeight,
            visibleTools,
            primaryCount: primary.querySelectorAll("button").length,
            canvasCount: document.querySelectorAll("#coverCanvas").length,
            dockCount: document.querySelectorAll("#splitTools").length,
            imageKept: preview.classList.contains("has-image"),
            textKept: document.querySelector("#topText").value === "Task13状态",
            zoomKept: document.querySelector("#zoom").value === "137",
          };
        })()`);
        return value?.mode === expected ? value : null;
      }, 3000, `${width}×${height} ${expected}`);
      results.push(result);
    }

    assert.equal(results.length, 16);
    for (const result of results) {
      assert.ok(result.overflow <= 1, `${result.width}×${result.height} 水平溢出 ${result.overflow}px`);
      assert.equal(result.previewVisible, true, `${result.width}×${result.height} 预览不可见`);
      assert.equal(result.visibleTools, true, `${result.width}×${result.height} 工具不可达`);
      assert.equal(result.primaryCount, 7);
      assert.equal(result.canvasCount, 1);
      assert.equal(result.dockCount, 1);
      assert.equal(result.imageKept, true);
      assert.equal(result.textKept, true);
      assert.equal(result.zoomKept, true);
    }
  } finally {
    socket?.close();
    if (chrome && chrome.exitCode === null) chrome.kill("SIGKILL");
    await Promise.race([vite.close(), delay(3000)]);
    await rm(profile, { recursive: true, force: true });
  }
});
