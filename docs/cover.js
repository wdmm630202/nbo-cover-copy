const ACCESS_KEY = "nbo_cover_access_until";
const SETTINGS_KEY = "nbo_cover_settings_v1";
const COPY_SYNC_KEY = "nbo-cover-copy-sync-v1";
const COPY_SYNC_CHANNEL = "nbo-cover-copy-sync-channel-v1";
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
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  textScale: 100,
  shade: 62,
  safe: true,
  brand: true,
  image: null,
  fileName: "",
};

const $ = (selector) => document.querySelector(selector);
const canvas = $("#coverCanvas");
const accessGate = $("#accessGate");
const coverPage = $("#coverPage");
let syncedCopy = null;

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

function updateSyncUi() {
  const ready = Boolean(syncedCopy);
  $("#copySync").classList.toggle("ready", ready);
  $("#copySyncTitle").textContent = ready
    ? `${syncedCopy.topText} / ${syncedCopy.bottomText}`
    : "等待文案页方案";
  $("#copySyncTitle").title = ready
    ? `${syncedCopy.topText} / ${syncedCopy.bottomText}`
    : "";
  $("#copySyncDetail").textContent = ready
    ? `${syncedCopy.platform} · 方案 ${String(syncedCopy.selectionIndex + 1).padStart(2, "0")} · 不会覆盖照片与构图`
    : "识别完成并选择方案后，可同步两行封面文字";
  ["syncAllCopy", "syncTopCopy", "syncBottomCopy"].forEach((id) => {
    $(`#${id}`).disabled = !ready;
  });
}

function acceptSyncedCopy(value, live = false) {
  const next = normalizeSyncedCopy(value);
  if (!next) return;
  syncedCopy = next;
  updateSyncUi();
  if (live) setStatus("文案页有新方案，可按需同步到封面");
}

try {
  acceptSyncedCopy(JSON.parse(localStorage.getItem(COPY_SYNC_KEY) || "null"));
} catch {
  updateSyncUi();
}

window.addEventListener("storage", (event) => {
  if (event.key !== COPY_SYNC_KEY || !event.newValue) return;
  try {
    acceptSyncedCopy(JSON.parse(event.newValue), true);
  } catch {
    return;
  }
});

if ("BroadcastChannel" in window) {
  const syncChannel = new BroadcastChannel(COPY_SYNC_CHANNEL);
  syncChannel.addEventListener("message", (event) => acceptSyncedCopy(event.data, true));
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

$("#syncAllCopy").addEventListener("click", () => applySyncedCopy("all"));
$("#syncTopCopy").addEventListener("click", () => applySyncedCopy("topText"));
$("#syncBottomCopy").addEventListener("click", () => applySyncedCopy("bottomText"));

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
  if (saved) Object.assign(state, saved, { image: null, fileName: "" });
} catch {
  $("#statusText").textContent = "已使用默认封面设置";
}

function saveSettings() {
  const settings = { ...state };
  delete settings.image;
  delete settings.fileName;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function preset() {
  return PRESETS[state.platform];
}

function updateUi() {
  $("#topText").value = state.topText;
  $("#bottomText").value = state.bottomText;
  $("#subtitle").value = state.subtitle;
  $("#safeToggle").checked = state.safe;
  $("#brandToggle").checked = state.brand;
  ["zoom", "offsetX", "offsetY", "textScale", "shade"].forEach((id) => {
    $(`#${id}`).value = state[id];
  });
  $("#zoomValue").textContent = `${state.zoom}%`;
  $("#offsetXValue").textContent = state.offsetX;
  $("#offsetYValue").textContent = state.offsetY;
  $("#textScaleValue").textContent = `${state.textScale}%`;
  $("#shadeValue").textContent = `${state.shade}%`;
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
["zoom", "offsetX", "offsetY", "textScale", "shade"].forEach((id) => {
  $(`#${id}`).addEventListener("input", (event) => {
    state[id] = Number(event.target.value);
    updateUi();
    saveSettings();
    draw();
  });
});
$("#safeToggle").addEventListener("change", (event) => { state.safe = event.target.checked; saveSettings(); draw(); });
$("#brandToggle").addEventListener("change", (event) => { state.brand = event.target.checked; saveSettings(); draw(); });
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
  if (state.brand) drawBrand(targetContext, width, height);
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
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `900 ${fitText(ctx, state.topText, baseFont, maxWidth)}px sans-serif`;
  ctx.fillText(state.topText || "上行标题", x, y, maxWidth);
  ctx.fillStyle = "#FEE800";
  ctx.font = `900 ${fitText(ctx, state.bottomText, baseFont, maxWidth)}px sans-serif`;
  ctx.fillText(state.bottomText || "下行标题", x, y + lineGap, maxWidth);
  if (state.subtitle.trim()) {
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.font = `500 ${Math.round(width * .03)}px sans-serif`;
    drawWrapped(ctx, state.subtitle, x, y + lineGap + baseFont * .8, maxWidth, width * .044, align);
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

function drawBrand(ctx, width, height) {
  const right = state.template === "right";
  const x = right ? width * .92 : width * .08;
  ctx.save();
  ctx.textAlign = right ? "right" : "left";
  ctx.shadowColor = "rgba(0,0,0,.65)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#fff";
  ctx.font = `800 ${Math.round(width * .037)}px sans-serif`;
  ctx.fillText("南铂摄影", x, height * .9);
  ctx.font = `700 ${Math.round(width * .015)}px sans-serif`;
  ctx.fillText("NANBO  PHOTO", x, height * .925);
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
