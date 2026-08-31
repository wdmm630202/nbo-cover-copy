"use client";

import {
  PRIMARY_TOOLS,
  getSecondaryTools,
  type PrimaryToolId,
  type ToolContext,
  type ToolDefinition,
} from "./core/tool-registry";

export type MobileToolChoice = Readonly<{ value: string | boolean; label: string }>;
export type MobileToolPresentation = Readonly<{
  value: unknown;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  busy?: boolean;
  actionLabel?: string;
  choices?: readonly MobileToolChoice[];
}>;

export type MobileToolDockProps = {
  primary: PrimaryToolId;
  secondary: string | null;
  context: ToolContext;
  valueFor: (tool: ToolDefinition) => unknown;
  onSelectPrimary: (id: PrimaryToolId) => void;
  onSelectSecondary: (id: string) => void;
  onChange: (tool: ToolDefinition, value: unknown) => void;
  onReset: (tool: ToolDefinition) => void;
  onAction: (tool: ToolDefinition) => void;
};

// This coverage table is intentionally not a second menu: labels, order, kinds and
// availability still come only from ToolRegistry. It documents each existing owner
// that CoverStudio/static bindings must delegate to and is checked against every ID.
export const MOBILE_TOOL_DELEGATIONS = Object.freeze({
  uploadMain: "mainFileInput", uploadBefore: "beforeFileInput", comparison: "settings", safeArea: "settings", syncCover: "workspaceSync",
  target: "adjustmentTarget", zoom: "settings", offsetX: "settings", offsetY: "settings", rotation: "settings",
  beforeZoom: "settings", beforeOffsetX: "settings", beforeOffsetY: "settings", beforeRotation: "settings", alignBefore: "alignment", resetBeforeFrame: "settings",
  topText: "settings", bottomText: "settings", subtitle: "settings", topColor: "settings", bottomColor: "settings", subtitleColor: "settings", dividerColor: "settings",
  textScale: "settings", bottomTextScale: "settings", subtitleScale: "settings", textScaleLinked: "settings", showDivider: "settings", textStroke: "settings", textShadow: "settings", syncCopy: "workspaceSync",
  brightness: "settings", shade: "settings", bottomShade: "settings",
  retouchEnabled: "retouchState", retouchTarget: "retouchState", brushSize: "retouchState", brushFeather: "retouchState", brushStrength: "retouchState",
  retouchBefore: "retouchState", retouchAfter: "retouchState", undoRetouch: "retouchState", clearRetouch: "retouchState",
  template: "settings", platform: "settings", watermarkEnabled: "settings", replaceWatermark: "watermarkInput", removeWatermark: "watermarkState",
  watermarkAlign: "settings", watermarkOpacity: "settings", memory1: "memoryState", memory2: "memoryState", memory3: "memoryState",
  resetSettings: "settings", factoryReset: "guardedReset", coverRules: "rulesAnchor",
} as const);

function presentationFor(tool: ToolDefinition, raw: unknown): MobileToolPresentation {
  if (raw && typeof raw === "object" && "value" in raw) return raw as MobileToolPresentation;
  return { value: raw };
}

export default function CoverMobileToolDock({
  primary,
  secondary,
  context,
  valueFor,
  onSelectPrimary,
  onSelectSecondary,
  onChange,
  onReset,
  onAction,
}: MobileToolDockProps) {
  const secondaryTools = getSecondaryTools(primary, context);
  const activeTool = secondaryTools.find((tool) => tool.id === secondary) ?? secondaryTools[0] ?? null;
  const presentation = activeTool ? presentationFor(activeTool, valueFor(activeTool)) : null;
  const value = presentation?.value;

  return (
    <>
      <section id="mobileSingleToolControl" className="mobile-single-tool-control" aria-live="polite">
        {!activeTool || !presentation ? <p>当前没有可用工具</p> : (
          <div className="mobile-tool-panel" data-active-tool={activeTool.id}>
            {activeTool.kind === "range" ? (
              <label className="mobile-range-control">
                <span><b>{activeTool.label}</b><span><output>{String(value)}</output>{activeTool.suffix ?? ""}<button type="button" onClick={() => onReset(activeTool)} disabled={presentation.disabled}>复位</button></span></span>
                <span>
                  <input type="range" min={presentation.min ?? activeTool.min} max={presentation.max ?? activeTool.max} step={presentation.step ?? 1} value={Number(value)} disabled={presentation.disabled} aria-label={activeTool.label} onChange={(event) => onChange(activeTool, Number(event.target.value))} />
                  <label className="mobile-exact-value"><span className="sr-only">{activeTool.label}准确数值</span><input type="number" inputMode="decimal" min={presentation.min ?? activeTool.min} max={presentation.max ?? activeTool.max} step={presentation.step ?? 1} value={Number(value)} disabled={presentation.disabled} aria-label={`${activeTool.label}准确数值`} onChange={(event) => onChange(activeTool, Number(event.target.value))} />{activeTool.suffix ? <i>{activeTool.suffix}</i> : null}</label>
                </span>
              </label>
            ) : null}
            {activeTool.kind === "text" ? (
              <label className="mobile-text-control"><span>{activeTool.label}</span>{activeTool.id === "subtitle"
                ? <textarea maxLength={activeTool.max} value={String(value ?? "")} onChange={(event) => onChange(activeTool, event.target.value)} />
                : <input type="text" maxLength={activeTool.max} value={String(value ?? "")} onChange={(event) => onChange(activeTool, event.target.value)} />}</label>
            ) : null}
            {activeTool.kind === "color" ? (
              <div className="mobile-color-control"><label><span>{activeTool.label}</span><input type="color" value={String(value)} aria-label={activeTool.label} onChange={(event) => onChange(activeTool, event.target.value)} /></label><output>{String(value).toUpperCase()}</output><button type="button" onClick={() => onReset(activeTool)}>复位</button></div>
            ) : null}
            {activeTool.kind === "toggle" ? (
              <button type="button" className={`mobile-toggle-control${value ? " is-active" : ""}`} role="switch" aria-checked={Boolean(value)} onClick={() => onChange(activeTool, !value)}><span>{activeTool.label}</span><b>{value ? "已开启" : "已关闭"}</b></button>
            ) : null}
            {activeTool.kind === "choice" ? (
              <div className="mobile-choice-control" role="group" aria-label={activeTool.label}>{presentation.choices?.map((choice) => <button type="button" key={String(choice.value)} className={value === choice.value ? "is-active" : ""} aria-pressed={value === choice.value} onClick={() => onChange(activeTool, choice.value)}>{choice.label}</button>)}</div>
            ) : null}
            {activeTool.kind === "action" ? (
              activeTool.id.startsWith("memory") ? <div className="mobile-memory-actions"><b>{String(value || activeTool.label)}</b><button type="button" onClick={() => onChange(activeTool, "rename")}>重命名</button><button type="button" onClick={() => onChange(activeTool, "save")}>保存</button><button type="button" onClick={() => onChange(activeTool, "load")}>应用</button></div>
                : <button type="button" className="mobile-action-control" disabled={presentation.disabled || presentation.busy} aria-busy={presentation.busy || undefined} onClick={() => onAction(activeTool)}>{presentation.busy ? "处理中…" : presentation.actionLabel ?? activeTool.label}</button>
            ) : null}
          </div>
        )}
      </section>
      <nav id="mobileSecondaryTools" className="mobile-secondary-tools" aria-label="当前工具">
        {secondaryTools.map((tool) => <button type="button" key={tool.id} aria-current={activeTool?.id === tool.id ? "true" : undefined} className={activeTool?.id === tool.id ? "is-active" : ""} onClick={() => onSelectSecondary(tool.id)}>{tool.label}</button>)}
      </nav>
      <nav id="mobilePrimaryTools" className="mobile-primary-tools" aria-label="编辑分类">
        {PRIMARY_TOOLS.map((tool) => <button type="button" key={tool.id} aria-current={primary === tool.id ? "page" : undefined} className={primary === tool.id ? "is-active" : ""} onClick={() => onSelectPrimary(tool.id)}>{tool.label}</button>)}
      </nav>
    </>
  );
}
