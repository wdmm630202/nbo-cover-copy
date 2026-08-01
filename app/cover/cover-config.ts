export type PlatformPreset = {
  id: "douyin" | "xiaohongshu" | "shipinhao";
  label: string;
  ratio: string;
  width: number;
  height: number;
  note: string;
};

export type CoverTemplate = {
  id: "left" | "bottom" | "badge" | "center" | "clean" | "right";
  name: string;
  hint: string;
  number: string;
};

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: "douyin",
    label: "抖音",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    note: "竖屏封面，带居中 3:4 主页安全区",
  },
  {
    id: "xiaohongshu",
    label: "小红书",
    ratio: "3:4",
    width: 1080,
    height: 1440,
    note: "适合图文与竖版内容封面",
  },
  {
    id: "shipinhao",
    label: "视频号",
    ratio: "3:4",
    width: 1080,
    height: 1440,
    note: "竖版内容常用工作尺寸",
  },
];

export const COVER_TEMPLATES: CoverTemplate[] = [
  { id: "left", name: "上方左题", hint: "上方区域，左侧标题", number: "01" },
  { id: "bottom", name: "上方冲击", hint: "上方区域，两行醒目", number: "02" },
  { id: "badge", name: "居中向左", hint: "居中区域，左侧标题", number: "03" },
  { id: "center", name: "居中主角", hint: "居中区域，适合留白", number: "04" },
  { id: "clean", name: "下方留白", hint: "下方区域，避开播放量", number: "05" },
  { id: "right", name: "下方右题", hint: "下方区域，右侧阅读", number: "06" },
];

export const DOUYIN_HOME_GRID_SAFE_AREA = {
  cropTop: 240,
  cropBottom: 1680,
  horizontalInset: 54,
  verticalInset: 54,
  playCountReserve: 144,
} as const;

export const COVER_RULES_VERSION = "南铂封面规范 2.0";
