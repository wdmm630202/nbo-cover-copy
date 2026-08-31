export type CoverLayoutMode = "compact" | "split" | "desktop";

export type LayoutEnvironment = {
  width: number;
  height: number;
  pointer: "coarse" | "fine";
};

export type MobileKeyboardViewportState = {
  baselineWidth: number;
  baselineHeight: number;
  orientation: "portrait" | "landscape";
  open: boolean;
  keyboardHeight: number;
};

export type MobileKeyboardViewportInput = {
  width: number;
  height: number;
  orientation: MobileKeyboardViewportState["orientation"];
  focused: boolean;
  active: boolean;
};

export const MOBILE_KEYBOARD_THRESHOLD = 140;
const MOBILE_VIEWPORT_WIDTH_RESET_DELTA = 2;

export function updateMobileKeyboardViewport(
  current: MobileKeyboardViewportState | null,
  input: MobileKeyboardViewportInput,
): MobileKeyboardViewportState {
  const width = Number.isFinite(input.width) ? Math.max(0, input.width) : 0;
  const height = Number.isFinite(input.height) ? Math.max(0, input.height) : 0;
  const orientation = input.orientation;
  if (!current) {
    return { baselineWidth: width, baselineHeight: height, orientation, open: false, keyboardHeight: 0 };
  }
  const resetBaseline = current.orientation !== orientation
    || Math.abs(current.baselineWidth - width) >= MOBILE_VIEWPORT_WIDTH_RESET_DELTA;

  if (!input.active || !input.focused || resetBaseline || height >= current.baselineHeight) {
    return { baselineWidth: width, baselineHeight: height, orientation, open: false, keyboardHeight: 0 };
  }

  const keyboardHeight = Math.max(0, current.baselineHeight - height);
  const open = keyboardHeight >= MOBILE_KEYBOARD_THRESHOLD;
  return {
    ...current,
    open,
    keyboardHeight: open ? Math.round(keyboardHeight) : 0,
  };
}

export function resolveCoverLayoutMode({ width, height, pointer }: LayoutEnvironment): CoverLayoutMode {
  if (pointer === "fine" && width >= 1180) return "desktop";
  if (width >= 680 && (width > height || pointer === "fine")) return "split";
  return "compact";
}
