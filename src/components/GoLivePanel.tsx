"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { armIngestAction, regenerateKeyAction, retryRecordingAction, stopBroadcastAction } from "@/app/actions/streams";
import type { ActionState } from "@/app/actions/util";
import { StatusBadge } from "./media";
import { CheckIcon, CopyIcon, EyeIcon } from "./icons";

type Server = { status: string; source_health: string; source_health_detail: string | null; last_error: string | null; started_at: string | null };
interface Props { streamId: string; sourceType: "platform_rtmps" | "platform_webrtc"; initialStatus: string; recording: boolean; title: string }
interface Ingest { protocol: "rtmps" | "whip"; server?: string | null; streamKey?: string | null; whipUrl?: string | null; srt?: { url: string; streamId: string; passphrase: string } | null; enabled: boolean }

async function getIngest(id: string): Promise<Ingest> {
  const r = await fetch(`/api/streams/${id}/ingest`, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Could not load connection details");
  return j;
}

function CopyRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className="flex gap-2">
        <input readOnly value={shown ? value : "•".repeat(Math.min(value.length, 32))} aria-label={label} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        {secret && <button type="button" className="btn-secondary btn-sm" onClick={() => setShown((s) => !s)} aria-label={shown ? `Hide ${label}` : `Show ${label}`}><EyeIcon width={16} height={16} /></button>}
        <button type="button" className="btn-secondary btn-sm" onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }} aria-label={`Copy ${label}`}>{copied ? <CheckIcon width={16} height={16} /> : <CopyIcon width={16} height={16} />}</button>
      </div>
    </div>
  );
}

export function GoLivePanel(props: Props) {
  const [server, setServer] = useState<Server>({ status: props.initialStatus, source_health: "unknown", source_health_detail: null, last_error: null, started_at: null });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const sync = useCallback(async (recordings = false) => {
    setSyncing(true);
    try {
      const r = await fetch(`/api/streams/${props.streamId}/sync${recordings ? "?recordings=1" : ""}`, { method: "POST", cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setNote(j.error ?? "Provider check failed."); return null; }
      setNote(null);
      if (j.stream) setServer(j.stream);
      return j;
    } finally { setSyncing(false); }
  }, [props.streamId]);

  useEffect(() => {
    const t = setTimeout(() => void sync(), 0);
    return () => clearTimeout(t);
  }, [sync]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void sync(); }, 10_000);
    return () => clearInterval(t);
  }, [sync]);

  const run = (fn: () => Promise<ActionState>, after?: () => void) => start(async () => {
    const r = await fn();
    setMsg(r?.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r?.error ?? "Failed." });
    await sync();
    after?.();
  });

  const live = server.status === "live";
  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold">{props.title}</p>
          <p className="text-xs text-muted">{props.sourceType === "platform_rtmps" ? "OBS / RTMPS" : "Browser / WebRTC"} · {props.recording ? "Recording on" : "Not recorded"}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={live ? "live" : server.status} />
          <button type="button" className="btn-ghost btn-sm" disabled={syncing} onClick={() => sync(true)}>{syncing ? "Checking…" : "Check status"}</button>
        </div>
      </div>
      {live && <div role="status" className="rounded-xl border border-live/40 bg-live/10 px-4 py-3 text-sm">The provider confirms your stream is <strong>live</strong>. Viewers can watch at <a className="text-accent underline" href={`/watch/${props.streamId}`} target="_blank" rel="noreferrer">/watch/{props.streamId.slice(0, 8)}…</a></div>}
      {server.last_error && !live && <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Last provider error: {server.last_error}</div>}
      {note && <p role="status" className="text-sm text-amber-300">{note}</p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-green-300" : "text-red-300"}`}>{msg.text}</p>}

      {props.sourceType === "platform_rtmps" ? <RtmpsPanel {...props} live={live} pending={pending} run={run} /> : <WebrtcPanel streamId={props.streamId} live={live} sync={sync} onStopped={() => run(() => stopBroadcastAction(props.streamId))} />}

      {props.sourceType === "platform_rtmps" && props.recording && (
        <div className="card p-4 text-sm">
          <p className="font-medium">Recording</p>
          <p className="mt-1 text-muted">When you stop, Cloudflare finishes the recording and ArenaLive publishes the replay after it is verified ready. This normally takes a few minutes. Replays only appear when processing really succeeded.</p>
          <button type="button" className="btn-secondary btn-sm mt-3" disabled={pending} onClick={() => run(() => retryRecordingAction(props.streamId))}>Check for a finished recording</button>
        </div>
      )}
    </div>
  );
}

function RtmpsPanel({ streamId, live, pending, run }: Props & { live: boolean; pending: boolean; run: (fn: () => Promise<ActionState>) => void }) {
  const [ingest, setIngest] = useState<Ingest | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => () => setIngest(null), []);
  async function reveal() {
    setLoading(true); setErr(null);
    try { setIngest(await getIngest(streamId)); } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }
  return (
    <div className="card space-y-4 p-4 sm:p-5">
      <h2 className="font-semibold">Connect OBS</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
        <li>Reveal your connection details below and keep them private.</li>
        <li>In OBS: Settings → Stream → Service “Custom…”. Paste the server and stream key.</li>
        <li>Recommended: H.264 video, AAC audio, keyframe interval 2 s, up to 1080p30 at 4–6 Mbps.</li>
        <li>Click “Start Streaming”. This page shows <strong>LIVE</strong> only after the provider confirms your encoder is connected.</li>
      </ol>
      {!ingest ? (
        <div><button type="button" className="btn-primary" onClick={reveal} disabled={loading}>{loading ? "Loading…" : "Reveal connection details"}</button>{err && <p role="alert" className="mt-2 text-sm text-red-300">{err}</p>}</div>
      ) : (
        <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-amber-300">Never share or screenshot your stream key. Anyone with it can broadcast as you. Regenerate it if it leaks.</p>
          {ingest.server && <CopyRow label="Server (RTMPS)" value={ingest.server} />}
          {ingest.streamKey && <CopyRow label="Stream key" value={ingest.streamKey} secret />}
          {!ingest.enabled && <p className="text-sm text-amber-300">Ingest is currently disabled — click “Enable ingest” before connecting.</p>}
          {ingest.srt && <details className="text-xs text-muted"><summary className="cursor-pointer">SRT details (advanced)</summary><div className="mt-2 space-y-2"><CopyRow label="SRT URL" value={ingest.srt.url} /><CopyRow label="Stream ID" value={ingest.srt.streamId} /><CopyRow label="Passphrase" value={ingest.srt.passphrase} secret /></div></details>}
          <button type="button" className="btn-ghost btn-sm" onClick={() => setIngest(null)}>Hide details</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => armIngestAction(streamId))}>Enable ingest</button>
        <button type="button" className="btn-danger" disabled={pending || !live} onClick={() => { if (confirm("Stop the broadcast? This disconnects your encoder and ends the stream.")) run(() => stopBroadcastAction(streamId)); }}>Stop broadcast</button>
        <button type="button" className="btn-ghost" disabled={pending || live} title={live ? "Stop the broadcast first" : undefined} onClick={() => { if (confirm("Regenerate the stream key? The current key stops working immediately.")) { setIngest(null); run(() => regenerateKeyAction(streamId)); } }}>Regenerate key</button>
      </div>
    </div>
  );
}

function WebrtcPanel({ streamId, live, sync, onStopped }: { streamId: string; live: boolean; sync: (r?: boolean) => Promise<unknown>; onStopped: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const resourceRef = useRef<string | null>(null);
  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] });
  const [cam, setCam] = useState("");
  const [mic, setMic] = useState("");
  const [phase, setPhase] = useState<"idle" | "preview" | "connecting" | "connected" | "failed">("idle");
  const [err, setErr] = useState<string | null>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== "undefined";

  const stopTracks = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; if (videoRef.current) videoRef.current.srcObject = null; };
  useEffect(() => () => { stopTracks(); pcRef.current?.close(); }, []);

  async function preview(camId: string = cam, micId: string = mic) {
    setErr(null);
    try {
      stopTracks();
      const s = await navigator.mediaDevices.getUserMedia({ video: { deviceId: camId ? { exact: camId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true } });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices({ cams: list.filter((d) => d.kind === "videoinput"), mics: list.filter((d) => d.kind === "audioinput") });
      setPhase((p) => (p === "idle" || p === "failed" ? "preview" : p));
    } catch (e) {
      const n = (e as DOMException).name;
      setErr(n === "NotAllowedError" ? "Camera/microphone permission was denied. Allow access in your browser's site settings and try again." : n === "NotFoundError" ? "No camera or microphone was found." : "Could not access your camera or microphone.");
    }
  }

  async function start() {
    if (!streamRef.current) return;
    setErr(null); setPhase("connecting");
    try {
      const ingest = await getIngest(streamId);
      if (!ingest.whipUrl) throw new Error("The provider did not return a WHIP endpoint.");
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }], bundlePolicy: "max-bundle" });
      pcRef.current = pc;
      streamRef.current.getTracks().forEach((t) => pc.addTransceiver(t, { direction: "sendonly", streams: [streamRef.current!] }));
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") { setPhase("connected"); void sync(); }
        if (pc.connectionState === "failed") { setPhase("failed"); setErr("The connection to the ingest server was lost."); }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await new Promise<void>((res) => { if (pc.iceGatheringState === "complete") return res(); pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && res()); setTimeout(res, 2000); });
      const r = await fetch(ingest.whipUrl, { method: "POST", headers: { "content-type": "application/sdp" }, body: pc.localDescription!.sdp });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? "The ingest endpoint rejected the connection." : `The ingest server returned ${r.status}.`);
      const loc = r.headers.get("location");
      resourceRef.current = loc ? new URL(loc, ingest.whipUrl).toString() : null;
      await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });
    } catch (e) {
      pcRef.current?.close(); pcRef.current = null;
      setPhase("preview"); setErr((e as Error).message || "Could not start the broadcast.");
    }
  }

  async function stop() {
    if (resourceRef.current) await fetch(resourceRef.current, { method: "DELETE" }).catch(() => undefined);
    pcRef.current?.close(); pcRef.current = null; resourceRef.current = null;
    stopTracks(); setPhase("idle");
    onStopped();
  }

  if (!supported) return <div className="card p-4 text-sm text-muted">Your browser does not support camera capture or WebRTC. Use a current version of Chrome, Edge, Firefox or Safari — or broadcast with OBS.</div>;
  const broadcasting = phase === "connecting" || phase === "connected";
  return (
    <div className="card space-y-4 p-4 sm:p-5">
      <h2 className="font-semibold">Broadcast from this browser</h2>
      <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">Browser broadcasts are <strong>live only</strong>: they are not recorded and no replay is created. Keep this tab open while broadcasting.</p>
      <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" aria-label="Camera preview" />
        {phase === "idle" && <div className="absolute inset-0 grid place-items-center text-sm text-muted">Camera is off</div>}
      </div>
      {phase !== "idle" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="cam" className="label">Camera</label><select id="cam" className="input" value={cam} disabled={broadcasting} onChange={(e) => { setCam(e.target.value); void preview(e.target.value, mic); }}>{devices.cams.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}</select></div>
          <div><label htmlFor="mic" className="label">Microphone</label><select id="mic" className="input" value={mic} disabled={broadcasting} onChange={(e) => { setMic(e.target.value); void preview(cam, e.target.value); }}>{devices.mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}</select></div>
        </div>
      )}
      {err && <p role="alert" className="text-sm text-red-300">{err}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {phase === "idle" || phase === "failed" ? <button type="button" className="btn-secondary" onClick={() => void preview()}>Enable camera</button> : null}
        {phase === "preview" && <button type="button" className="btn-primary" onClick={start}>Start broadcast</button>}
        {broadcasting && <button type="button" className="btn-danger" onClick={stop}>Stop broadcast</button>}
        {phase === "connecting" && <span role="status" className="text-sm text-muted">Connecting to the ingest server…</span>}
        {phase === "connected" && !live && <span role="status" className="text-sm text-amber-300">Connected to the ingest server — waiting for the provider to confirm the stream is live…</span>}
        {phase === "connected" && live && <span role="status" className="text-sm text-green-300">You are live.</span>}
      </div>
    </div>
  );
}
