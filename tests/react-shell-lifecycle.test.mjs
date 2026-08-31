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

test("Compact/Split 计算样式与 React 真实 DOM 生命周期保持稳定", { timeout: 20000 }, async (t) => {
  try {
    await access(CHROME);
  } catch {
    t.skip("当前环境没有 Google Chrome，跳过真实 DOM 集成测试");
    return;
  }

  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const profile = await mkdtemp(join(tmpdir(), "nbo-task12-chrome-"));
  const vite = await createServer({ root: repoRoot, configFile: false, logLevel: "silent", server: { host: "127.0.0.1", port: 0, strictPort: false } });
  let chrome;
  let socket;
  try {
    await Promise.race([
      vite.listen(),
      delay(3000).then(() => { throw new Error("Vite 启动超时"); }),
    ]);
    const address = vite.httpServer.address();
    const pageUrl = `http://127.0.0.1:${address.port}/tests/fixtures/react-shell-lifecycle.html`;
    chrome = spawn(CHROME, [
      "--headless=new",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
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
    await waitFor(async () => {
      const response = await send("Runtime.evaluate", { expression: "window.__task12Ready === true", returnByValue: true });
      return response.result.value === true;
    }, 7000, "React 生命周期 fixture");
    const evaluated = await send("Runtime.evaluate", { expression: "window.__runTask12Lifecycle()", awaitPromise: true, returnByValue: true });
    const result = evaluated.result.value;

    assert.equal(result.compactHeaderDisplay, "none");
    assert.equal(result.splitHeaderDisplay, "flex");
    assert.equal(result.canvasStable, true);
    assert.equal(result.surfaceMounts, 1);
    assert.equal(result.surfaceCleanups, 0);
    assert.equal(result.canvasListenerRemovals, 0);
    assert.equal(result.decodeCount, 1);
    assert.equal(result.stateStable, true);
    assert.equal(result.finalSurfaceCleanups, 1);
    assert.ok(result.finalCanvasListenerRemovals > 0);
  } finally {
    socket?.close();
    if (chrome && chrome.exitCode === null) chrome.kill("SIGKILL");
    await Promise.race([vite.close(), delay(3000)]);
    await rm(profile, { recursive: true, force: true });
  }
});
