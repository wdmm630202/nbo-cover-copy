"use client";

import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  COVER_RULES_VERSION,
  COVER_TEMPLATES,
  CoverTemplate,
  PLATFORM_PRESETS,
  PlatformPreset,
} from "./cover-config";

type StudioSettings = {
  platformId: PlatformPreset["id"];
  templateId: CoverTemplate["id"];
  topText: string;
  bottomText: string;
  subtitle: string;
  zoom: number;
  offsetX: number;
  offsetY: number;
  textScale: number;
  shade: number;
  showSafeArea: boolean;
  showBrand: boolean;
};

const STORAGE_KEY = "nbo-cover-studio-settings-v1";

const DEFAULT_SETTINGS: StudioSettings = {
  platformId: "douyin",
  templateId: "left",
  topText: "男人的高级感",
  bottomText: "藏在自然状态里",
  subtitle: "不被定义的自己，才是最有张力的表达",
  zoom: 100,
  offsetX: 0,
  offsetY: 0,
  textScale: 100,
  shade: 62,
  showSafeArea: true,
  showBrand: true,
};

function drawCover(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  settings: StudioSettings,
  preset: PlatformPreset,
  includeGuide: boolean,
) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const { width, height } = preset;
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#151515";
  context.fillRect(0, 0, width, height);

  if (image) {
    const baseScale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const scale = baseScale * (settings.zoom / 100);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    const x = (width - imageWidth) / 2 + (settings.offsetX / 100) * width;
    const y = (height - imageHeight) / 2 + (settings.offsetY / 100) * height;
    context.drawImage(image, x, y, imageWidth, imageHeight);
  } else {
    const placeholder = context.createLinearGradient(0, 0, width, height);
    placeholder.addColorStop(0, "#161616");
    placeholder.addColorStop(0.58, "#2b2725");
    placeholder.addColorStop(1, "#0d0d0d");
    context.fillStyle = placeholder;
    context.fillRect(0, 0, width, height);
    context.fillStyle = "rgba(255,255,255,.36)";
    context.font = `600 ${Math.round(width * 0.034)}px sans-serif`;
    context.textAlign = "center";
    context.fillText("上传照片后在这里预览", width / 2, height / 2);
  }

  drawTemplateShade(context, settings.templateId, width, height, settings.shade);
  drawTemplateText(context, settings, width, height);

  if (settings.showBrand) {
    drawBrand(context, width, height, settings.templateId);
  }

  if (includeGuide && settings.showSafeArea && preset.id === "douyin") {
    const safeHeight = width / 3 * 4;
    const safeTop = (height - safeHeight) / 2;
    context.save();
    context.setLineDash([18, 14]);
    context.lineWidth = 4;
    context.strokeStyle = "rgba(254,232,0,.92)";
    context.strokeRect(18, safeTop, width - 36, safeHeight);
    context.setLineDash([]);
    context.fillStyle = "rgba(254,232,0,.94)";
    context.font = `700 ${Math.round(width * 0.024)}px sans-serif`;
    context.textAlign = "right";
    context.fillText("主页 3:4 安全区（导出时自动隐藏）", width - 30, safeTop + 38);
    context.restore();
  }
}

function drawTemplateShade(
  context: CanvasRenderingContext2D,
  templateId: CoverTemplate["id"],
  width: number,
  height: number,
  shade: number,
) {
  const alpha = Math.max(0, Math.min(0.9, shade / 100));
  let gradient: CanvasGradient;

  if (templateId === "bottom") {
    gradient = context.createLinearGradient(0, height * 0.35, 0, height);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
  } else if (templateId === "right") {
    gradient = context.createLinearGradient(width * 0.18, 0, width, 0);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(1, `rgba(0,0,0,${alpha})`);
  } else if (templateId === "center") {
    gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha * 0.3})`);
    gradient.addColorStop(0.5, `rgba(0,0,0,${alpha * 0.12})`);
    gradient.addColorStop(1, `rgba(0,0,0,${alpha * 0.72})`);
  } else {
    gradient = context.createLinearGradient(0, 0, width * 0.82, 0);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gradient.addColorStop(0.68, `rgba(0,0,0,${alpha * 0.36})`);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

function drawTemplateText(
  context: CanvasRenderingContext2D,
  settings: StudioSettings,
  width: number,
  height: number,
) {
  const isRight = settings.templateId === "right";
  const isCenter = settings.templateId === "center";
  const isBottom = settings.templateId === "bottom";
  const isClean = settings.templateId === "clean";
  const textAlign: CanvasTextAlign = isRight ? "right" : isCenter ? "center" : "left";
  const x = isRight ? width * 0.92 : isCenter ? width * 0.5 : width * 0.08;
  const y = isBottom
    ? height * 0.68
    : isCenter
      ? height * 0.58
      : isClean
        ? height * 0.18
        : height * 0.24;
  const maxWidth = isCenter ? width * 0.84 : width * 0.72;
  const baseFont = Math.round(width * 0.074 * (settings.textScale / 100));
  const lineGap = Math.round(baseFont * 1.32);

  context.save();
  context.textAlign = textAlign;
  context.textBaseline = "alphabetic";
  context.shadowColor = "rgba(0,0,0,.42)";
  context.shadowBlur = 16;

  if (settings.templateId === "badge") {
    context.shadowBlur = 0;
    context.fillStyle = "#d7b98e";
    context.fillRect(width * 0.055, height * 0.035, width * 0.105, width * 0.105);
    context.fillStyle = "#fff";
    context.font = `500 ${Math.round(width * 0.034)}px sans-serif`;
    context.textAlign = "center";
    context.fillText("03", width * 0.1075, height * 0.035 + width * 0.068);
    context.textAlign = textAlign;
    context.shadowBlur = 16;
  }

  context.fillStyle = "#FFFFFF";
  context.font = `900 ${fitText(context, settings.topText, baseFont, maxWidth)}px sans-serif`;
  context.fillText(settings.topText || "上行标题", x, y, maxWidth);

  context.fillStyle = "#FEE800";
  context.font = `900 ${fitText(context, settings.bottomText, baseFont, maxWidth)}px sans-serif`;
  context.fillText(settings.bottomText || "下行标题", x, y + lineGap, maxWidth);

  if (settings.subtitle.trim()) {
    context.shadowBlur = 10;
    context.fillStyle = "rgba(255,255,255,.92)";
    context.font = `500 ${Math.round(width * 0.03)}px sans-serif`;
    drawWrappedText(
      context,
      settings.subtitle,
      x,
      y + lineGap + Math.round(baseFont * 0.8),
      maxWidth,
      Math.round(width * 0.044),
      textAlign,
    );
  }

  context.restore();
}

function drawBrand(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  templateId: CoverTemplate["id"],
) {
  const rightAligned = templateId === "right";
  const x = rightAligned ? width * 0.92 : width * 0.08;
  const align: CanvasTextAlign = rightAligned ? "right" : "left";
  context.save();
  context.textAlign = align;
  context.shadowColor = "rgba(0,0,0,.65)";
  context.shadowBlur = 12;
  context.fillStyle = "#FFFFFF";
  context.font = `800 ${Math.round(width * 0.037)}px sans-serif`;
  context.fillText("南铂摄影", x, height * 0.9);
  context.font = `700 ${Math.round(width * 0.015)}px sans-serif`;
  context.letterSpacing = `${Math.round(width * 0.003)}px`;
  context.fillText("NANBO  PHOTO", x, height * 0.925);
  context.restore();
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  startingSize: number,
  maxWidth: number,
) {
  let size = startingSize;
  const safeText = text || "标题";
  while (size > startingSize * 0.58) {
    context.font = `900 ${size}px sans-serif`;
    if (context.measureText(safeText).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign,
) {
  const characters = Array.from(text);
  const lines: string[] = [];
  let current = "";

  characters.forEach((character) => {
    const candidate = current + character;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = character;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);

  context.textAlign = align;
  lines.slice(0, 2).forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight, maxWidth);
  });
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="studio-slider">
      <span>
        {label}
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export default function CoverStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [settings, setSettings] = useState<StudioSettings>(DEFAULT_SETTINGS);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("上传照片后即可制作");

  const preset = useMemo(
    () => PLATFORM_PRESETS.find((item) => item.id === settings.platformId) ?? PLATFORM_PRESETS[0],
    [settings.platformId],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      } catch {
        setNotice("已使用默认封面设置");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (canvasRef.current) {
      drawCover(canvasRef.current, image, settings, preset, true);
    }
  }, [image, preset, settings]);

  const updateSetting = useCallback(
    <Key extends keyof StudioSettings>(key: Key, value: StudioSettings[Key]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const loadFile = useCallback((file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setNotice("请选择 JPG、PNG 或 WEBP 图片");
      return;
    }

    const url = URL.createObjectURL(file);
    const nextImage = new Image();
    nextImage.onload = () => {
      setImage(nextImage);
      setFileName(file.name);
      setNotice("照片已载入，可以调整构图和文字");
      URL.revokeObjectURL(url);
    };
    nextImage.onerror = () => {
      setNotice("这张图片暂时无法读取，请更换一张");
      URL.revokeObjectURL(url);
    };
    nextImage.src = url;
  }, []);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    loadFile(event.target.files?.[0]);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files?.[0]);
  };

  const exportCover = (format: "jpeg" | "png") => {
    if (!image || !canvasRef.current) {
      setNotice("请先上传一张照片");
      return;
    }

    const exportCanvas = document.createElement("canvas");
    drawCover(exportCanvas, image, settings, preset, false);
    exportCanvas.toBlob(
      (blob) => {
        if (!blob) {
          setNotice("导出没有完成，请重新尝试");
          return;
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const safeName = fileName.replace(/\.[^.]+$/, "") || "南铂封面";
        link.href = url;
        link.download = `${safeName}_${preset.label}_${preset.ratio.replace(":", "x")}.${format === "png" ? "png" : "jpg"}`;
        link.click();
        URL.revokeObjectURL(url);
        setNotice(`已导出 ${preset.width}×${preset.height} ${format === "png" ? "PNG" : "JPG"}`);
      },
      `image/${format}`,
      format === "jpeg" ? 0.94 : undefined,
    );
  };

  return (
    <section className="cover-studio">
      <div className="cover-studio-intro">
        <div>
          <span>配套服务 02</span>
          <h1>南铂封面制作台</h1>
          <p>把智能文案直接做成可发布封面。人物原片不重绘，照片不上传，尺寸和模板可以长期更新。</p>
        </div>
        <div className="studio-status">
          <i />
          {notice}
        </div>
      </div>

      <div className="cover-studio-grid">
        <aside className="studio-panel studio-controls">
          <div className="studio-panel-heading">
            <span>01</span>
            <div>
              <strong>照片与文字</strong>
              <small>先放原片，再放两行主文案</small>
            </div>
          </div>

          <div
            className={`studio-upload ${dragging ? "is-dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFile}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              <b>{image ? "更换照片" : "上传照片"}</b>
              <span>{fileName || "支持 JPG、PNG、WEBP"}</span>
            </button>
          </div>

          <label className="studio-field">
            <span>上行主标题 <b>固定纯白</b></span>
            <input
              value={settings.topText}
              maxLength={18}
              onChange={(event) => updateSetting("topText", event.target.value)}
              placeholder="例如：男人的高级感"
            />
          </label>
          <label className="studio-field">
            <span>下行主标题 <b className="yellow">固定品牌黄</b></span>
            <input
              value={settings.bottomText}
              maxLength={18}
              onChange={(event) => updateSetting("bottomText", event.target.value)}
              placeholder="例如：藏在自然状态里"
            />
          </label>
          <label className="studio-field">
            <span>补充小字 <b>可不填</b></span>
            <textarea
              value={settings.subtitle}
              maxLength={38}
              onChange={(event) => updateSetting("subtitle", event.target.value)}
              placeholder="补充价值点，不编造图片外事实"
            />
          </label>

          <div className="studio-platforms" aria-label="选择发布平台">
            {PLATFORM_PRESETS.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.id === settings.platformId ? "is-active" : ""}
                onClick={() => updateSetting("platformId", item.id)}
              >
                <strong>{item.label}</strong>
                <span>{item.ratio}</span>
              </button>
            ))}
          </div>
          <p className="studio-preset-note">
            {preset.width}×{preset.height} · {preset.note}
          </p>
        </aside>

        <section className="studio-preview-panel">
          <div className="studio-preview-toolbar">
            <div>
              <strong>实时封面预览</strong>
              <span>{preset.label} · {preset.ratio}</span>
            </div>
            <label className="studio-switch">
              <input
                type="checkbox"
                checked={settings.showSafeArea}
                onChange={(event) => updateSetting("showSafeArea", event.target.checked)}
              />
              <span />
              安全区
            </label>
          </div>
          <div className={`studio-canvas-shell ratio-${preset.ratio.replace(":", "-")}`}>
            <canvas ref={canvasRef} aria-label="封面实时预览" />
          </div>
          <div className="studio-export-row">
            <div>
              <strong>导出前检查</strong>
              <span>头顶、脸、手势和主标题均在安全区内</span>
            </div>
            <button type="button" className="export-secondary" onClick={() => exportCover("png")}>
              导出 PNG
            </button>
            <button type="button" className="export-primary" onClick={() => exportCover("jpeg")}>
              导出高清 JPG
            </button>
          </div>
        </section>

        <aside className="studio-panel studio-design">
          <div className="studio-panel-heading">
            <span>02</span>
            <div>
              <strong>版式与构图</strong>
              <small>参考南铂暗调杂志封面体系</small>
            </div>
          </div>

          <div className="studio-template-grid">
            {COVER_TEMPLATES.map((template) => (
              <button
                type="button"
                key={template.id}
                className={`studio-template template-${template.id} ${settings.templateId === template.id ? "is-active" : ""}`}
                onClick={() => updateSetting("templateId", template.id)}
              >
                <i>{template.number}</i>
                <b>{template.name}</b>
                <span>{template.hint}</span>
              </button>
            ))}
          </div>

          <div className="studio-adjustments">
            <Slider
              label="照片缩放"
              value={settings.zoom}
              min={100}
              max={180}
              suffix="%"
              onChange={(value) => updateSetting("zoom", value)}
            />
            <Slider
              label="左右位置"
              value={settings.offsetX}
              min={-40}
              max={40}
              suffix=""
              onChange={(value) => updateSetting("offsetX", value)}
            />
            <Slider
              label="上下位置"
              value={settings.offsetY}
              min={-40}
              max={40}
              suffix=""
              onChange={(value) => updateSetting("offsetY", value)}
            />
            <Slider
              label="标题大小"
              value={settings.textScale}
              min={76}
              max={132}
              suffix="%"
              onChange={(value) => updateSetting("textScale", value)}
            />
            <Slider
              label="压暗强度"
              value={settings.shade}
              min={20}
              max={90}
              suffix="%"
              onChange={(value) => updateSetting("shade", value)}
            />
          </div>

          <label className="studio-check">
            <input
              type="checkbox"
              checked={settings.showBrand}
              onChange={(event) => updateSetting("showBrand", event.target.checked)}
            />
            <span />
            显示“南铂摄影”品牌组
          </label>
        </aside>
      </div>

      <section className="cover-standard-card">
        <div>
          <span>长期规范</span>
          <h2>{COVER_RULES_VERSION}</h2>
        </div>
        <ul>
          <li><b>人物保护</b> 不拉伸、不重绘脸、五官、头发、手和服装</li>
          <li><b>固定颜色</b> 上行 #FFFFFF，下行 #FEE800</li>
          <li><b>主页安全</b> 抖音 9:16 自动显示居中 3:4 检查框</li>
          <li><b>本机处理</b> 图片不上传、不保存，导出后仍由你掌控</li>
        </ul>
        <p>平台规则会变化，尺寸预设独立维护；封面制作逻辑不依赖免费 AI 服务，即使智能文案暂时不可用，也能继续制作和导出。</p>
      </section>
    </section>
  );
}
