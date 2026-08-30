(function registerDropUpload(root) {
  const targetNames = {
    main: "精修图",
    before: "拍摄前照片",
  };
  const dropHints = {
    main: "松开导入精修图",
    before: "松开导入拍摄前照片",
  };
  const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

  function getImageDropHint(target) {
    return dropHints[target];
  }

  function resolveDroppedImage(files, target) {
    const droppedFiles = Array.from(files || []);
    const targetName = targetNames[target];
    if (droppedFiles.length === 0) {
      return { ok: false, reason: "empty", message: `请从文件夹拖入一张${targetName}` };
    }
    if (droppedFiles.length !== 1) {
      return { ok: false, reason: "multiple", message: `${targetName}每次只能拖入一张照片` };
    }

    const file = droppedFiles[0];
    if (!acceptedImageTypes.has(file.type)) {
      return { ok: false, reason: "unsupported", message: `${targetName}请选择 JPG、PNG 或 WEBP 图片` };
    }
    return { ok: true, file };
  }

  function createImageDropController(target) {
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
      drop(files) {
        depth = 0;
        return { active: false, selection: resolveDroppedImage(files, target) };
      },
    };
  }

  root.NBODropUpload = {
    createImageDropController,
    getImageDropHint,
    resolveDroppedImage,
  };
})(typeof window !== "undefined" ? window : globalThis);
