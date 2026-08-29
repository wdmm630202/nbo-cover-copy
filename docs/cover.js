const ACCESS_KEY = "nbo_cover_access_until";
const SETTINGS_KEY = "nbo_cover_settings_v1";
const MEMORY_KEY_PREFIX = "nbo_cover_memory_";
const MEMORY_NAMES_KEY = "nbo_cover_memory_names";
const COPY_SYNC_KEY = "nbo-cover-copy-sync-v1";
const COPY_SYNC_CHANNEL = "nbo-cover-copy-sync-channel-v1";
const IMAGE_MESSAGE_TYPE = "NBO_COVER_IMAGE_READY";
const IMAGE_REQUEST_TYPE = "NBO_COVER_IMAGE_REQUEST";
const ACCESS_DAYS = 180;
const WATERMARK_VISIBLE_HEIGHT_AT_1080 = 32;
const WATERMARK_BOTTOM_GAP_AT_1080 = 36;
const getWatermarkVisibleHeight = (width) => Math.round(WATERMARK_VISIBLE_HEIGHT_AT_1080 * width / 1080);
const getWatermarkBottomGap = (width) => Math.round(WATERMARK_BOTTOM_GAP_AT_1080 * width / 1080);
const formatExportTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};
const constrainExportSize = (size, maxPixels, maxSide) => {
  const scale = Math.min(1, Math.sqrt(maxPixels / (size.width * size.height)), maxSide / size.width, maxSide / size.height);
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
};
const exportSizeCandidates = (size) => {
  const mobile = /iP(?:hone|ad|od)|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent));
  const limits = mobile
    ? [[8_000_000, 4096], [6_000_000, 4096], [4_000_000, 4096], [2_100_000, 4096]]
    : [[Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY], [24_000_000, 8192], [16_000_000, 8192], [10_000_000, 6144], [6_000_000, 4096]];
  const candidates = limits.map(([maxPixels, maxSide]) => constrainExportSize(size, maxPixels, maxSide));
  return candidates.filter((candidate, index) =>
    index === candidates.findIndex((item) => item.width === candidate.width && item.height === candidate.height));
};
const PRESETS = {
  douyin: { label: "抖音", ratio: "9:16", width: 1080, height: 1920, note: "竖屏封面，带居中 3:4 主页安全区" },
  xiaohongshu: { label: "小红书", ratio: "3:4", width: 1080, height: 1440, note: "适合图文与竖版内容封面" },
  shipinhao: { label: "视频号", ratio: "3:4", width: 1080, height: 1440, note: "竖版内容常用工作尺寸" },
};
const {
  drawComparisonEditorialOverlay,
  getComparisonEvidenceLayout,
  getComparisonExportError,
  getComparisonFadeStops,
  getComparisonOverlapWarning,
  getComparisonPhotoTransform,
  getAdjustmentPanelVisibility,
  getVisibleRetouchStrokes,
  normalizeComparisonPhotoAdjustments,
  resolvePhotoInteractionTargetFromPoint,
  resolveRetouchTarget,
  resolveRetouchTargetFromPoint,
} = window.NBOCompareLayout;
const state = {
  platform: "douyin",
  template: "middle-left",
  topText: "男人的",
  bottomText: "高级感",
  subtitle: "不被定义的自己",
  topColor: "#FFFFFF",
  bottomColor: "#FFFFFF",
  dividerColor: "#C9A77A",
  divider: true,
  subtitleColor: "#FFFFFF",
  subtitleScale: 100,
  brightness: 100,
  zoom: 100,
  offsetX: 0,
  offsetXRangeVersion: 2,
  offsetY: 0,
  rotation: 0,
  textScale: 100,
  bottomTextScale: 100,
  textScaleLinked: true,
  textStroke: 0,
  textShadow: 50,
  textShadowDefaultVersion: 1,
  titleScaleVersion: 3,
  shade: 0,
  bottomShade: 100,
  safe: true,
  compareEnabled: false,
  beforeZoom: 100,
  beforeOffsetX: 0,
  beforeOffsetY: 0,
  beforeRotation: 0,
  beforeBrightness: 100,
  beforeShade: 0,
  beforeBottomShade: 100,
  watermarkScale: 100,
  watermarkAlign: "left",
  watermarkOpacity: 50,
  watermarkEnabled: false,
  watermarkDefaultVersion: 1,
  image: null,
  beforeImage: null,
  watermark: null,
  fileName: "",
  beforeFileName: "",
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
const previewScratch = { shade: document.createElement("canvas"), stroke: document.createElement("canvas"), compare: document.createElement("canvas") };
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
const normalizeComparisonSettings = (value = {}) => {
  const adjustments = normalizeComparisonPhotoAdjustments({
    zoom: value.beforeZoom,
    offsetX: value.beforeOffsetX,
    offsetY: value.beforeOffsetY,
    rotation: value.beforeRotation,
    brightness: value.beforeBrightness,
    shade: value.beforeShade,
    bottomShade: value.beforeBottomShade,
  });
  return {
    compareEnabled: value.compareEnabled === true,
    beforeZoom: adjustments.zoom,
    beforeOffsetX: adjustments.offsetX,
    beforeOffsetY: adjustments.offsetY,
    beforeRotation: adjustments.rotation,
    beforeBrightness: adjustments.brightness,
    beforeShade: adjustments.shade,
    beforeBottomShade: adjustments.bottomShade,
  };
};
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
    const target = resolveRetouchTargetFromPoint(point, { width: canvas.width, height: canvas.height }, state.compareEnabled, Boolean(state.beforeImage));
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
  const target = resolvePhotoInteractionTargetFromPoint(point, { width: canvas.width, height: canvas.height }, state.compareEnabled, Boolean(state.beforeImage));
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
  const target = resolvePhotoInteractionTargetFromPoint(point, { width: canvas.width, height: canvas.height }, state.compareEnabled, Boolean(state.beforeImage));
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
  const target = resolvePhotoInteractionTargetFromPoint(point, { width: canvas.width, height: canvas.height }, state.compareEnabled, Boolean(state.beforeImage));
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
    if (Number(saved.watermarkScale) <= 42) saved.watermarkScale = 100;
    if (saved.bottomColor === "#FEE800") saved.bottomColor = "#FFFFFF";
    if (Number(saved.watermarkOpacity) === 92) saved.watermarkOpacity = 50;
    if (Number(saved.shade) === 62) saved.shade = 0;
    if (saved.watermarkDefaultVersion !== 1) {
      saved.watermarkEnabled = false;
      saved.watermarkDefaultVersion = 1;
    }
    if (Number(saved.titleScaleVersion ?? 0) < 2) {
      saved.textScale = Math.round(Number(saved.textScale || 100) / 1.8);
    }
    if (Number(saved.titleScaleVersion ?? 0) < 3) {
      saved.bottomTextScale = Number(saved.textScale || 100);
      saved.textScaleLinked = true;
      saved.titleScaleVersion = 3;
    }
    if (saved.textShadowDefaultVersion !== 1) {
      saved.textShadow = 50;
      saved.textShadowDefaultVersion = 1;
    }
    if (saved.offsetXRangeVersion !== 2) {
      const previousOffsetX = Number(saved.offsetX ?? (saved.offsetXRangeVersion === 1 ? 100 : 0));
      saved.offsetX = Math.max(-200, Math.min(200, saved.offsetXRangeVersion === 1 ? previousOffsetX - 100 : previousOffsetX));
      saved.offsetXRangeVersion = 2;
    }
    if (saved.bottomText === "藏在自然状态里") saved.bottomText = "藏在自然状态";
    saved.template = normalizeTemplate(saved.template);
    Object.assign(state, saved, normalizeComparisonSettings(saved), {
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
  const settings = { ...state };
  delete settings.image;
  delete settings.beforeImage;
  delete settings.watermark;
  delete settings.fileName;
  delete settings.beforeFileName;
  delete settings.watermarkName;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
  return PRESETS[state.platform];
}

function getBeforeImageFrame(canvasSize) {
  const { frame, imageInset } = getComparisonEvidenceLayout(canvasSize);
  const inset = Math.max(2, Math.round(imageInset * canvasSize.width / 1080));
  return {
    x: frame.x + inset,
    y: frame.y + inset,
    width: frame.width - inset * 2,
    height: frame.height - inset * 2,
    radius: Math.max(1, frame.radius - inset),
  };
}

function getBeforeOffsetLimits(beforeImage, frame, beforeZoom, beforeRotation = 0) {
  if (!beforeImage?.naturalWidth || !beforeImage.naturalHeight) return { x: 0, y: 0 };
  const transform = getComparisonPhotoTransform(
    { width: beforeImage.naturalWidth, height: beforeImage.naturalHeight },
    { x: 0, y: 0, width: frame.width, height: frame.height },
    { zoom: beforeZoom, rotation: beforeRotation },
  );
  const cosine = Math.abs(Math.cos(transform.rotationRadians));
  const sine = Math.abs(Math.sin(transform.rotationRadians));
  const drawWidth = transform.drawWidth * cosine + transform.drawHeight * sine;
  const drawHeight = transform.drawWidth * sine + transform.drawHeight * cosine;
  return {
    x: Math.min(100, Math.max(0, (drawWidth - frame.width) / 2 / frame.width * 100)),
    y: Math.min(100, Math.max(0, (drawHeight - frame.height) / 2 / frame.height * 100)),
  };
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
  $("#dividerToggle").checked = state.divider;
  $("#subtitleColor").value = state.subtitleColor;
  $("#subtitleScale").value = state.subtitleScale;
  $("#subtitleScaleValue").textContent = `${state.subtitleScale}%`;
  $("#safeToggle").checked = state.safe;
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
  $("#compareUploadPanel").hidden = !state.compareEnabled;
  const adjustmentPanels = getAdjustmentPanelVisibility(state.compareEnabled, adjustmentTarget);
  $("#adjustmentTarget").hidden = !adjustmentPanels.selector;
  $("#mainAdjustments").hidden = !adjustmentPanels.after;
  $("#beforeControls").hidden = !adjustmentPanels.before;
  $("#adjustmentTargetAfter").classList.toggle("active", adjustmentTarget === "after");
  $("#adjustmentTargetBefore").classList.toggle("active", adjustmentTarget === "before");
  $("#beforeUploadTitle").textContent = state.beforeImage ? "更换照片" : "请添加拍摄前素颜照";
  $("#beforeFileName").textContent = state.beforeFileName || "支持 JPG、PNG、WEBP";
  $(".controls").classList.toggle("compare-active", state.compareEnabled);
  $(".design").classList.toggle("compare-active", state.compareEnabled);
  const overlapWarning = getComparisonOverlapWarning(state.compareEnabled, state.template);
  $("#compareOverlapWarning").textContent = overlapWarning;
  $("#compareOverlapWarning").hidden = !overlapWarning;
  document.querySelectorAll("[data-platform]").forEach((button) => button.classList.toggle("active", button.dataset.platform === state.platform));
  document.querySelectorAll("[data-template]").forEach((button) => button.classList.toggle("active", button.dataset.template === state.template));
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
  $("#mobileTouchZone").classList.toggle("active", Boolean(state.image) && state.platform === "douyin" && !retouch.active);
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
["dragenter", "dragover"].forEach((name) => $("#uploadBox").addEventListener(name, (event) => {
  event.preventDefault();
  $("#uploadBox").classList.add("dragging");
}));
["dragleave", "drop"].forEach((name) => $("#uploadBox").addEventListener(name, (event) => {
  event.preventDefault();
  $("#uploadBox").classList.remove("dragging");
}));
$("#uploadBox").addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));
$("#beforeFileInput").addEventListener("change", (event) => {
  loadBeforeFile(event.target.files[0]);
  event.target.value = "";
});
$("#beforeUploadButton").addEventListener("click", () => $("#beforeFileInput").click());
["dragenter", "dragover"].forEach((name) => $("#beforeUploadBox").addEventListener(name, (event) => {
  event.preventDefault();
  $("#beforeUploadBox").classList.add("dragging");
}));
["dragleave", "drop"].forEach((name) => $("#beforeUploadBox").addEventListener(name, (event) => {
  event.preventDefault();
  $("#beforeUploadBox").classList.remove("dragging");
}));
$("#beforeUploadBox").addEventListener("drop", (event) => loadBeforeFile(event.dataTransfer.files[0]));

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
$("#dividerToggle").addEventListener("change", (event) => { state.divider = event.target.checked; saveSettings(); draw(); });
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
$("#safeToggle").addEventListener("change", (event) => { state.safe = event.target.checked; saveSettings(); draw(); });
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
  updateUi();
  saveSettings();
  draw();
  setStatus("拍摄前照片构图已恢复默认");
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
$("#factoryReset").addEventListener("click", async () => {
  if (!window.confirm("确定彻底重置吗？\n\n将清空本工具的照片、封面设置、记忆方案和同步记录，登录状态会保留。")) return;
  [SETTINGS_KEY, MEMORY_NAMES_KEY, COPY_SYNC_KEY, ...[1, 2, 3].map((slot) => `${MEMORY_KEY_PREFIX}${slot}`)]
    .forEach((key) => localStorage.removeItem(key));
  try {
    const keys = await window.caches?.keys();
    await Promise.all((keys || []).map((key) => window.caches.delete(key)));
  } catch {}
  window.location.replace(`${window.location.pathname}?reset=${Date.now()}`);
});
$("#resetSettings").addEventListener("click", () => {
  Object.assign(state, {
    platform: "douyin", template: "middle-left", topText: "男人的", bottomText: "高级感",
    subtitle: "不被定义的自己", topColor: "#FFFFFF", bottomColor: "#FFFFFF",
    dividerColor: "#C9A77A", divider: true, subtitleColor: "#FFFFFF", subtitleScale: 100, brightness: 100,
    zoom: 100, offsetX: 0, offsetXRangeVersion: 2, offsetY: 0, rotation: 0, textScale: 100, bottomTextScale: 100, textScaleLinked: true, textStroke: 0, textShadow: 50, textShadowDefaultVersion: 1, titleScaleVersion: 3, shade: 0, bottomShade: 100,
    safe: true, compareEnabled: false, beforeZoom: 100, beforeOffsetX: 0, beforeOffsetY: 0, beforeRotation: 0, beforeBrightness: 100, beforeShade: 0, beforeBottomShade: 100,
    watermarkScale: 100, watermarkAlign: "left", watermarkOpacity: 50, watermarkEnabled: false, watermarkDefaultVersion: 1,
  });
  retouch.active = false;
  retouch.strokes = [];
  retouch.beforeStrokes = [];
  retouch.target = "after";
  retouch.compareBefore = false;
  updateUi(); saveSettings(); draw(); setStatus("已恢复默认构图和颜色");
});
document.querySelectorAll("[data-save-memory]").forEach((button) => button.addEventListener("click", () => {
  const slot = button.dataset.saveMemory;
  const settings = { ...state };
  delete settings.image; delete settings.beforeImage; delete settings.watermark;
  delete settings.fileName; delete settings.beforeFileName; delete settings.watermarkName;
  localStorage.setItem(`${MEMORY_KEY_PREFIX}${slot}`, JSON.stringify(settings));
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
    if (Number(parsed.watermarkScale) <= 42) parsed.watermarkScale = 100;
    if (parsed.bottomColor === "#FEE800") parsed.bottomColor = "#FFFFFF";
    if (Number(parsed.watermarkOpacity) === 92) parsed.watermarkOpacity = 50;
    if (Number(parsed.titleScaleVersion ?? 0) < 2) {
      parsed.textScale = Math.round(Number(parsed.textScale || 100) / 1.8);
    }
    if (Number(parsed.titleScaleVersion ?? 0) < 3) {
      parsed.bottomTextScale = Number(parsed.textScale || 100);
      parsed.textScaleLinked = true;
      parsed.titleScaleVersion = 3;
    }
    if (parsed.textShadowDefaultVersion !== 1) {
      parsed.textShadow = 50;
      parsed.textShadowDefaultVersion = 1;
    }
    if (parsed.offsetXRangeVersion !== 2) {
      const previousOffsetX = Number(parsed.offsetX ?? (parsed.offsetXRangeVersion === 1 ? 100 : 0));
      parsed.offsetX = Math.max(-200, Math.min(200, parsed.offsetXRangeVersion === 1 ? previousOffsetX - 100 : previousOffsetX));
      parsed.offsetXRangeVersion = 2;
    }
    if (parsed.bottomText === "藏在自然状态里") parsed.bottomText = "藏在自然状态";
    parsed.template = normalizeTemplate(parsed.template);
    delete parsed.beforeImage;
    delete parsed.beforeFileName;
    Object.assign(state, parsed, normalizeComparisonSettings(parsed));
    clampBeforeOffsets();
    updateUi(); saveSettings(); draw(); setStatus(`已应用记忆点 ${slot}`);
  } catch {
    setStatus(`记忆点 ${slot} 读取失败，请重新保存`);
  }
}));
$("#platforms").addEventListener("click", (event) => {
  const button = event.target.closest("[data-platform]");
  if (!button) return;
  state.platform = button.dataset.platform;
  clampBeforeOffsets();
  updateUi();
  saveSettings();
  draw();
});
$("#templates").addEventListener("click", (event) => {
  const button = event.target.closest("[data-template]");
  if (!button) return;
  state.template = button.dataset.template;
  state.watermarkAlign = state.template.endsWith("-left") ? "left" : state.template.endsWith("-right") ? "right" : "center";
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

function roundedRectPath(ctx, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function applyComparisonFadeMask(ctx, frame) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  const horizontalMask = ctx.createLinearGradient(frame.x, 0, frame.x + frame.width, 0);
  const verticalMask = ctx.createLinearGradient(0, frame.y, 0, frame.y + frame.height);
  getComparisonFadeStops().forEach(([stop, alpha]) => {
    horizontalMask.addColorStop(stop, `rgba(255,255,255,${alpha})`);
    verticalMask.addColorStop(stop, `rgba(255,255,255,${alpha})`);
  });
  ctx.fillStyle = horizontalMask;
  ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  ctx.fillStyle = verticalMask;
  ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
  ctx.restore();
}

function drawComparisonEvidence(ctx, ownerCanvas, width, height, beforeRetouchStrokes) {
  const { frame } = getComparisonEvidenceLayout({ width, height });
  const imageFrame = getBeforeImageFrame({ width, height });

  if (!state.beforeImage) {
    ctx.save();
    roundedRectPath(ctx, imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, imageFrame.radius);
    ctx.clip();
    ctx.fillStyle = "rgba(28,28,28,.66)";
    ctx.fillRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
    ctx.fillStyle = "rgba(238,238,238,.86)";
    ctx.font = `600 ${Math.max(12, Math.round(width * .018))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("请添加拍摄前素颜照", frame.x + frame.width / 2, frame.y + frame.height / 2, frame.width * .82);
    ctx.restore();
    return;
  }

  const scratch = ownerCanvas === canvas ? previewScratch.compare : document.createElement("canvas");
  if (scratch.width !== width) scratch.width = width;
  if (scratch.height !== height) scratch.height = height;
  const scratchContext = scratch.getContext("2d");
  if (!scratchContext) return;
  scratchContext.clearRect(0, 0, width, height);
  scratchContext.save();
  roundedRectPath(scratchContext, imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, imageFrame.radius);
  scratchContext.clip();
  const offsetLimits = getBeforeOffsetLimits(state.beforeImage, imageFrame, state.beforeZoom, state.beforeRotation);
  const offsetX = clamp(state.beforeOffsetX, -offsetLimits.x, offsetLimits.x);
  const offsetY = clamp(state.beforeOffsetY, -offsetLimits.y, offsetLimits.y);
  const transform = getComparisonPhotoTransform(
    { width: state.beforeImage.naturalWidth, height: state.beforeImage.naturalHeight },
    imageFrame,
    {
      zoom: state.beforeZoom,
      offsetX,
      offsetY,
      rotation: state.beforeRotation,
    },
  );
  scratchContext.filter = `brightness(${state.beforeBrightness}%)`;
  scratchContext.translate(transform.centerX, transform.centerY);
  scratchContext.rotate(transform.rotationRadians);
  scratchContext.drawImage(state.beforeImage, -transform.drawWidth / 2, -transform.drawHeight / 2, transform.drawWidth, transform.drawHeight);
  scratchContext.setTransform(1, 0, 0, 1, 0, 0);
  scratchContext.filter = "none";
  scratchContext.restore();
  applyComparisonFadeMask(scratchContext, imageFrame);
  ctx.drawImage(scratch, 0, 0);

  if (state.beforeShade > 0 || state.beforeBottomShade > 0) {
    const shadeCanvas = ownerCanvas === canvas ? previewScratch.shade : document.createElement("canvas");
    const strokeCanvas = ownerCanvas === canvas ? previewScratch.stroke : document.createElement("canvas");
    if (shadeCanvas.width !== width) shadeCanvas.width = width;
    if (shadeCanvas.height !== height) shadeCanvas.height = height;
    if (strokeCanvas.width !== width) strokeCanvas.width = width;
    if (strokeCanvas.height !== height) strokeCanvas.height = height;
    const shadeContext = shadeCanvas.getContext("2d");
    if (!shadeContext) return;
    shadeContext.clearRect(0, 0, width, height);
    shadeContext.save();
    roundedRectPath(shadeContext, imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height, imageFrame.radius);
    shadeContext.clip();
    if (state.beforeShade > 0) {
      const shadeAlpha = clamp(state.beforeShade / 100, 0, .9);
      shadeContext.fillStyle = `rgba(0,0,0,${shadeAlpha})`;
      shadeContext.fillRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
    }
    if (state.beforeBottomShade > 0) {
      const bottomAlpha = clamp(state.beforeBottomShade / 100, 0, .9);
      const bottomGradient = shadeContext.createLinearGradient(0, imageFrame.y + imageFrame.height * .35, 0, imageFrame.y + imageFrame.height);
      bottomGradient.addColorStop(0, "rgba(0,0,0,0)");
      bottomGradient.addColorStop(1, `rgba(0,0,0,${bottomAlpha})`);
      shadeContext.fillStyle = bottomGradient;
      shadeContext.fillRect(imageFrame.x, imageFrame.y, imageFrame.width, imageFrame.height);
    }
    shadeContext.restore();
    eraseShadeWithBrush(shadeContext, strokeCanvas, width, height, beforeRetouchStrokes);
    applyComparisonFadeMask(shadeContext, imageFrame);
    ctx.drawImage(shadeCanvas, 0, 0);
    if (ownerCanvas !== canvas) {
      shadeCanvas.width = shadeCanvas.height = 1;
      strokeCanvas.width = strokeCanvas.height = 1;
    }
  }
  if (ownerCanvas !== canvas) scratch.width = scratch.height = 1;
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
  const targetContext = targetCanvas.getContext("2d");
  const current = preset();
  const lowPower = (navigator.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4;
  const previewWidth = Math.min(lowPower ? 420 : 540, current.width);
  const previewSize = { width: previewWidth, height: Math.round(previewWidth * current.height / current.width) };
  const { width, height } = outputSize || (targetCanvas === canvas ? previewSize : current);
  targetCanvas.width = width;
  targetCanvas.height = height;
  targetContext.fillStyle = "#151515";
  targetContext.fillRect(0, 0, width, height);

  if (state.image) {
    const radians = state.rotation * Math.PI / 180;
    const rotatedWidth = Math.abs(state.image.naturalWidth * Math.cos(radians)) + Math.abs(state.image.naturalHeight * Math.sin(radians));
    const rotatedHeight = Math.abs(state.image.naturalWidth * Math.sin(radians)) + Math.abs(state.image.naturalHeight * Math.cos(radians));
    const base = Math.max(width / rotatedWidth, height / rotatedHeight);
    const scale = base * state.zoom / 100;
    const imageWidth = state.image.naturalWidth * scale;
    const imageHeight = state.image.naturalHeight * scale;
    targetContext.save();
    targetContext.filter = `brightness(${state.brightness}%)`;
    targetContext.translate(width / 2 + state.offsetX / 100 * width, height / 2 + state.offsetY / 100 * height);
    targetContext.rotate(radians);
    targetContext.drawImage(state.image, -imageWidth / 2, -imageHeight / 2, imageWidth, imageHeight);
    targetContext.restore();
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

  if (!photoOnly) {
    const retouchTarget = activeRetouchTarget();
    const strokeGroups = { after: retouch.strokes, before: retouch.beforeStrokes };
    const visibleAfterStrokes = getVisibleRetouchStrokes(strokeGroups, "after", targetCanvas === canvas && retouch.compareBefore && retouchTarget === "after");
    const visibleBeforeStrokes = getVisibleRetouchStrokes(strokeGroups, "before", targetCanvas === canvas && retouch.compareBefore && retouchTarget === "before");
    if (visibleAfterStrokes.length) {
      const shadeCanvas = targetCanvas === canvas ? previewScratch.shade : document.createElement("canvas");
      const strokeCanvas = targetCanvas === canvas ? previewScratch.stroke : document.createElement("canvas");
      if (shadeCanvas.width !== width) shadeCanvas.width = width;
      if (shadeCanvas.height !== height) shadeCanvas.height = height;
      if (strokeCanvas.width !== width) strokeCanvas.width = width;
      if (strokeCanvas.height !== height) strokeCanvas.height = height;
      const shadeContext = shadeCanvas.getContext("2d");
      if (shadeContext) {
        shadeContext.clearRect(0, 0, width, height);
        drawShade(shadeContext, width, height);
        eraseShadeWithBrush(shadeContext, strokeCanvas, width, height, visibleAfterStrokes);
        targetContext.drawImage(shadeCanvas, 0, 0);
      }
    } else {
      drawShade(targetContext, width, height);
    }
    if (state.compareEnabled) drawComparisonEvidence(targetContext, targetCanvas, width, height, visibleBeforeStrokes);
    drawText(targetContext, width, height);
    if (state.compareEnabled) drawComparisonEditorialOverlay(targetContext, { width, height }, roundedRectPath);
    if (state.watermark && state.watermarkEnabled) drawWatermark(targetContext, width, height);
  }
  if (!photoOnly && includeGuide && state.safe && state.platform === "douyin") drawGuide(targetContext, width, height);
}

function eraseShadeWithBrush(ctx, strokeCanvas, width, height, strokes) {
  if (!strokes.length) return;
  const strokeContext = strokeCanvas.getContext("2d");
  if (!strokeContext) return;
  strokes.forEach((stroke) => {
    const radius = Math.max(1, stroke.size * width / 2160);
    const feather = clamp(stroke.feather / 100, 0, 1);
    const strength = clamp(stroke.strength / 100, 0, 1);
    const coreRadius = radius * (1 - feather * .92);
    const blurRadius = radius * feather * .58;
    if (!stroke.points.length) return;
    strokeContext.clearRect(0, 0, width, height);
    strokeContext.lineCap = "round";
    strokeContext.lineJoin = "round";
    strokeContext.lineWidth = Math.max(1, coreRadius * 2);
    strokeContext.strokeStyle = `rgba(255,255,255,${strength})`;
    strokeContext.fillStyle = `rgba(255,255,255,${strength})`;
    const first = stroke.points[0];
    strokeContext.beginPath();
    strokeContext.moveTo(first.x * width, first.y * height);
    if (stroke.points.length === 1) {
      strokeContext.arc(first.x * width, first.y * height, coreRadius, 0, Math.PI * 2);
      strokeContext.fill();
    } else {
      for (let index = 1; index < stroke.points.length - 1; index += 1) {
        const point = stroke.points[index];
        const next = stroke.points[index + 1];
        strokeContext.quadraticCurveTo(point.x * width, point.y * height, (point.x + next.x) / 2 * width, (point.y + next.y) / 2 * height);
      }
      const last = stroke.points[stroke.points.length - 1];
      strokeContext.lineTo(last.x * width, last.y * height);
      strokeContext.stroke();
    }
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.filter = `blur(${blurRadius}px)`;
    ctx.drawImage(strokeCanvas, 0, 0);
    ctx.restore();
  });
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
  if (state.bottomShade > 0) {
    const bottomAlpha = Math.max(0, Math.min(.9, state.bottomShade / 100));
    const bottomGradient = ctx.createLinearGradient(0, height * .35, 0, height);
    bottomGradient.addColorStop(0, "rgba(0,0,0,0)");
    bottomGradient.addColorStop(1, `rgba(0,0,0,${bottomAlpha})`);
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, 0, width, height);
  }
}

function colorWithAlpha(color, alpha) {
  const value = Number.parseInt(color.replace("#", ""), 16);
  return `rgba(${value >> 16},${(value >> 8) & 255},${value & 255},${alpha})`;
}

function drawText(ctx, width, height) {
  const right = state.template.endsWith("-right");
  const center = state.template.endsWith("-center");
  const align = right ? "right" : center ? "center" : "left";
  const geometryScale = width / 1080;
  const horizontalInset = DOUYIN_HOME_SAFE.horizontalInset * geometryScale;
  const x = right ? width - horizontalInset : center ? width / 2 : horizontalInset;
  const maxWidth = width - horizontalInset * 2;
  const topBaseFont = Math.max(1, Math.round(width * .074 * 2.1 * state.textScale / 100));
  const bottomBaseFont = Math.max(1, Math.round(width * .074 * 2.1 * state.bottomTextScale / 100));
  ctx.save();
  ctx.textAlign = align;
  const textStroke = Math.max(0, Math.min(1, state.textStroke / 100));
  const textShadow = Math.max(0, Math.min(1, state.textShadow / 100));
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(0,0,0,${.92 * textStroke})`;
  ctx.lineWidth = width * .012 * textStroke;
  ctx.shadowColor = `rgba(0,0,0,${.78 * textShadow})`;
  ctx.shadowBlur = width * .024 * textShadow;
  ctx.shadowOffsetX = width * .004 * textShadow;
  ctx.shadowOffsetY = width * .006 * textShadow;
  const hasBottomText = Boolean(state.bottomText.trim());
  const topFit = fitText(ctx, state.topText, topBaseFont, maxWidth);
  const bottomFit = hasBottomText ? fitText(ctx, state.bottomText, state.textScaleLinked ? topBaseFont : bottomBaseFont, maxWidth) : topFit;
  const linkedFontSize = Math.min(topFit, bottomFit);
  const topFontSize = state.textScaleLinked ? linkedFontSize : topFit;
  const bottomFontSize = state.textScaleLinked ? linkedFontSize : bottomFit;
  const subtitleFontSize = Math.round(width * .061 * state.subtitleScale / 100);
  const activeHeadlineFontSize = hasBottomText ? bottomFontSize : topFontSize;
  ctx.font = `900 ${topFontSize}px sans-serif`;
  const topHeadlineInk = measureInkBounds(ctx, state.topText || "国");
  ctx.font = `900 ${activeHeadlineFontSize}px sans-serif`;
  const activeHeadlineInk = measureInkBounds(ctx, state.bottomText || state.topText || "国");
  ctx.font = `400 ${subtitleFontSize}px sans-serif`;
  const subtitleInk = measureInkBounds(ctx, state.subtitle || "国");
  const fixedVerticalGap = getWatermarkVisibleHeight(width);
  const lineGap = Math.round(topHeadlineInk.descent + fixedVerticalGap + activeHeadlineInk.ascent);
  const dividerThickness = 4;
  const relativeActiveBaseline = hasBottomText ? lineGap : 0;
  const relativeDividerY = Math.round(relativeActiveBaseline + activeHeadlineInk.descent + fixedVerticalGap);
  const relativeSubtitleBaseline = Math.round(relativeDividerY + dividerThickness + fixedVerticalGap + subtitleInk.ascent);
  const subtitleLineHeight = Math.round(subtitleFontSize * 1.45);
  const subtitleLines = countWrappedLines(ctx, state.subtitle);
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
    ? getWatermarkVisibleHeight(width) / Math.max(1, getWatermarkVisibleBounds(state.watermark).bottom - getWatermarkVisibleBounds(state.watermark).top)
    : 0;
  const watermarkEdgeGap = getWatermarkBottomGap(width);
  const watermarkBottom = cropBottom - playCountReserve - watermarkEdgeGap;
  const watermarkTop = state.watermark && state.watermarkEnabled
    ? watermarkBottom - (getWatermarkVisibleBounds(state.watermark).bottom - getWatermarkVisibleBounds(state.watermark).top) * watermarkScale
    : Number.POSITIVE_INFINITY;
  const bottomTextLimit = Math.min(usableBottom, watermarkTop - fixedVerticalGap);
  const requestedY = state.template.startsWith("top-")
    ? usableTop - blockTop
    : state.template.startsWith("bottom-")
      ? bottomTextLimit - blockBottom
      : (cropTop + cropBottom) / 2 - blockTop;
  const y = Math.round(Math.max(usableTop - blockTop, Math.min(requestedY, bottomTextLimit - blockBottom)));
  const secondBaseline = y + lineGap;
  const activeHeadlineBaseline = hasBottomText ? secondBaseline : y;
  const dividerY = y + relativeDividerY;
  const subtitleBaseline = y + relativeSubtitleBaseline;
  ctx.fillStyle = state.topColor;
  ctx.font = `900 ${topFontSize}px sans-serif`;
  if (textStroke > 0) ctx.strokeText(state.topText || "上行标题", x, y, maxWidth);
  ctx.fillText(state.topText || "上行标题", x, y, maxWidth);
  if (state.bottomText.trim()) {
    ctx.fillStyle = state.bottomColor;
    ctx.font = `900 ${bottomFontSize}px sans-serif`;
    if (textStroke > 0) ctx.strokeText(state.bottomText, x, secondBaseline, maxWidth);
    ctx.fillText(state.bottomText, x, secondBaseline, maxWidth);
  }
  if (state.divider) {
    const dividerWidth = activeHeadlineFontSize;
    const dividerX = right ? x - dividerWidth : center ? x - dividerWidth / 2 : x;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    const dividerGradient = ctx.createLinearGradient(dividerX, 0, dividerX + dividerWidth, 0);
    dividerGradient.addColorStop(0, colorWithAlpha(state.dividerColor, 0));
    dividerGradient.addColorStop(.18, colorWithAlpha(state.dividerColor, 1));
    dividerGradient.addColorStop(.82, colorWithAlpha(state.dividerColor, 1));
    dividerGradient.addColorStop(1, colorWithAlpha(state.dividerColor, 0));
    ctx.fillStyle = dividerGradient;
    ctx.fillRect(Math.round(dividerX), dividerY, Math.round(dividerWidth), dividerThickness);
  }
  if (state.subtitle.trim()) {
    ctx.shadowColor = `rgba(0,0,0,${.78 * textShadow})`;
    ctx.shadowBlur = width * .024 * textShadow;
    ctx.shadowOffsetX = width * .004 * textShadow;
    ctx.shadowOffsetY = width * .006 * textShadow;
    ctx.fillStyle = state.subtitleColor;
    ctx.font = `400 ${subtitleFontSize}px sans-serif`;
    const subtitleY = state.divider ? subtitleBaseline : activeHeadlineBaseline + activeHeadlineInk.descent + fixedVerticalGap + subtitleInk.ascent;
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
  const characters = Array.from(text);
  const lines = Array.from({ length: Math.ceil(characters.length / 12) }, (_, index) =>
    characters.slice(index * 12, index * 12 + 12).join("")
  );
  ctx.textAlign = align;
  lines.slice(0, 2).forEach((line, index) => {
    const lineY = y + index * lineHeight;
    if (Array.from(line).length !== 12) {
      if (ctx.lineWidth > 0) ctx.strokeText(line, x, lineY, maxWidth);
      return ctx.fillText(line, x, lineY, maxWidth);
    }
    const left = align === "right" ? x - maxWidth : align === "center" ? x - maxWidth / 2 : x;
    const glyphs = Array.from(line).map((character) => ({ character, metrics: ctx.measureText(character) }));
    const widths = glyphs.map(({ metrics }) =>
      (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || metrics.width)
    );
    const gap = Math.max(0, (maxWidth - widths.reduce((sum, width) => sum + width, 0)) / 11);
    let cursor = left;
    ctx.textAlign = "left";
    glyphs.forEach(({ character, metrics }, glyphIndex) => {
      if (ctx.lineWidth > 0) ctx.strokeText(character, cursor + (metrics.actualBoundingBoxLeft || 0), lineY);
      ctx.fillText(character, cursor + (metrics.actualBoundingBoxLeft || 0), lineY);
      cursor += widths[glyphIndex] + gap;
    });
    ctx.textAlign = align;
  });
}

function countWrappedLines(ctx, text) {
  if (!text.trim()) return 0;
  return Math.min(Math.ceil(Array.from(text).length / 12), 2);
}

function drawWatermark(ctx, width, height) {
  // 保留透明 PNG 的完整原始画布，画布本身就是水印的定位基准。
  const bounds = getWatermarkVisibleBounds(state.watermark);
  const scale = getWatermarkVisibleHeight(width) / Math.max(1, bounds.bottom - bounds.top);
  const drawWidth = state.watermark.naturalWidth * scale;
  const drawHeight = state.watermark.naturalHeight * scale;
  const safeInset = DOUYIN_HOME_SAFE.horizontalInset * (width / 1080);
  const watermarkEdgeGap = getWatermarkBottomGap(width);
  const x = state.watermarkAlign === "left"
    ? safeInset - bounds.left * scale
    : state.watermarkAlign === "right"
      ? width - safeInset - bounds.right * scale
      : width / 2 - (bounds.left + bounds.right) / 2 * scale;
  const isDouyinCanvas = height / width > 1.5;
  const cropBottom = isDouyinCanvas ? DOUYIN_HOME_SAFE.cropBottom * (width / 1080) : height;
  const playCountReserve = isDouyinCanvas ? DOUYIN_HOME_SAFE.playCountReserve * (width / 1080) : 0;
  const y = cropBottom - playCountReserve - watermarkEdgeGap - bounds.bottom * scale;
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
  const guideScale = width / PRESETS.douyin.width;
  const safeHeight = width / 3 * 4;
  const top = (height - safeHeight) / 2;
  ctx.save();
  ctx.setLineDash([18 * guideScale, 14 * guideScale]);
  ctx.lineWidth = 4 * guideScale;
  ctx.strokeStyle = "rgba(254,232,0,.92)";
  ctx.strokeRect(18 * guideScale, top, width - 36 * guideScale, safeHeight);
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(254,232,0,.94)";
  ctx.font = `700 ${Math.round(width * .024)}px sans-serif`;
  ctx.textAlign = "right";
  ctx.fillText("主页 3:4 安全区（导出时自动隐藏）", width - 30 * guideScale, top + 38 * guideScale);
  const reserveTop = (DOUYIN_HOME_SAFE.cropBottom - DOUYIN_HOME_SAFE.playCountReserve) * guideScale;
  const reserveHeight = DOUYIN_HOME_SAFE.playCountReserve * guideScale;
  ctx.fillStyle = "rgba(255,45,70,.12)";
  ctx.fillRect(18 * guideScale, reserveTop, width - 36 * guideScale, reserveHeight);
  ctx.setLineDash([12 * guideScale, 10 * guideScale]);
  ctx.strokeStyle = "rgba(255,80,96,.9)";
  ctx.beginPath();
  ctx.moveTo(18 * guideScale, reserveTop);
  ctx.lineTo(width - 18 * guideScale, reserveTop);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,110,120,.96)";
  ctx.textAlign = "left";
  ctx.fillText("播放量避让区 144px", 30 * guideScale, reserveTop + 38 * guideScale);
  ctx.restore();
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
  const output = document.createElement("canvas");
  const mimeType = format === "png" ? "image/png" : "image/jpeg";
  const current = preset();
  const sourceRatio = state.image.naturalWidth / state.image.naturalHeight;
  const targetRatio = current.width / current.height;
  const originalOutputSize = sourceRatio >= targetRatio
    ? { width: Math.round(state.image.naturalHeight * targetRatio), height: state.image.naturalHeight }
    : { width: state.image.naturalWidth, height: Math.round(state.image.naturalWidth / targetRatio) };
  const toBlob = (quality) => new Promise((resolve) => {
    try {
      output.toBlob(resolve, mimeType, quality);
    } catch {
      resolve(null);
    }
  });
  const maxBytes = 19.9 * 1024 * 1024;
  let outputSize = originalOutputSize;
  let blob = null;
  for (const candidate of exportSizeCandidates(originalOutputSize)) {
    let quality = format === "jpeg" ? .98 : undefined;
    try {
      draw(false, output, candidate, photoOnly);
      blob = await toBlob(quality);
      if (generation !== exportGeneration) {
        output.width = output.height = 1;
        return null;
      }
      while (blob && blob.size > maxBytes && format === "jpeg" && quality > .56) {
        quality = Math.max(.56, quality - .07);
        blob = await toBlob(quality);
        if (generation !== exportGeneration) {
          output.width = output.height = 1;
          return null;
        }
      }
    } catch {
      blob = null;
    }
    if (blob && blob.size <= maxBytes) {
      outputSize = candidate;
      break;
    }
    blob = null;
    output.width = output.height = 1;
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (generation !== exportGeneration) return null;
  }
  if (!blob) {
    output.width = output.height = 1;
    return null;
  }
  if (generation !== exportGeneration) {
    output.width = output.height = 1;
    return null;
  }
  const name = state.fileName.replace(/\.[^.]+$/, "") || "南铂封面";
  const exportName = `${name}_${current.label}_${current.ratio.replace(":", "x")}.${format === "png" ? "png" : "jpg"}`;
  const asset = { blob, file: new File([blob], exportName, { type: blob.type }), outputSize };
  output.width = output.height = 1;
  return asset;
}

async function exportCover(format, photoOnly = false) {
  if (!state.image) return setStatus("请先上传一张照片");
  const comparisonError = getComparisonExportError(state.compareEnabled, Boolean(state.beforeImage));
  if (!photoOnly && comparisonError) return setStatus(comparisonError);
  const generation = exportGeneration;
  const cached = exportCache;
  let asset = photoOnly || cached.generation !== generation ? null : cached[format];
  if (photoOnly) {
    setStatus(`正在生成无文字、无水印的${format === "png" ? " PNG" : " JPG"}…`);
    try {
      asset = await buildExportAsset(format, true, generation);
    } catch {
      asset = null;
    }
    if (generation !== exportGeneration) return;
    if (!asset) return setStatus("当前照片像素较大，浏览器未能完成导出，请关闭其他页面后再点一次");
  } else if (!asset) {
    setExportReady(format, false);
    setStatus(`正在生成原图尺寸 ${format === "png" ? "PNG" : "JPG"}…`);
    try {
      asset = await buildExportAsset(format, false, generation);
    } catch {
      asset = null;
    }
    if (generation !== exportGeneration) return;
    exportCache = { ...exportCache, generation, [format]: asset };
    setExportReady(format, true);
    if (!asset) return setStatus("当前照片像素较大，浏览器未能完成导出，请关闭其他页面后再点一次");
  }
  if (generation !== exportGeneration) return;
  const current = preset();
  const name = state.fileName.replace(/\.[^.]+$/, "") || "南铂封面";
  const exportName = `${name}_${photoOnly ? "原图" : "设计"}_${current.label}_${current.ratio.replace(":", "x")}_${formatExportTimestamp()}.${format === "png" ? "png" : "jpg"}`;
  asset = { ...asset, file: new File([asset.blob], exportName, { type: asset.blob.type }) };
  const isMobile = /iP(?:hone|ad|od)|Android/i.test(navigator.userAgent);
  if (isMobile) {
    if (generation !== exportGeneration) return;
    showSavePreview(asset);
    try {
      if (typeof navigator.share !== "function") throw new Error("当前浏览器未开放系统分享");
      await navigator.share({ files: [asset.file], title: "南铂封面" });
      if (generation !== exportGeneration) return;
      setStatus("已打开手机分享面板，请点击“存储图像”保存到相册");
      return;
    } catch (error) {
      if (generation !== exportGeneration) return;
      return setStatus(error instanceof DOMException && error.name === "AbortError" ? "已取消系统分享，也可以长按成品图保存" : "系统分享未打开，请点击“打开手机分享”或长按成品图保存");
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
      return setStatus(`已保存高清图片 · ${(asset.blob.size / 1024 / 1024).toFixed(1)}MB`);
    } catch (error) {
      if (generation !== exportGeneration) return;
      if (error instanceof DOMException && error.name === "AbortError") return setStatus("已取消保存，可再次点击导出");
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
  $("#savePreview").hidden = false;
  document.body.style.overflow = "hidden";
  setStatus(`高清成品已生成 ${asset.outputSize.width}×${asset.outputSize.height}，请长按图片存储到照片`);
}

$("#closeSavePreview").addEventListener("click", clearSavePreview);
$("#openPreviewImage").addEventListener("click", async () => {
  if (!savePreviewAsset) return;
  try {
    if (typeof navigator.share !== "function") throw new Error("当前浏览器未开放系统分享");
    await navigator.share({ files: [savePreviewAsset.file], title: "南铂封面" });
    setStatus("已打开手机分享面板，请点击“存储图像”保存到相册");
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError") && savePreviewUrl) window.location.href = savePreviewUrl;
  }
});

draw();
