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
        {/* The registry-driven dock supplies singleToolControl, secondary and primary rows. */}
        {dock}
      </div>
    </div>
  );
}
