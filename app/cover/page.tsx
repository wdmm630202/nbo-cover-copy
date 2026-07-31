import CoverStudio from "./CoverStudio";
import CopyWorkspaceSwitch from "./CopyWorkspaceSwitch";

export default function CoverPage() {
  return (
    <main className="cover-page">
      <header className="cover-studio-header">
        <div className="cover-studio-brand">
          <span className="cover-studio-mark">N</span>
          <span>
            <strong>NBO 自媒体工作台</strong>
            <small>封面制作服务</small>
          </span>
        </div>
        <div className="cover-studio-header-actions">
          <span>照片只在当前浏览器处理</span>
          <CopyWorkspaceSwitch />
        </div>
      </header>
      <CoverStudio />
    </main>
  );
}
