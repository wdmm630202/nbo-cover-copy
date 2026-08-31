"use client";

import type { ReactNode } from "react";

export type CoverCompactShellProps = {
  open: boolean;
  onClose: () => void;
  onOpenExport: () => void;
  canvas: ReactNode;
  dock: ReactNode;
};

export default function CoverCompactShell({
  open,
  onClose,
  onOpenExport,
  canvas,
  dock,
}: CoverCompactShellProps) {
  return (
    <div className={`cover-compact-shell${open ? " is-open" : ""}`}>
      <header id="mobileEditorTopbar" className="mobile-editor-topbar" hidden={!open}>
        <button className="mobile-editor-action" type="button" onClick={onClose}>返回</button>
        <strong>南铂封面</strong>
        <button className="mobile-editor-action mobile-editor-export-action" type="button" onClick={onOpenExport}>导出</button>
      </header>
      <div className="cover-compact-preview">{canvas}</div>
      <div className="cover-compact-dock" hidden={!open}>
        <nav id="mobileSecondaryTools" className="mobile-secondary-tools" aria-label="当前工具" hidden={!open}>
          <span className="mobile-tool-placeholder">预览始终保留在上方</span>
        </nav>
        <nav id="mobilePrimaryTools" className="mobile-primary-tools" aria-label="编辑分类" hidden={!open}>
          {dock}
        </nav>
      </div>
    </div>
  );
}
