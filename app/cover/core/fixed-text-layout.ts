/** Normal portrait cover typography. Coordinates are in a 1080px-wide canvas. */
export const FIXED_TEXT_FRAME = {
  left: 54, width: 576, top: 1008, bottom: 1472,
  maxFont: 168, minFont: 96, subtitleFont: 66, dividerThickness: 5,
  minGap: 16, maxGap: 120,
} as const;
type Ink = { width: number; ascent: number; descent: number };
type Input = { topText: string; bottomText: string; subtitle: string; width: number; height: number;
  showDivider?: boolean; measure: (text: string, fontSize: number, bold: boolean) => Ink };
export function usesFixedTextLayout(settings: { fixedTextLayout?: boolean; templateId: string; compareEnabled: boolean }) {
  return settings.fixedTextLayout === true && settings.templateId === 'bottom-left' && !settings.compareEnabled;
}
export function solveFixedTextLayout(input: Input) {
  const { topText, bottomText, subtitle, measure } = input;
  const s = input.width / 1080;
  const offset = input.height / input.width < 1.5 ? 240 : 0;
  const top = (FIXED_TEXT_FRAME.top-offset)*s;
  const bottom = (FIXED_TEXT_FRAME.bottom-offset)*s;
  const maxWidth = FIXED_TEXT_FRAME.width*s;
  const subtitleFontSize = FIXED_TEXT_FRAME.subtitleFont*s;
  const subtitleInk = measure(subtitle, subtitleFontSize, false);
  // Reserve the divider thickness even when hidden, so toggling it
  // does not move any text. The three surrounding ink gaps share one size.
  const dividerSlot = FIXED_TEXT_FRAME.dividerThickness*s;
  const dividerThickness = input.showDivider === false ? 0 : dividerSlot;
  const gapCount = 3;
  let error: string | null = null;
  const count = (text: string) => Array.from(new Intl.Segmenter('zh', {granularity:'grapheme'}).segment(text)).length;
  if (!topText.trim() || !bottomText.trim()) error = '请填写两行主标题，每行最多5个字';
  else if ([topText,bottomText].some(t=>count(t)>5 || /[\r\n]/.test(t))) error = '主标题每行最多5个字，请精简后导出';
  else if (!subtitle.trim() || /[\r\n]/.test(subtitle) || subtitleInk.width>maxWidth) error = '副标题字号固定，请保持一行并缩短文字（建议8字以内）';
  let fontSize = FIXED_TEXT_FRAME.maxFont*s;
  let topInk = measure(topText,fontSize,true);
  let bottomInk = measure(bottomText,fontSize,true);
  const available = bottom-top;
  for (; fontSize >= FIXED_TEXT_FRAME.minFont*s; fontSize -= .25*s) {
    topInk = measure(topText,fontSize,true); bottomInk = measure(bottomText,fontSize,true);
    const occupied = topInk.ascent+topInk.descent+bottomInk.ascent+bottomInk.descent+subtitleInk.ascent+subtitleInk.descent;
    if (Math.max(topInk.width,bottomInk.width)<=maxWidth && available-occupied-dividerSlot>=gapCount*FIXED_TEXT_FRAME.minGap*s) break;
  }
  const gap = (available-topInk.ascent-topInk.descent-bottomInk.ascent-bottomInk.descent-subtitleInk.ascent-subtitleInk.descent-dividerSlot)/gapCount;
  if (!error && (fontSize<FIXED_TEXT_FRAME.minFont*s || gap>FIXED_TEXT_FRAME.maxGap*s || gap<FIXED_TEXT_FRAME.minGap*s)) error='文案不适合当前文字区域，请精简或更换表达';
  const topBaseline=top+topInk.ascent;
  const bottomBaseline=topBaseline+topInk.descent+gap+bottomInk.ascent;
  const dividerY=bottomBaseline+bottomInk.descent+gap+(dividerSlot-dividerThickness)/2;
  const subtitleBaseline=bottom-subtitleInk.descent;
  return {error,top,bottom,left:FIXED_TEXT_FRAME.left*s,maxWidth,fontSize,subtitleFontSize,topInk,bottomInk,subtitleInk,gap,topBaseline,bottomBaseline,dividerY,dividerThickness,subtitleBaseline};
}

export function measureFixedText(context: CanvasRenderingContext2D, text: string, size: number, bold: boolean): Ink {
  context.font = `${bold ? 900 : 400} ${size}px sans-serif`;
  let ascent = 0, descent = 0;
  for (const character of Array.from(text || "国")) {
    const metrics = context.measureText(character);
    ascent = Math.max(ascent, metrics.actualBoundingBoxAscent || 0);
    descent = Math.max(descent, metrics.actualBoundingBoxDescent || 0);
  }
  return { width: context.measureText(text).width, ascent: ascent || size*.8, descent };
}
