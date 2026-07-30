"use client";

import { useEffect } from "react";

const AI_APP_URL =
  "https://script.google.com/macros/s/AKfycbwE3jYEnaSh75A-5ft6T-ChSvDnKrLFHvKi8fBvMEHhyRcBgieWcKsuN-3iuuzwQIQ_/exec";

export default function Home() {
  useEffect(() => {
    window.location.replace(AI_APP_URL);
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        color: "#171717",
        background:
          "radial-gradient(circle at 80% 10%, #fff0f3, transparent 34%), #fbfaf8",
      }}
    >
      <section
        style={{
          width: "min(90vw, 520px)",
          padding: "48px 34px",
          textAlign: "center",
          background: "rgba(255,255,255,.92)",
          border: "1px solid #eee8e5",
          borderRadius: 28,
          boxShadow: "0 24px 70px rgba(45,30,30,.12)",
        }}
      >
        <div
          style={{
            width: 58,
            height: 58,
            margin: "0 auto 22px",
            display: "grid",
            placeItems: "center",
            color: "#fff",
            background: "#ff2442",
            borderRadius: 17,
            font: "700 34px Georgia, serif",
          }}
        >
          N
        </div>
        <h1 style={{ margin: "0 0 12px", fontSize: 36 }}>正在进入免费智能版</h1>
        <p style={{ margin: "0 0 26px", color: "#76706e", lineHeight: 1.8 }}>
          真实识图 · 公开趋势 · 固定7+8字封面
          <br />
          首次输入密码后，这台设备会记住登录。
        </p>
        <a
          href={AI_APP_URL}
          style={{
            display: "inline-flex",
            minHeight: 48,
            padding: "0 24px",
            alignItems: "center",
            color: "#fff",
            background: "#ff2442",
            borderRadius: 999,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          立即进入
        </a>
      </section>
    </main>
  );
}
