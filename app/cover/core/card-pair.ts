import type { CoverSettings } from './editor-settings';
import type { CoverLiveFrame } from './render-core';
import type { CompareTextBounds } from '../compare-layout';
import { drawComparisonDashedFrame, getComparisonEvidenceLayout } from '../compare-layout';
import { getLiveCardPairLayout } from './live-layout';

type Rect = { x: number; y: number; width: number; height: number; radius: number };
type RoundPath = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => void;
type DrawText = (ctx: CanvasRenderingContext2D, settings: CoverSettings, width: number, height: number, watermark: HTMLImageElement | null, lines?: readonly number[], order?: "top-down" | "bottom-up") => CompareTextBounds;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const x = clamp(n); return x * x * (3 - 2 * x); };
function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${alpha})`;
}

function panel(ctx: CanvasRenderingContext2D, box: Rect, frame: CoverLiveFrame, scale: number, path: RoundPath, lines?: readonly number[], direction: "up" | "right" = "up") {
  ctx.save();
  path(ctx, box.x, box.y, box.width, box.height, box.radius);
  // Only the plate fades toward its related photo; glyphs and guides stay crisp.
  // Several eased stops avoid a hard band where the card blends into the image.
  const density = clamp((frame.density ?? 50) / 100);
  const base = frame.base ?? '#171b20';
  const plate = direction === "up"
    ? ctx.createLinearGradient(0, box.y + box.height, 0, box.y)
    : ctx.createLinearGradient(box.x, 0, box.x + box.width, 0);
  for (const [position, opacity] of [[0, 1], [.3, .97], [.55, .8], [.75, .46], [.9, .13], [1, 0]]) {
    plate.addColorStop(position, rgba(base, density * opacity));
  }
  ctx.fillStyle = plate;
  ctx.fill();
  ctx.strokeStyle = rgba(frame.accent ?? '#cbd7e0', .16);
  ctx.lineWidth = .8 * scale; ctx.stroke();
  if (frame.dashed) {
    ctx.scale(scale, scale);
    // Share the text's eased opacity for each height of the frame. A continuous
    // vertical gradient joins the rows without clipping or restarting dash spacing.
    let stroke: CanvasGradient | undefined;
    if (lines && lines.some(value => value < 1)) {
      stroke = ctx.createLinearGradient(0, box.y / scale, 0, (box.y + box.height) / scale);
      for (const [position, index] of [[0, 2], [.5, 1], [.85, 0], [1, 0]]) {
        stroke.addColorStop(position, `rgba(222,222,224,${.86 * clamp(lines[index] ?? 1)})`);
      }
    }
    drawComparisonDashedFrame(ctx, { x: box.x / scale, y: box.y / scale, width: box.width / scale, height: box.height / scale, radius: box.radius / scale }, path, stroke);
  }
  ctx.restore();
}

// The approved soft-laser path: continuous round corners, Gaussian leading edge
// and longer trailing light, with a smooth rise and decay. Geometry follows the panel.
function laser(ctx: CanvasRenderingContext2D, box: Rect, time: number, color: string, scale: number) {
  const p = clamp((time - 1.48) / .62);
  const envelope = smooth(p / .2) * (1 - smooth((p - .66) / .34));
  if (envelope === 0) return;
  const w = box.width / scale, h = box.height / scale, r = box.radius / scale;
  const sx = w - 2 * r, sy = h - 2 * r, arc = Math.PI * r / 2;
  const segments = [sx, arc, sy, arc, sx, arc, sy, arc];
  const length = 2 * (sx + sy) + 4 * arc;
  const point = (distance: number) => {
    let q = (distance % length + length) % length, seg = 0;
    while (seg < 7 && q > segments[seg]) q -= segments[seg++];
    const a = q / r;
    switch (seg) {
      case 0: return [r + q, 0];
      case 1: return [w - r + r * Math.cos(-Math.PI / 2 + a), r + r * Math.sin(-Math.PI / 2 + a)];
      case 2: return [w, r + q];
      case 3: return [w - r + r * Math.cos(a), h - r + r * Math.sin(a)];
      case 4: return [w - r - q, h];
      case 5: return [r + r * Math.cos(Math.PI / 2 + a), h - r + r * Math.sin(Math.PI / 2 + a)];
      case 6: return [0, h - r - q];
      default: return [r + r * Math.cos(Math.PI + a), r + r * Math.sin(Math.PI + a)];
    }
  };
  const head = (.025 + (1 - Math.cos(Math.PI * p)) / 2) * length;
  ctx.save(); ctx.translate(box.x, box.y); ctx.scale(scale, scale); ctx.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const distance = i / 160 * length;
    const d = ((head - distance + length * 1.5) % length) - length / 2;
    const intensity = Math.exp(-.5 * (d / (d < 0 ? 22 : 107)) ** 2) * envelope;
    if (intensity < .002) continue;
    const a = point(distance), b = point((i + 1) / 160 * length);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.shadowColor = rgba(color, intensity * .5); ctx.shadowBlur = 5;
    ctx.strokeStyle = rgba(color, intensity * .14); ctx.lineWidth = 6; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = rgba(color, intensity * .85); ctx.lineWidth = .85; ctx.stroke();
  }
  ctx.restore();
}

export function drawLiveCardPair(ctx: CanvasRenderingContext2D, frame: CoverLiveFrame, settings: CoverSettings, width: number, height: number, drawText: DrawText, path: RoundPath) {
  const s = width / 1080, t = frame.time ?? 2.1;
  // Measure with the actual cover renderer so edits, shadows and the original
  // one-character gradient divider never acquire a separate card-only style.
  ctx.save(); ctx.globalAlpha = 0;
  const text = drawText(ctx, settings, width, height, null, undefined, "bottom-up");
  ctx.restore();
  // Match drawComparisonEditorialOverlay: round once on its 1080px design grid,
  // then scale the dashed-frame geometry for previews and original-size exports.
  const reference = getComparisonEvidenceLayout({ width: 1080, height: height / s }, settings.beforeFrameScale).frame;
  const comparisonFrame = { x: reference.x * s, y: reference.y * s, width: reference.width * s, height: reference.height * s };
  const { upper, lower } = getLiveCardPairLayout(comparisonFrame, width, s);
  const entrance = frame.entrance ?? 1;
  if (entrance > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(upper.x - 8 * s, upper.y - 8 * s, upper.width + 16 * s, lower.y - upper.y + 8 * s); ctx.clip();
    ctx.globalAlpha *= entrance;
    const moving = { ...upper, y: upper.y + (lower.y - upper.y) * (1 - entrance) };
    panel(ctx, moving, frame, s, path);
    const fit = Math.min(upper.width / 462, upper.height / 342);
    const source = frame.source;
    // Clean after-face artwork keeps every original glyph; scale uniformly.
    ctx.drawImage(frame.image, source.x + 9, source.y + 9, 462, 342,
      upper.x + (upper.width - 462 * fit) / 2, moving.y + (upper.height - 342 * fit) / 2, 462 * fit, 342 * fit);
    laser(ctx, moving, t, frame.accent ?? '#cbd7e0', s);
    ctx.restore();
  }
  ctx.save(); ctx.globalAlpha *= frame.intro ?? 1;
  const movingLower = { ...lower, y: lower.y + 18 * s * (1 - (frame.intro ?? 1)) };
  panel(ctx, movingLower, frame, s, path, frame.lines, "right");
  path(ctx, movingLower.x, movingLower.y, lower.width, lower.height, lower.radius); ctx.clip();
  const fit = Math.min(1, (lower.width - 36 * s) / Math.max(1, text.right - text.left), (lower.height - 36 * s) / Math.max(1, text.bottom - text.top));
  // Anchor the completed block, not the currently visible rows, so later reveals
  // never move a line that has already appeared.
  ctx.translate(lower.x + (lower.width - (text.right - text.left) * fit) / 2 - text.left * fit, movingLower.y + (lower.height - (text.bottom - text.top) * fit) / 2 - text.top * fit);
  ctx.scale(fit, fit);
  drawText(ctx, settings, width, height, null, frame.lines, "bottom-up");
  ctx.restore();
  const flash = Math.sin(clamp((t - 1.4) / .3) * Math.PI);
  if (t > 1.4 && t < 1.7) {
    ctx.save();
    const light = ctx.createLinearGradient(lower.x, 0, lower.x + lower.width, 0);
    light.addColorStop(0, rgba(frame.accent ?? '#cbd7e0', 0));
    light.addColorStop(.5, rgba(frame.accent ?? '#cbd7e0', flash * .72));
    light.addColorStop(1, rgba(frame.accent ?? '#cbd7e0', 0));
    ctx.shadowColor = frame.accent ?? '#cbd7e0'; ctx.shadowBlur = 6 * s;
    ctx.fillStyle = light; ctx.fillRect(lower.x + lower.radius, lower.y, lower.width - lower.radius * 2, 1.4 * s);
    ctx.restore();
  }
}
