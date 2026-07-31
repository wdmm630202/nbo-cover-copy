import Link from "next/link";

const AI_APP_URL =
  "https://script.google.com/macros/s/AKfycbwE3jYEnaSh75A-5ft6T-ChSvDnKrLFHvKi8fBvMEHhyRcBgieWcKsuN-3iuuzwQIQ_/exec?nbo_embed=1";

export default function Home() {
  return (
    <main className="embedded-app-shell">
      <Link className="cover-maker-entry" href="/cover">
        <span>新服务</span>
        制作封面
      </Link>
      <div className="embedded-app-loading" aria-hidden="true">
        <div className="embedded-app-mark">N</div>
        <strong>正在进入南铂智能文案</strong>
        <span>请稍候，功能正在加载</span>
      </div>
      <div className="embedded-app-viewport">
        <iframe
          className="embedded-app-frame"
          src={AI_APP_URL}
          title="NBO 灵感封面智能文案工具"
          allow="clipboard-read; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
        >
          当前浏览器暂不支持嵌入页面，请更换浏览器后重试。
        </iframe>
      </div>
    </main>
  );
}
