"use client";

import type { ReactNode } from "react";
import type { RetouchTarget } from "./compare-layout";

export type CoverCompactShellProps = {
  open: boolean;
  split?: boolean;
  onClose: () => void;
  onOpenExport: () => void;
  keyboardOpen: boolean;
  brushMode: boolean;
  brushTarget: RetouchTarget;
  canvas: ReactNode;
  dock: ReactNode;
};

export default function CoverCompactShell({
  open,
  split = false,
  onClose,
  onOpenExport,
  keyboardOpen,
  brushMode,
  brushTarget,
  canvas,
  dock,
}: CoverCompactShellProps) {
  return (
    <div className={`cover-compact-shell${open ? " is-open" : ""}${split ? " is-split" : ""}${keyboardOpen ? " is-keyboard-open" : ""}`}>
      <header id="mobileEditorTopbar" className="mobile-editor-topbar" hidden={!open}>
        <button className="mobile-editor-action" type="button" onClick={onClose}>返回</button>
        <strong>南铂封面</strong>
        <button className="mobile-editor-action mobile-editor-export-action" type="button" onClick={onOpenExport}>导出</button>
      </header>
      <div className="cover-compact-preview split-preview">
        {canvas}
        <p id="mobileBrushStatus" className={`mobile-brush-status${brushMode ? " is-active" : ""}`} role="status" aria-live="polite">
          {brushMode ? "涂抹开启" : "涂抹关闭"} · {brushTarget === "before" ? "拍摄前照片" : "主照片"}
        </p>
      </div>
      <aside className="cover-compact-dock split-tools" hidden={!open && !split}>
        <div className="split-tools-header">
          <strong>编辑工具</strong>
          <button type="button" onClick={onOpenExport}>导出</button>
        </div>
        {/* The registry-driven dock supplies singleToolControl, secondary and primary rows. */}
        {dock}
      </aside>
    </div>
  );
}
