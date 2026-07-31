"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  COVER_COPY_MESSAGE_TYPE,
  COVER_COPY_SYNC_CHANNEL,
  COVER_COPY_SYNC_KEY,
  isTrustedCopyFrameOrigin,
  normalizeCoverCopySync,
} from "./workspace-sync";

export default function CoverWorkspaceEntry() {
  const [hasCopy, setHasCopy] = useState(false);

  useEffect(() => {
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
        !isTrustedCopyFrameOrigin(event.origin) ||
        event.data?.type !== COVER_COPY_MESSAGE_TYPE
      ) {
        return;
      }

      const payload = normalizeCoverCopySync(event.data.payload);
      if (!payload) return;

      try {
        window.localStorage.setItem(COVER_COPY_SYNC_KEY, JSON.stringify(payload));
      } catch {
        return;
      }

      setHasCopy(true);
      if ("BroadcastChannel" in window) {
        const channel = new BroadcastChannel(COVER_COPY_SYNC_CHANNEL);
        channel.postMessage(payload);
        channel.close();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  return (
    <Link
      className="cover-maker-entry"
      href="/cover"
      target="nbo-cover-studio"
      aria-label="在独立标签页打开封面制作，保留当前文案结果"
    >
      <span>{hasCopy ? "可同步" : "新服务"}</span>
      制作封面
    </Link>
  );
}
