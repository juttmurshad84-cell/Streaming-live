"use client";
import { useState } from "react";
import { createStreamAction, updateStreamAction } from "@/app/actions/streams";
import type { Sport, Stream } from "@/lib/types";
import { LANGUAGES } from "@/lib/format";
import { ActionForm, Checkbox, Field, SelectField, SubmitButton, TextArea, TextField } from "./forms";
import { ThumbnailField } from "./ThumbnailField";

type MatchOpt = { id: string; title: string; sport_slug: string | null; starts_at: string };
type Check = { ok: boolean; type: string | null; health: string; detail: string } | null;

const toLocalInput = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");

export function StreamForm({ sports, matches, stream, platformReady, recordingAllowed, recordingNote }: {
  sports: Sport[]; matches: MatchOpt[]; stream?: Stream; platformReady: boolean; recordingAllowed: boolean; recordingNote?: string;
}) {
  const editing = Boolean(stream);
  const [kind, setKind] = useState<string>("platform_rtmps");
  const [sportId, setSportId] = useState(stream?.sport_id ?? "");
  const [url, setUrl] = useState("");
  const [check, setCheck] = useState<Check>(null);
  const [checking, setChecking] = useState(false);
  const isExternal = stream ? !stream.source_type.startsWith("platform") : kind === "external";
  const sportSlug = sports.find((s) => s.id === sportId)?.slug ?? stream?.sport?.slug;
  const isWebrtc = stream ? stream.source_type === "platform_webrtc" : kind === "platform_webrtc";
  const isRtmps = stream ? stream.source_type === "platform_rtmps" : kind === "platform_rtmps";

  async function validate() {
    setChecking(true);
    setCheck(null);
    try {
      const r = await fetch("/api/sources/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
      setCheck(r.ok ? await r.json() : { ok: false, type: null, health: "failed", detail: r.status === 429 ? "Too many checks — wait a minute." : "Could not validate that URL." });
    } finally { setChecking(false); }
  }

  return (
    <ActionForm action={editing ? updateStreamAction : createStreamAction} encType="multipart/form-data" className="space-y-8">
      {stream && <input type="hidden" name="id" value={stream.id} />}
      <input type="hidden" name="chat_enabled_present" value="1" />
      <input type="hidden" name="recording_enabled_present" value="1" />

      {!editing && (
        <fieldset className="space-y-3">
          <legend className="label">How will you broadcast?</legend>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { v: "platform_rtmps", t: "OBS / encoder (RTMPS)", d: "Best quality. Recorded automatically (if allowed) and published as a replay.", off: !platformReady },
              { v: "platform_webrtc", t: "Browser camera (WebRTC)", d: "Go live from this browser. Live only — browser broadcasts are NOT recorded.", off: !platformReady },
              { v: "external", t: "External source URL", d: "Embed an HLS/DASH/MP4 URL you control, or a YouTube video you have rights to.", off: false },
            ].map((o) => (
              <label key={o.v} className={`card cursor-pointer p-4 transition ${kind === o.v ? "border-accent ring-1 ring-accent" : ""} ${o.off ? "opacity-60" : ""}`}>
                <input type="radio" name="source_kind" value={o.v} checked={kind === o.v} onChange={() => setKind(o.v)} className="sr-only" />
                <span className="block text-sm font-semibold">{o.t}</span><span className="mt-1 block text-xs text-muted">{o.d}</span>
                {o.off && <span className="mt-2 block text-xs text-amber-300">Streaming provider not configured on this server.</span>}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2"><TextField name="title" label="Title" defaultValue={stream?.title} required maxLength={120} /></div>
        <Field name="sport_id" label="Sport" required>
          <select id="sport_id" name="sport_id" value={sportId} onChange={(e) => setSportId(e.target.value)} className="input" aria-required>
            <option value="">Select a sport…</option>
            {sports.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <SelectField name="language" label="Language" defaultValue={stream?.language ?? "en"} options={[{ value: "", label: "Not specified" }, ...Object.entries(LANGUAGES).map(([v, label]) => ({ value: v, label }))]} />
        <div className="md:col-span-2"><TextArea name="description" label="Description" defaultValue={stream?.description} rows={4} maxLength={5000} /></div>
        <SelectField name="visibility" label="Visibility" defaultValue={stream?.visibility ?? "public"} hint={isWebrtc ? "Browser broadcasts can be Public or Unlisted only." : "Public streams are listed; unlisted need the link; private is owner-only."} options={[{ value: "public", label: "Public" }, { value: "unlisted", label: "Unlisted" }, ...(isWebrtc ? [] : [{ value: "private", label: "Private" }])]} />
        <Field name="scheduled_start" label="Scheduled start (UTC)" hint="Optional. Shows the stream as upcoming."><input id="scheduled_start" name="scheduled_start" type="datetime-local" defaultValue={toLocalInput(stream?.scheduled_start)} className="input" /></Field>
        <div className="md:col-span-2">
          <Field name="match_id" label="Link to a match" hint="Optional. Linking does not imply broadcast rights.">
            <select id="match_id" name="match_id" defaultValue={stream?.match_id ?? ""} className="input">
              <option value="">No linked match</option>
              {matches.filter((m) => !sportSlug || m.sport_slug === sportSlug || m.id === stream?.match_id).map((m) => <option key={m.id} value={m.id}>{m.title} — {new Date(m.starts_at).toISOString().slice(0, 16).replace("T", " ")} UTC</option>)}
            </select>
          </Field>
        </div>
      </div>
      {isExternal && (
        <fieldset className="space-y-3">
          <legend className="label">Source URL</legend>
          <div className="flex gap-2">
            <input name="external_url" type="url" inputMode="url" value={url} onChange={(e) => { setUrl(e.target.value); setCheck(null); }} placeholder={editing ? "Leave blank to keep the current source" : "https://…/stream.m3u8 or a YouTube link"} className="input" aria-label="Source URL" />
            <button type="button" className="btn-secondary shrink-0" onClick={validate} disabled={!url || checking}>{checking ? "Checking…" : "Test"}</button>
          </div>
          {check && <p role="status" className={`text-sm ${check.ok ? "text-green-300" : "text-red-300"}`}>{check.ok ? `✓ ${check.type?.toUpperCase()} source reachable. ` : "✕ "}{check.detail}</p>}
          <p className="hint">HTTPS only. Private network addresses are blocked. DRM-protected, paywalled, geo-restricted or login-gated streams are not supported and are never bypassed.{editing && stream?.playback_ref && <> Current: <span className="break-all font-mono">{stream.playback_ref}</span></>}</p>
        </fieldset>
      )}

      <ThumbnailField current={stream?.thumbnail_url} sportSlug={sportSlug} focusX={stream?.thumbnail_focus_x} focusY={stream?.thumbnail_focus_y} alt={stream?.thumbnail_alt} />

      <fieldset className="space-y-3">
        <legend className="label">Options</legend>
        <Checkbox name="chat_enabled" label="Enable live chat" defaultChecked={stream?.chat_enabled ?? true} />
        <div className="max-w-xs"><TextField name="chat_slow_mode_seconds" label="Chat slow mode (seconds)" type="text" defaultValue={String(stream?.chat_slow_mode_seconds ?? 0)} hint="0 = off, up to 300." /></div>
        {isRtmps && (
          <div>
            <Checkbox name="recording_enabled" label="Record this broadcast and publish a replay" defaultChecked={stream?.recording_enabled ?? recordingAllowed} description={recordingAllowed ? "Replays use storage and follow the retention policy." : undefined} />
            {!recordingAllowed && <p className="mt-1 text-xs text-amber-300">{recordingNote ?? "Recording is not available for your account."}</p>}
          </div>
        )}
        {isWebrtc && <p className="text-xs text-muted">Browser (WebRTC) broadcasts are live-only. They cannot be recorded or replayed.</p>}
      </fieldset>

      {!editing && (
        <div className="card border-amber-500/30 bg-amber-500/5 p-4">
          <Checkbox name="rights" label="I own or have permission to broadcast this content." description="Including the video, audio, music and any sports footage. Rebroadcasting TV or pay-per-view feeds without a licence is prohibited and will result in takedown and suspension." />
        </div>
      )}
      <div className="flex gap-3"><SubmitButton pendingLabel={editing ? "Saving…" : "Creating…"}>{editing ? "Save changes" : "Create stream"}</SubmitButton></div>
    </ActionForm>
  );
}
