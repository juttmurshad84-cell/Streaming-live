"use client";
import { useEffect, useState } from "react";
import { EyeIcon } from "./icons";
import { formatCount } from "@/lib/format";

function sessionKey() {
  const k = "al_viewer_key";
  let v = sessionStorage.getItem(k);
  if (!v) {
    v = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem(k, v);
  }
  return v;
}

/** Real concurrent-viewer count: one heartbeat per open, visible watch page. Renders nothing until the server reports a number. */
export function ViewerCount({ streamId, initial, live }: { streamId: string; initial: number | null; live: boolean }) {
  const [n, setN] = useState<number | null>(initial);
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const beat = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/viewer/heartbeat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ streamId, key: sessionKey() }) });
        if (r.ok && !stop) { const j = (await r.json()) as { viewers: number | null }; if (j.viewers != null) setN(j.viewers); }
      } catch { /* offline: next tick */ }
    };
    void beat();
    const t = setInterval(beat, 20_000);
    return () => { stop = true; clearInterval(t); };
  }, [streamId, live]);
  if (n == null) return null;
  return <span className="inline-flex items-center gap-1.5 text-sm text-muted" aria-label={`${n} watching now`}><EyeIcon width={16} height={16} />{formatCount(n) || 0} watching</span>;
}
