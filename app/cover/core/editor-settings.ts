// @ts-expect-error Node's built-in TypeScript loader requires the explicit extension used by direct tests.
import { COVER_TEMPLATES, PLATFORM_PRESETS, type CoverTemplate, type PlatformPreset } from "../cover-config.ts";

export type CoverSettings = {
  platformId: PlatformPreset["id"];
  templateId: CoverTemplate["id"];
  topText: string;
  bottomText: string;
  subtitle: string;
  topColor: string;
  bottomColor: string;
  dividerColor: string;
  showDivider: boolean;
  subtitleColor: string;
  subtitleScale: number;
  brightness: number;
  zoom: number;
  offsetX: number;
  offsetXRangeVersion: number;
  offsetY: number;
  rotation: number;
  textScale: number;
  bottomTextScale: number;
  textScaleLinked: boolean;
  textStroke: number;
  textShadow: number;
  textShadowDefaultVersion: number;
  titleScaleVersion: number;
  shade: number;
  bottomShade: number;
  showSafeArea: boolean;
  compareEnabled: boolean;
  beforeZoom: number;
  beforeOffsetX: number;
  beforeOffsetY: number;
  beforeRotation: number;
  beforeBrightness: number;
  beforeShade: number;
  beforeBottomShade: number;
  beforeFrameScale: number;
  watermarkScale: number;
  watermarkAlign: "left" | "center" | "right";
  watermarkOpacity: number;
  watermarkEnabled: boolean;
  watermarkDefaultVersion: number;
};

export type CoverSettingsNormalizationProfile = "canonical" | "static-storage" | "static-memory";

export const DEFAULT_COVER_SETTINGS: CoverSettings = {
  platformId: "douyin",
  templateId: "middle-left",
  topText: "男人的",
  bottomText: "高级感",
  subtitle: "不被定义的自己",
  topColor: "#FFFFFF",
  bottomColor: "#FFFFFF",
  dividerColor: "#C9A77A",
  showDivider: true,
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
  showSafeArea: true,
  compareEnabled: false,
  beforeZoom: 100,
  beforeOffsetX: 0,
  beforeOffsetY: 0,
  beforeRotation: 0,
  beforeBrightness: 100,
  beforeShade: 0,
  beforeBottomShade: 100,
  beforeFrameScale: 100,
  watermarkScale: 100,
  watermarkAlign: "left",
  watermarkOpacity: 50,
  watermarkEnabled: false,
  watermarkDefaultVersion: 1,
};

const STATIC_SETTING_ALIASES = {
  platform: "platformId",
  template: "templateId",
  divider: "showDivider",
  safe: "showSafeArea",
} as const;

function hasOwn(source: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function inferProfile(source: Record<string, unknown>): CoverSettingsNormalizationProfile {
  return Object.keys(STATIC_SETTING_ALIASES).some((key) => hasOwn(source, key))
    ? "static-storage"
    : "canonical";
}

function applyStaticAliases(source: Record<string, unknown>) {
  for (const [legacyKey, canonicalKey] of Object.entries(STATIC_SETTING_ALIASES)) {
    if (hasOwn(source, legacyKey)) source[canonicalKey] = source[legacyKey];
  }
}

function normalizeTemplateId(
  value: unknown,
  fallback: CoverTemplate["id"] = DEFAULT_COVER_SETTINGS.templateId,
): CoverTemplate["id"] {
  const legacy: Record<string, CoverTemplate["id"]> = {
    left: "top-left",
    bottom: "top-center",
    badge: "middle-left",
    center: "middle-center",
    clean: "bottom-left",
    right: "bottom-right",
  };
  const id = typeof value === "string" ? value : "";
  if (legacy[id]) return legacy[id];
  return COVER_TEMPLATES.some((template) => template.id === id)
    ? id as CoverTemplate["id"]
    : fallback;
}

export function normalizeCoverSettings(
  value: unknown,
  requestedProfile?: CoverSettingsNormalizationProfile,
): CoverSettings {
  const source: Record<string, unknown> = value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
  const profile = requestedProfile ?? inferProfile(source);
  if (profile !== "canonical") applyStaticAliases(source);

  if (!Object.keys(DEFAULT_COVER_SETTINGS).some((key) => hasOwn(source, key))) {
    return { ...DEFAULT_COVER_SETTINGS };
  }

  const numberValue = (key: keyof CoverSettings, min: number, max: number) => {
    const parsed = Number(source[key]);
    return Number.isFinite(parsed)
      ? Math.max(min, Math.min(max, parsed))
      : DEFAULT_COVER_SETTINGS[key] as number;
  };
  const booleanValue = (key: keyof CoverSettings) => typeof source[key] === "boolean"
    ? source[key] as boolean
    : DEFAULT_COVER_SETTINGS[key] as boolean;
  const textValue = (key: "topText" | "bottomText" | "subtitle", maxLength: number) => typeof source[key] === "string"
    ? source[key].slice(0, maxLength)
    : DEFAULT_COVER_SETTINGS[key];
  const colorValue = (key: "topColor" | "bottomColor" | "dividerColor" | "subtitleColor") => {
    const color = typeof source[key] === "string" ? source[key].toUpperCase() : "";
    return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_COVER_SETTINGS[key];
  };

  if (source.bottomColor === "#FEE800") source.bottomColor = "#FFFFFF";
  if (Number(source.watermarkOpacity) === 92) source.watermarkOpacity = 50;
  if (Number(source.watermarkScale) <= 42) source.watermarkScale = 100;
  if (profile !== "static-memory" && Number(source.shade) === 62) source.shade = 0;
  if (profile !== "static-memory" && source.watermarkDefaultVersion !== 1) {
    source.watermarkEnabled = false;
    source.watermarkDefaultVersion = 1;
  }
  if (Number(source.titleScaleVersion ?? 0) < 2) {
    source.textScale = Math.round(Number(source.textScale || 100) / 1.8);
  }
  if (Number(source.titleScaleVersion ?? 0) < 3) {
    source.bottomTextScale = Number(source.textScale || 100);
    source.textScaleLinked = true;
    source.titleScaleVersion = 3;
  }
  if (source.textShadowDefaultVersion !== 1) {
    source.textShadow = 50;
    source.textShadowDefaultVersion = 1;
  }
  if (source.offsetXRangeVersion !== 2) {
    const previousOffsetX = Number(source.offsetX ?? (source.offsetXRangeVersion === 1 ? 100 : 0));
    source.offsetX = Math.max(
      -200,
      Math.min(200, source.offsetXRangeVersion === 1 ? previousOffsetX - 100 : previousOffsetX),
    );
    source.offsetXRangeVersion = 2;
  }
  if (source.bottomText === "藏在自然状态里") source.bottomText = "藏在自然状态";

  const platformId = typeof source.platformId === "string"
    && PLATFORM_PRESETS.some((item) => item.id === source.platformId)
    ? source.platformId as PlatformPreset["id"]
    : DEFAULT_COVER_SETTINGS.platformId;
  const watermarkAlign = source.watermarkAlign === "left"
    || source.watermarkAlign === "center"
    || source.watermarkAlign === "right"
    ? source.watermarkAlign
    : DEFAULT_COVER_SETTINGS.watermarkAlign;
  const staticTemplateFallback = profile === "canonical"
    ? DEFAULT_COVER_SETTINGS.templateId
    : "top-left";
  const staticWatermarkDefaultVersion = Number(source.watermarkDefaultVersion);

  return {
    platformId,
    templateId: normalizeTemplateId(source.templateId, staticTemplateFallback),
    topText: textValue("topText", 18),
    bottomText: textValue("bottomText", 18),
    subtitle: textValue("subtitle", 38),
    topColor: colorValue("topColor"),
    bottomColor: colorValue("bottomColor"),
    dividerColor: colorValue("dividerColor"),
    showDivider: booleanValue("showDivider"),
    subtitleColor: colorValue("subtitleColor"),
    subtitleScale: numberValue("subtitleScale", 60, 160),
    brightness: numberValue("brightness", 0, 200),
    zoom: numberValue("zoom", 0, 400),
    offsetX: numberValue("offsetX", -200, 200),
    offsetXRangeVersion: 2,
    offsetY: numberValue("offsetY", -200, 200),
    rotation: numberValue("rotation", -180, 180),
    textScale: numberValue("textScale", 0, 200),
    bottomTextScale: numberValue("bottomTextScale", 0, 200),
    textScaleLinked: booleanValue("textScaleLinked"),
    textStroke: numberValue("textStroke", 0, 100),
    textShadow: numberValue("textShadow", 0, 100),
    textShadowDefaultVersion: 1,
    titleScaleVersion: 3,
    shade: numberValue("shade", 0, 100),
    bottomShade: numberValue("bottomShade", 0, 100),
    showSafeArea: booleanValue("showSafeArea"),
    compareEnabled: booleanValue("compareEnabled"),
    beforeZoom: numberValue("beforeZoom", 100, 300),
    beforeOffsetX: numberValue("beforeOffsetX", -100, 100),
    beforeOffsetY: numberValue("beforeOffsetY", -100, 100),
    beforeRotation: numberValue("beforeRotation", -180, 180),
    beforeBrightness: numberValue("beforeBrightness", 0, 200),
    beforeShade: numberValue("beforeShade", 0, 100),
    beforeBottomShade: numberValue("beforeBottomShade", 0, 100),
    beforeFrameScale: numberValue("beforeFrameScale", 100, 120),
    watermarkScale: numberValue("watermarkScale", 0, 300),
    watermarkAlign,
    watermarkOpacity: numberValue("watermarkOpacity", 0, 100),
    watermarkEnabled: booleanValue("watermarkEnabled"),
    watermarkDefaultVersion: profile === "static-memory"
      && Number.isFinite(staticWatermarkDefaultVersion)
      ? staticWatermarkDefaultVersion
      : 1,
  };
}

export function updateCoverSetting<K extends keyof CoverSettings>(
  settings: CoverSettings,
  key: K,
  value: CoverSettings[K],
): CoverSettings {
  return normalizeCoverSettings({ ...settings, [key]: value });
}
