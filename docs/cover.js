const ACCESS_KEY = "nbo_cover_access_until";
const SETTINGS_KEY = "nbo_cover_settings_v1";
const MEMORY_KEY_PREFIX = "nbo_cover_memory_";
const COPY_SYNC_KEY = "nbo-cover-copy-sync-v1";
const COPY_SYNC_CHANNEL = "nbo-cover-copy-sync-channel-v1";
const IMAGE_MESSAGE_TYPE = "NBO_COVER_IMAGE_READY";
const IMAGE_REQUEST_TYPE = "NBO_COVER_IMAGE_REQUEST";
const ACCESS_DAYS = 180;
const PRESETS = {
  douyin: { label: "抖音", ratio: "9:16", width: 1080, height: 1920, note: "竖屏封面，带居中 3:4 主页安全区" },
  xiaohongshu: { label: "小红书", ratio: "3:4", width: 1080, height: 1440, note: "适合图文与竖版内容封面" },
  shipinhao: { label: "视频号", ratio: "3:4", width: 1080, height: 1440, note: "竖版内容常用工作尺寸" },
};
const state = {
  platform: "douyin",
  template: "top-left",
  topText: "男人的高级感",
  bottomText: "藏在自然状态里",
  subtitle: "不被定义的自己，才是最有张力的表达",
  topColor: "#FFFFFF",
  bottomColor: "#FEE800",
  dividerColor: "#C9A77A",
  divider: true,
  subtitleColor: "#FFFFFF",
  subtitleScale: 100,
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  textScale: 100,
  shade: 62,
  safe: true,
  watermarkScale: 100,
  watermarkAlign: "center",
  watermarkOpacity: 92,
  watermarkEnabled: true,
  image: null,
  watermark: null,
  fileName: "",
  watermarkName: "",
};

function normalizeTemplate(value) {
  const legacy = { left: "top-left", bottom: "top-center", badge: "middle-left", center: "middle-center", clean: "bottom-left", right: "bottom-right" };
  const valid = ["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"];
  return legacy[value] || (valid.includes(value) ? value : "top-left");
}

const DOUYIN_HOME_SAFE = {
  cropTop: 240,
  cropBottom: 1680,
  horizontalInset: 54,
  verticalInset: 54,
  playCountReserve: 144,
};

const $ = (selector) => document.querySelector(selector);
const canvas = $("#coverCanvas");
const accessGate = $("#accessGate");
const coverPage = $("#coverPage");
let syncedCopy = null;
let syncedImage = null;
let defaultWatermark = null;
const syncChannel = "BroadcastChannel" in window
  ? new BroadcastChannel(COPY_SYNC_CHANNEL)
  : null;

function normalizeSyncedCopy(value) {
  if (!value || typeof value !== "object") return null;
  const topText = typeof value.topText === "string" ? value.topText.trim().slice(0, 18) : "";
  const bottomText = typeof value.bottomText === "string" ? value.bottomText.trim().slice(0, 18) : "";
  if (!topText || !bottomText) return null;
  return {
    version: 1,
    topText,
    bottomText,
    platform: ["小红书", "抖音", "视频号"].includes(value.platform) ? value.platform : "小红书",
    selectionIndex: Math.max(0, Math.min(2, Number(value.selectionIndex) || 0)),
    updatedAt: Number(value.updatedAt) || Date.now(),
  };
}

function normalizeSyncedImage(value) {
  if (!value || typeof value !== "object") return null;
  if (
    typeof value.dataUrl !== "string" ||
    !/^data:image\/(?:jpeg|png|webp);base64,/i.test(value.dataUrl) ||
    value.dataUrl.length > 48000000
  ) return null;
  return {
    dataUrl: value.dataUrl,
    fileName: typeof value.fileName === "string" && value.fileName.trim()
      ? value.fileName.trim().slice(0, 160)
      : "文案页封面照片",
    updatedAt: Number(value.updatedAt) || Date.now(),
  };
}

function updateSyncUi() {
  const copyReady = Boolean(syncedCopy);
  const imageReady = Boolean(syncedImage);
  $("#copySync").classList.toggle("ready", copyReady || imageReady);
  $("#copySyncTitle").textContent = copyReady
    ? `${syncedCopy.topText} / ${syncedCopy.bottomText}`
    : "等待文案页方案";
  $("#copySyncTitle").title = copyReady
    ? `${syncedCopy.topText} / ${syncedCopy.bottomText}`
    : "";
  $("#copySyncDetail").textContent = copyReady
    ? `${syncedCopy.platform} · 方案 ${String(syncedCopy.selectionIndex + 1).padStart(2, "0")} · ${imageReady ? "封面照片已就绪" : "等待封面照片"} · 不会自动覆盖`
    : imageReady
      ? "封面照片已就绪，可单独同步"
      : "识别完成并选择方案后，可同步封面照片与文字";
  $("#syncAllCopy").disabled = !copyReady && !imageReady;
  $("#syncTopCopy").disabled = !copyReady;
  $("#syncBottomCopy").disabled = !copyReady;
  $("#syncCoverImage").disabled = !imageReady;
}

function acceptSyncedCopy(value, live = false) {
  const next = normalizeSyncedCopy(value);
  if (!next) return;
  syncedCopy = next;
  updateSyncUi();
  if (live) setStatus("文案页有新方案，可按需同步到封面");
}

function acceptSyncedImage(value, live = false) {
  const next = normalizeSyncedImage(value);
  if (!next) return;
  syncedImage = next;
  updateSyncUi();
  if (live) setStatus("文案页封面照片已就绪，可按需同步");
}

try {
  acceptSyncedCopy(JSON.parse(localStorage.getItem(COPY_SYNC_KEY) || "null"));
} catch {}
updateSyncUi();

window.addEventListener("storage", (event) => {
  if (event.key !== COPY_SYNC_KEY || !event.newValue) return;
  try {
    acceptSyncedCopy(JSON.parse(event.newValue), true);
  } catch {
    return;
  }
});

if (syncChannel) {
  syncChannel.addEventListener("message", (event) => {
    if (event.data?.type === IMAGE_MESSAGE_TYPE) {
      acceptSyncedImage(event.data.payload, true);
      return;
    }
    acceptSyncedCopy(event.data, true);
  });
  syncChannel.postMessage({ type: IMAGE_REQUEST_TYPE });
}

$("#copyWorkspaceSwitch").addEventListener("click", () => {
  if (window.opener && !window.opener.closed) {
    window.opener.focus();
    return;
  }

  window.open("./", "nbo-copy-studio");
});

function applySyncedCopy(field) {
  if (!syncedCopy) return setStatus("请先在文案页完成识别并选择一组方案");
  if (field !== "bottomText") state.topText = syncedCopy.topText;
  if (field !== "topText") state.bottomText = syncedCopy.bottomText;
  updateUi();
  saveSettings();
  draw();
  setStatus(
    field === "all"
      ? "两行封面文案已同步，照片和构图保持不变"
      : field === "topText"
        ? "上行文案已同步"
        : "下行文案已同步",
  );
}

function applySyncedImage(quiet = false) {
  if (!syncedImage) return setStatus("文案页原图暂不可用，请保持文案页打开并重新上传图片");
  const nextImage = new Image();
  nextImage.onload = () => {
    state.image = nextImage;
    state.fileName = syncedImage.fileName;
    $("#uploadTitle").textContent = "更换照片";
    $("#fileName").textContent = syncedImage.fileName;
    draw();
    if (!quiet) setStatus("文案页封面照片已同步，文字和构图保持不变");
  };
  nextImage.onerror = () => setStatus("封面照片读取没有完成，请在文案页重新上传");
  nextImage.src = syncedImage.dataUrl;
}

function applyAllSync() {
  if (!syncedCopy && !syncedImage) return setStatus("请先在文案页上传图片并选择一组方案");
  if (syncedCopy) {
    state.topText = syncedCopy.topText;
    state.bottomText = syncedCopy.bottomText;
    updateUi();
    saveSettings();
    draw();
  }
  if (syncedImage) applySyncedImage(true);
  setStatus(
    syncedCopy && syncedImage
      ? "封面照片和两行文案已同步，构图设置保持不变"
      : syncedImage
        ? "封面照片已同步，文字和构图保持不变"
        : "两行封面文案已同步，照片和构图保持不变",
  );
}

$("#syncAllCopy").addEventListener("click", applyAllSync);
$("#syncTopCopy").addEventListener("click", () => applySyncedCopy("topText"));
$("#syncBottomCopy").addEventListener("click", () => applySyncedCopy("bottomText"));
$("#syncCoverImage").addEventListener("click", () => applySyncedImage());

function unlock() {
  localStorage.setItem(ACCESS_KEY, String(Date.now() + ACCESS_DAYS * 86400000));
  accessGate.classList.add("is-hidden");
  coverPage.classList.remove("is-hidden");
  requestAnimationFrame(draw);
}

if (Number(localStorage.getItem(ACCESS_KEY) || 0) > Date.now()) unlock();

$("#accessForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if ($("#accessPassword").value.trim() === "0817") {
    unlock();
  } else {
    $("#accessError").textContent = "密码不正确，请重新输入";
  }
});

try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
  if (saved) {
    if (Number(saved.watermarkScale) <= 42) saved.watermarkScale = 100;
    saved.template = normalizeTemplate(saved.template);
    Object.assign(state, saved, { image: null, watermark: null, fileName: "", watermarkName: "" });
  }
} catch {
  $("#statusText").textContent = "已使用默认封面设置";
}

function saveSettings() {
  const settings = { ...state };
  delete settings.image;
  delete settings.watermark;
  delete settings.fileName;
  delete settings.watermarkName;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadDefaultWatermark() {
  const image = new Image();
  image.onload = () => {
    defaultWatermark = image;
    state.watermark = image;
    state.watermarkName = "南铂固定水印";
    $("#watermarkName").textContent = state.watermarkName;
    updateUi();
    draw();
  };
  image.onerror = () => setStatus("固定水印暂时无法读取，请刷新页面");
  image.src = "./nanbo-default-watermark.png";
}

function preset() {
  return PRESETS[state.platform];
}

function updateUi() {
  $("#topText").value = state.topText;
  $("#bottomText").value = state.bottomText;
  $("#subtitle").value = state.subtitle;
  $("#topColor").value = state.topColor;
  $("#bottomColor").value = state.bottomColor;
  $("#dividerColor").value = state.dividerColor;
  $("#dividerToggle").checked = state.divider;
  $("#subtitleColor").value = state.subtitleColor;
  $("#subtitleScale").value = state.subtitleScale;
  $("#subtitleScaleValue").textContent = `${state.subtitleScale}%`;
  $("#safeToggle").checked = state.safe;
  ["zoom", "offsetX", "offsetY", "textScale", "shade", "watermarkOpacity"].forEach((id) => {
    $(`#${id}`).value = state[id];
  });
  $("#zoomValue").textContent = `${state.zoom}%`;
  $("#offsetXValue").textContent = state.offsetX;
  $("#offsetYValue").textContent = state.offsetY;
  $("#textScaleValue").textContent = `${state.textScale}%`;
  $("#shadeValue").textContent = `${state.shade}%`;
  $("#watermarkOpacityValue").textContent = `${state.watermarkOpacity}%`;
  document.querySelectorAll("[data-platform]").forEach((button) => button.classList.toggle("active", button.dataset.platform === state.platform));
  document.querySelectorAll("[data-template]").forEach((button) => button.classList.toggle("active", button.dataset.template === state.template));
  document.querySelectorAll("[data-watermark-align]").forEach((button) => button.classList.toggle("active", button.dataset.watermarkAlign === state.watermarkAlign));
  $("#useWatermark").classList.toggle("active", state.watermarkEnabled);
  $("#disableWatermark").classList.toggle("active", !state.watermarkEnabled);
  const current = preset();
  $("#presetNote").textContent = `${current.width}×${current.height} · ${current.note}`;
  $("#previewRatio").textContent = `${current.label} · ${current.ratio}`;
  $("#canvasShell").className = `canvas-shell ratio-${current.ratio.replace(":", "-")}`;
}
updateUi();
loadDefaultWatermark();

$("#fileInput").addEventListener("change", (event) => loadFile(event.target.files[0]));
["dragenter", "dragover"].forEach((name) => $("#uploadBox").addEventListener(name, (event) => {
  event.preventDefault();
  $("#uploadBox").classList.add("dragging");
}));
["dragleave", "drop"].forEach((name) => $("#uploadBox").addEventListener(name, (event) => {
  event.preventDefault();
  $("#uploadBox").classList.remove("dragging");
}));
$("#uploadBox").addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));

function loadFile(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setStatus("请选择 JPG、PNG 或 WEBP 图片");
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    state.image = image;
    state.fileName = file.name;
    $("#uploadTitle").textContent = "更换照片";
    $("#fileName").textContent = file.name;
    setStatus("照片已载入，可以调整构图和文字");
    URL.revokeObjectURL(url);
    draw();
  };
  image.onerror = () => {
    setStatus("这张图片暂时无法读取，请更换一张");
    URL.revokeObjectURL(url);
  };
  image.src = url;
}

["topText", "bottomText", "subtitle"].forEach((id) => {
  $(`#${id}`).addEventListener("input", (event) => {
    state[id] = event.target.value;
    saveSettings();
    draw();
  });
});
["topColor", "bottomColor", "dividerColor", "subtitleColor"].forEach((id) => {
  $(`#${id}`).addEventListener("input", (event) => {
    state[id] = event.target.value.toUpperCase();
    saveSettings();
    draw();
  });
});
$("#subtitleScale").addEventListener("input", (event) => {
  state.subtitleScale = Number(event.target.value);
  $("#subtitleScaleValue").textContent = `${state.subtitleScale}%`;
  saveSettings(); draw();
});
$("#dividerToggle").addEventListener("change", (event) => { state.divider = event.target.checked; saveSettings(); draw(); });
["zoom", "offsetX", "offsetY", "textScale", "shade", "watermarkOpacity"].forEach((id) => {
  $(`#${id}`).addEventListener("input", (event) => {
    state[id] = Number(event.target.value);
    updateUi();
    saveSettings();
    draw();
  });
});
document.querySelectorAll("[data-watermark-align]").forEach((button) => button.addEventListener("click", () => {
  state.watermarkAlign = button.dataset.watermarkAlign;
  updateUi(); saveSettings(); draw();
}));
$("#safeToggle").addEventListener("change", (event) => { state.safe = event.target.checked; saveSettings(); draw(); });
$("#watermarkMain").addEventListener("click", () => {
  state.watermarkEnabled = true;
  updateUi(); saveSettings(); draw(); setStatus("已使用南铂固定水印");
});
$("#useWatermark").addEventListener("click", () => {
  state.watermarkEnabled = true;
  updateUi(); saveSettings(); draw(); setStatus("已使用水印");
});
$("#disableWatermark").addEventListener("click", () => {
  state.watermarkEnabled = false;
  updateUi(); saveSettings(); draw(); setStatus("本次已不使用水印，固定水印仍保留");
});
$("#watermarkButton").addEventListener("click", () => $("#watermarkInput").click());
$("#watermarkInput").addEventListener("change", (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (file.type !== "image/png") return setStatus("水印请使用透明 PNG 图片");
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    state.watermark = image;
    state.watermarkName = file.name;
    state.watermarkEnabled = true;
    $("#watermarkName").textContent = file.name;
    updateUi(); saveSettings();
    setStatus("透明水印已加入，导出时会保留");
    URL.revokeObjectURL(url);
    draw();
  };
  image.onerror = () => {
    setStatus("这张水印无法读取，请更换透明 PNG");
    URL.revokeObjectURL(url);
  };
  image.src = url;
});
$("#removeWatermark").addEventListener("click", () => {
  state.watermark = defaultWatermark;
  state.watermarkName = "南铂固定水印";
  state.watermarkEnabled = true;
  $("#watermarkName").textContent = state.watermarkName;
  updateUi(); saveSettings();
  setStatus("临时水印已移除，已恢复南铂固定水印");
  draw();
});
$("#resetSettings").addEventListener("click", () => {
  Object.assign(state, {
    platform: "douyin", template: "top-left", topText: "男人的高级感", bottomText: "藏在自然状态里",
    subtitle: "不被定义的自己，才是最有张力的表达", topColor: "#FFFFFF", bottomColor: "#FEE800",
    dividerColor: "#C9A77A", divider: true, subtitleColor: "#FFFFFF", subtitleScale: 100,
    zoom: 100, offsetX: 0, offsetY: 0, textScale: 100, shade: 62,
    safe: true, watermarkScale: 100, watermarkAlign: "center", watermarkOpacity: 92, watermarkEnabled: true,
  });
  updateUi(); saveSettings(); draw(); setStatus("已恢复默认构图和颜色");
});
document.querySelectorAll("[data-save-memory]").forEach((button) => button.addEventListener("click", () => {
  const slot = button.dataset.saveMemory;
  const settings = { ...state };
  delete settings.image; delete settings.watermark; delete settings.fileName; delete settings.watermarkName;
  localStorage.setItem(`${MEMORY_KEY_PREFIX}${slot}`, JSON.stringify(settings));
  setStatus(`已保存到记忆点 ${slot}`);
}));
document.querySelectorAll("[data-load-memory]").forEach((button) => button.addEventListener("click", () => {
  const slot = button.dataset.loadMemory;
  try {
    const saved = localStorage.getItem(`${MEMORY_KEY_PREFIX}${slot}`);
    if (!saved) return setStatus(`记忆点 ${slot} 还没有保存设置`);
    const parsed = JSON.parse(saved);
    if (Number(parsed.watermarkScale) <= 42) parsed.watermarkScale = 100;
    parsed.template = normalizeTemplate(parsed.template);
    Object.assign(state, parsed);
    updateUi(); saveSettings(); draw(); setStatus(`已应用记忆点 ${slot}`);
  } catch {
    setStatus(`记忆点 ${slot} 读取失败，请重新保存`);
  }
}));
$("#platforms").addEventListener("click", (event) => {
  const button = event.target.closest("[data-platform]");
  if (!button) return;
  state.platform = button.dataset.platform;
  updateUi();
  saveSettings();
  draw();
});
$("#templates").addEventListener("click", (event) => {
  const button = event.target.closest("[data-template]");
  if (!button) return;
  state.template = button.dataset.template;
  updateUi();
  saveSettings();
  draw();
});
$("#exportJpg").addEventListener("click", () => exportCover("jpeg"));
$("#exportPng").addEventListener("click", () => exportCover("png"));

function setStatus(message) {
  $("#statusText").textContent = message;
}

function draw(includeGuide = true, targetCanvas = canvas) {
  const targetContext = targetCanvas.getContext("2d");
  const current = preset();
  const { width, height } = current;
  targetCanvas.width = width;
  targetCanvas.height = height;
  targetContext.fillStyle = "#151515";
  targetContext.fillRect(0, 0, width, height);

  if (state.image) {
    const base = Math.max(width / state.image.naturalWidth, height / state.image.naturalHeight);
    const scale = base * state.zoom / 100;
    const imageWidth = state.image.naturalWidth * scale;
    const imageHeight = state.image.naturalHeight * scale;
    const x = (width - imageWidth) / 2 + state.offsetX / 100 * width;
    const y = (height - imageHeight) / 2 + state.offsetY / 100 * height;
    targetContext.drawImage(state.image, x, y, imageWidth, imageHeight);
  } else {
    const placeholder = targetContext.createLinearGradient(0, 0, width, height);
    placeholder.addColorStop(0, "#161616");
    placeholder.addColorStop(.58, "#2b2725");
    placeholder.addColorStop(1, "#0d0d0d");
    targetContext.fillStyle = placeholder;
    targetContext.fillRect(0, 0, width, height);
    targetContext.fillStyle = "rgba(255,255,255,.36)";
    targetContext.font = `600 ${Math.round(width * .034)}px sans-serif`;
    targetContext.textAlign = "center";
    targetContext.fillText("上传照片后在这里预览", width / 2, height / 2);
  }

  drawShade(targetContext, width, height);
  drawText(targetContext, width, height);
  if (state.watermark && state.watermarkEnabled) drawWatermark(targetContext, width, height);
  if (includeGuide && state.safe && state.platform === "douyin") drawGuide(targetContext, width, height);
}

function drawShade(ctx, width, height) {
  const alpha = Math.max(0, Math.min(.9, state.shade / 100));
  let gradient;
  if (state.template.startsWith("bottom-")) {
    gradient = ctx.createLinearGradient(0, height * .35, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
  } else if (state.template.endsWith("-right")) {
    gradient = ctx.createLinearGradient(width * .18, 0, width, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
  } else if (state.template === "middle-center") {
    gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha * .3})`);
    gradient.addColorStop(.5, `rgba(0,0,0,${alpha * .12})`);
    gradient.addColorStop(1, `rgba(0,0,0,${alpha * .72})`);
  } else {
    gradient = ctx.createLinearGradient(0, 0, width * .82, 0);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gradient.addColorStop(.68, `rgba(0,0,0,${alpha * .36})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawText(ctx, width, height) {
  const right = state.template.endsWith("-right");
  const center = state.template.endsWith("-center");
  const align = right ? "right" : center ? "center" : "left";
  const geometryScale = width / 1080;
  const horizontalInset = DOUYIN_HOME_SAFE.horizontalInset * geometryScale;
  const x = right ? width - horizontalInset : center ? width / 2 : horizontalInset;
  const maxWidth = width - horizontalInset * 2;
  const baseFont = Math.round(width * .074 * state.textScale / 100);
  const lineGap = Math.round(baseFont * 1.32);
  ctx.save();
  ctx.textAlign = align;
  ctx.shadowColor = "rgba(0,0,0,.42)";
  ctx.shadowBlur = 16;
  const topFontSize = fitText(ctx, state.topText, baseFont, maxWidth);
  const bottomFontSize = fitText(ctx, state.bottomText, baseFont, maxWidth);
  const subtitleFontSize = Math.round(width * .03 * state.subtitleScale / 100);
  const hasBottomText = Boolean(state.bottomText.trim());
  const activeHeadlineFontSize = hasBottomText ? bottomFontSize : topFontSize;
  ctx.font = `900 ${topFontSize}px sans-serif`;
  const topHeadlineInk = measureInkBounds(ctx, state.topText || "国");
  ctx.font = `900 ${activeHeadlineFontSize}px sans-serif`;
  const activeHeadlineInk = measureInkBounds(ctx, state.bottomText || state.topText || "国");
  ctx.font = `500 ${subtitleFontSize}px sans-serif`;
  const subtitleInk = measureInkBounds(ctx, state.subtitle || "国");
  const opticalGap = Math.ceil(subtitleInk.ascent + subtitleInk.descent);
  const dividerThickness = Math.max(4, Math.round(activeHeadlineFontSize * .055));
  const relativeActiveBaseline = hasBottomText ? lineGap : 0;
  const relativeDividerY = Math.round(relativeActiveBaseline + activeHeadlineInk.descent + opticalGap);
  const relativeSubtitleBaseline = Math.round(relativeDividerY + dividerThickness + opticalGap + subtitleInk.ascent);
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.45);
  const subtitleLines = countWrappedLines(ctx, state.subtitle, maxWidth);
  const blockTop = -topHeadlineInk.ascent;
  const blockBottom = state.subtitle.trim()
    ? relativeSubtitleBaseline + (subtitleLines - 1) * subtitleLineHeight + subtitleInk.descent
    : state.divider
      ? relativeDividerY + dividerThickness
      : relativeActiveBaseline + activeHeadlineInk.descent;
  const isDouyinCanvas = height / width > 1.5;
  const cropTop = isDouyinCanvas ? DOUYIN_HOME_SAFE.cropTop * geometryScale : 0;
  const cropBottom = isDouyinCanvas ? DOUYIN_HOME_SAFE.cropBottom * geometryScale : height;
  const usableTop = cropTop + DOUYIN_HOME_SAFE.verticalInset * geometryScale;
  const playCountReserve = isDouyinCanvas ? DOUYIN_HOME_SAFE.playCountReserve * geometryScale : 0;
  const usableBottom = cropBottom - playCountReserve - DOUYIN_HOME_SAFE.verticalInset * geometryScale;
  const watermarkScale = state.watermark && state.watermarkEnabled
    ? Math.min(width / state.watermark.naturalWidth, height / state.watermark.naturalHeight) * state.watermarkScale / 100
    : 0;
  const watermarkTop = state.watermark && state.watermarkEnabled
    ? (height - state.watermark.naturalHeight * watermarkScale) / 2 + getWatermarkVisibleBounds(state.watermark).top * watermarkScale
    : Number.POSITIVE_INFINITY;
  const bottomTextLimit = Math.min(usableBottom, watermarkTop - opticalGap);
  const requestedY = state.template.startsWith("top-")
    ? usableTop - blockTop
    : state.template.startsWith("bottom-")
      ? bottomTextLimit - blockBottom
      : (cropTop + cropBottom) / 2 - blockTop;
  const y = Math.round(Math.max(usableTop - blockTop, Math.min(requestedY, usableBottom - blockBottom)));
  const secondBaseline = y + lineGap;
  const activeHeadlineBaseline = hasBottomText ? secondBaseline : y;
  const dividerY = y + relativeDividerY;
  const subtitleBaseline = y + relativeSubtitleBaseline;
  ctx.fillStyle = state.topColor;
  ctx.font = `900 ${topFontSize}px sans-serif`;
  ctx.fillText(state.topText || "上行标题", x, y, maxWidth);
  if (state.bottomText.trim()) {
    ctx.fillStyle = state.bottomColor;
    ctx.font = `900 ${bottomFontSize}px sans-serif`;
    ctx.fillText(state.bottomText, x, secondBaseline, maxWidth);
  }
  if (state.divider) {
    const dividerWidth = activeHeadlineFontSize;
    const dividerX = right ? x - dividerWidth : center ? x - dividerWidth / 2 : x;
    ctx.shadowBlur = 8;
    ctx.fillStyle = state.dividerColor;
    ctx.fillRect(Math.round(dividerX), dividerY, Math.round(dividerWidth), dividerThickness);
  }
  if (state.subtitle.trim()) {
    ctx.fillStyle = state.subtitleColor;
    ctx.font = `500 ${subtitleFontSize}px sans-serif`;
    const subtitleY = state.divider ? subtitleBaseline : activeHeadlineBaseline + activeHeadlineInk.descent + opticalGap + subtitleInk.ascent;
    drawWrapped(ctx, state.subtitle, x, subtitleY, maxWidth, subtitleLineHeight, align);
  }
  ctx.restore();
}

function fitText(ctx, text, start, maxWidth) {
  let size = start;
  while (size > start * .58) {
    ctx.font = `900 ${size}px sans-serif`;
    if (ctx.measureText(text || "标题").width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function measureInkBounds(ctx, text) {
  const characters = Array.from(text || "国");
  let ascent = 0;
  let descent = 0;
  characters.forEach((character) => {
    const metrics = ctx.measureText(character);
    ascent = Math.max(ascent, metrics.actualBoundingBoxAscent || 0);
    descent = Math.max(descent, metrics.actualBoundingBoxDescent || 0);
  });
  const fallbackSize = Number(ctx.font.match(/([\d.]+)px/)?.[1] || 16);
  return {
    ascent: ascent || fallbackSize * .78,
    descent: descent || fallbackSize * .22,
  };
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight, align) {
  const lines = [];
  let current = "";
  Array.from(text).forEach((character) => {
    const candidate = current + character;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = character;
    } else current = candidate;
  });
  if (current) lines.push(current);
  ctx.textAlign = align;
  lines.slice(0, 2).forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight, maxWidth));
}

function countWrappedLines(ctx, text, maxWidth) {
  if (!text.trim()) return 0;
  let lines = 1;
  let current = "";
  Array.from(text).forEach((character) => {
    const candidate = current + character;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines += 1;
      current = character;
    } else current = candidate;
  });
  return Math.min(lines, 2);
}

function drawWatermark(ctx, width, height) {
  // 保留透明 PNG 的完整原始画布，画布本身就是水印的定位基准。
  const baseScale = Math.min(width / state.watermark.naturalWidth, height / state.watermark.naturalHeight);
  const scale = baseScale * state.watermarkScale / 100;
  const drawWidth = state.watermark.naturalWidth * scale;
  const drawHeight = state.watermark.naturalHeight * scale;
  const bounds = getWatermarkVisibleBounds(state.watermark);
  const safeInset = DOUYIN_HOME_SAFE.horizontalInset * (width / 1080);
  const x = state.watermarkAlign === "left"
    ? safeInset - bounds.left * scale
    : state.watermarkAlign === "right"
      ? width - safeInset - bounds.right * scale
      : width / 2 - (bounds.left + bounds.right) / 2 * scale;
  const y = (height - drawHeight) / 2;
  ctx.save();
  ctx.globalAlpha = state.watermarkOpacity / 100;
  ctx.drawImage(state.watermark, x, y, drawWidth, drawHeight);
  ctx.restore();
}

const watermarkBoundsCache = new WeakMap();

function getWatermarkVisibleBounds(watermark) {
  const cached = watermarkBoundsCache.get(watermark);
  if (cached) return cached;
  const sampleWidth = Math.min(1600, watermark.naturalWidth);
  const sampleHeight = Math.max(1, Math.round(watermark.naturalHeight * sampleWidth / watermark.naturalWidth));
  const sample = document.createElement("canvas");
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const sampleContext = sample.getContext("2d", { willReadFrequently: true });
  if (!sampleContext) return { left: 0, right: watermark.naturalWidth, top: 0, bottom: watermark.naturalHeight };
  sampleContext.drawImage(watermark, 0, 0, sampleWidth, sampleHeight);
  const pixels = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
  let left = sampleWidth;
  let right = -1;
  let top = sampleHeight;
  let bottom = -1;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] <= 8) continue;
    const x = ((index - 3) / 4) % sampleWidth;
    const y = Math.floor(((index - 3) / 4) / sampleWidth);
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  const ratioX = watermark.naturalWidth / sampleWidth;
  const ratioY = watermark.naturalHeight / sampleHeight;
  const bounds = right < left
    ? { left: 0, right: watermark.naturalWidth, top: 0, bottom: watermark.naturalHeight }
    : { left: left * ratioX, right: (right + 1) * ratioX, top: top * ratioY, bottom: (bottom + 1) * ratioY };
  watermarkBoundsCache.set(watermark, bounds);
  return bounds;
}

function drawGuide(ctx, width, height) {
  const safeHeight = width / 3 * 4;
  const top = (height - safeHeight) / 2;
  ctx.save();
  ctx.setLineDash([18, 14]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(254,232,0,.92)";
  ctx.strokeRect(18, top, width - 36, safeHeight);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(254,232,0,.94)";
  ctx.font = `700 ${Math.round(width * .024)}px sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("主页 3:4 安全区（导出时自动隐藏）", width - 30, top + 38);
  const reserveTop = DOUYIN_HOME_SAFE.cropBottom - DOUYIN_HOME_SAFE.playCountReserve;
  ctx.fillStyle = "rgba(255,45,70,.12)";
  ctx.fillRect(18, reserveTop, width - 36, DOUYIN_HOME_SAFE.playCountReserve);
  ctx.setLineDash([12, 10]);
  ctx.strokeStyle = "rgba(255,80,96,.9)";
  ctx.beginPath();
  ctx.moveTo(18, reserveTop);
  ctx.lineTo(width - 18, reserveTop);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,110,120,.96)";
  ctx.textAlign = "left";
  ctx.fillText("播放量避让区 144px", 30, reserveTop + 38);
  ctx.restore();
}

function exportCover(format) {
  if (!state.image) return setStatus("请先上传一张照片");
  const output = document.createElement("canvas");
  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  draw(false, output);
  output.toBlob((blob) => {
    if (!blob) return setStatus("导出没有完成，请重新尝试");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const name = state.fileName.replace(/\.[^.]+$/, "") || "南铂封面";
    const current = preset();
    link.href = url;
    link.download = `${name}_${current.label}_${current.ratio.replace(":", "x")}.${format === "png" ? "png" : "jpg"}`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`已导出 ${current.width}×${current.height} ${format === "png" ? "PNG" : "JPG"}`);
  }, mimeType, format === "jpeg" ? .94 : undefined);
}

draw();
