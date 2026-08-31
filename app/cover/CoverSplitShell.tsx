"use client";

import CoverCompactShell from "./CoverCompactShell";
import type { CoverCompactShellProps } from "./CoverCompactShell";
import type { CoverLayoutMode } from "./core/responsive-layout";

export type CoverSplitShellProps = Omit<CoverCompactShellProps, "split"> & {
  mode: CoverLayoutMode;
};

export default function CoverSplitShell({ mode, onOpenExport, ...props }: CoverSplitShellProps) {
  return (
    <div className={`cover-responsive-shell is-${mode}`} data-shell-layout={mode}>
      <CoverCompactShell {...props} onOpenExport={onOpenExport} split={mode === "split"} />
    </div>
  );
}
