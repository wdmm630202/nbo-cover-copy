import { getSecondaryTools, PRIMARY_TOOLS, type PrimaryToolId, type ToolDefinition } from './tool-registry';
import { drawCoverText, getBeforeImageFrame } from './render-core';
import type { CoverSettings } from './editor-settings';

type Presentation = { value: unknown; disabled?: boolean; min?: number; max?: number; choices?: readonly { value: string | boolean; label: string }[] };
export type PhoneEditorAdapter = {
  read(): { settings: CoverSettings; image: HTMLImageElement | null; beforeImage: HTMLImageElement | null; watermark: HTMLImageElement | null; live: boolean; brush: boolean; notice: string; busy: boolean };
  value(tool: ToolDefinition): Presentation;
  change(tool: ToolDefinition, value: unknown): void;
  reset(tool: ToolDefinition): void;
  action(tool: ToolDefinition): void;
  beginEdit(): () => void;
  preview(active: boolean, guides: boolean): void;
  back(): void;
  export(format: 'jpeg' | 'png', photoOnly: boolean): Promise<unknown>;
};

type Workspace = 'compose' | 'text' | 'image' | 'retouch' | 'watermark' | 'more' | 'export' | 'stickers' | 'rules';
const mainActions = [['compose', '构图'], ['text', '文字'], ['image', '画面'], ['retouch', '涂抹'], ['watermark', '水印']] as const;
const titles: Record<Workspace, string> = { compose: '位置与大小', text: '文字', image: '画面', retouch: '局部涂抹提亮', watermark: '水印', more: '版式与更多', export: '导出成品', stickers: '动画贴图', rules: '封面规范' };
const defaults: Partial<Record<Workspace, string>> = { compose: 'zoom', text: 'topText', image: 'brightness', retouch: 'brushSize', watermark: 'watermarkEnabled', more: 'template' };

// The persistent phone workspace presents the existing tools, canvas and exports.
// Each owner retains all photo and rendering state; desktop markup is untouched.
export function mountPhoneEditor(root: HTMLElement, owner: () => PhoneEditorAdapter) {
  const append = (parent: HTMLElement, ...children: Node[]) => children.forEach(child => parent.appendChild(child));
  const panel = root.parentElement!;
  const canvasShell = panel.querySelector<HTMLElement>('.canvas-shell, .studio-canvas-shell')!;
  const canvas = canvasShell.querySelector('canvas')!;
  const liveHost = panel.querySelector<HTMLElement>('.live-control-host, #liveControlHost')!;
  const pointer = matchMedia('(pointer: coarse)');
  let active = false, guides = false, frame = 0, disposed = false;
  let workspace: Workspace = 'compose', selectedTool = 'zoom', target: 'after' | 'before' = 'after';
  let rollback: (() => void) | null = null, pendingMode = false;
  let renderKey = '', lastNotice = '', message = '';
  let renderedImage: HTMLImageElement | null = null, renderedBefore: HTMLImageElement | null = null;
  const element = (tag: string, className: string) => Object.assign(document.createElement(tag), {className});
  const header = element('header', 'phone-header');
  const photos = element('aside', 'phone-photo-rail'); photos.setAttribute('aria-label', '照片入口');
  const shortcuts = element('aside', 'phone-shortcut-rail'); shortcuts.setAttribute('aria-label', '预览快捷开关');
  const hint = element('div', 'phone-hint'); hint.setAttribute('role', 'status');
  const dock = element('section', 'phone-dock'); dock.setAttribute('aria-label', '当前工具调整');
  const nav = element('nav', 'phone-main-actions'); nav.setAttribute('aria-label', '常用工具');
  const selection = element('div', 'phone-selection'); selection.hidden = true;
  append(root, header, photos, shortcuts, hint, dock, nav, selection);
  let refreshInputs: (() => void)[] = [];
  const state = () => owner().read();
  const tools = (primary: PrimaryToolId) => getSecondaryTools(primary, { comparisonEnabled: state().settings.compareEnabled, target });
  const find = (id: string) => PRIMARY_TOOLS.flatMap(p => getSecondaryTools(p.id, {comparisonEnabled: true, target})).find(t => t.id === id)!;
  const button = (label: string, fn: () => void, className = '') => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = className;
    b.addEventListener('click', fn); return b;
  };
  const text = (label: string, className = '') => { const p = element('p', className); p.textContent = label; return p; };
  function begin() {
    const undo = owner().beginEdit(), savedGuides = guides;
    const style = liveHost.querySelector<HTMLButtonElement>('[data-style][aria-pressed=true]');
    const card = style?.closest('.live-card-item');
    const density = card?.querySelector<HTMLButtonElement>('[data-density][aria-pressed=true]');
    const audio = [...(card?.querySelectorAll<HTMLButtonElement>('[data-voice], [data-sfx]') || [])].map(control => ({control, pressed: control.getAttribute('aria-pressed')}));
    return () => {
      undo(); guides = savedGuides; owner().preview(active, guides);
      if (style && style.getAttribute('aria-pressed') !== 'true') style.click();
      if (density && density.getAttribute('aria-pressed') !== 'true') density.click();
      for (const {control, pressed} of audio) if (control.getAttribute('aria-pressed') !== pressed) control.click();
    };
  }
  const change = (t: ToolDefinition, value: unknown) => {
    if (!rollback) rollback = begin();
    if (t.kind === 'range') { const p = owner().value(t); value = Math.max(p.min ?? t.min ?? -Infinity, Math.min(p.max ?? t.max ?? Infinity, Number(value))); }
    owner().change(t, value); update();
  };
  const stopBrush = () => { if (state().brush) owner().change(find('retouchEnabled'), false); };
  function open(next: Workspace, id = defaults[next] || '') {
    if (workspace !== next) { rollback = null; if (next !== 'retouch') stopBrush(); }
    workspace = next; selectedTool = id; message = ''; renderKey = ''; update();
  }
  function undo() {
    stopBrush(); rollback?.(); rollback = null; message = ''; renderKey = ''; update();
  }
  function setTarget(next: 'after' | 'before') {
    if (target !== next) rollback = null;
    target = next; owner().change(find('target'), next);
    if (state().settings.compareEnabled) owner().change(find('retouchTarget'), next);
    renderKey = ''; update();
  }
  async function mode(next: 'Live' | '关闭 Live' | '普通封面' | '前后对比') {
    if (pendingMode) return;
    rollback = null; stopBrush(); pendingMode = true; message = ''; update();
    try {
      const wantLive = next === 'Live';
      if (state().live !== wantLive) {
        liveHost.querySelector<HTMLButtonElement>('.live-toggle')?.click();
        const deadline = Date.now() + 15000;
        while (state().live !== wantLive && Date.now() < deadline && !disposed) await new Promise(r => setTimeout(r, 80));
        if (state().live !== wantLive) throw new Error('Live 加载未完成，请检查网络后重试');
      }
      if (next === '普通封面' || next === '前后对比') owner().change(find('comparison'), next === '前后对比');
      target = 'after'; if (!wantLive && workspace === 'stickers') open('compose');
    } catch (error) { message = error instanceof Error ? error.message : '切换失败，请重试'; }
    finally { pendingMode = false; renderKey = ''; update(); }
  }
  function photoRail() {
    for (const [id, label, img] of [['after', '主照片', state().image], ['before', '素颜照', state().beforeImage]] as const) {
      const b = button(label, () => {
        if (id === 'before' && !state().settings.compareEnabled) owner().change(find('comparison'), true);
        setTarget(id);
        if (!img) owner().action(find(id === 'after' ? 'uploadMain' : 'uploadBefore'));
        if (!['compose', 'image', 'retouch'].includes(workspace)) open('compose');
      }, 'phone-photo');
      b.setAttribute('aria-pressed', String(target === id));
      if (img) {
        const thumb = document.createElement('canvas'); thumb.width = 80; thumb.height = 80;
        const c = thumb.getContext('2d')!, scale = Math.max(80 / img.naturalWidth, 80 / img.naturalHeight);
        c.drawImage(img, (80-img.naturalWidth*scale)/2, (80-img.naturalHeight*scale)/2, img.naturalWidth*scale, img.naturalHeight*scale);
        b.insertBefore(thumb, b.firstChild);
      } else { const plus = element('span', 'phone-plus'); plus.textContent = '+'; plus.setAttribute('aria-hidden', 'true'); b.insertBefore(plus, b.firstChild); }
      append(photos, b);
    }
    append(photos, button('换照片', () => owner().action(find(target === 'before' ? 'uploadBefore' : 'uploadMain')), 'phone-rail-action'));
  }
  function toggle(label: string, pressed: boolean, fn: () => void, disabled = false) {
    const b = button(label, fn, 'phone-rail-action'); b.setAttribute('aria-pressed', String(pressed)); b.disabled = disabled; append(shortcuts, b);
  }
  function liveAction(selector: string, label: string, parent: HTMLElement) {
    const original = liveHost.querySelector<HTMLButtonElement>(selector);
    const b = button(label, () => { original?.click(); update(); }); b.disabled = !original || original.disabled; append(parent, b);
  }
  function availableTools() {
    if (workspace === 'watermark') return tools('more').filter(t => /watermark/i.test(t.id));
    if (workspace === 'more') return [...tools('layout'), ...tools('more').filter(t => !/watermark/i.test(t.id)), find('syncCover'), find('syncCopy')];
    if (['export', 'stickers', 'rules'].includes(workspace)) return [];
    return tools(workspace as PrimaryToolId).filter(t => !['target', 'retouchTarget', 'retouchEnabled'].includes(t.id));
  }
  function perform(t: ToolDefinition) {
    if (t.id === 'coverRules') open('rules');
    else { if (!rollback) rollback = begin(); owner().action(t); update(); }
  }
  function renderTool(t: ToolDefinition, parent: HTMLElement) {
    const p = owner().value(t), label = t.label.replace('拍摄前', '素颜照');
    if (t.kind === 'range') {
      const row = element('div', 'phone-value-row');
      const range = document.createElement('input'); range.type = 'range'; range.setAttribute('aria-label', label);
      const number = document.createElement('input'); number.type = 'number'; number.inputMode = 'decimal'; number.setAttribute('aria-label', `${label}数值`);
      const apply = (input: HTMLInputElement) => {
        if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
        const n = Math.max(Number(range.min), Math.min(Number(range.max), input.valueAsNumber));
        range.value = number.value = String(n); change(t, n);
      };
      range.oninput = () => apply(range); number.oninput = () => apply(number);
      const reset = button('复位', () => { if (!rollback) rollback = begin(); owner().reset(t); update(); }, 'phone-reset');
      const sync = () => {
        const value = owner().value(t);
        for (const input of [range, number]) {
          input.min = String(value.min ?? t.min ?? 0); input.max = String(value.max ?? t.max ?? 100); input.step = '0.1';
          if (document.activeElement !== input) input.value = String(value.value); input.disabled = Boolean(value.disabled);
        }
        reset.disabled = Boolean(value.disabled);
      }; sync(); refreshInputs.push(sync);
      append(row, text(label), number, text(t.suffix ?? ''), reset); append(parent, row, range);
    } else if (t.kind === 'text' || t.kind === 'color') {
      const labelNode = element('label', 'phone-field'); append(labelNode, text(label));
      const input = document.createElement('input'); input.type = t.kind === 'color' ? 'color' : 'text'; input.setAttribute('aria-label', label);
      if (t.max) input.maxLength = state().live && t.kind === 'text' ? 6 : t.max;
      input.oninput = () => change(t, input.value.replace(/[\r\n]/g, ''));
      const sync = () => { const value = owner().value(t); if (document.activeElement !== input) input.value = String(value.value ?? ''); input.disabled = Boolean(value.disabled); };
      sync(); refreshInputs.push(sync); append(labelNode, input); append(parent, labelNode);
      if (t.kind === 'text') append(parent, text('点下方切换上行、下行和小字，修改实时生效', 'phone-note'));
    } else if (t.kind === 'choice') {
      const choices = element('div', 'phone-tool-grid'); choices.setAttribute('aria-label', label);
      for (const c of p.choices ?? []) {
        const b = button(c.label, () => change(t, c.value));
        const sync = () => { const value = owner().value(t); b.disabled = Boolean(value.disabled); b.setAttribute('aria-pressed', String(value.value === c.value)); };
        sync(); refreshInputs.push(sync); append(choices, b);
      } append(parent, choices);
    } else if (t.kind === 'toggle') {
      const b = button('', () => change(t, !owner().value(t).value));
      const sync = () => { const value = owner().value(t); b.textContent = `${label} · ${value.value ? '已开启' : '已关闭'}`; b.setAttribute('aria-pressed', String(Boolean(value.value))); b.disabled = Boolean(value.disabled); };
      sync(); refreshInputs.push(sync); append(parent, b);
    } else if (t.id.startsWith('memory')) {
      append(parent, text(String(p.value || label)));
      const row = element('div', 'phone-tool-grid');
      for (const [id, name] of [['load', '应用'], ['save', '保存'], ['rename', '重命名']]) append(row, button(name, () => change(t, id))); append(parent, row);
    } else append(parent, button(t.label, () => perform(t)));
    if (p.disabled && state().live) append(parent, text('Live 固定字号与对齐，三行文字仍可修改', 'phone-note'));
  }
  function renderExport(parent: HTMLElement) {
    const s = state(), ready = Boolean(s.image && (!s.settings.compareEnabled || s.beforeImage));
    const row = element('div', 'phone-tool-grid phone-export-grid');
    for (const [format, label, photoOnly] of [['jpeg', '高清 JPG', false], ['png', 'PNG', false], ['jpeg', '原图 JPG', true], ['png', '原图 PNG', true]] as const) {
      const b = button(s.busy ? '正在生成…' : label, () => void owner().export(format, photoOnly).finally(update), photoOnly ? '' : 'phone-primary'); b.disabled = !ready || s.busy; append(row, b);
    } append(parent, row);
    if (!ready) append(parent, text('请先添加主照片和已开启的素颜对比照', 'phone-note'));
    if (s.live) {
      const native = liveHost.querySelector('.live-export')?.textContent === '保存实况';
      liveAction('.live-export', native ? '保存实况' : '导出 Live', parent);
      if (!liveHost.querySelector<HTMLButtonElement>('.live-cancel')?.hidden) liveAction('.live-cancel', '取消导出', parent);
      append(parent, text(native ? '保存到苹果「照片」，长按播放。' : 'Live 为照片与视频配对文件，需用 Mac 保存助手导入苹果「照片」。', 'phone-note'));
      const helper = liveHost.querySelector<HTMLAnchorElement>('.live-helper'); if (!native && helper) append(parent, helper.cloneNode(true));
    }
  }
  function render() {
    frame = 0; if (!active || disposed) return;
    const s = state();
    if (s.image !== renderedImage || s.beforeImage !== renderedBefore) { renderedImage = s.image; renderedBefore = s.beforeImage; renderKey = ''; }
    if (!s.settings.compareEnabled) target = 'after';
    else if (s.brush) target = owner().value(find('retouchTarget')).value === 'before' ? 'before' : 'after';
    if (s.notice !== lastNotice) { lastNotice = s.notice; message = /失败|错误|请先|不支持|不能|无法|已保存|已应用|还没有|已恢复|已移除|已同步/.test(s.notice) ? s.notice : ''; }
    const liveStatus = liveHost.querySelector('output')?.textContent ?? '';
    const list = availableTools();
    if (list.length && !list.some(t => t.id === selectedTool)) selectedTool = list[0].id;
    const key = JSON.stringify([workspace, selectedTool, target, Boolean(s.image), Boolean(s.beforeImage), s.live, s.settings.compareEnabled, pendingMode, s.busy, s.brush, guides, liveStatus, message]);
    root.dataset.workspace = workspace; root.dataset.target = target;
    if (key === renderKey) { refreshInputs.forEach(fn => fn()); positionSelection(); return; }
    const oldStrip = dock.querySelector('.phone-tool-strip'), scroll = oldStrip?.scrollLeft ?? 0;
    const oldStripKey = oldStrip?.getAttribute('data-tools');
    renderKey = key; refreshInputs = []; [header, photos, shortcuts, hint, dock, nav].forEach(e => e.replaceChildren());
    const back = button('撤销', undo); back.title = '撤回当前工具的调整';
    const syncUndo = () => { back.disabled = !rollback; }; syncUndo(); refreshInputs.push(syncUndo);
    const title = document.createElement('strong'); title.textContent = '南铂封面';
    const more = button('更多', () => open('more')); more.setAttribute('aria-pressed', String(['more','rules'].includes(workspace)));
    const save = button('导出', () => open('export'), 'phone-accent'); save.disabled = !s.image; save.setAttribute('aria-pressed', String(workspace === 'export'));
    append(header, back, title, more, save);
    photoRail();
    toggle('安全区', guides, () => { guides = !guides; owner().preview(active, guides); update(); });
    toggle('前后对比', s.settings.compareEnabled, () => void mode(s.settings.compareEnabled ? '普通封面' : '前后对比'), s.live || pendingMode);
    toggle('Live', s.live, () => void mode(s.live ? '关闭 Live' : 'Live'), pendingMode);
    if (s.live) { liveAction('.live-play', '播放', shortcuts); toggle('贴图', workspace === 'stickers', () => open('stickers')); }
    const hintText = pendingMode ? '正在准备 Live…' : message || liveStatus || (!s.image ? '点左侧 ＋ 添加主照片，开始制作' : s.brush ? `正在涂抹${target === 'after' ? '主照片' : '素颜照'}` : '点选照片或文字 · 单指移动 · 双指缩放');
    hint.textContent = hintText; hint.title = hintText;
    const context = element('div', 'phone-context');
    const heading = document.createElement('strong'); heading.textContent = titles[workspace]; append(context, heading);
    if (['compose','image','retouch'].includes(workspace)) append(context, text(target === 'after' ? '主照片' : '素颜照', 'phone-target'));
    if (workspace === 'retouch') { const b = button(s.brush ? '退出涂抹' : '开启涂抹', () => change(find('retouchEnabled'), !state().brush)); b.setAttribute('aria-pressed', String(s.brush)); b.dataset.tool = 'retouchEnabled'; append(context, b); }
    if (workspace === 'more') append(context, button('返回文案页', () => owner().back(), 'phone-reset'));
    append(dock, context);
    const controls = element('div', 'phone-adjustment'); append(dock, controls);
    if (workspace === 'export') renderExport(controls);
    else if (workspace === 'rules') append(controls, text(document.querySelector('#coverRules')?.textContent?.trim() || '人物原片不拉伸，核心文案放在安全区内。导出自动隐藏辅助线。', 'phone-rules'));
    else if (workspace === 'stickers') {
      const row = element('div', 'phone-stickers');
      for (const card of liveHost.querySelectorAll<HTMLButtonElement>('[data-style]')) {
        const b = button(card.getAttribute('aria-label') || '贴图', () => { if (!rollback) rollback = begin(); card.click(); renderKey = ''; update(); }); b.setAttribute('aria-pressed', card.getAttribute('aria-pressed') || 'false');
        const original = card.querySelector('canvas'); if (original) { const thumb = document.createElement('canvas'); thumb.width = original.width; thumb.height = original.height; thumb.getContext('2d')!.drawImage(original,0,0); b.insertBefore(thumb,b.firstChild); }
        const item = element('div', 'phone-card-item'); append(item,b);
        if (card.getAttribute('aria-pressed') === 'true') {
          const options = element('div', 'phone-card-options');
          for (const control of card.closest('.live-card-item')?.querySelectorAll<HTMLButtonElement>('.live-card-options button') || []) {
            const copy = button(control.textContent || '', () => { if (!control.hasAttribute('data-replay') && !rollback) rollback = begin(); control.click(); renderKey = ''; update(); });
            copy.disabled = control.disabled;
            const pressed = control.getAttribute('aria-pressed'); if (pressed !== null) copy.setAttribute('aria-pressed',pressed);
            copy.setAttribute('aria-label',control.getAttribute('aria-label') || control.textContent || '卡片设置'); append(options,copy);
          }
          append(item,options);
        }
        append(row,item);
      } append(controls,row);
    } else {
      if (list.length) renderTool(find(selectedTool), controls);
      const strip = element('div', 'phone-tool-strip'); strip.setAttribute('aria-label', `${titles[workspace]}选项`); strip.setAttribute('data-tools', list.map(t => t.id).join(','));
      for (const t of list) {
        const b = button(t.label, () => { selectedTool = t.id; renderKey = ''; update(); }); b.dataset.tool = t.id;
        b.setAttribute('aria-pressed', String(selectedTool === t.id));
        const sync = () => { b.disabled = Boolean(owner().value(t).disabled); }; sync(); refreshInputs.push(sync); append(strip, b);
      }
      append(dock, strip);
      if (strip.getAttribute('data-tools') === oldStripKey) strip.scrollLeft = scroll;
      const selected = strip.querySelector<HTMLElement>('[aria-pressed=true]');
      if (selected) {
        const left = selected.offsetLeft;
        if (left < strip.scrollLeft) strip.scrollLeft = left;
        else if (left + selected.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + selected.offsetWidth - strip.clientWidth;
      }
    }
    for (const [id,label] of mainActions) { const b = button(label, () => open(id)); b.setAttribute('aria-pressed', String(workspace === id)); append(nav,b); }
    positionSelection();
  }
  function update() { if (!frame && !disposed) frame = requestAnimationFrame(render); }
  function viewport() {
    const next = pointer.matches && innerWidth < 680;
    if (next !== active) { active = next; document.body.classList.toggle('nbo-phone', active); owner().preview(active, guides); renderKey = ''; if (!active) { selection.hidden = true; canvas.style.removeProperty('width'); canvas.style.removeProperty('height'); } }
    if (active) {
      const vv = window.visualViewport;
      const keyboard = Boolean(vv && vv.height < innerHeight * .76 && root.contains(document.activeElement));
      panel.style.setProperty('--phone-height', `${keyboard ? vv!.height : innerHeight}px`);
      panel.style.setProperty('--phone-top', `${keyboard ? vv!.offsetTop : 0}px`);
      panel.classList.toggle('phone-keyboard', keyboard);
    }
    update();
  }
  const scratch = document.createElement('canvas'); scratch.width = 540; scratch.height = 960;
  function regions() {
    const {settings,watermark} = state(); const w = canvas.width, h = canvas.height;
    const bounds = drawCoverText(scratch.getContext('2d')!, settings, w, h, settings.watermarkEnabled ? watermark : null);
    const before = getBeforeImageFrame({width: w, height: h}, settings.beforeFrameScale);
    return { text: {x:bounds.left,y:bounds.top,width:bounds.right-bounds.left,height:bounds.bottom-bounds.top}, before };
  }
  function positionSelection() {
    if (active) {
      const cs = getComputedStyle(canvasShell);
      const width = canvasShell.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const height = canvasShell.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const fitted = Math.max(1, Math.min(width, height * canvas.width / canvas.height));
      canvas.style.setProperty('width', `${fitted}px`, 'important');
      canvas.style.setProperty('height', `${fitted * canvas.height / canvas.width}px`, 'important');
    }
    const show = active && Boolean(state().image) && ['compose', 'image', 'text', 'stickers'].includes(workspace);
    selection.hidden = !show; if (!show) return;
    const r = canvas.getBoundingClientRect(); const areas = regions();
    const sticker = {x:areas.text.x,y:areas.text.y+areas.text.height+24*canvas.width/1080,width:Math.max(0,Math.min(450*canvas.width/1080,areas.before.x-36*canvas.width/1080-areas.text.x)),height:200*canvas.width/1080};
    const box = workspace === 'stickers' ? sticker : workspace === 'text' ? areas.text : target === 'before' ? areas.before : {x:0,y:0,width:canvas.width,height:canvas.height};
    Object.assign(selection.style, {left:`${r.left + box.x / canvas.width * r.width}px`,top:`${r.top + box.y / canvas.height * r.height}px`,width:`${box.width / canvas.width * r.width}px`,height:`${box.height / canvas.height * r.height}px`});
  }
  const points = new Map<number, {x:number;y:number}>();
  let gesture: { x:number;y:number;offsetX:number;offsetY:number;zoom:number;distance:number;moved:boolean;hit:string } | null = null;
  function hit(x:number,y:number) {
    const r=canvas.getBoundingClientRect(), px=(x-r.left)/r.width*canvas.width,py=(y-r.top)/r.height*canvas.height, a=regions();
    const inside=(b:{x:number;y:number;width:number;height:number})=>px>=b.x&&px<=b.x+b.width&&py>=b.y&&py<=b.y+b.height;
    if(state().settings.compareEnabled&&inside(a.before))return 'before';
    if(inside(a.text))return 'text';
    if(state().live&&px>=a.text.x&&px<=a.before.x&&py>a.text.y+a.text.height&&py<a.text.y+a.text.height+110)return 'stickers';
    return 'after';
  }
  function down(e:PointerEvent) {
    if(!active||!state().image||state().brush||e.pointerType!=='touch')return;
    e.preventDefault();e.stopPropagation();points.set(e.pointerId,{x:e.clientX,y:e.clientY});canvasShell.setPointerCapture(e.pointerId);
    if(points.size===1){const h=hit(e.clientX,e.clientY);const s=state().settings;gesture={x:e.clientX,y:e.clientY,offsetX:h==='before'?s.beforeOffsetX:s.offsetX,offsetY:h==='before'?s.beforeOffsetY:s.offsetY,zoom:h==='before'?s.beforeZoom:s.zoom,distance:0,moved:false,hit:h};}
    if(points.size===2&&gesture){const [a,b]=[...points.values()];gesture.distance=Math.hypot(a.x-b.x,a.y-b.y);}
  }
  function move(e:PointerEvent) {
    if(!points.has(e.pointerId)||!gesture)return;e.preventDefault();e.stopPropagation();points.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(!['after','before'].includes(gesture.hit))return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(!gesture.moved&&Math.hypot(dx,dy)<7&&points.size<2)return;
    if(!gesture.moved){gesture.moved=true;setTarget(gesture.hit as 'after'|'before');if(!rollback)rollback=begin();}
    if(points.size===2){const [a,b]=[...points.values()];change(find(target==='before'?'beforeZoom':'zoom'),Math.max(target==='before'?100:1,Math.min(target==='before'?300:400,gesture.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,gesture.distance))));}
    else {const r=canvas.getBoundingClientRect();change(find(target==='before'?'beforeOffsetX':'offsetX'),gesture.offsetX+dx/(target==='before'?regions().before.width/canvas.width*r.width:r.width)*100);change(find(target==='before'?'beforeOffsetY':'offsetY'),gesture.offsetY+dy/(target==='before'?regions().before.height/canvas.height*r.height:r.height)*100);}
  }
  function up(e:PointerEvent) {
    if(!points.has(e.pointerId))return;
    e.preventDefault();e.stopPropagation();points.delete(e.pointerId);
    if(points.size===1&&gesture?.moved){
      const remaining=[...points.values()][0],s=state().settings;
      gesture.x=remaining.x;gesture.y=remaining.y;
      gesture.offsetX=target==='before'?s.beforeOffsetX:s.offsetX;
      gesture.offsetY=target==='before'?s.beforeOffsetY:s.offsetY;
      gesture.zoom=target==='before'?s.beforeZoom:s.zoom;
    }
    if(!points.size&&gesture){
      if(gesture.moved){const draft=rollback;open('compose');rollback=draft;}
      else if(e.type!=='pointercancel'){
        if(gesture.hit==='text')open('text');else if(gesture.hit==='stickers')open('stickers');
        else {setTarget(gesture.hit as 'after'|'before');open('compose');}
      }
      gesture=null;
    }
  }
  canvasShell.addEventListener('pointerdown',down,true);canvasShell.addEventListener('pointermove',move,true);canvasShell.addEventListener('pointerup',up,true);canvasShell.addEventListener('pointercancel',up,true);
  const observer = new MutationObserver(()=>{renderKey='';update();});if(liveHost)observer.observe(liveHost,{subtree:true,childList:true,attributes:true,characterData:true});
  window.addEventListener('resize',viewport);pointer.addEventListener('change',viewport);window.visualViewport?.addEventListener('resize',viewport);root.addEventListener('focusin',viewport);root.addEventListener('focusout',viewport);
  const sizeObserver = new ResizeObserver(() => { positionSelection(); }); sizeObserver.observe(canvasShell); sizeObserver.observe(canvas);
  viewport();
  return { update, destroy(){ disposed=true;cancelAnimationFrame(frame);observer.disconnect();sizeObserver.disconnect();window.removeEventListener('resize',viewport);pointer.removeEventListener('change',viewport);window.visualViewport?.removeEventListener('resize',viewport);root.removeEventListener('focusin',viewport);root.removeEventListener('focusout',viewport);canvasShell.removeEventListener('pointerdown',down,true);canvasShell.removeEventListener('pointermove',move,true);canvasShell.removeEventListener('pointerup',up,true);canvasShell.removeEventListener('pointercancel',up,true);if(active){document.body.classList.remove('nbo-phone');owner().preview(false,guides);}root.replaceChildren();} };
}
