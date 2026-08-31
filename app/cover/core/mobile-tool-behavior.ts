import type { ToolDefinition } from "./tool-registry";

export type MobileSyncedCopy = Readonly<{ topText: string; bottomText: string }>;
export type MobileSyncedCopyField = "topText" | "bottomText" | "all";

export function applyMobileSyncedCopy<T extends Readonly<{ topText: string; bottomText: string }>>(
  current: T,
  syncedCopy: MobileSyncedCopy,
  field: MobileSyncedCopyField,
): T {
  return {
    ...current,
    topText: field === "bottomText" ? current.topText : syncedCopy.topText,
    bottomText: field === "topText" ? current.bottomText : syncedCopy.bottomText,
  };
}

export function resetMobileToolSetting<T extends Readonly<Record<string, unknown>>>(current: T, tool: ToolDefinition): T {
  if (!tool.settingKey || tool.defaultValue === undefined) return current;
  return { ...current, [tool.settingKey]: tool.defaultValue };
}

export function isMobileToolDisabled(
  tool: Pick<ToolDefinition, "id">,
  state: Readonly<{ textScaleLinked: boolean }>,
): boolean {
  return tool.id === "bottomTextScale" && state.textScaleLinked;
}

export function getMobileRetouchTargetChoices(hasBeforeImage: boolean) {
  return [
    { value: "after", label: "主照片记录" },
    ...(hasBeforeImage ? [{ value: "before", label: "拍摄前记录" }] : []),
  ] as const;
}

type RulesTarget = Readonly<{
  scrollIntoView: (options: ScrollIntoViewOptions) => void;
  focus: (options: FocusOptions) => void;
}>;

export function revealCoverRules(options: Readonly<{
  compactOpen: boolean;
  closeCompact: () => void;
  afterLayout: (callback: () => void) => void;
  getTarget: () => RulesTarget | null;
}>) {
  const reveal = () => {
    const target = options.getTarget();
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
  };
  if (!options.compactOpen) return reveal();
  options.closeCompact();
  options.afterLayout(reveal);
}
