import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";
import { createServer } from "vite";
import { PRIMARY_TOOLS, SECONDARY_TOOLS } from "../app/cover/core/tool-registry.ts";
import {
  assertLayoutSnapshot,
  assertShellTraceParity,
  assertToolCoverage,
} from "./helpers/final-acceptance-audit.mjs";

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
    }, 12000);
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
    await evaluate(send, `localStorage.setItem("nbo_cover_access_until", String(Date.now() + 86400000)); true;`);
    await send("Page.reload", { ignoreCache: true });
    await waitFor(() => evaluate(send, "document.readyState === 'complete' && !document.querySelector('#coverPage').classList.contains('is-hidden')"), 7000, "解锁封面页");

    const uploaded = await evaluate(send, `(async () => {
      const makeFile = (width, height, color, name) => new Promise(resolve => {
        const source = document.createElement("canvas"); source.width = width; source.height = height;
        const context = source.getContext("2d");
        const gradient = context.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, color); gradient.addColorStop(1, "#101010");
        context.fillStyle = gradient; context.fillRect(0, 0, width, height);
        context.fillStyle = "#ffffff"; context.font = "80px sans-serif"; context.fillText(name, 80, 140);
        source.toBlob(blob => resolve(new File([blob], name, { type: "image/png" })), "image/png");
      });
      const load = async (id, file, ready) => {
        const transfer = new DataTransfer(); transfer.items.add(file);
        const input = document.querySelector(id); input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        const deadline = Date.now() + 6000;
        while (!ready() && Date.now() < deadline) await new Promise(r => setTimeout(r, 40));
        return ready();
      };
      const main = await makeFile(1080, 1920, "#b83030", "task13-main.png");
      const before = await makeFile(900, 1200, "#2d70b8", "task13-before.png");
      await load("#fileInput", main, () => document.querySelector("#canvasShell").classList.contains("has-image"));
      const beforeReady = await load("#beforeFileInput", before, () => document.querySelector("#beforeFileName").textContent.includes("task13-before"));
      const compare = document.querySelector("#compareToggle"); compare.checked = true; compare.dispatchEvent(new Event("change", { bubbles: true }));
      const set = (id, value, event = "input") => { const control = document.querySelector(id); control.value = value; control.dispatchEvent(new Event(event, { bubbles: true })); };
      set("#topText", "Task13状态"); set("#bottomText", "跨设备一致"); set("#subtitle", "真实导出路径");
      set("#zoom", "137"); set("#beforeZoom", "126"); set("#brightness", "113"); set("#shade", "27"); set("#bottomShade", "68");
      localStorage.setItem("nbo-cover-copy-sync-v1", JSON.stringify({ topText: "同步上行", bottomText: "同步下行", platform: "抖音", selectionIndex: 0, updatedAt: Date.now() }));
      window.__task13Requests = [];
      window.NBOCoverCore.setCoverExportRenderRequestObserver(request => {
        window.__task13Requests.push({
          width: request.outputSize.width, height: request.outputSize.height,
          trace: {
            hasMain: Boolean(request.image), hasBefore: Boolean(request.beforeImage), photoOnly: Boolean(request.photoOnly),
            capsule: Boolean(request.settings.compareEnabled && request.beforeImage), beforeFrame: request.settings.beforeFrameScale,
            settings: ["topText", "bottomText", "subtitle", "compareEnabled", "zoom", "beforeZoom", "beforeFrameScale", "brightness", "shade", "bottomShade"].map(key => [key, request.settings[key]]),
            afterStrokes: JSON.parse(JSON.stringify(request.retouchStrokes || [])),
            beforeStrokes: JSON.parse(JSON.stringify(request.beforeRetouchStrokes || [])),
          },
        });
      });
      return { mainReady: document.querySelector("#canvasShell").classList.contains("has-image"), beforeReady, compare: compare.checked, beforeText: document.querySelector("#beforeFileName")?.textContent, status: document.querySelector("#statusText")?.textContent };
    })()`, true);
    assert.deepEqual(uploaded, { mainReady: true, beforeReady: true, compare: true, beforeText: "task13-before.png", status: "前后对比已开启，可继续调整拍摄前照片" }, "受控页必须真实载入测试图片");

    const canvasRect = await evaluate(send, `(() => {
      const primary = [...document.querySelectorAll("#mobilePrimaryTools button")].find(button => button.textContent === "涂抹");
      primary.click();
      document.querySelector("#mobileSecondaryTools button").click();
      document.querySelector("#mobileSingleToolControl button").click();
      const rect = document.querySelector("#coverCanvas").getBoundingClientRect();
      return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    })()`);
    const paintStroke = async (x1, y1, x2, y2) => {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", buttons: 1, clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x2, y: y2, button: "left", buttons: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", buttons: 0, clickCount: 1 });
    };
    await paintStroke(canvasRect.left + canvasRect.width * 0.24, canvasRect.top + canvasRect.height * 0.35, canvasRect.left + canvasRect.width * 0.3, canvasRect.top + canvasRect.height * 0.4);
    await paintStroke(canvasRect.left + canvasRect.width * 0.84, canvasRect.top + canvasRect.height * 0.7, canvasRect.left + canvasRect.width * 0.88, canvasRect.top + canvasRect.height * 0.74);
    const strokesReady = await evaluate(send, `document.querySelector("#retouchTarget").hidden === false && !document.querySelector("#compareBefore").disabled`);
    assert.equal(strokesReady, true, "必须通过真实画布事件建立主图/拍摄前涂抹记录");

    const toolAudit = await evaluate(send, `(() => {
      const core = window.NBOCoverCore;
      const coverage = {};
      const primaryHits = [];
      const clickLog = [];
      document.addEventListener("click", event => { if (event.target.id) clickLog.push(event.target.id); }, true);
      const setTarget = target => document.querySelector(target === "before" ? "#adjustmentTargetBefore" : "#adjustmentTargetAfter").click();
      const selectPrimary = id => {
        const index = core.PRIMARY_TOOLS.findIndex(tool => tool.id === id);
        const button = document.querySelectorAll("#mobilePrimaryTools button")[index];
        button.click(); primaryHits.push(id);
      };
      const auditGroup = (id, target = "after") => {
        setTarget(target); selectPrimary(id);
        const tools = core.getSecondaryTools(id, { comparisonEnabled: true, target });
        tools.forEach((tool, index) => {
          const button = document.querySelectorAll("#mobileSecondaryTools button")[index];
          button.click();
          const panel = document.querySelector("#mobileSingleToolControl [data-active-tool]");
          const selected = document.querySelectorAll("#mobileSecondaryTools button")[index];
          coverage[tool.id] = panel?.dataset.activeTool === tool.id && selected.getAttribute("aria-pressed") === "true";
        });
      };
      core.PRIMARY_TOOLS.forEach(primary => auditGroup(primary.id, "after"));
      auditGroup("compose", "before");
      setTarget("after");

      const selectTool = (primary, id, target = "after") => {
        setTarget(target); selectPrimary(primary);
        const tools = core.getSecondaryTools(primary, { comparisonEnabled: true, target });
        const index = tools.findIndex(tool => tool.id === id);
        document.querySelectorAll("#mobileSecondaryTools button")[index].click();
        return document.querySelector("#mobileSingleToolControl [data-active-tool]");
      };
      const rangePanel = selectTool("compose", "zoom");
      const range = rangePanel.querySelector('input[type="range"]'); range.value = "142"; range.dispatchEvent(new Event("input", { bubbles: true }));
      const rangeChanged = document.querySelector("#zoom").value === "142";
      const textPanel = selectTool("text", "topText");
      const text = textPanel.querySelector('input[type="text"]'); text.value = "A1文字回调"; text.dispatchEvent(new Event("input", { bubbles: true }));
      const textChanged = document.querySelector("#topText").value === "A1文字回调";
      const colorPanel = selectTool("text", "topColor");
      const color = colorPanel.querySelector('input[type="color"]'); color.value = "#123456"; color.dispatchEvent(new Event("input", { bubbles: true }));
      const colorChanged = document.querySelector("#topColor").value.toLowerCase() === "#123456";
      const togglePanel = selectTool("photo", "safeArea");
      const safeBefore = document.querySelector("#safeToggle").checked; togglePanel.querySelector("button").click();
      const toggleChanged = document.querySelector("#safeToggle").checked !== safeBefore;
      togglePanel.querySelector("button").click();
      const choicePanel = selectTool("layout", "template");
      choicePanel.querySelectorAll("button")[1].click();
      const choiceChanged = document.querySelector('#templates [data-template="top-center"]').classList.contains("active");
      const actionPanel = selectTool("compose", "resetBeforeFrame", "before");
      actionPanel.querySelector("button").click();
      const actionChanged = clickLog.includes("resetBeforeFrame");

      const restore = (id, value) => { const control = document.querySelector(id); control.value = value; control.dispatchEvent(new Event("input", { bubbles: true })); };
      restore("#topText", "Task13状态"); restore("#topColor", "#ffffff"); restore("#zoom", "137");
      document.querySelector('#templates [data-template="middle-left"]').click();
      selectTool("compose", "target", "after");
      document.querySelector("#mobileSecondaryTools").scrollLeft = 0;
      document.querySelector("#mobilePrimaryTools").scrollLeft = 0;
      return {
        coverage, primaryHits: [...new Set(primaryHits)],
        representatives: { rangeChanged, textChanged, colorChanged, toggleChanged, choiceChanged, actionChanged },
      };
    })()`);
    assert.deepEqual(toolAudit.primaryHits.sort(), PRIMARY_TOOLS.map(({ id }) => id).sort());
    assertToolCoverage(Object.values(SECONDARY_TOOLS).flat().map(({ id }) => id), toolAudit.coverage);
    assert.deepEqual(toolAudit.representatives, {
      rangeChanged: true, textChanged: true, colorChanged: true,
      toggleChanged: true, choiceChanged: true, actionChanged: true,
    });

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
          const primary = document.querySelector("#mobilePrimaryTools");
          const controls = document.querySelector(".controls");
          const toolRoot = root.dataset.coverLayout === "desktop" ? controls : primary;
          const toolStyle = getComputedStyle(toolRoot);
          const visibleTools = toolStyle.display !== "none" && toolStyle.visibility !== "hidden";
          const rect = element => { const value = element.getBoundingClientRect(); return { id: element.id || element.className, left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height }; };
          const vv = window.visualViewport;
          const viewport = { left: vv?.offsetLeft || 0, top: vv?.offsetTop || 0, right: (vv?.offsetLeft || 0) + (vv?.width || innerWidth), bottom: (vv?.offsetTop || 0) + (vv?.height || innerHeight) };
          const previewRect = rect(preview);
          const mode = root.dataset.coverLayout;
          const topbar = document.querySelector(mode === "compact" ? "#mobileEditorTopbar" : mode === "split" ? ".split-tools-header" : ".studio-header");
          const secondary = document.querySelector("#mobileSecondaryTools");
          const a1 = document.querySelector("#mobileSingleToolControl");
          const container = mode === "split" ? rect(document.querySelector("#splitTools")) : viewport;
          const intersects = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
          const visible = element => element && !element.hidden && getComputedStyle(element).display !== "none" && rect(element).width > 0 && rect(element).height > 0;
          const interactiveElements = mode === "desktop"
            ? [document.querySelector("#copyWorkspaceSwitch")]
            : [topbar.querySelector("button:last-of-type"), primary.querySelector("button[aria-pressed=true]"), secondary.querySelector("button[aria-pressed=true]"), a1.querySelector("button")].filter(visible);
          const interactive = interactiveElements.map(rect);
          const toolIntersections = mode === "desktop" || [primary, secondary, a1].every(element => visible(element) && intersects(rect(element), container));
          let exportOptions = [];
          if (mode !== "desktop") {
            document.querySelector(mode === "compact" ? "#openMobileExport" : "#openSplitExport").click();
            exportOptions = [...document.querySelectorAll("#mobileExportSheet .mobile-export-options button")].map(rect);
            document.querySelector("#closeMobileExport").click();
          } else {
            exportOptions = ["#exportOriginalPng", "#exportOriginalJpg", "#exportPng", "#exportJpg"].map(selector => rect(document.querySelector(selector)));
          }
          const transformedOffscreen = [topbar, preview, ...(mode === "desktop" ? [controls] : [primary, secondary, a1])]
            .filter(visible).filter(element => getComputedStyle(element).transform !== "none" && !intersects(rect(element), mode === "desktop" ? viewport : container)).map(element => element.id || element.className);
          const sample = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
          let visualSignature = 0; for (let index = 0; index < sample.length; index += Math.max(4, Math.floor(sample.length / 64 / 4) * 4)) visualSignature = (visualSignature + sample[index] + sample[index + 1] + sample[index + 2] + sample[index + 3]) % 1000000007;
          return {
            width: innerWidth, height: innerHeight, mode,
            pointerMatches: matchMedia("(pointer: coarse)").matches,
            overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
            snapshot: { viewport, preview: previewRect, interactive: mode === "desktop" ? interactive : [...interactive, ...exportOptions], minimumTarget: ${JSON.stringify(pointer)} === "coarse" ? 44 : 36, transformedOffscreen },
            visibleTools, toolIntersections, toolRects: mode === "desktop" ? [] : [rect(primary), rect(secondary), rect(a1), container], topbarVisible: visible(topbar) && intersects(rect(topbar), viewport), exportCount: exportOptions.length,
            primaryCount: primary.querySelectorAll("button").length,
            canvasCount: document.querySelectorAll("#coverCanvas").length,
            dockCount: document.querySelectorAll("#splitTools").length,
            imageKept: preview.classList.contains("has-image"),
            beforeKept: document.querySelector("#beforeFileName").textContent.includes("task13-before"),
            compareKept: document.querySelector("#compareToggle").checked,
            textKept: document.querySelector("#topText").value === "Task13状态",
            zoomKept: document.querySelector("#zoom").value === "137",
            brightnessKept: document.querySelector("#brightness").value === "113",
            shadeKept: document.querySelector("#shade").value === "27",
            bottomShadeKept: document.querySelector("#bottomShade").value === "68",
            visualSignature,
          };
        })()`);
        return value?.mode === expected ? value : null;
      }, 3000, `${width}×${height} ${expected}`);
      results.push(result);
    }

    assert.equal(results.length, 16);
    for (const result of results) {
      assert.ok(result.overflow <= 1, `${result.width}×${result.height} 水平溢出 ${result.overflow}px`);
      try {
        assertLayoutSnapshot(result.snapshot);
      } catch (error) {
        throw new Error(`${result.width}×${result.height}: ${error.message}; preview=${JSON.stringify(result.snapshot.preview)} interactive=${JSON.stringify(result.snapshot.interactive)}`);
      }
      assert.equal(result.pointerMatches, result.mode !== "desktop", `${result.width}×${result.height} coarse/fine 未真实影响 resolver`);
      assert.equal(result.visibleTools, true, `${result.width}×${result.height} 工具不可达`);
      assert.equal(result.toolIntersections, true, `${result.width}×${result.height} 工具未落在自身滚动容器 ${JSON.stringify(result.toolRects)}`);
      assert.equal(result.topbarVisible, true, `${result.width}×${result.height} topbar 不在 visualViewport`);
      assert.equal(result.exportCount, 4, `${result.width}×${result.height} 导出格式不完整`);
      assert.equal(result.primaryCount, 7);
      assert.equal(result.canvasCount, 1);
      assert.equal(result.dockCount, 1);
      assert.equal(result.imageKept, true);
      assert.equal(result.beforeKept, true);
      assert.equal(result.compareKept, true);
      assert.equal(result.textKept, true);
      assert.equal(result.zoomKept, true);
      assert.equal(result.brightnessKept, true);
      assert.equal(result.shadeKept, true);
      assert.equal(result.bottomShadeKept, true);
      assert.ok(result.visualSignature > 0, `${result.width}×${result.height} 画面像素丢失`);
    }

    await evaluate(send, `(() => {
      HTMLCanvasElement.prototype.toBlob = function(callback, type) { callback(new Blob(["task13"], { type: type || "image/png" })); };
      window.showSaveFilePicker = undefined;
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      window.__task13Requests.length = 0;
    })()`);
    const shellRequests = {};
    for (const [name, width, height, coarse, trigger] of [
      ["compact", 390, 844, true, "#mobileExportDesignPng"],
      ["split", 1024, 768, true, "#mobileExportDesignPng"],
      ["desktop", 1280, 800, false, "#exportPng"],
    ]) {
      await send("Emulation.setTouchEmulationEnabled", { enabled: coarse, maxTouchPoints: coarse ? 5 : 1 });
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: coarse });
      await waitFor(() => evaluate(send, `document.querySelector(".studio-grid").dataset.coverLayout === ${JSON.stringify(name)}`), 3000, `${name} 导出 shell`);
      await waitFor(() => evaluate(send, `!document.querySelector("#mobileExportDesignPng").disabled`), 3000, `${name} 导出按钮就绪`);
      const beforeCount = await evaluate(send, "window.__task13Requests.length");
      await evaluate(send, `(() => {
        const brightness = document.querySelector("#brightness"); brightness.dispatchEvent(new Event("input", { bubbles: true }));
        const mode = document.querySelector(".studio-grid").dataset.coverLayout;
        if (mode === "compact") document.querySelector("#openMobileExport").click();
        if (mode === "split") document.querySelector("#openSplitExport").click();
        document.querySelector(${JSON.stringify(trigger)}).click();
      })()`);
      const request = await waitFor(async () => {
        const requests = await evaluate(send, "window.__task13Requests");
        return requests.length > beforeCount ? requests.at(-1) : null;
      }, 7000, `${name} 真实导出 render request`);
      shellRequests[name] = request;
      await waitFor(() => evaluate(send, `!document.querySelector("#mobileExportDesignPng").disabled`), 3000, `${name} 导出收尾`);
      await evaluate(send, `document.querySelector("#closeSavePreview")?.click();`);
    }
    assertShellTraceParity(shellRequests);
    assert.equal(shellRequests.compact.trace.hasMain, true);
    assert.equal(shellRequests.compact.trace.hasBefore, true);
    assert.equal(shellRequests.compact.trace.photoOnly, false);
    assert.equal(shellRequests.compact.trace.capsule, true);
    assert.equal(shellRequests.compact.trace.beforeFrame, 100);
    assert.ok(shellRequests.compact.trace.afterStrokes.length > 0, "最终 render request 必须含主图涂抹");
    assert.ok(shellRequests.compact.trace.beforeStrokes.length > 0, "最终 render request 必须含拍摄前涂抹");
    assert.deepEqual(Object.fromEntries(shellRequests.compact.trace.settings), {
      topText: "Task13状态", bottomText: "跨设备一致", subtitle: "真实导出路径",
      compareEnabled: true, zoom: 137, beforeZoom: 126, beforeFrameScale: 100,
      brightness: 113, shade: 27, bottomShade: 68,
    });
  } finally {
    socket?.close();
    if (chrome && chrome.exitCode === null) chrome.kill("SIGKILL");
    await Promise.race([vite.close(), delay(3000)]);
    await rm(profile, { recursive: true, force: true });
  }
});
