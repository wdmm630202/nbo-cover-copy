import type { CoverSettings } from "./editor-settings";

export const LIVE_LOCKED_VALUES = Object.freeze({
  templateId: "middle-left" as const,
  textScale: 45,
  bottomTextScale: 45,
  textScaleLinked: true,
  subtitleScale: 114,
  beforeFrameScale: 114.4,
  compareEnabled: true,
});

export const LIVE_TEXT_KEYS = ["topText", "bottomText", "subtitle"] as const;
export type LiveText = Pick<CoverSettings, typeof LIVE_TEXT_KEYS[number]>;
// User-approved defaults: other Live controls must not replace these three lines.
export const LIVE_DEFAULT_TEXT: Readonly<LiveText> = Object.freeze({
  topText: "男士素人改造",
  bottomText: "原来普通男生",
  subtitle: "也能拍成这样",
});

export function normalizeLiveLine(value: string) {
  const singleLine = value.replace(/[\r\n]/g, "");
  return Array.from(new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(singleLine))
    .slice(0, 6).map((part) => part.segment).join("");
}

export function getLiveSettings<T extends CoverSettings>(settings: T, text?: LiveText): T {
  return {
    ...settings,
    ...LIVE_LOCKED_VALUES,
    topText: normalizeLiveLine(text?.topText ?? settings.topText),
    bottomText: normalizeLiveLine(text?.bottomText ?? settings.bottomText),
    subtitle: normalizeLiveLine(text?.subtitle ?? settings.subtitle),
  };
}

export function updateLiveSettings<T extends CoverSettings>(
  original: T,
  action: T | ((settings: T) => T),
  text?: LiveText,
): T {
  const active = getLiveSettings(original, text);
  const updated = typeof action === "function" ? action(active) : action;
  const result = { ...updated };
  for (const key of Object.keys(LIVE_LOCKED_VALUES) as (keyof typeof LIVE_LOCKED_VALUES)[]) {
    Object.assign(result, { [key]: original[key] });
  }
  for (const key of LIVE_TEXT_KEYS) {
    // A control unrelated to text must not truncate a pre-existing long normal-mode title.
    result[key] = updated[key] === active[key] ? original[key] : normalizeLiveLine(updated[key]);
  }
  return result;
}

export function getLiveMotionState(time: number) {
  const t = Math.max(0, Math.min(89 / 30, Number.isFinite(time) ? time : 0));
  const second = Math.min(2, Math.floor(t));
  const linear = Math.min(1, Math.max(0, (t - second) * 30 / 29));
  const progress = linear > 1 - 1e-9 ? 1 : 1 - (1 - linear) ** 3;
  return {
    phase: (["before", "after", "complete"] as const)[second],
    progress,
    overlayOpacity: second === 2 ? Math.min(1, linear * 5) : 0,
    animationTime: second === 2 ? (linear > 1 - 1e-9 ? 3 : linear * 3) : 0,
  };
}
