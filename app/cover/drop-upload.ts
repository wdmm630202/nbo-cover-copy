export type ImageDropTarget = "main" | "before";

export type DroppedImageFile = {
  name: string;
  type: string;
};

export type DroppedImageSelection<T extends DroppedImageFile> =
  | { ok: true; file: T }
  | { ok: false; reason: "empty" | "multiple" | "unsupported"; message: string };

const TARGET_NAMES: Record<ImageDropTarget, string> = {
  main: "精修图",
  before: "拍摄前照片",
};

const DROP_HINTS: Record<ImageDropTarget, string> = {
  main: "松开导入精修图",
  before: "松开导入拍摄前照片",
};

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function getImageDropHint(target: ImageDropTarget) {
  return DROP_HINTS[target];
}

export function resolveDroppedImage<T extends DroppedImageFile>(
  files: ArrayLike<T> | null | undefined,
  target: ImageDropTarget,
): DroppedImageSelection<T> {
  const droppedFiles = Array.from(files ?? []);
  const targetName = TARGET_NAMES[target];

  if (droppedFiles.length === 0) {
    return { ok: false, reason: "empty", message: `请从文件夹拖入一张${targetName}` };
  }
  if (droppedFiles.length !== 1) {
    return { ok: false, reason: "multiple", message: `${targetName}每次只能拖入一张照片` };
  }

  const file = droppedFiles[0];
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    return { ok: false, reason: "unsupported", message: `${targetName}请选择 JPG、PNG 或 WEBP 图片` };
  }

  return { ok: true, file };
}

export function createImageDropController(target: ImageDropTarget) {
  let depth = 0;
  const getState = () => ({ active: depth > 0, hint: getImageDropHint(target) });

  return {
    enter() {
      depth += 1;
      return getState();
    },
    leave() {
      depth = Math.max(0, depth - 1);
      return getState();
    },
    drop<T extends DroppedImageFile>(files: ArrayLike<T> | null | undefined) {
      depth = 0;
      return { active: false, selection: resolveDroppedImage(files, target) };
    },
  };
}
