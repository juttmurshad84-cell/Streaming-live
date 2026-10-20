"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackDescriptor } from "@/lib/playback";
import { RefreshIcon } from "./icons";

type Props = { kind: "stream" | "video"; id: string; title: string; poster?: string | null; autoPlay?: boolean; onLiveChange?: (live: boolean) => void };

const frame = "relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black";

export function Player({ kind, id, title, poster, autoPlay = true }: Props) {
  const [desc, setDesc] = useState<PlaybackDescriptor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async (endpoint: string, signal?: AbortSignal) => {
    try {
      const r = await fetch(endpoint, { cache: "no-store", signal });
      if (r.status === 404) { setError("This content is unavailable."); setDesc(null); return; }
      if (r.status === 429) { setError("Too many requests — please wait a moment and retry."); return; }
      const j = (await r.json()) as PlaybackDescriptor;
      setError(null);
      setDesc(j);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Could not load the player. Check your connection and retry.");
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setDesc(null);
    setError(null);
    void load(`/api/playback/${kind}/${id}`, ac.signal);
    return () => ac.abort();
  }, [kind, id, nonce, load]);

  // A stream that is not live yet: re-check periodically so viewers see it start without refreshing.
  useEffect(() => {
    if (kind !== "stream" || desc?.kind !== "offline") return;
    const t = setInterval(() => void load(`/api/playback/stream/${id}`), 20_000);
    return () => clearInterval(t);
  }, [desc, kind, id, load]);

  const retry = () => setNonce((n) => n + 1);

  if (error) return <Message tone="error" text={error} onRetry={retry} />;
  if (!desc) return <div className={frame} aria-busy="true" aria-label="Loading player"><div className="skeleton absolute inset-0 rounded-none" /></div>;

  switch (desc.kind) {
    case "offline": return <Message text={desc.message} poster={poster} onRetry={retry} />;
    case "youtube":
    case "embed":
      return (
        <div className={frame}>
          <iframe src={desc.kind === "youtube" ? desc.embedUrl : desc.url} title={title} className="absolute inset-0 h-full w-full" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" />
        </div>
      );
    case "mp4":
      return <div className={frame}><video src={desc.url} controls playsInline preload="metadata" poster={poster ?? undefined} className="h-full w-full" aria-label={title} /></div>;
    case "replay":
      return <Player kind="video" id={desc.videoId} title={title} poster={poster} autoPlay={autoPlay} />;
    case "whep":
      return <WhepPlayer url={desc.url} title={title} poster={poster} autoPlay={autoPlay} />;
    case "hls":
    case "dash":
      return <AdaptivePlayer key={desc.url} desc={desc} title={title} poster={poster} autoPlay={autoPlay} onExpired={retry} />;
  }
}

function Message({ text, onRetry, tone, poster }: { text: string; onRetry?: () => void; tone?: "error"; poster?: string | null }) {
  return (
    <div className={frame} role={tone === "error" ? "alert" : "status"}>
      {poster && /* eslint-disable-next-line @next/next/no-img-element */ <img src={poster} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
      <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-surface to-bg p-6 text-center">
        <div className="max-w-md space-y-3">
          <p className={tone === "error" ? "text-red-300" : "text-fg"}>{text}</p>
          {onRetry && <button type="button" onClick={onRetry} className="btn-secondary btn-sm"><RefreshIcon width={14} height={14} />Check again</button>}
        </div>
      </div>
    </div>
  );
}

function AdaptivePlayer({ desc, title, poster, autoPlay, onExpired }: { desc: Extract<PlaybackDescriptor, { kind: "hls" | "dash" }>; title: string; poster?: string | null; autoPlay: boolean; onExpired: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [behind, setBehind] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let destroy: () => void = () => undefined;
    let cancelled = false;
    setErr(null);

    (async () => {
      try {
        if (desc.kind === "hls") {
          if (video.canPlayType("application/vnd.apple.mpegurl") && !(window as unknown as { MediaSource?: unknown }).MediaSource) {
            video.src = desc.url; // Safari/iOS native HLS
            return;
          }
          const { default: Hls } = await import("hls.js");
          if (cancelled) return;
          if (!Hls.isSupported()) { video.src = desc.url; return; }
          const hls = new Hls({ lowLatencyMode: desc.live, enableWorker: true, backBufferLength: desc.live ? 30 : 90 });
          hls.loadSource(desc.url);
          hls.attachMedia(video);
          let netRetries = 0;
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data.fatal) return;
            const code = (data.response as { code?: number } | undefined)?.code;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
              if (code === 401 || code === 403) { hls.destroy(); onExpired(); return; } // signed token expired
              if (netRetries++ < 4) { setTimeout(() => hls.startLoad(), 1500 * netRetries); return; }
              setErr(desc.live ? "The stream is not available right now. It may have ended or be reconnecting." : "The video could not be loaded.");
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
              if (netRetries++ < 3) hls.recoverMediaError(); else setErr("This video could not be decoded by your browser.");
            } else {
              setErr("Playback failed.");
              hls.destroy();
            }
          });
          destroy = () => hls.destroy();
        } else {
          const dashjs = await import("dashjs");
          if (cancelled) return;
          const player = dashjs.MediaPlayer().create();
          player.initialize(video, desc.url, autoPlay);
          player.on("error", () => setErr("Playback failed."));
          destroy = () => player.destroy();
        }
      } catch {
        setErr("The player could not be started in this browser.");
      }
    })();
    return () => { cancelled = true; destroy(); };
  }, [desc, autoPlay, onExpired, tries]);

  // "Back to live" affordance for live HLS
  useEffect(() => {
    const v = ref.current;
    if (!v || !(desc.kind === "hls" && desc.live)) return;
    const t = setInterval(() => setBehind(v.buffered.length > 0 && v.buffered.end(v.buffered.length - 1) - v.currentTime > 12), 3000);
    return () => clearInterval(t);
  }, [desc]);

  if (err) return <Message tone="error" text={err} poster={poster} onRetry={() => setTries((n) => n + 1)} />;
  return (
    <div className={frame}>
      <video ref={ref} controls playsInline autoPlay={autoPlay} muted={autoPlay && desc.live} poster={poster ?? undefined} className="h-full w-full" aria-label={title} />
      {behind && <button type="button" className="btn-primary btn-sm absolute bottom-14 right-3" onClick={() => { const v = ref.current; if (v && v.buffered.length) v.currentTime = v.buffered.end(v.buffered.length - 1) - 1; setBehind(false); }}>Go to live</button>}
    </div>
  );
}

/** WHEP (WebRTC) playback for browser broadcasts — sub-second latency, no recording. */
function WhepPlayer({ url, title, poster, autoPlay }: { url: string; title: string; poster?: string | null; autoPlay: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"connecting" | "playing" | "waiting" | "failed">("connecting");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], bundlePolicy: "max-bundle" });
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (ev) => {
      if (ref.current && ref.current.srcObject !== ev.streams[0]) {
        ref.current.srcObject = ev.streams[0];
        setState("playing");
      }
    };
    pc.onconnectionstatechange = () => { if (!closed && (pc.connectionState === "failed" || pc.connectionState === "disconnected")) setState("failed"); };

    (async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await new Promise<void>((res) => {
          if (pc.iceGatheringState === "complete") return res();
          const done = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", done); res(); } };
          pc.addEventListener("icegatheringstatechange", done);
          setTimeout(res, 2000);
        });
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/sdp" }, body: pc.localDescription!.sdp });
        if (r.status === 404 || r.status === 409) { // broadcaster not connected yet
          if (!closed) { setState("waiting"); timer = setTimeout(() => setAttempt((n) => n + 1), 5000); }
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
      } catch {
        if (!closed) setState("failed");
      }
    })();
    return () => { closed = true; if (timer) clearTimeout(timer); pc.close(); };
  }, [url, attempt]);

  if (state === "failed") return <Message tone="error" text="The live connection was lost." poster={poster} onRetry={() => { setState("connecting"); setAttempt((n) => n + 1); }} />;
  return (
    <div className={frame}>
      <video ref={ref} autoPlay={autoPlay} playsInline controls muted poster={poster ?? undefined} className="h-full w-full" aria-label={title} />
      {state !== "playing" && <div className="absolute inset-0 grid place-items-center bg-black/60 text-sm text-muted" role="status">{state === "waiting" ? "Waiting for the broadcaster to connect…" : "Connecting…"}</div>}
    </div>
  );
}
