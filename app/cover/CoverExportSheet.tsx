"use client";

export type CoverExportSheetProps = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onExport: (format: "png" | "jpeg", photoOnly: boolean) => void;
};

export default function CoverExportSheet({ open, busy, onClose, onExport }: CoverExportSheetProps) {
  return (
    <section id="mobileExportSheet" className="mobile-export-sheet" aria-label="选择导出格式" hidden={!open}>
      <div>
        <strong>选择导出格式</strong>
        <p role="status" aria-live="polite">{busy ? "正在生成原始像素成品…" : "导出后会打开系统分享；取消后仍可长按成品保存。"}</p>
        <div className="mobile-export-options">
          <button type="button" disabled={busy} onClick={() => onExport("png", true)}>原图 PNG</button>
          <button type="button" disabled={busy} onClick={() => onExport("jpeg", true)}>原图 JPG</button>
          <button type="button" disabled={busy} onClick={() => onExport("png", false)}>设计 PNG</button>
          <button type="button" disabled={busy} onClick={() => onExport("jpeg", false)}>设计 JPG</button>
        </div>
        <button className="mobile-export-close" type="button" disabled={busy} onClick={onClose}>取消</button>
      </div>
    </section>
  );
}
