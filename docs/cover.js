const ACCESS_KEY = "nbo_cover_access_until";
const SETTINGS_KEY = "nbo_cover_settings_v1";
const MEMORY_KEY_PREFIX = "nbo_cover_memory_";
const MEMORY_NAMES_KEY = "nbo_cover_memory_names";
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
const {
  DEFAULT_COVER_SETTINGS,
  createCoverExportAsset,
  drawCover,
  drawCoverText,
  getExportFileName,
  getBeforeImageFrame,
  getBeforeOffsetLimits,
  normalizeCoverSettings,
  releaseCoverScratchCanvases,
  serializeStaticCoverSettings,
  updateCoverSetting,
} = window.NBOCoverCore;
const {
  getComparisonAlignmentPlan,
  getComparisonExportError,
  getComparisonOverlapWarning,
  getAdjustmentPanelVisibility,
  getVisibleRetouchStrokes,
  resolvePhotoInteractionTargetFromPoint,
  resolveRetouchTarget,
  resolveRetouchTargetFromPoint,
} = window.NBOCompareLayout;

function isMobileExportDevice() {
  return /iP(?:hone|ad|od)|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
}

function canShareExportFile(file) {
  if (typeof navigator.share !== "function") return false;
  return typeof navigator.canShare !== "function" || navigator.canShare({ files: [file] });
}
const {
  createImageDropController,
  getImageDropHint,
} = window.NBODropUpload;
const state = {
  ...DEFAULT_COVER_SETTINGS,
  image: null,
  beforeImage: null,
  watermark: null,
  fileName: "",
  beforeFileName: "",
  watermarkName: "",
};

const $ = (selector) => document.querySelector(selector);
const canvas = $("#coverCanvas");
const canvasShell = $("#canvasShell");
const previewTools = $("#previewTools");
const accessGate = $("#accessGate");
const coverPage = $("#coverPage");
let syncedCopy = null;
let syncedImage = null;
let defaultWatermark = null;
let exportGeneration = 0;
let exportCache = { generation: 0, jpeg: null, png: null };
let previewDrawFrame = 0;
let saveSettingsTimer = 0;
let imageInteraction = { rotationMode: false, drag: null };
let adjustmentTarget = "after";
const mobileGesture = { pointers: new Map(), holdTimer: 0, active: false, anchorId: null, holdOrigin: null, baseline: null };
const rotationSnapAngles = [-180, -90, 0, 90, 180];
let transformHintTimer = 0;

function snapRotation(value) {
  const nearest = rotationSnapAngles.reduce((best, angle) => Math.abs(angle - value) < Math.abs(best - value) ? angle : best);
  const snapped = Math.abs(nearest - value) <= 3;
  return { value: snapped ? nearest : value, guide: snapped ? (Math.abs(nearest) === 90 ? "vertical" : "horizontal") : "" };
}

function showTransformHint(text, guide = "") {
  const hud = $("#transformHud");
  hud.textContent = text;
  hud.classList.add("visible");
  $("#snapHorizontal").classList.toggle("visible", guide === "horizontal");
  $("#snapVertical").classList.toggle("visible", guide === "vertical");
  window.clearTimeout(transformHintTimer);
  transformHintTimer = window.setTimeout(() => {
    hud.classList.remove("visible");
    $("#snapHorizontal").classList.remove("visible");
    $("#snapVertical").classList.remove("visible");
  }, 650);
}
const retouch = {
  active: false,
  size: 120,
  feather: 70,
  strength: 100,
  strokes: [],
  beforeStrokes: [],
  target: "after",
  pointerId: null,
  pointerTarget: null,
  compareBefore: false,
};
const syncChannel = "BroadcastChannel" in window
  ? new BroadcastChannel(COPY_SYNC_CHANNEL)
  : null;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const isMobileTouch = (event) => event.pointerType === "touch" && window.matchMedia("(max-width: 780px) and (pointer: coarse)").matches;
const activeRetouchTarget = () => resolveRetouchTarget(retouch.target, state.compareEnabled, Boolean(state.beforeImage));
const activeRetouchStrokes = () => activeRetouchTarget() === "before" ? retouch.beforeStrokes : retouch.strokes;

function mobileGestureBaseline() {
  const points = [...mobileGesture.pointers.values()];
  if (!points.length) return (mobileGesture.baseline = null);
  if (points.length === 1) {
    mobileGesture.baseline = { mode: "move", x: points[0].x, y: points[0].y, offsetX: state.offsetX, offsetY: state.offsetY };
    return;
  }
  if (points.length === 2) {
    const [a, b] = points;
    mobileGesture.baseline = { mode: "rotate", angle: Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, rotation: state.rotation };
    return;
  }
  const [, a, b] = points;
  mobileGesture.baseline = { mode: "scaleMove", midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), offsetX: state.offsetX, offsetY: state.offsetY, zoom: state.zoom };
}

function syncMobileTransformControls() {
  [["zoom", state.zoom], ["offsetX", state.offsetX], ["offsetY", state.offsetY], ["rotation", state.rotation]].forEach(([id, value]) => { $(`#${id}`).value = value; });
  $("#zoomValue").value = state.zoom;
  $("#offsetXValue").value = state.offsetX;
  $("#offsetYValue").value = state.offsetY;
  $("#rotationValue").value = state.rotation;
}

const syncPreviewToolsWidth = () => {
  if (canvasShell && previewTools) previewTools.style.width = `${canvasShell.getBoundingClientRect().width}px`;
};
if (canvasShell && previewTools) {
  if ("ResizeObserver" in window) new ResizeObserver(syncPreviewToolsWidth).observe(canvasShell);
  window.addEventListener("resize", syncPreviewToolsWidth);
  window.requestAnimationFrame(syncPreviewToolsWidth);
}

canvas.addEventListener("pointerdown", (event) => {
  if (!state.image || event.button !== 0) return;
  if (retouch.active) {
    retouch.compareBefore = false;
    const rect = canvas.getBoundingClientRect();
    const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
    const target = resolveRetouchTargetFromPoint(point, { width: canvas.width, height: canvas.height }, state.compareEnabled, Boolean(state.beforeImage), state.beforeFrameScale);
    retouch.target = target;
    retouch.pointerId = event.pointerId;
    retouch.pointerTarget = target;
    const strokes = target === "before" ? retouch.beforeStrokes : retouch.strokes;
    strokes.push({
      points: [point],
      size: retouch.size,
      feather: retouch.feather,
      strength: retouch.strength,
    });
    canvas.setPointerCapture(event.pointerId);
    updateUi();
    setStatus(target === "before" ? "正在涂抹拍摄前照片" : "正在涂抹主照片");
    draw();
    return;
  }
  if (isMobileTouch(event)) return;
  const rect = canvas.getBoundingClientRect();
  const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  const target = resolvePhotoInteractionTargetFromPoint(point, { width: canvas.width, height: canvas.height }, state.compareEnabled, Boolean(state.beforeImage), state.beforeFrameScale);
  if (state.compareEnabled && adjustmentTarget !== target) { adjustmentTarget = target; updateUi(); }
  imageInteraction.drag = {
    pointerId: event.pointerId,
    target,
    x: event.clientX,
    y: event.clientY,
    offsetX: target === "before" ? state.beforeOffsetX : state.offsetX,
    offsetY: target === "before" ? state.beforeOffsetY : state.offsetY,
    rotation: target === "before" ? state.beforeRotation : state.rotation,
  };
  setStatus(imageInteraction.rotationMode
    ? target === "before" ? "正在旋转拍摄前照片" : "正在旋转主照片"
    : target === "before" ? "正在移动拍摄前照片" : "正在移动主照片");
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (retouch.active) {
    const rect = canvas.getBoundingClientRect();
    const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
    const cursor = $("#brushCursor");
    cursor.style.left = `${point.x * 100}%`;
    cursor.style.top = `${point.y * 100}%`;
    cursor.classList.add("visible");
  }
  if (retouch.pointerId === event.pointerId) {
    const rect = canvas.getBoundingClientRect();
    const strokes = retouch.pointerTarget === "before" ? retouch.beforeStrokes : retouch.strokes;
    strokes.at(-1)?.points.push({ x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) });
    draw();
    return;
  }
  if (isMobileTouch(event)) return;
  const drag = imageInteraction.drag;
  if (!state.image || !drag || drag.pointerId !== event.pointerId) return;
  const rect = canvas.getBoundingClientRect();
  const beforeFrame = getBeforeImageFrame({ width: canvas.width, height: canvas.height });
  const interactionWidth = drag.target === "before" ? rect.width * beforeFrame.width / canvas.width : rect.width;
  const interactionHeight = drag.target === "before" ? rect.height * beforeFrame.height / canvas.height : rect.height;
  if (imageInteraction.rotationMode) {
    const snapped = snapRotation(clamp(Math.round(drag.rotation + (event.clientX - drag.x) / interactionWidth * 180), -180, 180));
    if (drag.target === "before") {
      state.beforeRotation = snapped.value;
      clampBeforeOffsets();
      syncBeforeTransformControls();
      showTransformHint(`拍摄前 ${state.beforeRotation}°`, snapped.guide);
    } else {
      state.rotation = snapped.value;
      $("#rotation").value = state.rotation;
      $("#rotationValue").value = state.rotation;
      showTransformHint(`${state.rotation}°`, snapped.guide);
    }
  } else {
    if (drag.target === "before") {
      const limits = currentBeforeOffsetLimits();
      state.beforeOffsetX = clamp(Math.round(drag.offsetX + (event.clientX - drag.x) / interactionWidth * 100), -limits.x, limits.x);
      state.beforeOffsetY = clamp(Math.round(drag.offsetY + (event.clientY - drag.y) / interactionHeight * 100), -limits.y, limits.y);
      syncBeforeTransformControls();
    } else {
      state.offsetX = clamp(Math.round(drag.offsetX + (event.clientX - drag.x) / interactionWidth * 100), -200, 200);
      state.offsetY = clamp(Math.round(drag.offsetY + (event.clientY - drag.y) / interactionHeight * 100), -200, 200);
      $("#offsetX").value = state.offsetX;
      $("#offsetXValue").value = state.offsetX;
      $("#offsetY").value = state.offsetY;
      $("#offsetYValue").value = state.offsetY;
    }
  }
  saveSettings(); draw();
});

const endImageDrag = (event) => {
  if (retouch.pointerId === event.pointerId) {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    retouch.pointerId = null;
    retouch.pointerTarget = null;
    return;
  }
  const drag = imageInteraction.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  imageInteraction.drag = null;
};
canvas.addEventListener("pointerup", endImageDrag);
canvas.addEventListener("pointercancel", endImageDrag);
canvas.addEventListener("pointerleave", () => $("#brushCursor").classList.remove("visible"));

const mobileTouchZone = $("#mobileTouchZone");
mobileTouchZone.addEventListener("pointerdown", (event) => {
  if (!isMobileTouch(event) || !state.image || retouch.active) return;
  if (mobileGesture.pointers.size >= 3) return;
  mobileGesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (mobileGesture.pointers.size === 1) {
    mobileGesture.active = false;
    mobileGesture.anchorId = event.pointerId;
    mobileGesture.holdOrigin = { x: event.clientX, y: event.clientY };
    mobileGesture.baseline = null;
    window.clearTimeout(mobileGesture.holdTimer);
    mobileGesture.holdTimer = window.setTimeout(() => {
      if (mobileGesture.pointers.size !== 1 || mobileGesture.anchorId === null) return;
      mobileGesture.active = true;
      mobileTouchZone.classList.add("is-gesture-active");
      mobileTouchZone.setPointerCapture(mobileGesture.anchorId);
      mobileGestureBaseline();
      showTransformHint("已锁定照片");
    }, 220);
  } else if (mobileGesture.active) {
    event.preventDefault();
    mobileTouchZone.setPointerCapture(event.pointerId);
    mobileGestureBaseline();
  } else {
    window.clearTimeout(mobileGesture.holdTimer);
  }
});

mobileTouchZone.addEventListener("pointermove", (event) => {
  if (!mobileGesture.pointers.has(event.pointerId)) return;
  mobileGesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (!mobileGesture.active) {
    const origin = mobileGesture.holdOrigin;
    if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 8) window.clearTimeout(mobileGesture.holdTimer);
    return;
  }
  event.preventDefault();
  if (!mobileGesture.active || !mobileGesture.baseline) return;
  const rect = canvas.getBoundingClientRect();
  const points = [...mobileGesture.pointers.values()];
  const baseline = mobileGesture.baseline;
  if (points.length === 1 && baseline.mode === "move") {
    state.offsetX = clamp(Math.round(baseline.offsetX + (points[0].x - baseline.x) / rect.width * 100), -200, 200);
    state.offsetY = clamp(Math.round(baseline.offsetY + (points[0].y - baseline.y) / rect.height * 100), -200, 200);
    showTransformHint(`${state.offsetX}, ${state.offsetY}`);
  } else if (points.length === 2 && baseline.mode === "rotate") {
    const [a, b] = points;
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const angleDelta = ((angle - baseline.angle + 540) % 360) - 180;
    const snapped = snapRotation(clamp(Math.round(baseline.rotation + angleDelta), -180, 180));
    state.rotation = snapped.value;
    showTransformHint(`${state.rotation}°`, snapped.guide);
  } else if (points.length === 3 && baseline.mode === "scaleMove") {
    const [, a, b] = points;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const distance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    state.zoom = clamp(Math.round(baseline.zoom * distance / baseline.distance), 0, 400);
    state.offsetX = clamp(Math.round(baseline.offsetX + (midX - baseline.midX) / rect.width * 100), -200, 200);
    state.offsetY = clamp(Math.round(baseline.offsetY + (midY - baseline.midY) / rect.height * 100), -200, 200);
    showTransformHint(`${state.zoom}% · ${state.offsetX}, ${state.offsetY}`);
  } else {
    mobileGestureBaseline();
    return;
  }
  syncMobileTransformControls();
  saveSettings();
  draw();
});

const endMobileGesture = (event) => {
  if (!mobileGesture.pointers.has(event.pointerId)) return;
  mobileGesture.pointers.delete(event.pointerId);
  if (mobileTouchZone.hasPointerCapture(event.pointerId)) mobileTouchZone.releasePointerCapture(event.pointerId);
  if (event.pointerId === mobileGesture.anchorId && mobileGesture.pointers.size) {
    mobileGesture.active = false;
    mobileGesture.baseline = null;
    mobileTouchZone.classList.remove("is-gesture-active");
  } else if (mobileGesture.active && mobileGesture.pointers.size) mobileGestureBaseline();
  else if (!mobileGesture.pointers.size) {
    window.clearTimeout(mobileGesture.holdTimer);
    mobileGesture.active = false;
    mobileGesture.anchorId = null;
    mobileGesture.holdOrigin = null;
    mobileGesture.baseline = null;
    mobileTouchZone.classList.remove("is-gesture-active");
    saveSettings();
  }
};
mobileTouchZone.addEventListener("pointerup", endMobileGesture);
mobileTouchZone.addEventListener("pointercancel", endMobileGesture);
const stopNativeMobileTouch = (event) => {
  if (mobileGesture.active) event.preventDefault();
};
mobileTouchZone.addEventListener("touchstart", stopNativeMobileTouch, { passive: false });
mobileTouchZone.addEventListener("touchmove", stopNativeMobileTouch, { passive: false });

function exitAllMobileOperations() {
  if (!window.matchMedia("(max-width: 780px) and (pointer: coarse)").matches) return;
  window.clearTimeout(mobileGesture.holdTimer);
  mobileGesture.pointers.forEach((_point, pointerId) => {
    if (mobileTouchZone.hasPointerCapture(pointerId)) mobileTouchZone.releasePointerCapture(pointerId);
  });
  mobileGesture.pointers.clear();
  mobileGesture.active = false;
  mobileGesture.anchorId = null;
  mobileGesture.holdOrigin = null;
  mobileGesture.baseline = null;
  mobileTouchZone.classList.remove("is-gesture-active");
  if (retouch.pointerId !== null && canvas.hasPointerCapture(retouch.pointerId)) canvas.releasePointerCapture(retouch.pointerId);
  retouch.pointerId = null;
  retouch.pointerTarget = null;
  retouch.active = false;
  retouch.compareBefore = false;
  imageInteraction.rotationMode = false;
  imageInteraction.drag = null;
  $("#brushCursor").classList.remove("visible");
  updateUi();
  draw();
  setStatus("已退出全部操作，可正常浏览页面");
}

document.querySelector(".studio-header")?.addEventListener("click", exitAllMobileOperations);

canvas.addEventListener("wheel", (event) => {
  if (!state.image) return;
  if (retouch.active) return;
  event.preventDefault();
  const amount = clamp(-event.deltaY * .02, -2, 2);
  const rect = canvas.getBoundingClientRect();
  const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  const target = resolvePhotoInteractionTargetFromPoint(point, { width: canvas.width, height: canvas.height }, state.compareEnabled, Boolean(state.beforeImage), state.beforeFrameScale);
  if (state.compareEnabled && adjustmentTarget !== target) { adjustmentTarget = target; updateUi(); }
  if (target === "before") {
    state.beforeZoom = clamp(Math.round((state.beforeZoom + amount) * 10) / 10, 100, 300);
    clampBeforeOffsets();
    syncBeforeTransformControls();
    showTransformHint(`拍摄前 ${state.beforeZoom}%`);
  } else {
    state.zoom = clamp(Math.round((state.zoom + amount) * 10) / 10, 0, 400);
    $("#zoom").value = state.zoom;
    $("#zoomValue").value = state.zoom;
    showTransformHint(`${state.zoom}%`);
  }
  saveSettings(); draw();
}, { passive: false });

canvas.addEventListener("dblclick", (event) => {
  if (!state.image) return;
  if (retouch.active) return;
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const point = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  const target = resolvePhotoInteractionTargetFromPoint(point, { width: canvas.width, height: canvas.height }, state.compareEnabled, Boolean(state.beforeImage), state.beforeFrameScale);
  if (state.compareEnabled && adjustmentTarget !== target) { adjustmentTarget = target; updateUi(); }
  imageInteraction.rotationMode = !imageInteraction.rotationMode;
  $("#canvasShell").classList.toggle("is-rotating", imageInteraction.rotationMode);
  setStatus(imageInteraction.rotationMode
    ? `已进入${target === "before" ? "拍摄前照片" : "主照片"}旋转：按住左右拖动，双击退出`
    : "已退出旋转，可按住照片移动");
});

window.addEventListener("keydown", (event) => {
  if (!retouch.active || !event.metaKey) return;
  const smaller = event.code === "BracketLeft" || event.key === "[" || event.key === "【";
  const larger = event.code === "BracketRight" || event.key === "]" || event.key === "】";
  if (!smaller && !larger) return;
  event.preventDefault();
  retouch.size = clamp(retouch.size + (larger ? 10 : -10), 20, 400);
  $("#brushSize").value = retouch.size;
  updateUi();
});

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
    retouch.strokes = [];
    retouch.compareBefore = false;
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
    Object.assign(state, normalizeCoverSettings(saved), {
      image: null,
      beforeImage: null,
      watermark: null,
      fileName: "",
      beforeFileName: "",
      watermarkName: "",
    });
  }
} catch {
  $("#statusText").textContent = "已使用默认封面设置";
}

function saveSettings() {
  window.clearTimeout(saveSettingsTimer);
  saveSettingsTimer = window.setTimeout(writeSettings, 250);
}

function writeSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(serializeStaticCoverSettings(state)));
}

window.addEventListener("pagehide", () => {
  window.clearTimeout(saveSettingsTimer);
  writeSettings();
});

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
  return PRESETS[state.platformId];
}


function currentBeforeOffsetLimits(beforeZoom = state.beforeZoom) {
  const raw = getBeforeOffsetLimits(state.beforeImage, getBeforeImageFrame(preset()), beforeZoom, state.beforeRotation);
  return { x: Math.floor(raw.x), y: Math.floor(raw.y) };
}

function clampBeforeOffsets() {
  if (!state.beforeImage) return;
  const limits = currentBeforeOffsetLimits();
  state.beforeOffsetX = clamp(state.beforeOffsetX, -limits.x, limits.x);
  state.beforeOffsetY = clamp(state.beforeOffsetY, -limits.y, limits.y);
}

function syncBeforeTransformControls() {
  const limits = currentBeforeOffsetLimits();
  $("#beforeZoom").value = state.beforeZoom;
  $("#beforeZoomValue").value = state.beforeZoom;
  $("#beforeRotation").value = state.beforeRotation;
  $("#beforeRotationValue").value = state.beforeRotation;
  [["beforeOffsetX", state.beforeOffsetX, limits.x], ["beforeOffsetY", state.beforeOffsetY, limits.y]].forEach(([id, value, limit]) => {
    $(`#${id}`).min = -limit;
    $(`#${id}`).max = limit;
    $(`#${id}`).value = value;
    $(`#${id}Value`).min = -limit;
    $(`#${id}Value`).max = limit;
    $(`#${id}Value`).value = value;
  });
}

function updateUi() {
  $("#topText").value = state.topText;
  $("#bottomText").value = state.bottomText;
  $("#subtitle").value = state.subtitle;
  $("#topColor").value = state.topColor;
  $("#bottomColor").value = state.bottomColor;
  $("#dividerColor").value = state.dividerColor;
  $("#dividerToggle").checked = state.showDivider;
  $("#subtitleColor").value = state.subtitleColor;
  $("#subtitleScale").value = state.subtitleScale;
  $("#subtitleScaleValue").textContent = `${state.subtitleScale}%`;
  $("#safeToggle").checked = state.showSafeArea;
  $("#compareToggle").checked = state.compareEnabled;
  ["zoom", "offsetX", "offsetY", "beforeZoom", "beforeOffsetX", "beforeOffsetY", "beforeRotation", "beforeBrightness", "beforeShade", "beforeBottomShade", "rotation", "textScale", "bottomTextScale", "textStroke", "textShadow", "brightness", "shade", "bottomShade", "watermarkOpacity"].forEach((id) => {
    $(`#${id}`).value = state[id];
  });
  $("#zoomValue").value = state.zoom;
  $("#offsetXValue").value = state.offsetX;
  $("#offsetYValue").value = state.offsetY;
  const beforeOffsetLimits = currentBeforeOffsetLimits();
  const visibleBeforeOffsetX = clamp(state.beforeOffsetX, -beforeOffsetLimits.x, beforeOffsetLimits.x);
  const visibleBeforeOffsetY = clamp(state.beforeOffsetY, -beforeOffsetLimits.y, beforeOffsetLimits.y);
  $("#beforeZoomValue").value = state.beforeZoom;
  $("#beforeRotationValue").value = state.beforeRotation;
  $("#beforeBrightnessValue").value = state.beforeBrightness;
  $("#beforeShadeValue").value = state.beforeShade;
  $("#beforeBottomShadeValue").value = state.beforeBottomShade;
  [["beforeOffsetX", visibleBeforeOffsetX, beforeOffsetLimits.x], ["beforeOffsetY", visibleBeforeOffsetY, beforeOffsetLimits.y]].forEach(([id, value, limit]) => {
    $(`#${id}`).min = -limit;
    $(`#${id}`).max = limit;
    $(`#${id}`).value = value;
    $(`#${id}Value`).min = -limit;
    $(`#${id}Value`).max = limit;
    $(`#${id}Value`).value = value;
  });
  $("#rotationValue").value = state.rotation;
  $("#textScaleValue").value = state.textScale;
  $("#bottomTextScaleValue").value = state.bottomTextScale;
  $("#bottomTextScaleValue").disabled = state.textScaleLinked;
  $("#bottomTextScale").disabled = state.textScaleLinked;
  $("#textScaleLink").classList.toggle("active", state.textScaleLinked);
  $("#textScaleLink").setAttribute("aria-pressed", String(state.textScaleLinked));
  $("#textScaleLink").textContent = state.textScaleLinked ? "上下行大小联动" : "下行独立调整";
  $("#textStrokeValue").value = state.textStroke;
  $("#textShadowValue").value = state.textShadow;
  $("#brightnessValue").value = state.brightness;
  $("#shadeValue").value = state.shade;
  $("#bottomShadeValue").value = state.bottomShade;
  $("#watermarkOpacityValue").textContent = `${state.watermarkOpacity}%`;
  $("#uploadTitle").textContent = state.image ? "更换照片" : "上传照片";
  $("#fileName").textContent = state.fileName || "支持 JPG、PNG、WEBP";
  $("#compareUploadPanel").hidden = !state.compareEnabled;
  const adjustmentPanels = getAdjustmentPanelVisibility(state.compareEnabled, adjustmentTarget);
  $("#adjustmentTarget").hidden = !adjustmentPanels.selector;
  $("#mainAdjustments").hidden = !adjustmentPanels.after;
  $("#beforeControls").hidden = !adjustmentPanels.before;
  $("#adjustmentTargetAfter").classList.toggle("active", adjustmentTarget === "after");
  $("#adjustmentTargetBefore").classList.toggle("active", adjustmentTarget === "before");
  $("#beforeUploadTitle").textContent = state.beforeImage ? "更换照片" : "请添加拍摄前素颜照";
  $("#beforeFileName").textContent = state.beforeFileName || "支持 JPG、PNG、WEBP";
  $("#alignBeforeFrame").disabled = !state.beforeImage;
  $(".controls").classList.toggle("compare-active", state.compareEnabled);
  $(".design").classList.toggle("compare-active", state.compareEnabled);
  const overlapWarning = getComparisonOverlapWarning(state.compareEnabled, state.templateId);
  $("#compareOverlapWarning").textContent = overlapWarning;
  $("#compareOverlapWarning").hidden = !overlapWarning;
  document.querySelectorAll("[data-platform]").forEach((button) => button.classList.toggle("active", button.dataset.platform === state.platformId));
  document.querySelectorAll("[data-template]").forEach((button) => button.classList.toggle("active", button.dataset.template === state.templateId));
  document.querySelectorAll("[data-watermark-align]").forEach((button) => button.classList.toggle("active", button.dataset.watermarkAlign === state.watermarkAlign));
  $("#useWatermark").classList.toggle("active", state.watermarkEnabled);
  $("#disableWatermark").classList.toggle("active", !state.watermarkEnabled);
  const current = preset();
  $("#presetNote").textContent = `${current.width}×${current.height} · ${current.note}`;
  $("#previewRatio").textContent = `${current.label} · ${current.ratio}`;
  $("#canvasShell").className = `canvas-shell ratio-${current.ratio.replace(":", "-")}`;
  $("#canvasShell").classList.toggle("has-image", Boolean(state.image));
  $("#canvasShell").classList.toggle("is-rotating", imageInteraction.rotationMode);
  $("#canvasShell").classList.toggle("is-brushing", retouch.active);
  $("#mobileTouchZone").classList.toggle("active", Boolean(state.image) && state.platformId === "douyin" && !retouch.active);
  $("#retouchToggle").classList.toggle("active", retouch.active);
  $("#retouchToggle").textContent = retouch.active ? "退出涂抹" : "开启涂抹";
  const retouchTarget = activeRetouchTarget();
  const targetStrokes = activeRetouchStrokes();
  $("#retouchTarget").hidden = !(state.compareEnabled && state.beforeImage);
  $(".retouch-panel").classList.toggle("compare-retouch", Boolean(state.compareEnabled && state.beforeImage));
  $("#retouchTargetAfter").classList.toggle("active", retouchTarget === "after");
  $("#retouchTargetBefore").classList.toggle("active", retouchTarget === "before");
  $("#retouchNote").textContent = `落笔自动识别照片 · 当前管理：${retouchTarget === "before" ? "拍摄前照片" : "主照片"}`;
  $("#brushSizeValue").value = retouch.size;
  $("#brushFeatherValue").value = retouch.feather;
  $("#brushStrengthValue").value = retouch.strength;
  $("#undoRetouch").disabled = !targetStrokes.length;
  $("#clearRetouch").disabled = !targetStrokes.length;
  $("#compareBefore").disabled = !targetStrokes.length;
  $("#compareBefore").classList.toggle("active", retouch.compareBefore);
  $("#compareAfter").classList.toggle("active", !retouch.compareBefore);
  $("#brushCursor").style.width = `${retouch.size / 10.8}%`;
  if (!retouch.active) $("#brushCursor").classList.remove("visible");
}
updateUi();
loadDefaultWatermark();

$("#fileInput").addEventListener("change", (event) => loadFile(event.target.files[0]));
$("#beforeFileInput").addEventListener("change", (event) => {
  loadBeforeFile(event.target.files[0]);
  event.target.value = "";
});
$("#beforeUploadButton").addEventListener("click", () => $("#beforeFileInput").click());

function setImageDropActive(target, active) {
  const main = target === "main";
  const box = main ? $("#uploadBox") : $("#beforeUploadBox");
  box.classList.toggle("dragging", active);
  if (main) {
    $("#uploadTitle").textContent = active ? getImageDropHint("main") : state.image ? "更换照片" : "上传照片";
    $("#fileName").textContent = active ? "支持单张 JPG、PNG、WEBP" : state.fileName || "支持 JPG、PNG、WEBP";
    return;
  }
  $("#beforeUploadTitle").textContent = active ? getImageDropHint("before") : state.beforeImage ? "更换照片" : "请添加拍摄前素颜照";
  $("#beforeFileName").textContent = active ? "支持单张 JPG、PNG、WEBP" : state.beforeFileName || "支持 JPG、PNG、WEBP";
}

function bindImageDropZone(box, target, loadImage) {
  const controller = createImageDropController(target);
  box.addEventListener("dragenter", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setImageDropActive(target, controller.enter().active);
  });
  box.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  box.addEventListener("dragleave", (event) => {
    event.preventDefault();
    setImageDropActive(target, controller.leave().active);
  });
  box.addEventListener("drop", (event) => {
    event.preventDefault();
    const result = controller.drop(event.dataTransfer.files);
    setImageDropActive(target, result.active);
    if (!result.selection.ok) return setStatus(result.selection.message);
    loadImage(result.selection.file);
  });
}

bindImageDropZone($("#uploadBox"), "main", loadFile);
bindImageDropZone($("#beforeUploadBox"), "before", loadBeforeFile);

function loadFile(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setStatus("请选择 JPG、PNG 或 WEBP 图片");
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    state.image = image;
    retouch.strokes = [];
    retouch.compareBefore = false;
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

function loadBeforeFile(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setStatus("拍摄前照片请选择 JPG、PNG 或 WEBP 图片");
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    state.beforeImage = image;
    state.beforeFileName = file.name;
    retouch.beforeStrokes = [];
    retouch.compareBefore = false;
    clampBeforeOffsets();
    updateUi();
    setStatus("拍摄前素颜照已载入，可独立调整七项参数");
    URL.revokeObjectURL(url);
    draw();
  };
  image.onerror = () => {
    setStatus("这张拍摄前照片暂时无法读取，请更换一张");
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
$("#dividerToggle").addEventListener("change", (event) => {
  state.showDivider = event.target.checked;
  saveSettings(); draw();
});
["zoom", "offsetX", "offsetY", "beforeZoom", "beforeOffsetX", "beforeOffsetY", "beforeRotation", "beforeBrightness", "beforeShade", "beforeBottomShade", "rotation", "textScale", "bottomTextScale", "textStroke", "textShadow", "brightness", "shade", "bottomShade", "watermarkOpacity"].forEach((id) => {
  $(`#${id}`).addEventListener("input", (event) => {
    const rawValue = Number(event.target.value);
    if (id === "rotation") {
      const snapped = snapRotation(rawValue);
      state.rotation = snapped.value;
      showTransformHint(`${state.rotation}°`, snapped.guide);
    } else if (id === "beforeRotation") {
      const snapped = snapRotation(rawValue);
      state.beforeRotation = snapped.value;
      clampBeforeOffsets();
      showTransformHint(`拍摄前 ${state.beforeRotation}°`, snapped.guide);
    } else {
      if (id === "beforeOffsetX" || id === "beforeOffsetY") {
        const axis = id === "beforeOffsetX" ? "x" : "y";
        const limit = currentBeforeOffsetLimits()[axis];
        state[id] = clamp(rawValue, -limit, limit);
      } else {
        state[id] = rawValue;
      }
      if (id === "beforeZoom") clampBeforeOffsets();
      if (id === "textScale" && state.textScaleLinked) state.bottomTextScale = rawValue;
      if (id === "zoom") showTransformHint(`${state.zoom}%`);
    }
    updateUi();
    saveSettings();
    draw();
  });
});
$("#textScaleLink").addEventListener("click", () => {
  state.textScaleLinked = !state.textScaleLinked;
  if (state.textScaleLinked) state.bottomTextScale = state.textScale;
  updateUi();
  saveSettings();
  draw();
  setStatus(state.textScaleLinked ? "上下行标题大小已联动" : "下行标题大小可独立调整");
});
$("#retouchToggle").addEventListener("click", () => {
  retouch.active = !retouch.active;
  imageInteraction.rotationMode = false;
  updateUi();
  setStatus(retouch.active
    ? state.compareEnabled && state.beforeImage
      ? "已开启涂抹，落笔位置会自动识别主照片或拍摄前照片"
      : "已开启主照片涂抹，请在照片上按住绘制"
    : "已退出涂抹，可继续移动照片");
});
[["brushSize", "size"], ["brushFeather", "feather"], ["brushStrength", "strength"]].forEach(([id, key]) => {
  $(`#${id}`).addEventListener("input", (event) => {
    retouch[key] = Number(event.target.value);
    updateUi();
  });
});
const resetDefaults = {
  brushSize: 120,
  brushFeather: 70,
  brushStrength: 100,
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  beforeZoom: 100,
  beforeOffsetX: 0,
  beforeOffsetY: 0,
  beforeRotation: 0,
  beforeBrightness: 100,
  beforeShade: 0,
  beforeBottomShade: 100,
  rotation: 0,
  textScale: 100,
  bottomTextScale: 100,
  textStroke: 0,
  textShadow: 50,
  brightness: 100,
  shade: 0,
  bottomShade: 100,
};
const brushResetKeys = { brushSize: "size", brushFeather: "feather", brushStrength: "strength" };
document.querySelectorAll("[data-value-control]").forEach((input) => {
  input.addEventListener("focus", () => input.select());
  const commitExactValue = () => {
    const id = input.dataset.valueControl;
    if (!input.value.trim()) return updateUi();
    const value = Math.round(Number(input.value));
    if (!Number.isFinite(value)) return updateUi();
    const next = Math.max(Number(input.min), Math.min(Number(input.max), value));
    if (brushResetKeys[id]) {
      retouch[brushResetKeys[id]] = next;
    } else {
      if (id === "beforeOffsetX" || id === "beforeOffsetY") {
        const axis = id === "beforeOffsetX" ? "x" : "y";
        const limit = currentBeforeOffsetLimits()[axis];
        state[id] = clamp(next, -limit, limit);
      } else {
        state[id] = next;
      }
      if (id === "beforeZoom" || id === "beforeRotation") clampBeforeOffsets();
      if (id === "textScale" && state.textScaleLinked) state.bottomTextScale = next;
    }
    updateUi();
    saveSettings();
    draw();
    setStatus("已应用准确数值");
  };
  input.addEventListener("change", commitExactValue);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") input.blur();
  });
});
document.querySelectorAll("[data-reset-control]").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  const id = button.dataset.resetControl;
  if (!(id in resetDefaults)) return;
  if (brushResetKeys[id]) {
    retouch[brushResetKeys[id]] = resetDefaults[id];
  } else if (id === "bottomTextScale" && state.textScaleLinked) {
    state.textScale = resetDefaults.textScale;
    state.bottomTextScale = resetDefaults.bottomTextScale;
  } else {
    state[id] = resetDefaults[id];
    if (id === "beforeZoom" || id === "beforeRotation") clampBeforeOffsets();
    if (id === "textScale" && state.textScaleLinked) state.bottomTextScale = resetDefaults.bottomTextScale;
  }
  updateUi();
  saveSettings();
  draw();
  setStatus("这一项已恢复默认");
}));
$("#retouchTargetAfter").addEventListener("click", () => { retouch.target = "after"; retouch.compareBefore = false; updateUi(); draw(); setStatus("当前查看主照片的涂抹记录"); });
$("#retouchTargetBefore").addEventListener("click", () => { retouch.target = "before"; retouch.compareBefore = false; updateUi(); draw(); setStatus("当前查看拍摄前照片的涂抹记录"); });
$("#adjustmentTargetAfter").addEventListener("click", () => { adjustmentTarget = "after"; updateUi(); setStatus("当前显示主照片与文字构图控制"); });
$("#adjustmentTargetBefore").addEventListener("click", () => { adjustmentTarget = "before"; updateUi(); setStatus("当前显示拍摄前照片构图控制"); });
$("#compareBefore").addEventListener("click", () => { if (!activeRetouchStrokes().length) return; retouch.compareBefore = true; updateUi(); draw(); });
$("#compareAfter").addEventListener("click", () => { retouch.compareBefore = false; updateUi(); draw(); });
$("#undoRetouch").addEventListener("click", () => { retouch.compareBefore = false; activeRetouchStrokes().pop(); updateUi(); draw(); });
$("#clearRetouch").addEventListener("click", () => { retouch.compareBefore = false; if (activeRetouchTarget() === "before") retouch.beforeStrokes = []; else retouch.strokes = []; updateUi(); draw(); });
document.querySelectorAll("[data-watermark-align]").forEach((button) => button.addEventListener("click", () => {
  state.watermarkAlign = button.dataset.watermarkAlign;
  updateUi(); saveSettings(); draw();
}));
$("#safeToggle").addEventListener("change", (event) => {
  state.showSafeArea = event.target.checked;
  saveSettings(); draw();
});
$("#compareToggle").addEventListener("change", (event) => {
  state.compareEnabled = event.target.checked;
  updateUi();
  saveSettings();
  draw();
  setStatus(state.compareEnabled
    ? state.beforeImage
      ? "前后对比已开启，可继续调整拍摄前照片"
      : "请添加拍摄前素颜照"
    : "前后对比已关闭，拍摄前照片仍保留在当前浏览器内存中");
});
$("#resetBeforeControls").addEventListener("click", () => {
  state.beforeZoom = 100;
  state.beforeOffsetX = 0;
  state.beforeOffsetY = 0;
  state.beforeRotation = 0;
  state.beforeBrightness = 100;
  state.beforeShade = 0;
  state.beforeBottomShade = 100;
  state.beforeFrameScale = 100;
  updateUi();
  saveSettings();
  draw();
  setStatus("拍摄前照片构图已恢复默认");
});
$("#alignBeforeFrame").addEventListener("click", () => {
  if (!state.compareEnabled || !state.beforeImage) return setStatus("请先开启前后对比并添加拍摄前素颜照");
  const current = preset();
  const scratch = document.createElement("canvas");
  scratch.width = current.width;
  scratch.height = current.height;
  const context = scratch.getContext("2d");
  if (!context) return setStatus("暂时无法计算对齐，请刷新后重试");
  const textBounds = drawCoverText(
    context,
    state,
    current.width,
    current.height,
    state.watermarkEnabled ? state.watermark : null,
  );
  const plan = getComparisonAlignmentPlan(current, textBounds, { currentScale: state.beforeFrameScale });
  scratch.width = scratch.height = 1;
  if (!plan.ok) {
    return setStatus(plan.reason === "overlap"
      ? "文字与对比图间距不足，已保留原构图"
      : plan.reason === "too-large"
        ? "需要放大超过120%，已保留原构图"
        : "对齐需要缩小照片，已保留原构图");
  }
  state.beforeFrameScale = plan.scale;
  clampBeforeOffsets();
  updateUi();
  saveSettings();
  draw();
  setStatus("已与左侧文字顶部对齐");
});
$("#resetBeforeFrame").addEventListener("click", () => {
  state.beforeFrameScale = 100;
  clampBeforeOffsets();
  updateUi();
  saveSettings();
  draw();
  setStatus("已恢复对比图默认尺寸");
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
$("#factoryReset").addEventListener("click", () => {
  if (!window.confirm("确定彻底重置吗？\n\n将清空本工具的照片、封面设置、记忆方案和同步记录，登录状态会保留。")) return;
  [SETTINGS_KEY, MEMORY_NAMES_KEY, COPY_SYNC_KEY, ...[1, 2, 3].map((slot) => `${MEMORY_KEY_PREFIX}${slot}`)]
    .forEach((key) => localStorage.removeItem(key));
  window.location.replace(`${window.location.pathname}?reset=${Date.now()}`);
});
$("#resetSettings").addEventListener("click", () => {
  Object.assign(state, updateCoverSetting(
    DEFAULT_COVER_SETTINGS,
    "platformId",
    DEFAULT_COVER_SETTINGS.platformId,
  ));
  retouch.active = false;
  retouch.strokes = [];
  retouch.beforeStrokes = [];
  retouch.target = "after";
  retouch.compareBefore = false;
  updateUi(); saveSettings(); draw(); setStatus("已恢复默认构图和颜色");
});
document.querySelectorAll("[data-save-memory]").forEach((button) => button.addEventListener("click", () => {
  const slot = button.dataset.saveMemory;
  localStorage.setItem(`${MEMORY_KEY_PREFIX}${slot}`, JSON.stringify(serializeStaticCoverSettings(state)));
  setStatus(`已保存到记忆点 ${slot}`);
}));
function updateMemoryNames() {
  let names = ["记忆 1", "记忆 2", "记忆 3"];
  try {
    const saved = JSON.parse(localStorage.getItem(MEMORY_NAMES_KEY) || "null");
    if (Array.isArray(saved) && saved.length === 3) names = saved;
  } catch {}
  document.querySelectorAll("[data-memory-name]").forEach((label, index) => { label.textContent = names[index]; });
  return names;
}
document.querySelectorAll("[data-rename-memory]").forEach((button) => button.addEventListener("click", () => {
  const slot = Number(button.dataset.renameMemory);
  const names = updateMemoryNames();
  const name = window.prompt("输入记忆名称", names[slot - 1]);
  if (!name?.trim()) return;
  names[slot - 1] = name.trim().slice(0, 12);
  localStorage.setItem(MEMORY_NAMES_KEY, JSON.stringify(names));
  updateMemoryNames();
}));
updateMemoryNames();
document.querySelectorAll("[data-load-memory]").forEach((button) => button.addEventListener("click", () => {
  const slot = button.dataset.loadMemory;
  try {
    const saved = localStorage.getItem(`${MEMORY_KEY_PREFIX}${slot}`);
    if (!saved) return setStatus(`记忆点 ${slot} 还没有保存设置`);
    const parsed = JSON.parse(saved);
    delete parsed.beforeImage;
    delete parsed.beforeFileName;
    Object.assign(state, normalizeCoverSettings(parsed, "static-memory", state));
    clampBeforeOffsets();
    updateUi(); saveSettings(); draw(); setStatus(`已应用记忆点 ${slot}`);
  } catch {
    setStatus(`记忆点 ${slot} 读取失败，请重新保存`);
  }
}));
$("#platforms").addEventListener("click", (event) => {
  const button = event.target.closest("[data-platform]");
  if (!button) return;
  state.platformId = button.dataset.platform;
  clampBeforeOffsets();
  updateUi();
  saveSettings();
  draw();
});
$("#templates").addEventListener("click", (event) => {
  const button = event.target.closest("[data-template]");
  if (!button) return;
  state.templateId = button.dataset.template;
  state.watermarkAlign = state.templateId.endsWith("-left") ? "left" : state.templateId.endsWith("-right") ? "right" : "center";
  updateUi();
  saveSettings();
  draw();
});
$("#exportOriginalPng").addEventListener("click", () => exportCover("png", true));
$("#exportOriginalJpg").addEventListener("click", () => exportCover("jpeg", true));
$("#exportJpg").addEventListener("click", () => exportCover("jpeg"));
$("#exportPng").addEventListener("click", () => exportCover("png"));

function setStatus(message) {
  $("#statusText").textContent = message;
}

function setExportStatus(message) {
  setStatus(message);
  $("#exportFeedback").textContent = message;
}

function describeExportResolution(asset) {
  return asset.usedMobileFallback
    ? `原始像素超出当前手机可用内存，已采用可稳定导出的最高像素 ${asset.outputSize.width}×${asset.outputSize.height}`
    : `已保留原始裁切像素 ${asset.outputSize.width}×${asset.outputSize.height}`;
}

function draw(includeGuide = true, targetCanvas = canvas, outputSize = null, photoOnly = false) {
  if (targetCanvas === canvas && !outputSize) {
    scheduleExportPreparation();
    if (previewDrawFrame) return;
    previewDrawFrame = window.requestAnimationFrame(() => {
      previewDrawFrame = 0;
      drawNow(includeGuide, targetCanvas, outputSize, photoOnly);
    });
    return;
  }
  drawNow(includeGuide, targetCanvas, outputSize, photoOnly);
}

function drawNow(includeGuide = true, targetCanvas = canvas, outputSize = null, photoOnly = false) {
  const current = preset();
  const lowPower = (navigator.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4;
  const previewWidth = Math.min(lowPower ? 420 : 540, current.width);
  const previewSize = { width: previewWidth, height: Math.round(previewWidth * current.height / current.width) };
  const retouchTarget = activeRetouchTarget();
  const strokeGroups = { after: retouch.strokes, before: retouch.beforeStrokes };
  const isPreview = targetCanvas === canvas;
  const visibleAfterStrokes = photoOnly
    ? []
    : getVisibleRetouchStrokes(strokeGroups, "after", isPreview && retouch.compareBefore && retouchTarget === "after");
  const visibleBeforeStrokes = photoOnly
    ? []
    : getVisibleRetouchStrokes(strokeGroups, "before", isPreview && retouch.compareBefore && retouchTarget === "before");

  drawCover({
    canvas: targetCanvas,
    image: state.image,
    beforeImage: state.beforeImage,
    watermark: state.watermarkEnabled ? state.watermark : null,
    settings: state,
    preset: { id: state.platformId, ...current },
    includeGuide,
    outputSize: outputSize || (isPreview ? previewSize : current),
    photoOnly,
    retouchStrokes: visibleAfterStrokes,
    beforeRetouchStrokes: visibleBeforeStrokes,
  });
  if (!isPreview) releaseCoverScratchCanvases(targetCanvas);
}

function setExportReady(format, ready) {
  const button = format === "jpeg" ? $("#exportJpg") : $("#exportPng");
  button.disabled = Boolean(state.image) && !ready;
  button.textContent = state.image && !ready ? "准备中…" : format === "jpeg" ? "导出高清 JPG" : "导出 PNG";
}

function scheduleExportPreparation() {
  exportGeneration += 1;
  exportCache = { generation: exportGeneration, jpeg: null, png: null };
  clearSavePreview();
  setExportReady("jpeg", true);
  setExportReady("png", true);
}

async function buildExportAsset(format, photoOnly = false, generation = exportGeneration) {
  if (!state.image || generation !== exportGeneration) return null;
  const current = preset();
  return createCoverExportAsset({
    render: {
      image: state.image,
      beforeImage: state.beforeImage,
      watermark: state.watermarkEnabled ? state.watermark : null,
      settings: state,
      preset: { id: state.platformId, ...current },
      retouchStrokes: retouch.strokes,
      beforeRetouchStrokes: retouch.beforeStrokes,
    },
    format,
    photoOnly,
    mobile: isMobileExportDevice(),
    fileStem: state.fileName,
  });
}

async function exportCover(format, photoOnly = false) {
  if (!state.image) return setExportStatus("请先上传一张照片");
  const comparisonError = getComparisonExportError(state.compareEnabled, Boolean(state.beforeImage));
  if (!photoOnly && comparisonError) return setExportStatus(comparisonError);
  const generation = exportGeneration;
  const cached = exportCache;
  let asset = photoOnly || cached.generation !== generation ? null : cached[format];
  if (photoOnly) {
    setExportStatus(`正在生成无文字、无水印的${format === "png" ? " PNG" : " JPG"}…`);
    try {
      asset = await buildExportAsset(format, true, generation);
    } catch {
      asset = null;
    }
    if (generation !== exportGeneration) return;
    if (!asset) return setExportStatus(isMobileExportDevice()
      ? `手机仍无法生成这张${format === "png" ? " PNG" : " JPG"}，请关闭其他页面后再试${format === "jpeg" ? "，或改用 PNG" : ""}`
      : format === "jpeg"
        ? "无法在保留原始像素的同时把 JPG 控制在 19.9MB 内，请改用 PNG 导出"
        : "浏览器无法按原始像素导出，请关闭其他页面后再试");
  } else if (!asset) {
    setExportReady(format, false);
    setExportStatus(`正在尝试生成原始像素 ${format === "png" ? "PNG" : "JPG"}…`);
    try {
      asset = await buildExportAsset(format, false, generation);
    } catch {
      asset = null;
    }
    if (generation !== exportGeneration) return;
    exportCache = { ...exportCache, generation, [format]: asset };
    setExportReady(format, true);
    if (!asset) return setExportStatus(isMobileExportDevice()
      ? `手机仍无法生成这张${format === "png" ? " PNG" : " JPG"}，请关闭其他页面后再试${format === "jpeg" ? "，或改用 PNG" : ""}`
      : format === "jpeg"
        ? "无法在保留原始像素的同时把 JPG 控制在 19.9MB 内，请改用 PNG 导出"
        : "浏览器无法按原始像素导出，请关闭其他页面后再试");
  }
  if (generation !== exportGeneration) return;
  const current = preset();
  const exportName = getExportFileName(
    state.fileName,
    photoOnly ? "原图" : "设计",
    current.label,
    current.ratio,
    format,
  );
  asset = { ...asset, file: new File([asset.blob], exportName, { type: asset.blob.type }) };
  const isMobile = isMobileExportDevice();
  const resolutionMessage = describeExportResolution(asset);
  setExportStatus(`${resolutionMessage}，成品已生成`);
  if (isMobile) {
    if (generation !== exportGeneration) return;
    showSavePreview(asset);
    try {
      if (!canShareExportFile(asset.file)) throw new Error("当前浏览器未开放文件分享");
      await navigator.share({ files: [asset.file], title: "南铂封面" });
      if (generation !== exportGeneration) return;
      setExportStatus(`${resolutionMessage}；已打开手机分享面板，请点击“存储图像”`);
      return;
    } catch (error) {
      if (generation !== exportGeneration) return;
      return setExportStatus(error instanceof DOMException && error.name === "AbortError"
        ? `${resolutionMessage}；已取消系统分享，也可以长按成品图保存`
        : `${resolutionMessage}；请在成品预览里长按图片保存`);
    }
  }
  if (!isMobile && window.showSaveFilePicker) {
    try {
      if (generation !== exportGeneration) return;
      const handle = await window.showSaveFilePicker({
        suggestedName: asset.file.name,
        types: [{ description: format === "png" ? "PNG 图片" : "JPG 图片", accept: { [asset.blob.type]: [format === "png" ? ".png" : ".jpg"] } }],
      });
      if (generation !== exportGeneration) return;
      const writable = await handle.createWritable();
      if (generation !== exportGeneration) {
        await writable.abort?.();
        return;
      }
      await writable.write(asset.blob);
      if (generation !== exportGeneration) {
        await writable.abort?.();
        return;
      }
      await writable.close();
      if (generation !== exportGeneration) return;
      return setExportStatus(`已保存高清图片 · ${(asset.blob.size / 1024 / 1024).toFixed(1)}MB`);
    } catch (error) {
      if (generation !== exportGeneration) return;
      if (error instanceof DOMException && error.name === "AbortError") return setExportStatus("已取消保存，可再次点击导出");
    }
  }
  if (generation !== exportGeneration) return;
  showSavePreview(asset);
}

let savePreviewUrl = "";
let savePreviewAsset = null;
function clearSavePreview() {
  if (savePreviewUrl) URL.revokeObjectURL(savePreviewUrl);
  savePreviewUrl = "";
  savePreviewAsset = null;
  $("#savePreviewImage").removeAttribute("src");
  $("#savePreview").hidden = true;
  document.body.style.overflow = "";
}

function showSavePreview(asset) {
  if (savePreviewUrl) URL.revokeObjectURL(savePreviewUrl);
  savePreviewUrl = URL.createObjectURL(asset.blob);
  savePreviewAsset = asset;
  $("#savePreviewImage").src = savePreviewUrl;
  $("#savePreviewText").textContent = `${describeExportResolution(asset)}；请长按下面的图片，选择“存储到照片”`;
  $("#savePreview").hidden = false;
  document.body.style.overflow = "hidden";
  setExportStatus(`${describeExportResolution(asset)}，请长按图片存储到照片`);
}

$("#closeSavePreview").addEventListener("click", clearSavePreview);
$("#openPreviewImage").addEventListener("click", async () => {
  if (!savePreviewAsset) return;
  try {
    if (!canShareExportFile(savePreviewAsset.file)) throw new Error("当前浏览器未开放文件分享");
    await navigator.share({ files: [savePreviewAsset.file], title: "南铂封面" });
    setExportStatus("已打开手机分享面板，请点击“存储图像”保存到相册");
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError") && savePreviewUrl) window.location.href = savePreviewUrl;
  }
});

draw();
