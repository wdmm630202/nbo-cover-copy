"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  COVER_COPY_MESSAGE_TYPE,
  COVER_COPY_SYNC_CHANNEL,
  COVER_COPY_SYNC_KEY,
  COVER_IMAGE_MESSAGE_TYPE,
  COVER_IMAGE_REQUEST_TYPE,
  CoverImageSync,
  isTrustedCopyFrameOrigin,
  normalizeCoverCopySync,
  normalizeCoverImageSync,
} from "./workspace-sync";

export default function CoverWorkspaceEntry() {
  const [hasCopy, setHasCopy] = useState(false);
  const imageRef = useRef<CoverImageSync | null>(null);

  useEffect(() => {
    const channel = "BroadcastChannel" in window
      ? new BroadcastChannel(COVER_COPY_SYNC_CHANNEL)
      : null;

    const timer = window.setTimeout(() => {
      try {
        setHasCopy(Boolean(normalizeCoverCopySync(JSON.parse(window.localStorage.getItem(COVER_COPY_SYNC_KEY) || "null"))));
      } catch {
        setHasCopy(false);
      }
    }, 0);

    const handleMessage = (event: MessageEvent) => {
      const frame = document.querySelector<HTMLIFrameElement>(".embedded-app-frame");
      if (
        !frame ||
        event.source !== frame.contentWindow ||
        !isTrustedCopyFrameOrigin(event.origin)
      ) {
        return;
      }

      if (event.data?.type === COVER_IMAGE_MESSAGE_TYPE) {
        const imagePayload = normalizeCoverImageSync(event.data.payload);
        if (!imagePayload) return;
        imageRef.current = imagePayload;
        setHasCopy(true);
        channel?.postMessage({
          type: COVER_IMAGE_MESSAGE_TYPE,
          payload: imagePayload,
        });
        return;
      }

      if (event.data?.type !== COVER_COPY_MESSAGE_TYPE) return;

      const payload = normalizeCoverCopySync(event.data.payload);
      if (!payload) return;
      try {
        window.localStorage.setItem(COVER_COPY_SYNC_KEY, JSON.stringify(payload));
      } catch {
        return;
      }

      setHasCopy(true);
      channel?.postMessage(payload);
    };

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type !== COVER_IMAGE_REQUEST_TYPE || !imageRef.current) return;
        channel.postMessage({
          type: COVER_IMAGE_MESSAGE_TYPE,
          payload: imageRef.current,
        });
      };
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);
      channel?.close();
    };
  }, []);

  return (
    <header className="workspace-nav">
      <div className="workspace-brand">
        <span className="workspace-brand-mark">N</span>
        <span>
          <strong>NBO 灵感封面</strong>
          <small>真实识图 · 公开趋势 · 三平台文案</small>
        </span>
      </div>
      <Link
        className="cover-maker-entry"
        href="/cover"
        target="nbo-cover-studio"
        aria-label="在独立标签页打开封面制作，保留当前文案结果"
      >
        <span>{hasCopy ? "可同步" : "新服务"}</span>
        制作封面
      </Link>
      <div className="workspace-online"><i />免费智能版在线</div>
    </header>
  );
}
