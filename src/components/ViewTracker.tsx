"use client";
import { useEffect } from "react";

/** Counts one view after the page has been open (and visible) for 10 seconds. */
export function ViewTracker({ videoId }: { videoId: string }) {
  useEffect(() => {
    const t = setTimeout(() => { if (document.visibilityState === "visible") void fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch(() => undefined); }, 10_000);
    return () => clearTimeout(t);
  }, [videoId]);
  return null;
}
