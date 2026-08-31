"use client";

export type CoverExportSheetProps = {
  open: boolean;
  onClose: () => void;
};

export default function CoverExportSheet({ open, onClose }: CoverExportSheetProps) {
  return (
    <section id="mobileExportSheet" className="mobile-export-sheet" aria-label="选择导出格式" hidden={!open}>
      <div>
        <strong>选择导出格式</strong>
        <p>导出选项将在这里显示，当前不会自动生成图片。</p>
        <button className="mobile-editor-action" type="button" onClick={onClose}>完成</button>
      </div>
    </section>
  );
}
