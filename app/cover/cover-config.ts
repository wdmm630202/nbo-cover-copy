export type PlatformPreset = {
  id: "douyin" | "xiaohongshu" | "shipinhao";
  label: string;
  ratio: string;
  width: number;
  height: number;
  note: string;
};

export type CoverTemplate = {
  id:
    | "top-left" | "top-center" | "top-right"
    | "middle-left" | "middle-center" | "middle-right"
    | "bottom-left" | "bottom-center" | "bottom-right";
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
  { id: "top-left", name: "上方左题", hint: "上方区域，左侧对齐", number: "01" },
  { id: "top-center", name: "上方居中", hint: "上方区域，中轴对齐", number: "02" },
  { id: "top-right", name: "上方右题", hint: "上方区域，右侧对齐", number: "03" },
  { id: "middle-left", name: "居中左题", hint: "居中区域，左侧对齐", number: "04" },
  { id: "middle-center", name: "居中", hint: "居中区域，中轴对齐", number: "05" },
  { id: "middle-right", name: "居中右题", hint: "居中区域，右侧对齐", number: "06" },
  { id: "bottom-left", name: "下方左题", hint: "下方区域，左侧对齐", number: "07" },
  { id: "bottom-center", name: "下方居中", hint: "下方区域，中轴对齐", number: "08" },
  { id: "bottom-right", name: "下方右题", hint: "下方区域，右侧对齐", number: "09" },
];

export const DOUYIN_HOME_GRID_SAFE_AREA = {
  cropTop: 240,
  cropBottom: 1680,
  horizontalInset: 54,
  verticalInset: 54,
  playCountReserve: 144,
} as const;

export const COVER_RULES_VERSION = "南铂封面规范 2.0";
