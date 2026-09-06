import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_COVER_SETTINGS } from '../app/cover/core/editor-settings.ts';
import { getComparisonEvidenceLayout } from '../app/cover/compare-layout.ts';
import { readFile } from 'node:fs/promises';
import { createTraceEnvironment, loadCurrentCore } from './helpers/render-trace-harness.mjs';

const moduleUrl = new URL('../app/cover/core/live-layout.ts', import.meta.url);
let live;
try { live = await import(moduleUrl.href); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

test('Live 锁定值不覆盖原设置，关闭后原字号、版式和对比状态完整保留', () => {
  assert.ok(live, '缺少 Live 排版模块');
  const original = { ...DEFAULT_COVER_SETTINGS, templateId: 'bottom-right', textScale: 83, subtitleScale: 135, beforeFrameScale: 102, compareEnabled: false };
  const snapshot = structuredClone(original);
  const active = live.getLiveSettings(original);
  assert.equal(active.textScale, 45);
  assert.equal(active.bottomTextScale, 45);
  assert.equal(active.subtitleScale, 114);
  assert.equal(active.templateId, 'middle-left');
  assert.equal(active.compareEnabled, true);
  assert.deepEqual(original, snapshot);
});

test('9:16 和 3:4 中三行文字顶端与素颜框对齐，动画只占左下指定区域', () => {
  assert.ok(live, '缺少 Live 排版模块');
  for (const height of [1920, 1440]) {
    const layout = live.getLiveLayout({ width: 1080, height });
    const { frame, safe } = getComparisonEvidenceLayout({ width: 1080, height }, 114.4);
    assert.equal(layout.top, frame.y);
    assert.ok(layout.animation.y > layout.top + 300);
    assert.ok(layout.animation.x >= safe.x);
    assert.ok(layout.animation.x + layout.animation.width < frame.x);
    assert.ok(layout.animation.y + layout.animation.height < safe.y + safe.height);
    assert.ok(layout.textWidth >= layout.headlineSize * 6);
  }
});

test('Live 状态保留构图、颜色与照片调整，并阻止记忆点或复位改动锁定值', () => {
  assert.ok(live, '缺少 Live 排版模块');
  const original = { ...DEFAULT_COVER_SETTINGS, textScale: 86, compareEnabled: false };
  const next = live.updateLiveSettings(original, (current) => ({ ...current, textScale: 200, offsetX: 32, topColor: '#123456', topText: '男士素人改造' }));
  assert.equal(next.textScale, 86);
  assert.equal(next.compareEnabled, false);
  assert.equal(next.offsetX, 32);
  assert.equal(next.topColor, '#123456');
  assert.equal(next.topText, '男士素人改造');
  assert.equal(live.getLiveSettings(next).textScale, 45);
});

test('三行文字保持单行固定字号，按完整 Unicode 字符限制为六字', () => {
  assert.ok(live, '缺少 Live 排版模块');
  assert.equal(live.normalizeLiveLine('男士\n素人改造作品'), '男士素人改造');
  assert.equal(live.normalizeLiveLine('😀😀😀😀😀😀😀'), '😀😀😀😀😀😀');
});

test('三秒分镜依次是素颜收进框、精修落到构图、完成动效，封面对应最后一帧', () => {
  assert.equal(typeof live?.getLiveMotionState, 'function', '缺少三秒分镜');
  assert.deepEqual(live.getLiveMotionState(0), { phase:'before', progress:0, overlayOpacity:0, animationTime:0 });
  assert.equal(live.getLiveMotionState(29/30).progress,1);
  assert.equal(live.getLiveMotionState(1).phase,'after');
  assert.equal(live.getLiveMotionState(1).progress,0);
  assert.equal(live.getLiveMotionState(59/30).progress,1);
  assert.equal(live.getLiveMotionState(2).phase,'complete');
  assert.equal(live.getLiveMotionState(89/30).animationTime,3);
  assert.equal(live.getLiveMotionState(89/30).overlayOpacity,1);
  assert.deepEqual(live.getLiveMotionState(3),live.getLiveMotionState(89/30));
});

test('真实绘制在 Live 模式锁定三行字号和首行顶对齐，普通渲染输入不被写回', async () => {
  const environment = createTraceEnvironment();
  const core = loadCurrentCore(await readFile(new URL('../docs/cover-core.js', import.meta.url), 'utf8'), environment);
  const settings = { ...DEFAULT_COVER_SETTINGS, topText: '男士素人改造', bottomText: '原来普通男生', subtitle: '也能拍成这样', textScale: 100 };
  core.drawCover({ canvas: environment.createCanvas('live'), image: null, beforeImage: null, watermark: null,
    settings, preset: { id: 'douyin', width: 1080, height: 1920 }, includeGuide: false, live: {} });
  const lines = environment.recorder.log.filter(([name, value]) => name === 'fillText' && [settings.topText, settings.bottomText, settings.subtitle].includes(value));
  assert.equal(lines.length, 3);
  assert.equal(lines[0][2], 54, 'Live 文字必须固定左对齐');
  assert.equal(settings.textScale, 100, '绘制不得改写普通模式的字号');
  assert.ok(environment.recorder.log.some((entry) => entry[0] === 'set.font' && entry[1] === '900 76px sans-serif'), '应使用固定标题字号');
});
