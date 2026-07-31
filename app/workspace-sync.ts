export const COVER_COPY_SYNC_KEY = "nbo-cover-copy-sync-v1";
export const COVER_COPY_SYNC_CHANNEL = "nbo-cover-copy-sync-channel-v1";
export const COVER_COPY_MESSAGE_TYPE = "NBO_COVER_COPY_SELECTED";

export type CoverCopySync = {
  version: 1;
  topText: string;
  bottomText: string;
  platform: "小红书" | "抖音" | "视频号";
  selectionIndex: number;
  updatedAt: number;
};

export function normalizeCoverCopySync(value: unknown): CoverCopySync | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<CoverCopySync>;
  const topText = typeof candidate.topText === "string" ? candidate.topText.trim().slice(0, 18) : "";
  const bottomText = typeof candidate.bottomText === "string" ? candidate.bottomText.trim().slice(0, 18) : "";
  const platform = ["小红书", "抖音", "视频号"].includes(candidate.platform ?? "")
    ? candidate.platform as CoverCopySync["platform"]
    : "小红书";

  if (!topText || !bottomText) return null;

  return {
    version: 1,
    topText,
    bottomText,
    platform,
    selectionIndex: Math.max(0, Math.min(2, Number(candidate.selectionIndex) || 0)),
    updatedAt: Number(candidate.updatedAt) || Date.now(),
  };
}

export function isTrustedCopyFrameOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return (
      hostname === "script.google.com" ||
      hostname === "script.googleusercontent.com" ||
      hostname.endsWith(".script.googleusercontent.com")
    );
  } catch {
    return false;
  }
}
