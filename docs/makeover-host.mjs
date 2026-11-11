/** @typedef {{ postMessage: (message: { action: string, data: string }) => unknown }} NativeBridge */
/** @typedef {Window & { webkit?: { messageHandlers?: { nanboLive?: NativeBridge } } }} NativeWindow */

/** @param {string} search @returns {'cover'|'makeover'} */
export function resolveCreationMode(search) {
  return new URLSearchParams(search).get('mode') === 'makeover' ? 'makeover' : 'cover';
}
/** @param {string} href @param {string} mode */
export function creationModeURL(href, mode) {
  const url = new URL(href);
  if (mode === 'makeover') url.searchParams.set('mode', 'makeover');
  else url.searchParams.delete('mode');
  return url.href;
}
/** @param {{ source: unknown, origin: string }} event @param {unknown} source @param {string} origin */
export function isTrustedMakeoverEvent(event, source, origin) {
  return source != null && event.source === source && event.origin === origin;
}
/** @param {unknown} value @returns {number|null} */
export function normalizeMakeoverHeight(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 300 && value <= 10000 ? Math.min(10000, Math.max(300, Math.round(value))) : null;
}
/** @param {unknown} message @returns {{ id: string, data: string }|null} */
export function validateMakeoverSave(message) {
  if (!message || typeof message !== 'object') return null;
  const value = /** @type {{ type?: unknown, id?: unknown, data?: unknown }} */ (message);
  if (value.type !== 'NBO_MAKEOVER_SAVE' || typeof value.id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.id)) return null;
  if (typeof value.data !== 'string' || value.data.length >= 90000000 || !/^(?:iVBORw0KGgo|\/9j\/)/.test(value.data) || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)) return null;
  return { id: value.id, data: value.data };
}
/** @param {unknown} message @param {NativeBridge|null|undefined} bridge */
export async function forwardMakeoverSave(message, bridge) {
  const payload = validateMakeoverSave(message);
  const result = { type: 'NBO_MAKEOVER_SAVE_RESULT', id: payload?.id ?? '', saved: false };
  if (!payload) return { ...result, error: '导出图片格式或大小无效，请重新导出。' };
  if (!bridge || typeof bridge.postMessage !== 'function') return { ...result, error: '当前环境不支持本机保存，请使用浏览器下载。' };
  try {
    const response = await bridge.postMessage({ action: 'image', data: payload.data });
    if (response && typeof response === 'object' && /** @type {{ saved?: unknown }} */ (response).saved === true) return { ...result, saved: true };
  } catch { /* Show a local Chinese failure; never reinterpret diagnostics as success. */ }
  return { ...result, error: '本机未确认保存成功，请重新导出或使用浏览器下载。' };
}

function nativeBridge() {
  return /** @type {NativeWindow} */ (window).webkit?.messageHandlers?.nanboLive ?? null;
}
/** @param {HTMLIFrameElement} iframe */
function postToFrame(iframe, message) {
  iframe.contentWindow?.postMessage(message, window.location.origin === 'null' ? '*' : window.location.origin);
}
/** Tell an already-mounted child that it is visible, without reloading its photos.
 * @param {HTMLIFrameElement} iframe */
export function notifyMakeoverFrame(iframe) {
  postToFrame(iframe, { type: 'NBO_MAKEOVER_HOST', nativeSave: typeof nativeBridge()?.postMessage === 'function' });
  postToFrame(iframe, { type: 'NBO_MAKEOVER_MEASURE' });
}
/** @param {HTMLIFrameElement} iframe @param {(height:number)=>void} onHeight */
export function bindMakeoverFrame(iframe, onHeight) {
  let active = true;
  const loaded = () => notifyMakeoverFrame(iframe);
  /** @param {MessageEvent} event */
  const receive = async (event) => {
    if (!isTrustedMakeoverEvent(event, iframe.contentWindow, window.location.origin)) return;
    const message = event.data;
    if (!message || typeof message !== 'object') return;
    if (message.type === 'NBO_MAKEOVER_HEIGHT') {
      const height = normalizeMakeoverHeight(message.height);
      if (height !== null) onHeight(height);
    } else if (message.type === 'NBO_MAKEOVER_SAVE') {
      const source = iframe.contentWindow;
      const result = await forwardMakeoverSave(message, nativeBridge());
      if (active && iframe.contentWindow === source) postToFrame(iframe, result);
    }
  };
  window.addEventListener('message', receive);
  iframe.addEventListener('load', loaded);
  return () => {
    active = false;
    window.removeEventListener('message', receive);
    iframe.removeEventListener('load', loaded);
  };
}
