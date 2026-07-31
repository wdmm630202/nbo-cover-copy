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
  { id: "left", name: "暗调左题", hint: "人物靠右，左侧强标题", number: "01" },
  { id: "bottom", name: "底部冲击", hint: "底部渐变，两行醒目", number: "02" },
  { id: "badge", name: "杂志编号", hint: "编号与信息层级", number: "03" },
  { id: "center", name: "中心主角", hint: "居中标题，适合留白", number: "04" },
  { id: "clean", name: "极简留白", hint: "克制排版，突出人物", number: "05" },
  { id: "right", name: "右侧标题", hint: "人物靠左，右侧阅读", number: "06" },
];

export const COVER_RULES_VERSION = "南铂封面规范 1.0";
