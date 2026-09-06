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

type Screen = 'start' | 'home' | 'photo' | 'text' | 'layout' | 'adjust' | 'more' | 'group' | 'tool' | 'export' | 'stickers' | 'rules';
const mainActions = [['photo', '换图'], ['text', '文案'], ['layout', '排版'], ['adjust', '调整'], ['more', '更多']] as const;
const groupTitles: Partial<Record<PrimaryToolId, string>> = { compose: '位置与大小', image: '亮度与压暗', text: '文字样式', retouch: '局部提亮', more: '水印与记忆' };
const titles: Record<Screen, string> = { start: '南铂封面', home: '南铂封面', photo: '更换照片', text: '编辑文案', layout: '选择排版', adjust: '调整照片', more: '更多工具', group: '更多工具', tool: '调整', export: '导出成品', stickers: '动画贴图', rules: '封面规范' };

// Both entry points own their existing photo/render/export state. This shell only
// groups the shared tools for touch phones; it never changes desktop markup.
export function mountPhoneEditor(root: HTMLElement, owner: () => PhoneEditorAdapter) {
  const append = (parent: HTMLElement, ...children: Node[]) => children.forEach(child => parent.appendChild(child));
  const panel = root.parentElement!;
  const canvasShell = panel.querySelector<HTMLElement>('.canvas-shell, .studio-canvas-shell')!;
  const canvas = canvasShell.querySelector('canvas')!;
  const liveHost = panel.querySelector<HTMLElement>('.live-control-host, #liveControlHost')!;
  const pointer = matchMedia('(pointer: coarse)');
  let active = false, guides = false, frame = 0, disposed = false;
  let screen: Screen = owner().read().image ? 'home' : 'start';
  let group: PrimaryToolId = 'compose', selectedTool = '', target: 'after' | 'before' = 'after';
  let rollback: (() => void) | null = null, pendingMode: string | null = null;
  let renderKey = '', lastNotice = '', message = '';
  let renderedImage: HTMLImageElement | null = null, renderedBefore: HTMLImageElement | null = null;
  const header = document.createElement('header'); header.className = 'phone-header';
  const start = document.createElement('section'); start.className = 'phone-start';
  const hint = document.createElement('div'); hint.className = 'phone-hint';
  const dock = document.createElement('section'); dock.className = 'phone-dock';
  const selection = document.createElement('div'); selection.className = 'phone-selection'; selection.hidden = true;
  append(root, header, start, hint, dock, selection);
  let refreshInputs: (() => void)[] = [];
  const state = () => owner().read();
  const tools = (primary: PrimaryToolId) => getSecondaryTools(primary, { comparisonEnabled: state().settings.compareEnabled, target });
  const find = (id: string) => PRIMARY_TOOLS.flatMap(p => tools(p.id)).find(t => t.id === id)!;
  const button = (label: string, fn: () => void, className = '') => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.className = className;
    b.addEventListener('click', fn); return b;
  };
  const text = (label: string, className = '') => { const p = document.createElement('p'); p.textContent = label; p.className = className; return p; };
  const change = (t: ToolDefinition, value: unknown) => {
    if (t.kind === 'range') { const p = owner().value(t); value = Math.max(p.min ?? t.min ?? -Infinity, Math.min(p.max ?? t.max ?? Infinity, Number(value))); }
    owner().change(t, value); update();
  };
  function begin() {
    const undo = owner().beginEdit(), savedGuides = guides;
    const style = liveHost.querySelector<HTMLButtonElement>('[data-style][aria-pressed=true]');
    return () => { undo(); guides = savedGuides; owner().preview(active, guides); if (style && style.getAttribute('aria-pressed') !== 'true') style.click(); };
  }
  const stopBrush = () => { if (state().brush) change(find('retouchEnabled'), false); };
  const commit = () => { rollback = null; stopBrush(); };
  function open(next: Screen, primary?: PrimaryToolId, id?: string) {
    if (!rollback && !['start', 'home', 'export'].includes(next)) rollback = begin();
    if (screen === 'group' && group === 'retouch' && !(next === 'tool' && primary === 'retouch')) stopBrush();
    screen = next; if (primary) group = primary; if (id) selectedTool = id;
    renderKey = ''; update();
  }
  function finish(cancel = false) {
    stopBrush(); if (cancel) rollback?.(); rollback = null;
    screen = state().image ? 'home' : 'start'; message = ''; renderKey = ''; update();
  }
  function setTarget(next: 'after' | 'before') {
    target = next; change(find('target'), next); if (state().settings.compareEnabled) change(find('retouchTarget'), next); renderKey = ''; update();
  }
  function targetPicker(parent: HTMLElement) {
    if (!state().settings.compareEnabled) return;
    const row = document.createElement('div'); row.className = 'phone-segment'; row.setAttribute('aria-label', '正在调整的照片');
    for (const [id, label] of [['after', '精修照'], ['before', '素颜照']] as const) {
      const b = button(label, () => setTarget(id)); b.setAttribute('aria-pressed', String(target === id)); append(row, b);
    }
    append(parent, row);
  }
  async function mode(next: string) {
    if (pendingMode) return;
    commit(); pendingMode = next; message = ''; update();
    try {
      const wantLive = next === 'Live';
      if (state().live !== wantLive) {
        liveHost.querySelector<HTMLButtonElement>('.live-toggle')?.click();
        const deadline = Date.now() + 15000;
        while (state().live !== wantLive && Date.now() < deadline && !disposed) await new Promise(r => setTimeout(r, 80));
        if (state().live !== wantLive) throw new Error('Live 加载未完成，请检查网络后重试');
      }
      if (!wantLive) change(find('comparison'), next === '前后对比');
      target = 'after';
    } catch (error) { message = error instanceof Error ? error.message : '切换失败，请重试'; }
    finally { pendingMode = null; renderKey = ''; update(); }
  }
  function modes(parent: HTMLElement) {
    const row = document.createElement('div'); row.className = 'phone-segment phone-modes'; row.setAttribute('aria-label', '成品形式');
    for (const label of ['普通封面', '前后对比', 'Live']) {
      const current = state().live ? 'Live' : state().settings.compareEnabled ? '前后对比' : '普通封面';
      const b = button(label, () => void mode(label)); b.setAttribute('aria-pressed', String(label === current)); b.disabled = Boolean(pendingMode); append(row, b);
    }
    append(parent, row);
  }
  function photoCards(parent: HTMLElement) {
    const row = document.createElement('div'); row.className = 'phone-photos';
    for (const [id, label, img] of [['uploadMain', '精修照', state().image], ...(state().settings.compareEnabled ? [['uploadBefore', '素颜照', state().beforeImage] as const] : [])] as const) {
      const b = button(`${img ? '更换' : '添加'}${label}`, () => owner().action(find(id)), 'phone-photo');
      if (img) {
        const thumb = document.createElement('canvas'); thumb.width = 120; thumb.height = 120;
        const c = thumb.getContext('2d')!; const scale = Math.max(120 / img.naturalWidth, 120 / img.naturalHeight);
        c.drawImage(img, (120 - img.naturalWidth * scale) / 2, (120 - img.naturalHeight * scale) / 2, img.naturalWidth * scale, img.naturalHeight * scale);
        b.insertBefore(thumb, b.firstChild);
      } else { const plus = document.createElement('span'); plus.textContent = '+'; plus.className = 'phone-plus'; plus.setAttribute('aria-hidden', 'true'); b.insertBefore(plus, b.firstChild); }
      append(row, b);
    }
    append(parent, row);
  }
  function toolButton(t: ToolDefinition, parent: HTMLElement) {
    const b = button(t.label, () => {
      if (t.id === 'coverRules') open('rules');
      else if (t.kind === 'action' && !t.id.startsWith('memory')) { owner().action(t); update(); }
      else open('tool', t.primary, t.id);
    });
    const sync = () => { const p = owner().value(t); b.disabled = Boolean(p.disabled); if (['retouchBefore', 'retouchAfter'].includes(t.id)) b.setAttribute('aria-pressed', String(Boolean(p.value))); };
    sync(); refreshInputs.push(sync); append(parent, b);
  }
  function toolList(primary: PrimaryToolId, parent: HTMLElement, filter: (t: ToolDefinition) => boolean = () => true) {
    const grid = document.createElement('div'); grid.className = 'phone-tool-grid';
    tools(primary).filter(filter).forEach(t => toolButton(t, grid)); append(parent, grid);
  }
  function renderTool(t: ToolDefinition, parent: HTMLElement) {
    const p = owner().value(t), label = t.label.replace('拍摄前', '素颜照');
    if (t.kind === 'range') {
      const row = document.createElement('div'); row.className = 'phone-value-row';
      const range = document.createElement('input'); range.type = 'range'; range.setAttribute('aria-label', label);
      const number = document.createElement('input'); number.type = 'number'; number.inputMode = 'decimal'; number.setAttribute('aria-label', `${label}数值`);
      range.min = number.min = String(p.min ?? t.min ?? 0); range.max = number.max = String(p.max ?? t.max ?? 100); range.step = number.step = '0.1';
      const apply = (input: HTMLInputElement) => {
        if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
        const n = Math.max(Number(range.min), Math.min(Number(range.max), input.valueAsNumber));
        range.value = number.value = String(n); change(t, n);
      };
      range.oninput = () => apply(range); number.oninput = () => apply(number);
      const sync = () => { const value = owner().value(t); for (const input of [range, number]) { if (document.activeElement !== input) input.value = String(value.value); input.disabled = Boolean(value.disabled); } };
      sync(); refreshInputs.push(sync);
      const reset = button('复位', () => { owner().reset(t); update(); }, 'phone-reset'); reset.disabled = Boolean(p.disabled);
      append(row, text(label), number, text(t.suffix ?? ''), reset); append(parent, row, range);
    } else if (t.kind === 'text' || t.kind === 'color') {
      const labelNode = document.createElement('label'); labelNode.className = 'phone-field'; append(labelNode, text(label));
      const input = document.createElement('input'); input.type = t.kind === 'color' ? 'color' : 'text'; input.setAttribute('aria-label', label);
      if (t.max) input.maxLength = state().live && t.kind === 'text' ? 6 : t.max;
      input.oninput = () => change(t, input.value.replace(/[\r\n]/g, ''));
      const sync = () => { const value = owner().value(t); if (document.activeElement !== input) input.value = String(value.value ?? ''); input.disabled = Boolean(value.disabled); };
      sync(); refreshInputs.push(sync); append(labelNode, input); append(parent, labelNode);
    } else if (t.kind === 'choice') {
      const choices = document.createElement('div'); choices.className = 'phone-tool-grid'; choices.setAttribute('aria-label', label);
      for (const c of p.choices ?? []) {
        const b = button(c.label, () => { change(t, c.value); renderKey = ''; }); b.disabled = Boolean(p.disabled); b.setAttribute('aria-pressed', String(p.value === c.value)); append(choices, b);
      }
      append(parent, choices);
    } else if (t.kind === 'toggle') {
      const b = button(`${label} · ${p.value ? '已开启' : '已关闭'}`, () => { change(t, !p.value); renderKey = ''; }); b.setAttribute('aria-pressed', String(Boolean(p.value))); b.disabled = Boolean(p.disabled); append(parent, b);
    } else if (t.id.startsWith('memory')) {
      append(parent, text(String(p.value || label)));
      for (const [id, name] of [['load', '应用'], ['save', '保存当前设置'], ['rename', '重命名']]) append(parent, button(name, () => { change(t, id); update(); }));
    } else toolButton(t, parent);
    if (p.disabled && state().live) append(parent, text('Live 已固定字号与对齐，可修改三行文字。', 'phone-note'));
  }
  function liveAction(selector: string, label: string, parent: HTMLElement) {
    const original = liveHost.querySelector<HTMLButtonElement>(selector);
    const b = button(label, () => { original?.click(); update(); }); b.disabled = !original || original.disabled; append(parent, b);
  }
  function render() {
    frame = 0; if (!active || disposed) return;
    const s = state();
    if (s.image !== renderedImage || s.beforeImage !== renderedBefore) { renderedImage = s.image; renderedBefore = s.beforeImage; renderKey = ''; }
    if (!s.image && screen !== 'start') { screen = 'start'; rollback = null; } if (!s.settings.compareEnabled) target = 'after';
    else if (s.brush) target = owner().value(find('retouchTarget')).value === 'before' ? 'before' : 'after';
    if (s.notice !== lastNotice) { lastNotice = s.notice; message = /失败|错误|请先|不支持|不能|无法|已保存|已应用|还没有|已恢复|已移除|已同步/.test(s.notice) ? s.notice : ''; }
    const liveStatus = liveHost.querySelector('output')?.textContent ?? '';
    const key = JSON.stringify([screen, group, selectedTool, target, Boolean(s.image), Boolean(s.beforeImage), s.live, s.settings.compareEnabled, pendingMode, s.busy, s.brush, liveStatus, message]);
    root.dataset.screen = screen; panel.classList.toggle('phone-at-start', screen === 'start');
    root.dataset.target = target;
    if (key === renderKey) { refreshInputs.forEach(fn => fn()); positionSelection(); return; }
    renderKey = key; refreshInputs = []; header.replaceChildren(); start.replaceChildren(); hint.replaceChildren(); dock.replaceChildren();
    const editing = !['start', 'home', 'export'].includes(screen);
    append(header, button(editing ? '取消' : screen === 'export' ? '返回' : screen === 'home' ? '照片' : '文案页', () => {
      if (editing) finish(true); else if (screen === 'export') open('home'); else if (screen === 'home') open('start'); else owner().back();
    }));
    const h = document.createElement('strong'); h.textContent = screen === 'tool' ? (find(selectedTool)?.label ?? '调整') : screen === 'group' ? groupTitles[group] || titles.group : titles[screen]; append(header, h);
    const right = button(editing ? '完成' : '导出', () => editing ? finish() : open('export'), 'phone-accent'); right.disabled = !editing && !s.image; append(header, right);
    start.hidden = screen !== 'start'; dock.hidden = screen === 'start'; hint.hidden = screen === 'start';
    if (screen === 'start') {
      append(start, text('先选成品，再放照片', 'phone-heading'), text('照片只在当前设备处理', 'phone-note'));
      modes(start); photoCards(start);
      append(start, text(s.live ? '两张照片 → 三行文案 → 3 秒 Live' : s.settings.compareEnabled ? '精修照做主画面，素颜照做前后对比' : '放入精修照，修改文字即可导出', 'phone-note'));
      const go = button(pendingMode ? '正在准备 Live…' : '开始编辑', () => open('home'), 'phone-primary'); go.disabled = !s.image || (s.settings.compareEnabled && !s.beforeImage) || Boolean(pendingMode); append(start, go);
    } else {
      append(hint, text(screen === 'home' ? '轻点文字或照片，直接编辑' : screen === 'text' ? '三行文案 · 实时预览' : screen === 'layout' ? '成品尺寸与标题位置' : screen === 'stickers' ? '选择贴图，完成后应用' : screen === 'group' && group === 'text' ? '文字样式 · 实时预览' : s.brush ? `正在涂抹：${target === 'after' ? '精修照' : '素颜照'}` : `正在编辑：${target === 'after' ? '精修照' : '素颜照'}`));
      if (screen === 'home') {
        if (s.live) { const row = document.createElement('div'); row.className = 'phone-live-row'; liveAction('.live-play', '播放 Live', row); append(row, button('动画贴图', () => open('stickers'))); append(dock, row); }
        const nav = document.createElement('nav'); nav.className = 'phone-main-actions'; nav.setAttribute('aria-label', '常用工具');
        for (const [id, label] of mainActions) append(nav, button(label, () => open(id)));
        append(dock, nav);
      } else if (screen === 'photo') photoCards(dock);
      else if (screen === 'text') {
        for (const id of ['topText', 'bottomText', 'subtitle']) renderTool(find(id), dock);
        append(dock, button('文字样式', () => open('group', 'text')));
      } else if (screen === 'layout') {
        renderTool(find('platform'), dock); append(dock, text('标题位置', 'phone-note')); renderTool(find('template'), dock);
      } else if (screen === 'adjust') {
        targetPicker(dock);
        const row = document.createElement('div'); row.className = 'phone-tool-grid';
        for (const [id, label] of [['compose', '位置与大小'], ['image', '亮度与压暗'], ['retouch', '局部提亮']] as const) append(row, button(label, () => { open('group', id); if (id === 'retouch' && !s.brush) change(find('retouchEnabled'), true); })); append(dock, row);
      } else if (screen === 'group') {
        if (['compose', 'image', 'retouch'].includes(group)) targetPicker(dock);
        if (group === 'compose') append(dock, text('拖动照片移动，双指缩放；也可点选精确调整。', 'phone-note'));
        toolList(group, dock, t => !['target', 'retouchTarget', 'retouchEnabled'].includes(t.id) && !(group === 'text' && t.kind === 'text'));
      } else if (screen === 'tool') { const t = find(selectedTool); if (t) renderTool(t, dock); append(dock, button('返回工具', () => open('group', group), 'phone-back')); }
      else if (screen === 'more') {
        const grid = document.createElement('div'); grid.className = 'phone-tool-grid';
        append(grid, button('成品形式', () => { commit(); open('start'); }));
        append(grid, button(`安全区 · ${guides ? '显示' : '隐藏'}`, () => { guides = !guides; owner().preview(active, guides); renderKey = ''; update(); }));
        append(grid, button('水印与记忆', () => open('group', 'more')));
        toolButton(find('syncCover'), grid); toolButton(find('syncCopy'), grid);
        if (s.live) append(grid, button('动画贴图', () => open('stickers')));
        append(dock, grid);
      } else if (screen === 'stickers') {
        const row = document.createElement('div'); row.className = 'phone-stickers';
        for (const card of liveHost.querySelectorAll<HTMLButtonElement>('[data-style]')) {
          const b = button(card.getAttribute('aria-label') || '贴图', () => { card.click(); renderKey = ''; update(); }); b.setAttribute('aria-pressed', card.getAttribute('aria-pressed') || 'false');
          const original = card.querySelector('canvas'); if (original) { const thumb = document.createElement('canvas'); thumb.width = original.width; thumb.height = original.height; thumb.getContext('2d')!.drawImage(original, 0, 0); b.insertBefore(thumb, b.firstChild); } append(row, b);
        }
        append(dock, row);
      } else if (screen === 'rules') { append(dock, text(document.querySelector('#coverRules')?.textContent?.trim() || '人物原片不拉伸，核心文案放在安全区内。导出自动隐藏辅助线。', 'phone-rules')); }
      else if (screen === 'export') {
        const ready = Boolean(s.image && (!s.settings.compareEnabled || s.beforeImage));
        append(dock, text(ready ? '保存当前成品' : '请先添加精修照和素颜照', 'phone-note'));
        for (const [format, label] of [['jpeg', '保存高清 JPG'], ['png', '保存 PNG']] as const) {
          const b = button(s.busy ? '正在生成…' : label, () => void owner().export(format, false).finally(update), 'phone-primary'); b.disabled = !ready || s.busy; append(dock, b);
        }
        if (s.live) {
          const native = liveHost.querySelector('.live-export')?.textContent === '保存实况';
          liveAction('.live-export', native ? '保存实况' : '导出 Live', dock);
          if (!liveHost.querySelector<HTMLButtonElement>('.live-cancel')?.hidden) liveAction('.live-cancel', '取消导出', dock);
          append(dock, text(native ? '保存到苹果「照片」，长按播放。' : '下载照片与视频配对文件。要在 iPhone 相册长按播放，需通过 Mac 保存助手导入「照片」。', 'phone-note'));
          const helper = liveHost.querySelector<HTMLAnchorElement>('.live-helper');
          if (!native && helper) append(dock, helper.cloneNode(true));
        }
        const originals = document.createElement('details'); append(originals, Object.assign(document.createElement('summary'), { textContent: '仅导出照片' }));
        for (const [format, label] of [['jpeg', '原图 JPG'], ['png', '原图 PNG']] as const) append(originals, button(label, () => void owner().export(format, true).finally(update)));
        append(dock, originals);
      }
    }
    if (message || liveStatus) { const notice = text(message || liveStatus, 'phone-notice'); notice.setAttribute('role', 'status'); append(screen === 'start' ? start : dock, notice); }
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
    if (active && screen !== 'start') {
      const cs = getComputedStyle(canvasShell);
      const width = canvasShell.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const height = canvasShell.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const fitted = Math.max(1, Math.min(width, height * canvas.width / canvas.height));
      canvas.style.setProperty('width', `${fitted}px`, 'important');
      canvas.style.setProperty('height', `${fitted * canvas.height / canvas.width}px`, 'important');
    }
    const show = active && ['adjust', 'group', 'tool', 'text', 'stickers'].includes(screen);
    selection.hidden = !show; if (!show) return;
    const r = canvas.getBoundingClientRect(); const areas = regions();
    const sticker = {x:areas.text.x,y:areas.text.y+areas.text.height+24*canvas.width/1080,width:Math.max(0,Math.min(450*canvas.width/1080,areas.before.x-36*canvas.width/1080-areas.text.x)),height:200*canvas.width/1080};
    const box = screen === 'stickers' ? sticker : screen === 'text' || group === 'text' && ['group','tool'].includes(screen) ? areas.text : target === 'before' ? areas.before : {x:0,y:0,width:canvas.width,height:canvas.height};
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
    if(!active||['start','export'].includes(screen)||state().brush||e.pointerType!=='touch')return;
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
      if(gesture.moved)open('group','compose');
      else if(e.type!=='pointercancel'){
        if(gesture.hit==='text')open('text');else if(gesture.hit==='stickers')open('stickers');
        else {setTarget(gesture.hit as 'after'|'before');open('adjust');}
      }
      gesture=null;
    }
  }
  canvasShell.addEventListener('pointerdown',down,true);canvasShell.addEventListener('pointermove',move,true);canvasShell.addEventListener('pointerup',up,true);canvasShell.addEventListener('pointercancel',up,true);
  const observer = new MutationObserver(()=>{renderKey='';update();});if(liveHost)observer.observe(liveHost,{subtree:true,childList:true,attributes:true,characterData:true});
  window.addEventListener('resize',viewport);pointer.addEventListener('change',viewport);window.visualViewport?.addEventListener('resize',viewport);root.addEventListener('focusin',viewport);root.addEventListener('focusout',viewport);
  const sizeObserver = new ResizeObserver(() => { positionSelection(); }); sizeObserver.observe(canvasShell);
  viewport();
  return { update, destroy(){ disposed=true;cancelAnimationFrame(frame);observer.disconnect();sizeObserver.disconnect();window.removeEventListener('resize',viewport);pointer.removeEventListener('change',viewport);window.visualViewport?.removeEventListener('resize',viewport);root.removeEventListener('focusin',viewport);root.removeEventListener('focusout',viewport);canvasShell.removeEventListener('pointerdown',down,true);canvasShell.removeEventListener('pointermove',move,true);canvasShell.removeEventListener('pointerup',up,true);canvasShell.removeEventListener('pointercancel',up,true);if(active){document.body.classList.remove('nbo-phone');owner().preview(false,guides);}root.replaceChildren();} };
}
