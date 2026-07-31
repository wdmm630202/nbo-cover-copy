import Link from "next/link";
import CoverStudio from "./CoverStudio";

export default function CoverPage() {
  return (
    <main className="cover-page">
      <header className="cover-studio-header">
        <Link className="cover-studio-brand" href="/">
          <span className="cover-studio-mark">N</span>
          <span>
            <strong>NBO 自媒体工作台</strong>
            <small>封面制作服务</small>
          </span>
        </Link>
        <div className="cover-studio-header-actions">
          <span>照片只在当前浏览器处理</span>
          <Link href="/">返回智能文案</Link>
        </div>
      </header>
      <CoverStudio />
    </main>
  );
}
