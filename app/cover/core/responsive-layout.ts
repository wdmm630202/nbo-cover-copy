export type CoverLayoutMode = "compact" | "split" | "desktop";

export type LayoutEnvironment = {
  width: number;
  height: number;
  pointer: "coarse" | "fine";
};

export function resolveCoverLayoutMode({ width, height, pointer }: LayoutEnvironment): CoverLayoutMode {
  if (pointer === "fine" && width >= 1180) return "desktop";
  if (width >= 680 && (width > height || pointer === "fine")) return "split";
  return "compact";
}
