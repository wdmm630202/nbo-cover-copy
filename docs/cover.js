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
  template: "left",
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
  watermarkScale: 22,
  watermarkOpacity: 92,
  image: null,
  watermark: null,
  fileName: "",
  watermarkName: "",
};

const $ = (selector) => document.querySelector(selector);
const canvas = $("#coverCanvas");
const accessGate = $("#accessGate");
const coverPage = $("#coverPage");
let syncedCopy = null;
let syncedImage = null;
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
  if (saved) Object.assign(state, saved, { image: null, watermark: null, fileName: "", watermarkName: "" });
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
  ["zoom", "offsetX", "offsetY", "textScale", "shade", "watermarkScale", "watermarkOpacity"].forEach((id) => {
    $(`#${id}`).value = state[id];
  });
  $("#zoomValue").textContent = `${state.zoom}%`;
  $("#offsetXValue").textContent = state.offsetX;
  $("#offsetYValue").textContent = state.offsetY;
  $("#textScaleValue").textContent = `${state.textScale}%`;
  $("#shadeValue").textContent = `${state.shade}%`;
  $("#watermarkScaleValue").textContent = `${state.watermarkScale}%`;
  $("#watermarkOpacityValue").textContent = `${state.watermarkOpacity}%`;
  document.querySelectorAll("[data-platform]").forEach((button) => button.classList.toggle("active", button.dataset.platform === state.platform));
  document.querySelectorAll("[data-template]").forEach((button) => button.classList.toggle("active", button.dataset.template === state.template));
  const current = preset();
  $("#presetNote").textContent = `${current.width}×${current.height} · ${current.note}`;
  $("#previewRatio").textContent = `${current.label} · ${current.ratio}`;
  $("#canvasShell").className = `canvas-shell ratio-${current.ratio.replace(":", "-")}`;
}
updateUi();

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
["zoom", "offsetX", "offsetY", "textScale", "shade", "watermarkScale", "watermarkOpacity"].forEach((id) => {
  $(`#${id}`).addEventListener("input", (event) => {
    state[id] = Number(event.target.value);
    updateUi();
    saveSettings();
    draw();
  });
});
$("#safeToggle").addEventListener("change", (event) => { state.safe = event.target.checked; saveSettings(); draw(); });
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
    $("#watermarkTitle").textContent = "更换透明水印";
    $("#watermarkName").textContent = file.name;
    $("#removeWatermark").hidden = false;
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
  state.watermark = null;
  state.watermarkName = "";
  $("#watermarkTitle").textContent = "上传透明 PNG 水印";
  $("#watermarkName").textContent = "不上传就不显示任何品牌字样";
  $("#removeWatermark").hidden = true;
  setStatus("水印已移除");
  draw();
});
$("#resetSettings").addEventListener("click", () => {
  Object.assign(state, {
    platform: "douyin", template: "left", topText: "男人的高级感", bottomText: "藏在自然状态里",
    subtitle: "不被定义的自己，才是最有张力的表达", topColor: "#FFFFFF", bottomColor: "#FEE800",
    dividerColor: "#C9A77A", divider: true, subtitleColor: "#FFFFFF", subtitleScale: 100,
    zoom: 100, offsetX: 0, offsetY: 0, textScale: 100, shade: 62,
    safe: true, watermarkScale: 22, watermarkOpacity: 92,
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
    Object.assign(state, JSON.parse(saved));
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
  if (state.watermark) drawWatermark(targetContext, width, height);
  if (includeGuide && state.safe && state.platform === "douyin") drawGuide(targetContext, width, height);
}

function drawShade(ctx, width, height) {
  const alpha = Math.max(0, Math.min(.9, state.shade / 100));
  let gradient;
  if (state.template === "bottom") {
    gradient = ctx.createLinearGradient(0, height * .35, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
  } else if (state.template === "right") {
    gradient = ctx.createLinearGradient(width * .18, 0, width, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
  } else if (state.template === "center") {
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
  const right = state.template === "right";
  const center = state.template === "center";
  const bottom = state.template === "bottom";
  const clean = state.template === "clean";
  const align = right ? "right" : center ? "center" : "left";
  const x = right ? width * .92 : center ? width * .5 : width * .08;
  const y = bottom ? height * .68 : center ? height * .58 : clean ? height * .18 : height * .24;
  const maxWidth = center ? width * .84 : width * .72;
  const baseFont = Math.round(width * .074 * state.textScale / 100);
  const lineGap = Math.round(baseFont * 1.32);
  ctx.save();
  ctx.textAlign = align;
  ctx.shadowColor = "rgba(0,0,0,.42)";
  ctx.shadowBlur = 16;
  if (state.template === "badge") {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#d7b98e";
    ctx.fillRect(width * .055, height * .035, width * .105, width * .105);
    ctx.fillStyle = "#fff";
    ctx.font = `500 ${Math.round(width * .034)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("03", width * .1075, height * .035 + width * .068);
    ctx.textAlign = align;
    ctx.shadowBlur = 16;
  }
  const topFontSize = fitText(ctx, state.topText, baseFont, maxWidth);
  const bottomFontSize = fitText(ctx, state.bottomText, baseFont, maxWidth);
  const subtitleFontSize = Math.round(width * .03 * state.subtitleScale / 100);
  const secondBaseline = y + lineGap;
  const hasBottomText = Boolean(state.bottomText.trim());
  const activeHeadlineBaseline = hasBottomText ? secondBaseline : y;
  const activeHeadlineFontSize = hasBottomText ? bottomFontSize : topFontSize;
  ctx.font = `900 ${activeHeadlineFontSize}px sans-serif`;
  const activeHeadlineInk = measureInkBounds(ctx, state.bottomText || state.topText || "国");
  ctx.font = `500 ${subtitleFontSize}px sans-serif`;
  const subtitleInk = measureInkBounds(ctx, state.subtitle || "国");
  const opticalGap = Math.ceil(subtitleInk.ascent + subtitleInk.descent);
  const dividerThickness = Math.max(4, Math.round(activeHeadlineFontSize * .055));
  const dividerY = Math.round(activeHeadlineBaseline + activeHeadlineInk.descent + opticalGap);
  const subtitleBaseline = Math.round(dividerY + dividerThickness + opticalGap + subtitleInk.ascent);
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
    drawWrapped(ctx, state.subtitle, x, subtitleY, maxWidth, subtitleFontSize * 1.45, align);
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

function drawWatermark(ctx, width, height) {
  const right = state.template === "right";
  const maxWidth = width * state.watermarkScale / 100;
  const scale = Math.min(maxWidth / state.watermark.naturalWidth, height * .1 / state.watermark.naturalHeight);
  const drawWidth = state.watermark.naturalWidth * scale;
  const drawHeight = state.watermark.naturalHeight * scale;
  const x = right ? width * .92 - drawWidth : width * .08;
  const y = height * .91 - drawHeight;
  ctx.save();
  ctx.globalAlpha = state.watermarkOpacity / 100;
  ctx.shadowColor = "rgba(0,0,0,.65)";
  ctx.shadowBlur = 10;
  ctx.drawImage(state.watermark, x, y, drawWidth, drawHeight);
  ctx.restore();
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
