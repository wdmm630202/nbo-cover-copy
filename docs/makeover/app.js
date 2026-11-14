import { POSTER, PHOTO_AREA, clampSplit, getPanes, getPhotoTransform, snapPhotoRotation, rotationFromDrag, inversePhotoPoint } from './geometry.mjs?v=20261112-cover-minimum';
import { drawPhotoEffects } from './photo-effects.mjs?v=20261112-photo-ops';
import { drawTintedMask } from './tint-mask.mjs?v=20261114-complete-mobile-export';
import { createMakeoverExportAsset, getMakeoverExportFileName, getMakeoverExportSize, isMobileMakeoverDevice } from './export.mjs?v=20261114-complete-mobile-export';

const embedded = new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window;
document.documentElement.classList.toggle('is-embedded', embedded);
const parentOrigin = location.origin === 'null' ? '*' : location.origin;
let nativeSave = false;
let saveSequence = 0;
let heightFrame = 0;
let lastHeight = 0;
const pendingSaves = new Map();

function reportHeight(force = false) {
  if (!embedded || heightFrame) return;
  heightFrame = requestAnimationFrame(() => {
    heightFrame = 0;
    const height = Math.ceil(document.body.getBoundingClientRect().height);
    if (!force && height === lastHeight) return;
    lastHeight = height;
    window.parent.postMessage({ type: 'NBO_MAKEOVER_HEIGHT', height }, parentOrigin);
  });
}

window.addEventListener('message', (event) => {
  if (!embedded || event.source !== window.parent || event.origin !== location.origin) return;
  const message = event.data;
  if (message?.type === 'NBO_MAKEOVER_HOST') nativeSave = message.nativeSave === true;
  if (message?.type === 'NBO_MAKEOVER_MEASURE') reportHeight(true);
  if (message?.type === 'NBO_MAKEOVER_SAVE_RESULT') {
    const pending = pendingSaves.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingSaves.delete(message.id);
    if (message.saved === true) pending.resolve();
    else pending.reject(new Error(typeof message.error === 'string' && /[\u3400-\u9fff]/.test(message.error) ? message.error.slice(0, 300) : '保存失败，请检查相册权限后重试。'));
  }
});

async function saveInApp(blob) {
  if (4 * Math.ceil(blob.size / 3) >= 90_000_000) throw new Error('图片较大，请改用 JPG 导出后重试。');
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('无法读取导出图片，请重试。'));
    reader.readAsDataURL(blob);
  });
  if (!data || data.length >= 90_000_000) throw new Error('图片较大，请改用 JPG 导出后重试。');
  const id = `makeover-${Date.now()}-${++saveSequence}`;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingSaves.delete(id);
      reject(new Error('保存响应超时，请先确认相册中是否已有成图。'));
    }, 60_000);
    pendingSaves.set(id, { resolve, reject, timeout });
    try {
      window.parent.postMessage({ type: 'NBO_MAKEOVER_SAVE', id, data }, parentOrigin);
    } catch {
      clearTimeout(timeout);
      pendingSaves.delete(id);
      reject(new Error('无法连接制作台保存功能，请重试。'));
    }
  });
}

const $ = (selector) => document.querySelector(selector);
if (!/^https?:$/.test(location.protocol)) $('#update-export').hidden = true;
const mobileExport = isMobileMakeoverDevice();
if (mobileExport) {
  $('#export-note').textContent = '原片像素分块导出 · PNG 无损 / JPG 最高质量';
  $('#export-png').textContent = '手机 PNG';
  $('#export-jpg').textContent = '手机 JPG';
}
const preview = $('#preview');
const previewContext = preview.getContext('2d');
// Keep desktop labels aligned with the fitted poster at every viewport size.
new ResizeObserver(([entry]) => {
  $('.preview-heading').style.setProperty('--poster-width', `${entry.contentRect.width}px`);
}).observe($('.poster-wrap'));
const names = ['素颜照片', '精修照片'];
const PHOTO_DEFAULTS = { zoom: 100, offsetX: 0, offsetY: 0, rotation: 0, brightness: 100, shade: 0, bottomShade: 0 };
const LIMITS = { zoom: [100, 400], offsetX: [-200, 200], offsetY: [-200, 200], rotation: [-180, 180], brightness: [0, 200], shade: [0, 100], bottomShade: [0, 100] };
const photos = names.map(() => ({ image: null, ...PHOTO_DEFAULTS, strokes: [], request: 0, loading: false }));
const brush = { active: false, size: 120, feather: 70, strength: 100, compareBefore: false };
const touches = new Map();
let pinch = null;
let rotationMode = false;
let currentTool = 'photos';
let selectedParameter = 'zoom';
let hintTimer = 0;
let previewFailed = false;
const numericOwners = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let template = null;
let templateGradient = null;
let templateGradientOpacity = 100;
let gradientColor = '#000000';
// Original PSD text raster, cropped without altering its 75% layer opacity.
const NOTE_BOUNDS = { x: 104, y: 299, width: 1076, height: 228 };
let noteTemplate = null;
let noteLayer = null;
let noteColor = '#000000';
let pickingColor = null;
let templateRequest = 0;
let split = .5;
let activeSide = 0;
let pointer = null;
let frame = 0;
let revision = 0;
let exporting = false;
let downloadURL = null;
let mobileSaveAsset = null;

function status(message, error = false) {
  $('#status').textContent = message;
  $('#status').classList.toggle('error', error);
}

function ready() {
  return Boolean(template && templateGradient && noteLayer && photos.every((photo) => photo.image && !photo.loading));
}

function updateButtons() {
  // Keep the controls and gesture baselines at the actual covered placement.
  getPanes(split).forEach((pane, side) => {
    const photo = photos[side];
    if (!photo.image) return;
    photo.zoom = clamp(photo.zoom, 100, 400);
    const transform = getPhotoTransform(pane, photo.image.naturalWidth, photo.image.naturalHeight, photo);
    photo.offsetX = pane.width > 0 ? (transform.centerX - pane.x - pane.width / 2) / pane.width * 100 : 0;
    photo.offsetY = pane.height > 0 ? (transform.centerY - pane.y - pane.height / 2) / pane.height * 100 : 0;
  });
  const photo = photos[activeSide];
  const unavailable = !photo.image || photo.loading;
  $('#export-png').disabled = $('#export-jpg').disabled = exporting || !ready();
  for (const key of Object.keys(PHOTO_DEFAULTS)) {
    const range = $('#adjust-' + key), number = $('#adjust-' + key + '-value');
    range.disabled = number.disabled = unavailable;
    range.value = Math.round(photo[key] * 10) / 10;
    if (document.activeElement !== number) number.value = Math.round(photo[key] * 10) / 10;
    $('[data-reset-setting="' + key + '"]').disabled = unavailable;
  }
  $('#adjust-templateGradient').disabled = $('#adjust-templateGradient-value').disabled = !template || !templateGradient;
  $('[data-reset-template-gradient]').disabled = !template || !templateGradient;
  document.querySelectorAll('[data-template-gradient-preset]').forEach(button => {
    button.disabled = !template || !templateGradient;
    button.setAttribute('aria-pressed', String(Number(button.dataset.templateGradientPreset) === templateGradientOpacity));
  });
  $('#adjust-templateGradient').value = templateGradientOpacity;
  if (document.activeElement !== $('#adjust-templateGradient-value')) $('#adjust-templateGradient-value').value = templateGradientOpacity;
  for (const [target, color, available] of [['note', noteColor, noteTemplate], ['gradient', gradientColor, templateGradient]]) {
    $('#' + target + '-color').value = color;
    $('#' + target + '-color-value').textContent = color.toUpperCase();
    $('#' + target + '-color').disabled = $('#' + target + '-pick').disabled = !available;
    document.querySelectorAll('[data-' + target + '-color]').forEach(button => {
      button.disabled = !available;
      button.setAttribute('aria-pressed', String(button.dataset[target + 'Color'] === color));
    });
    $('#' + target + '-pick').setAttribute('aria-pressed', String(pickingColor === target));
    $('#' + target + '-pick').textContent = pickingColor === target ? '完成吸色' : '吸色';
    $('#' + target + '-pick-help').hidden = pickingColor !== target;
  }
  $('.poster-wrap').classList.toggle('is-picking-color', Boolean(pickingColor));
  document.querySelectorAll('[data-photo-target]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.photoTarget) === activeSide)));
  document.querySelectorAll('button[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === currentTool)));
  document.querySelectorAll('.setting-row').forEach(row => row.classList.toggle('is-selected', row.dataset.setting === selectedParameter));
  $('#parameter-select').value = selectedParameter;
  $('#reset-photo').disabled = unavailable;
  $('#rotation-mode').disabled = unavailable;
  $('#rotation-mode').setAttribute('aria-pressed', String(rotationMode));
  $('#rotation-mode').textContent = rotationMode ? '退出旋转' : '进入旋转';
  $('#interaction-help').textContent = brush.active ? '正在涂抹 · Esc退出' : rotationMode ? '左右拖动旋转 · 双击退出' : '拖动移动 · 滚轮缩放 · 双击旋转';
  $('.poster-wrap').classList.toggle('is-rotating', rotationMode);
  $('.poster-wrap').classList.toggle('is-brushing', brush.active);
  $('#brush-toggle').disabled = unavailable;
  $('#brush-toggle').setAttribute('aria-pressed', String(brush.active));
  $('#brush-toggle').textContent = brush.active ? '退出涂抹' : '开启涂抹';
  for (const key of ['size', 'feather', 'strength']) {
    const range = $('#brush-' + key), number = $('#brush-' + key + '-value');
    range.disabled = number.disabled = unavailable;
    range.value = brush[key];
    if (document.activeElement !== number) number.value = brush[key];
    $('[data-reset-brush="' + key + '"]').disabled = unavailable;
  }
  for (const id of ['brush-before', 'brush-after', 'brush-undo', 'brush-clear']) $('#' + id).disabled = unavailable || photo.strokes.length === 0;
  $('#brush-before').setAttribute('aria-pressed', String(brush.compareBefore));
  $('#brush-after').setAttribute('aria-pressed', String(!brush.compareBefore));
  $('#brush-hint').textContent = photo.shade === 0 && photo.bottomShade === 0
    ? '当前未叠加额外压暗。先在“画面”调高压暗，再涂抹提亮；涂抹不影响模板渐变。'
    : '涂抹只擦除当前照片的额外压暗，笔迹跟随照片移动；涂抹不影响模板渐变。';
}

function setTool(tool) {
  pickingColor = null;
  currentTool = tool;
  $('.workspace').dataset.tool = tool;
  if (tool === 'compose' && ['brightness', 'shade', 'bottomShade', 'templateGradient', 'gradientColor', 'noteColor'].includes(selectedParameter)) selectedParameter = 'zoom';
  if (tool === 'tone' && !['brightness', 'shade', 'bottomShade', 'templateGradient', 'gradientColor', 'noteColor'].includes(selectedParameter)) selectedParameter = 'brightness';
  if (tool === 'brush') $('.brush-settings').open = true;
  else { brush.active = false; brush.compareBefore = false; $('#brush-cursor').classList.remove('visible'); }
  updateButtons();
  renderSoon();
}

function setParameter(key, raw, snap = false, owner = { side: activeSide, request: photos[activeSide].request }) {
  const photo = photos[owner.side];
  if (!photo.image || photo.loading || photo.request !== owner.request) return;
  stopGesture();
  let value = Number(raw);
  if (!Number.isFinite(value)) value = photo[key];
  value = Math.round(clamp(value, ...LIMITS[key]) * 10) / 10;
  if (key === 'rotation' && snap) {
    const result = snapPhotoRotation(value);
    value = result.value;
    showHint(value + '°', result.guide);
  }
  photo[key] = value;
  brush.compareBefore = false;
  updateButtons();
  $('#adjust-' + key + '-value').value = Math.round(photos[activeSide][key] * 10) / 10;
  edited();
}

function showHint(text, guide = '') {
  $('#transform-hud').textContent = text;
  $('#transform-hud').classList.add('visible');
  const pane = getPanes(split, preview.width)[activeSide];
  $('#snap-horizontal').style.top = (pane.y + pane.height / 2) / POSTER.height * 100 + '%';
  $('#snap-horizontal').style.left = pane.x / POSTER.width * 100 + '%';
  $('#snap-horizontal').style.width = pane.width / POSTER.width * 100 + '%';
  $('#snap-vertical').style.left = (pane.x + pane.width / 2) / POSTER.width * 100 + '%';
  $('#snap-horizontal').classList.toggle('visible', guide === 'horizontal');
  $('#snap-vertical').classList.toggle('visible', guide === 'vertical');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    for (const id of ['transform-hud', 'snap-horizontal', 'snap-vertical']) $('#' + id).classList.remove('visible');
  }, 650);
}

function stopGesture() {
  const ids = new Set([...touches.keys(), ...(pointer ? [pointer.id] : [])]);
  pointer = null; pinch = null; touches.clear();
  for (const id of ids) {
    for (const target of [preview, $('#divider')]) if (target.hasPointerCapture(id)) target.releasePointerCapture(id);
  }
}

function toggleRotation() {
  stopGesture();
  pickingColor = null;
  brush.active = false;
  brush.compareBefore = false;
  $('#brush-cursor').classList.remove('visible');
  rotationMode = !rotationMode;
  updateButtons();
  renderSoon();
  status(rotationMode ? '已进入旋转：按住照片左右拖动，双击退出。' : '已退出旋转，可按住照片移动。');
}

function readyStatus() {
  if (!template) {
    if (!$('#retry-template').hidden) status('内置模板读取失败，请点击重新加载模板。若仍失败，请更新制作台后重试。', true);
    return;
  }
  if (photos.some((photo) => photo.loading)) {
    status('正在读取照片…');
    return;
  }
  if (ready()) status('两张照片已就绪，可以导出。');
  else status(`请选择${photos.map((photo, side) => !photo.image ? names[side] : '').filter(Boolean).join('和')}。`);
}

let shareFile = null;
function clearDownload() {
  shareFile = null;
  $('#share-image').hidden = true;
  mobileSaveAsset = null;
  $('#mobile-save-preview').hidden = true;
  $('#mobile-save-image').removeAttribute('src');
  $('.workspace').inert = false;
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL = null;
  $('#download-result').hidden = true;
  $('#download-link').removeAttribute('href');
  $('#open-image').removeAttribute('href');
}

function canShareFile(file) {
  try {
    return typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare({ files: [file] }));
  } catch { return false; }
}

function showMobileSave(asset, fileName) {
  const file = new File([asset.blob], fileName, { type: asset.blob.type });
  mobileSaveAsset = { file, revision, width: asset.width, height: asset.height };
  $('#mobile-save-image').src = downloadURL;
  $('#mobile-save-note').textContent = `${asset.width} × ${asset.height} 像素${asset.resized ? '（手机兼容尺寸）' : ''}。长按成品图片，选择“存储到照片”，或点击下方按钮。`;
  $('#mobile-share').hidden = !canShareFile(file);
  $('#mobile-share').disabled = false;
  $('#mobile-save-preview').hidden = false;
  $('.workspace').inert = true;
  $('#mobile-save-close').focus({ preventScroll: true });
}

function mobileSaveDetails(asset) {
  return `${asset.width} × ${asset.height} 像素。`;
}

$('#mobile-save-close').addEventListener('click', () => {
  clearDownload();
  $('#export-jpg').focus({ preventScroll: true });
});
$('#mobile-share').addEventListener('click', async () => {
  const asset = mobileSaveAsset;
  if (!asset || asset.revision !== revision) return;
  $('#mobile-share').disabled = true;
  try {
    // This second, explicit tap supplies a fresh user gesture after image encoding.
    await navigator.share({ files: [asset.file], title: '南铂素人改造' });
    if (mobileSaveAsset === asset) $('#mobile-save-note').textContent = mobileSaveDetails(asset) + '分享流程已结束。也可长按成品图片，选择“存储到照片”。';
  } catch (error) {
    if (mobileSaveAsset === asset) $('#mobile-save-note').textContent = error?.name === 'AbortError'
      ? mobileSaveDetails(asset) + '已取消分享，成品仍在。长按图片可存储到照片。'
      : mobileSaveDetails(asset) + '当前浏览器未能打开分享。请长按成品图片，选择“存储到照片”。';
  } finally {
    if (mobileSaveAsset === asset) $('#mobile-share').disabled = false;
  }
});

function edited() {
  revision += 1;
  if (downloadURL) {
    clearDownload();
    status('构图已更新，可以重新导出。');
  }
  renderSoon();
}

function paint(context, width, height, forExport = false, layers = null, visible = null) {
  const fixed = layers?.[0] ?? template, gradient = layers?.[1] ?? templateGradient;
  context.save();
  try {
    context.clearRect(0, 0, width, height);
    context.scale(width / POSTER.width, height / POSTER.height);
    context.fillStyle = '#fff';
    context.fillRect(0, 0, POSTER.width, POSTER.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    getPanes(split, width).forEach((pane, side) => {
      if (pane.width <= 0) return;
      context.save();
      try {
        context.beginPath();
        context.rect(pane.x, pane.y, pane.width, pane.height);
        context.clip();
        const photo = photos[side];
        if (photo.image) {
          context.fillStyle = '#000';
          context.fillRect(pane.x, pane.y, pane.width, pane.height);
          const transform = getPhotoTransform(pane, photo.image.naturalWidth, photo.image.naturalHeight, photo);
          context.save();
          try {
            context.filter = 'brightness(' + photo.brightness + '%)';
            context.translate(transform.centerX, transform.centerY);
            context.rotate(transform.rotationRadians);
            if (transform.width > 0 && transform.height > 0) context.drawImage(photo.image, -transform.width / 2, -transform.height / 2, transform.width, transform.height);
          } finally { context.restore(); }
          drawPhotoEffects(context, pane, transform, photo, { compareBefore: !forExport && side === activeSide && brush.compareBefore, renderWidth: width });
        } else {
          context.fillStyle = side === 0 ? '#e5e8e3' : '#d6ddd5';
          context.fillRect(pane.x, pane.y, pane.width, pane.height);
        }
      } finally { context.restore(); }
    });
    // PSD gradient is independently controlled; lettering, borders and logos stay above it.
    if (gradient && templateGradientOpacity > 0) {
      context.save();
      try {
        context.globalAlpha = templateGradientOpacity / 100;
        if (gradientColor === '#000000') context.drawImage(gradient, 0, 0, POSTER.width, POSTER.height);
        else {
          context.scale(POSTER.width / width, POSTER.height / height);
          drawTintedMask(context, gradient, width, height, gradientColor, visible);
        }
      } finally { context.restore(); }
    }
    if (fixed) context.drawImage(fixed, 0, 0, POSTER.width, POSTER.height);
    if (noteLayer) context.drawImage(noteLayer, NOTE_BOUNDS.x, NOTE_BOUNDS.y, NOTE_BOUNDS.width, NOTE_BOUNDS.height);
  } finally { context.restore(); }
}

function renderSoon() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    try {
      paint(previewContext, preview.width, preview.height);
      if (previewFailed) { previewFailed = false; readyStatus(); }
    } catch (error) {
      previewFailed = true;
      status(error instanceof Error && /[\u3400-\u9fff]/.test(error.message) ? error.message : '预览绘制失败，请调整参数或更换照片后重试。', true);
    }
    const panes = getPanes(split, preview.width);
    const pane = panes[activeSide];
    $('#selection').style.left = `${pane.x / POSTER.width * 100}%`;
    $('#selection').style.width = `${pane.width / POSTER.width * 100}%`;
    $('#divider').style.left = `${panes[1].x / POSTER.width * 100}%`;
  });
}

function selectSide(side) {
  const focused = document.activeElement;
  if (focused?.matches('.setting-row input[type="number"]')) focused.blur();
  if (activeSide !== side) brush.compareBefore = false;
  activeSide = side;
  document.querySelectorAll('.photo-card').forEach((card, index) => card.classList.toggle('selected', index === side));
  $(`input[name="active-side"][value="${side}"]`).checked = true;
  $('#active-label').textContent = `正在调整：${names[side]}`;
  updateButtons();
  renderSoon();
}

function setSplit(value, fromPointer = false) {
  if (!fromPointer) stopGesture();
  split = clampSplit(value);
  const percentage = Math.round(split * 1000) / 10;
  $('#split').value = percentage;
  $('#split-value').textContent = `${percentage}%`;
  $('#split-handle').setAttribute('aria-valuenow', String(percentage));
  updateButtons();
  $('#split-handle').setAttribute('aria-valuetext', `素颜照片占 ${percentage}%，精修照片占 ${Math.round((100 - percentage) * 10) / 10}%`);
  edited();
}

function decodeImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth && image.naturalHeight ? resolve(image) : reject(new Error('图片没有有效尺寸'));
    image.onerror = () => reject(new Error('无法解码图片'));
    image.src = url;
  });
}

async function loadPhoto(file, side) {
  const photo = photos[side];
  const request = ++photo.request;
  photo.loading = false;
  // MIME can be empty for local files; allow only these three known extensions then.
  const supported = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
  if (!supported) {
    status(`${names[side]}格式不支持，请使用 JPG、PNG 或 WebP。`, true);
    updateButtons();
    return;
  }
  stopGesture();
  photo.loading = true;
  updateButtons();
  status(`正在读取${names[side]}…`);
  let url;
  try {
    url = URL.createObjectURL(file);
    const image = await decodeImage(url);
    if (request !== photo.request) return;
    Object.assign(photo, PHOTO_DEFAULTS, { image, strokes: [] });
    brush.compareBefore = false;
    $(`#file-name-${side}`).textContent = file.name;
    $(`#file-name-${side}`).title = file.name;
    selectSide(side);
    edited();
  } catch {
    if (request === photo.request) status(`${names[side]}读取失败，图片可能已损坏或浏览器无法解码，请换一张 JPG、PNG 或 WebP。`, true);
  } finally {
    if (url) URL.revokeObjectURL(url);
    if (request === photo.request) {
      photo.loading = false;
      updateButtons();
      // Retain a useful decode error instead of replacing it with a ready message.
      if (!$('#status').classList.contains('error')) readyStatus();
    }
  }
}

let templateSources;
function templateSource(name) {
  templateSources ??= JSON.parse($('#template-assets')?.textContent || '{}');
  const source = templateSources[name];
  if (typeof source !== 'string' || !source.startsWith('data:image/png;base64,')) throw new Error('模板资源不完整，请更新制作台后重试。');
  return source;
}

async function loadTemplate() {
  const request = ++templateRequest;
  $('#retry-template').hidden = true;
  status('正在加载原版模板…');
  try {
    const [[image, gradient], note] = await Promise.all([mobileExport
      ? Promise.all([
        decodeImage(templateSource('fixed-mobile')),
        decodeImage(templateSource('gradient-mobile')),
      ])
      : Promise.all([
        decodeImage(templateSource('fixed')),
        decodeImage(templateSource('gradient')),
      ]), decodeImage(templateSource('note'))]);
    if (request !== templateRequest) return;
    const expected = mobileExport ? { width: 2160, height: 2880 } : POSTER;
    if ([image, gradient].some(asset => asset.naturalWidth !== expected.width || asset.naturalHeight !== expected.height)) throw new Error('模板尺寸不符');
    if (note.naturalWidth !== NOTE_BOUNDS.width || note.naturalHeight !== NOTE_BOUNDS.height) throw new Error('备注模板尺寸不符');
    template = image;
    templateGradient = gradient;
    noteTemplate = note;
    recolorNote();
    renderSoon();
    readyStatus();
  } catch {
    if (request !== templateRequest) return;
    template = null;
    templateGradient = null;
    noteTemplate = noteLayer = null;
    $('#retry-template').hidden = false;
    status('内置模板读取失败，请点击重新加载模板。若仍失败，请更新制作台后重试。', true);
  }
  updateButtons();
}

function recolorNote() {
  if (!noteTemplate) return;
  noteLayer ??= document.createElement('canvas');
  noteLayer.width = NOTE_BOUNDS.width;
  noteLayer.height = NOTE_BOUNDS.height;
  const context = noteLayer.getContext('2d');
  if (!context) throw new Error('无法读取备注图层，请重新加载模板。');
  context.drawImage(noteTemplate, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = noteColor;
  context.fillRect(0, 0, noteLayer.width, noteLayer.height);
  context.globalCompositeOperation = 'source-over';
}

function setArtworkColor(target, color, keepPicking = false) {
  if (!/^#[0-9a-f]{6}$/i.test(color) || !(target === 'note' ? noteTemplate : templateGradient)) return;
  stopGesture();
  if (target === 'note') { noteColor = color.toLowerCase(); recolorNote(); }
  else gradientColor = color.toLowerCase();
  if (!keepPicking) pickingColor = null;
  updateButtons();
  edited();
}

for (const target of ['note', 'gradient']) {
  document.querySelectorAll('[data-' + target + '-color]').forEach(button => button.addEventListener('click', () => setArtworkColor(target, button.dataset[target + 'Color'])));
  $('#' + target + '-color').addEventListener('input', event => setArtworkColor(target, event.target.value));
  $('#' + target + '-pick').addEventListener('click', () => {
    stopGesture();
    pickingColor = pickingColor === target ? null : target;
    $('#brush-cursor').classList.remove('visible');
    updateButtons();
  });
}

function point(event) {
  const bounds = preview.getBoundingClientRect();
  return { x: (event.clientX - bounds.left) * POSTER.width / bounds.width, y: (event.clientY - bounds.top) * POSTER.height / bounds.height };
}

function sideAt(position) {
  return position.x < getPanes(split, preview.width)[1].x ? 0 : 1;
}
function inPane(position, pane) {
  return position.x >= pane.x && position.x <= pane.x + pane.width && position.y >= pane.y && position.y <= pane.y + pane.height;
}
function photoTransform(side, pane = getPanes(split, preview.width)[side]) {
  const photo = photos[side];
  return getPhotoTransform(pane, photo.image.naturalWidth, photo.image.naturalHeight, photo);
}
function brushCursor(position) {
  const cursor = $('#brush-cursor');
  cursor.style.left = position.x / POSTER.width * 100 + '%';
  cursor.style.top = position.y / POSTER.height * 100 + '%';
  cursor.style.width = brush.size / 1080 * 100 + '%';
  cursor.style.aspectRatio = '1';
  cursor.classList.add('visible');
}
function rebaseTouch() {
  if (!pointer || pointer.type !== 'photo') return;
  const values = [...touches.values()];
  const photo = photos[pointer.side];
  if (values.length >= 2) {
    const [a, b] = values;
    pinch = { distance: Math.max(1, Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y)), x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2, zoom: photo.zoom, offsetX: photo.offsetX, offsetY: photo.offsetY };
  } else if (values.length) {
    const a = values[0];
    pointer = { ...pointer, id: a.id, start: a.position, clientX: a.clientX, clientY: a.clientY, offsetX: photo.offsetX, offsetY: photo.offsetY, rotation: photo.rotation, moved: false };
    pinch = null;
  }
}
preview.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  if (pickingColor) {
    const position = point(event);
    const x = clamp(Math.floor(position.x / POSTER.width * preview.width), 0, preview.width - 1);
    const y = clamp(Math.floor(position.y / POSTER.height * preview.height), 0, preview.height - 1);
    // Read a one-pixel copy so repeated sampling does not switch the poster's
    // canvas to a different rendering backend or allocate a full-size copy.
    const sample = document.createElement('canvas');
    sample.width = sample.height = 1;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) { status('暂时无法吸色，请使用自定义颜色。', true); return; }
    sampleContext.drawImage(preview, x, y, 1, 1, 0, 0, 1, 1);
    const pixel = sampleContext.getImageData(0, 0, 1, 1).data;
    setArtworkColor(pickingColor, '#' + Array.from(pixel.slice(0, 3), value => value.toString(16).padStart(2, '0')).join(''), true);
    event.preventDefault();
    return;
  }
  const position = point(event), side = sideAt(position), photo = photos[side];
  if (event.pointerType === 'touch' && pointer?.touch && pointer.type === 'photo' && pointer.side === side && touches.size === 1) {
    touches.set(event.pointerId, { id: event.pointerId, position, clientX: event.clientX, clientY: event.clientY });
    preview.setPointerCapture(event.pointerId);
    rebaseTouch();
    event.preventDefault();
    return;
  }
  if (pointer) return;
  selectSide(side);
  preview.focus({ preventScroll: true });
  if (!photo.image || photo.loading) return;
  const pane = getPanes(split, preview.width)[side];
  if (pane.width <= 0) return;
  pointer = { id: event.pointerId, side, request: photo.request, pane, start: position, clientX: event.clientX, clientY: event.clientY, offsetX: photo.offsetX, offsetY: photo.offsetY, rotation: photo.rotation, mode: rotationMode ? 'rotate' : 'move', type: 'photo', touch: event.pointerType === 'touch', moved: false };
  if (brush.active) {
    const transform = photoTransform(side, pane);
    const source = inversePhotoPoint(transform, position);
    if (!source || !inPane(position, pane)) { pointer = null; return; }
    brush.compareBefore = false;
    photo.strokes.push({ points: [source], radius: brush.size * POSTER.width / 2160 / transform.width, feather: brush.feather, strength: brush.strength });
    pointer.type = 'brush';
    pointer.stroke = photo.strokes.length - 1;
    pointer.transform = transform;
    brushCursor(position);
    edited();
    updateButtons();
  } else if (pointer.touch) {
    touches.set(event.pointerId, { id: event.pointerId, position, clientX: event.clientX, clientY: event.clientY });
  }
  preview.setPointerCapture(event.pointerId);
  event.preventDefault();
});
$('#divider').addEventListener('pointerdown', event => {
  if (pointer || (event.pointerType === 'mouse' && event.button !== 0)) return;
  pointer = { id: event.pointerId, type: 'split', offset: point(event).x - (PHOTO_AREA.x + PHOTO_AREA.width * split) };
  event.currentTarget.setPointerCapture(event.pointerId);
  $('#split-handle').focus({ preventScroll: true });
  event.preventDefault();
});
function movePointer(event) {
  if (pickingColor) return;
  const position = point(event);
  if (brush.active && event.currentTarget === preview) brushCursor(position);
  if (!pointer) return;
  if (pointer.type === 'split') {
    if (pointer.id === event.pointerId) setSplit((position.x - pointer.offset - PHOTO_AREA.x) / PHOTO_AREA.width, true);
    return;
  }
  const photo = photos[pointer.side];
  if (photo.loading || photo.request !== pointer.request) { stopGesture(); return; }
  if (pointer.touch && touches.has(event.pointerId)) {
    touches.set(event.pointerId, { id: event.pointerId, position, clientX: event.clientX, clientY: event.clientY });
    if (touches.size >= 2 && pinch) {
      const [a, b] = [...touches.values()];
      const distance = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
      photo.zoom = Math.round(clamp(pinch.zoom * distance / pinch.distance, 100, 400) * 10) / 10;
      photo.offsetX = Math.round(clamp(pinch.offsetX + ((a.position.x + b.position.x) / 2 - pinch.x) / pointer.pane.width * 100, -200, 200) * 10) / 10;
      photo.offsetY = Math.round(clamp(pinch.offsetY + ((a.position.y + b.position.y) / 2 - pinch.y) / pointer.pane.height * 100, -200, 200) * 10) / 10;
      showHint(photo.zoom + '%');
      updateButtons(); edited(); event.preventDefault(); return;
    }
  }
  if (pointer.id !== event.pointerId) return;
  if (pointer.type === 'brush') {
    if (!inPane(position, pointer.pane)) { stopGesture(); $('#brush-cursor').classList.remove('visible'); return; }
    const source = inversePhotoPoint(pointer.transform, position);
    if (source) {
      const stroke = photo.strokes[pointer.stroke];
      if (!stroke) return;
      photo.strokes[pointer.stroke] = { ...stroke, points: [...stroke.points, source] };
      edited();
    }
    event.preventDefault();
    return;
  }
  if (pointer.touch && !pointer.moved && Math.hypot(event.clientX - pointer.clientX, event.clientY - pointer.clientY) < 7) return;
  pointer.moved = true;
  if (pointer.mode === 'rotate') {
    const result = rotationFromDrag(pointer.rotation, position.x - pointer.start.x, pointer.pane.width);
    photo.rotation = result.value;
    showHint(photo.rotation + '°', result.guide);
  } else {
    photo.offsetX = Math.round(clamp(pointer.offsetX + (position.x - pointer.start.x) / pointer.pane.width * 100, -200, 200) * 10) / 10;
    photo.offsetY = Math.round(clamp(pointer.offsetY + (position.y - pointer.start.y) / pointer.pane.height * 100, -200, 200) * 10) / 10;
    showHint(photo.offsetX + ', ' + photo.offsetY);
  }
  updateButtons(); edited(); event.preventDefault();
}
function endPointer(event) {
  if (event.type !== 'pointerup') {
    if (pointer?.id === event.pointerId || touches.has(event.pointerId)) stopGesture();
    return;
  }
  if (touches.has(event.pointerId)) {
    touches.delete(event.pointerId);
    if (touches.size) rebaseTouch();
    else { pointer = null; pinch = null; }
    if (preview.hasPointerCapture(event.pointerId)) preview.releasePointerCapture(event.pointerId);
  } else if (pointer?.id === event.pointerId) stopGesture();
}
for (const target of [preview, $('#divider')]) {
  target.addEventListener('pointermove', movePointer);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) target.addEventListener(type, endPointer);
}
preview.addEventListener('pointerleave', () => $('#brush-cursor').classList.remove('visible'));
preview.addEventListener('wheel', event => {
  if (brush.active || pointer || pickingColor) return;
  const side = sideAt(point(event)), photo = photos[side];
  if (!photo.image || photo.loading) return;
  event.preventDefault();
  selectSide(side);
  photo.zoom = Math.round(clamp(photo.zoom + clamp(-event.deltaY * .02, -2, 2), 100, 400) * 10) / 10;
  showHint(photo.zoom + '%'); updateButtons(); edited();
}, { passive: false });
preview.addEventListener('dblclick', event => {
  if (brush.active || pickingColor) return;
  const side = sideAt(point(event));
  if (!photos[side].image || photos[side].loading) return;
  event.preventDefault();
  selectSide(side);
  toggleRotation();
});
$('#split-handle').addEventListener('keydown', event => {
  const changes = { ArrowLeft: -.01, ArrowDown: -.01, ArrowRight: .01, ArrowUp: .01, PageDown: -.1, PageUp: .1 };
  if (event.key in changes) setSplit(split + changes[event.key]);
  else if (event.key === 'Home') setSplit(0);
  else if (event.key === 'End') setSplit(1);
  else return;
  event.preventDefault();
});
preview.addEventListener('keydown', event => {
  const photo = photos[activeSide];
  if (!photo.image || photo.loading || brush.active) return;
  const step = event.shiftKey ? 5 : 1;
  const changes = { ArrowLeft: ['offsetX', -step], ArrowRight: ['offsetX', step], ArrowUp: ['offsetY', -step], ArrowDown: ['offsetY', step] };
  if (event.key in changes) { const [key, delta] = changes[event.key]; setParameter(key, photo[key] + delta); }
  else if (['+', '=', '-'].includes(event.key)) setParameter('zoom', photo.zoom + (event.key === '-' ? -step : step));
  else return;
  event.preventDefault();
});
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    const hadOperation = pointer || rotationMode || brush.active || brush.compareBefore || pickingColor;
    pickingColor = null;
    stopGesture(); rotationMode = false; brush.active = false; brush.compareBefore = false;
    $('#brush-cursor').classList.remove('visible'); updateButtons(); renderSoon();
    if (hadOperation) status('已退出当前操作，可继续移动照片。');
  }
  if (!brush.active || !(event.metaKey || event.ctrlKey) || event.target.matches('input,textarea,select')) return;
  if (['BracketLeft', 'BracketRight'].includes(event.code)) {
    event.preventDefault(); brush.size = clamp(brush.size + (event.code === 'BracketLeft' ? -10 : 10), 20, 400); updateButtons();
  }
});
window.addEventListener('blur', stopGesture);
const isFileDrag = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');

// Keep a file dropped outside its upload box from opening over the editor.
document.addEventListener('dragover', (event) => {
  if (!isFileDrag(event) || event.defaultPrevented) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'none';
});
document.addEventListener('drop', (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  status('请把图片拖到素颜照片或精修照片的上传框内。', true);
});

photos.forEach((photo, side) => {
  const dropZone = $('label[for="photo-' + side + '"]');
  let dragDepth = 0;
  const clearDrag = () => { dragDepth = 0; dropZone.classList.remove('is-dragover'); };
  dropZone.addEventListener('dragenter', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault(); dragDepth += 1; dropZone.classList.add('is-dragover');
  });
  dropZone.addEventListener('dragover', event => {
    if (!isFileDrag(event)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
  });
  dropZone.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) clearDrag(); });
  dropZone.addEventListener('drop', event => {
    event.preventDefault(); event.stopPropagation(); clearDrag();
    const files = event.dataTransfer?.files;
    if (!files || files.length !== 1) { status('请一次拖入一张' + names[side] + '，支持 JPG、PNG 或 WebP。', true); return; }
    loadPhoto(files[0], side);
  });
  dropZone.addEventListener('dragend', clearDrag);
  window.addEventListener('blur', clearDrag);
  $('#photo-' + side).addEventListener('change', event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (file) loadPhoto(file, side);
  });
  $('input[name="active-side"][value="' + side + '"]').addEventListener('change', () => { stopGesture(); selectSide(side); });
  $('[data-edit-photo="' + side + '"]').addEventListener('click', () => { stopGesture(); selectSide(side); setTool('compose'); });
});
document.querySelectorAll('[data-photo-target]').forEach(button => button.addEventListener('click', () => { stopGesture(); selectSide(Number(button.dataset.photoTarget)); }));
document.querySelectorAll('button[data-tool]').forEach(button => button.addEventListener('click', () => { stopGesture(); setTool(button.dataset.tool); }));
$('#parameter-select').addEventListener('change', event => {
  selectedParameter = event.target.value;
  setTool(['brightness', 'shade', 'bottomShade', 'templateGradient', 'gradientColor', 'noteColor'].includes(selectedParameter) ? 'tone' : 'compose');
});
for (const key of Object.keys(PHOTO_DEFAULTS)) {
  $('#adjust-' + key).addEventListener('input', event => setParameter(key, event.target.value, key === 'rotation'));
  const number = $('#adjust-' + key + '-value');
  number.addEventListener('focus', () => {
    numericOwners.set(number, { side: activeSide, request: photos[activeSide].request });
    number.select();
  });
  number.addEventListener('change', () => {
    const owner = numericOwners.get(number) ?? { side: activeSide, request: photos[activeSide].request };
    setParameter(key, number.value === '' ? photos[owner.side][key] : number.value, false, owner);
    number.value = Math.round(photos[activeSide][key] * 10) / 10;
  });
  number.addEventListener('blur', () => { numericOwners.delete(number); number.value = Math.round(photos[activeSide][key] * 10) / 10; });
  number.addEventListener('keydown', event => { if (event.key === 'Enter') number.blur(); });
  $('[data-reset-setting="' + key + '"]').addEventListener('click', () => setParameter(key, PHOTO_DEFAULTS[key]));
}
$('#reset-photo').addEventListener('click', () => {
  stopGesture();
  Object.assign(photos[activeSide], PHOTO_DEFAULTS, { strokes: [] });
  brush.compareBefore = false; rotationMode = false; brush.active = false;
  updateButtons(); edited(); status(names[activeSide] + '已恢复默认，照片保留。');
});
function setTemplateGradient(raw) {
  stopGesture();
  const value = Number(raw);
  if (Number.isFinite(value)) templateGradientOpacity = Math.round(clamp(value, 0, 100));
  updateButtons();
  $('#adjust-templateGradient-value').value = templateGradientOpacity;
  edited();
}
$('#adjust-templateGradient').addEventListener('input', event => setTemplateGradient(event.target.value));
const templateGradientNumber = $('#adjust-templateGradient-value');
templateGradientNumber.addEventListener('focus', () => templateGradientNumber.select());
templateGradientNumber.addEventListener('change', () => setTemplateGradient(templateGradientNumber.value === '' ? templateGradientOpacity : templateGradientNumber.value));
templateGradientNumber.addEventListener('keydown', event => { if (event.key === 'Enter') templateGradientNumber.blur(); });
templateGradientNumber.addEventListener('blur', () => { templateGradientNumber.value = templateGradientOpacity; });
$('[data-reset-template-gradient]').addEventListener('click', () => setTemplateGradient(100));
document.querySelectorAll('[data-template-gradient-preset]').forEach(button => button.addEventListener('click', () => setTemplateGradient(button.dataset.templateGradientPreset)));
$('#rotation-mode').addEventListener('click', toggleRotation);
$('#brush-toggle').addEventListener('click', () => {
  pickingColor = null;
  stopGesture(); rotationMode = false; brush.active = !brush.active; brush.compareBefore = false;
  if (!brush.active) $('#brush-cursor').classList.remove('visible');
  updateButtons(); renderSoon();
  status(brush.active ? $('#brush-hint').textContent : '已退出涂抹，可继续移动照片。');
});
$('.brush-settings').addEventListener('toggle', () => {
  if ($('.brush-settings').open) return;
  stopGesture(); brush.active = false; brush.compareBefore = false;
  $('#brush-cursor').classList.remove('visible'); updateButtons(); renderSoon();
});
const brushDefaults = { size: 120, feather: 70, strength: 100 };
for (const key of Object.keys(brushDefaults)) {
  const range = $('#brush-' + key), number = $('#brush-' + key + '-value');
  const apply = value => {
    const parsed = Number(value);
    brush[key] = Number.isFinite(parsed) ? Math.round(clamp(parsed, Number(range.min), Number(range.max))) : brush[key];
    number.value = brush[key]; updateButtons();
  };
  range.addEventListener('input', event => apply(event.target.value));
  number.addEventListener('focus', () => number.select());
  number.addEventListener('change', () => apply(number.value === '' ? brush[key] : number.value));
  number.addEventListener('keydown', event => { if (event.key === 'Enter') number.blur(); });
  $('[data-reset-brush="' + key + '"]').addEventListener('click', () => apply(brushDefaults[key]));
}
$('#brush-before').addEventListener('click', () => { stopGesture(); brush.compareBefore = true; updateButtons(); renderSoon(); });
$('#brush-after').addEventListener('click', () => { stopGesture(); brush.compareBefore = false; updateButtons(); renderSoon(); });
$('#brush-undo').addEventListener('click', () => {
  stopGesture(); photos[activeSide].strokes.pop(); brush.compareBefore = false; updateButtons(); edited();
});
$('#brush-clear').addEventListener('click', () => {
  stopGesture(); photos[activeSide].strokes = []; brush.compareBefore = false; updateButtons(); edited();
});
setTool('photos');
$('#split').addEventListener('input', (event) => setSplit(Number(event.target.value) / 100));
$('#equal-split').addEventListener('click', () => setSplit(.5));
$('#retry-template').addEventListener('click', loadTemplate);

async function exportPoster(format) {
  if (!ready() || exporting) return;
  exporting = true;
  const snapshot = revision;
  clearDownload();
  updateButtons();
  status(`正在生成 ${format.toUpperCase()}，保留原片细节…`);
  let writable, exportLayers;
  const releaseLayers = () => { exportLayers?.forEach(image => { image.src = 'data:,'; }); exportLayers = null; };
  try {
    const fileName = getMakeoverExportFileName(format);
    const usePicker = /^https?:$/.test(location.protocol) && !nativeSave && !mobileExport && window.showSaveFilePicker;
    // Open during the click gesture, before asynchronous image encoding.
    const handle = usePicker ? await window.showSaveFilePicker({
      startIn: 'desktop',
      suggestedName: fileName,
      types: [{ description: format === 'png' ? 'PNG 图片' : 'JPG 图片', accept: {
        [format === 'png' ? 'image/png' : 'image/jpeg']: [`.${format}`],
      } }],
    }) : null;
    if (snapshot !== revision || photos.some(photo => photo.loading)) throw new Error('照片或构图已更改，请重新导出。');
    // Low-memory mobile templates are for preview only; final artwork uses the original PSD rasters.
    if (mobileExport) exportLayers = await Promise.all([
      decodeImage(templateSource('fixed')),
      decodeImage(templateSource('gradient')),
    ]);
    const asset = await createMakeoverExportAsset({
      format,
      // paint() fills the entire poster white before compositing the photos/PSD.
      // RGB PNG preserves identical pixels without encoding a redundant alpha channel.
      opaque: true,
      ...getMakeoverExportSize(photos, split),
      tiled: navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
      onProgress: percent => status(`正在生成原片 ${format.toUpperCase()} · ${percent}%…`),
      isCancelled: () => snapshot !== revision || photos.some(photo => photo.loading),
      render: (canvas, region) => {
        const context = canvas.getContext('2d');
        if (!context) throw new Error('无法创建画布，请关闭其他页面后重试。');
        context.save();
        try {
          if (region) context.translate(-region.x, -region.y);
          paint(context, region?.width ?? canvas.width, region?.height ?? canvas.height, true, exportLayers,
            region ? { x: region.x, y: region.y, width: canvas.width, height: canvas.height } : null);
        } finally { context.restore(); }
      },
    });
    releaseLayers();
    const { blob } = asset;
    const details = `${asset.width} × ${asset.height} 像素 · ${(blob.size / 1_000_000).toFixed(2)}MB`;
    if (snapshot !== revision || photos.some((photo) => photo.loading)) {
      status('照片或构图已更改，请重新导出。');
      return;
    }
    if (nativeSave) {
      status('正在保存到相册…');
      await saveInApp(blob);
      status(`${details}，成图已保存到相册。`);
      return;
    }
    if (handle) {
      writable = await handle.createWritable();
      if (snapshot !== revision || photos.some(photo => photo.loading)) throw new Error('照片或构图已更改，请重新导出。');
      await writable.write(blob);
      if (snapshot !== revision || photos.some(photo => photo.loading)) throw new Error('照片或构图已更改，请重新导出。');
      await writable.close();
      writable = null;
      status(`${details}，已保存。`);
      return;
    }
    downloadURL = URL.createObjectURL(blob);
    const link = $('#download-link');
    link.href = downloadURL;
    link.download = fileName;
    $('#open-image').href = downloadURL;
    shareFile = new File([blob], fileName, { type: blob.type });
    try { $('#share-image').hidden = !navigator.canShare?.({ files: [shareFile] }); } catch { $('#share-image').hidden = true; }
    $('#download-result').hidden = false;
    status(`${details}${asset.resized ? '（已等比缩小）' : ''}，已生成。`);
    if (mobileExport) showMobileSave(asset, fileName);
    else link.click();
  } catch (error) {
    try { await writable?.abort(); } catch { /* Preserve the original save error. */ }
    if (error?.name === 'AbortError') status('已取消保存，可再次点击导出。');
    else if (snapshot !== revision || photos.some(photo => photo.loading)) status('照片或构图已更改，请重新导出。');
    else status(error instanceof Error && /[\u3400-\u9fff]/.test(error.message) ? error.message : '导出失败，可能是图片过大或浏览器内存不足。请重新尝试，或更换浏览器。', true);
  } finally {
    releaseLayers();
    exporting = false;
    updateButtons();
  }
}

$('#share-image').addEventListener('click', async () => {
  if (!shareFile || !navigator.share) return;
  const file = shareFile;
  try {
    // A fresh tap provides Safari's required user activation after slow encoding.
    await navigator.share({ files: [file], title: '南铂素人改造' });
    status('已打开系统分享，请选择“存储图像”；也可打开图片后长按保存。');
  } catch (error) {
    status(error?.name === 'AbortError' ? '已取消分享，成品仍可下载或打开保存。' : '请点“打开图片保存”，再长按图片保存。');
  }
});

$('#export-png').addEventListener('click', () => exportPoster('png'));
$('#export-jpg').addEventListener('click', () => exportPoster('jpg'));
window.addEventListener('pagehide', (event) => {
  // Preserve working download links on back-forward cache restores.
  if (!event.persisted) clearDownload();
});
renderSoon();
loadTemplate();
if (embedded) {
  new ResizeObserver(() => reportHeight()).observe(document.body);
  window.addEventListener('resize', () => reportHeight());
  reportHeight(true);
}
