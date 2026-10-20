import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { logger, errMessage } from "@/lib/log";
import { getLifecycle } from "@/lib/providers/cloudflare";
import { getRecordingSettings, openRecordingFor } from "@/lib/recording";
import type { Stream } from "@/lib/types";

type StreamRow = Pick<Stream, "id" | "owner_id" | "status" | "started_at" | "ended_at" | "source_type" | "provider_stream_id" | "recording_enabled" | "is_published" | "visibility" | "title">;

export type LiveSignal = "connected" | "disconnected" | "errored";

/**
 * Apply a provider-reported live state to a stream. Only called from verified webhooks or after a
 * direct provider API check — never from client-supplied claims. Idempotent.
 */
export async function applyLiveSignal(streamId: string, signal: LiveSignal, opts: { detail?: string; at?: string; videoUid?: string | null } = {}) {
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Service role client unavailable");
  const { data: s } = await db.from("streams").select("id, owner_id, status, started_at, ended_at, source_type, provider_stream_id, recording_enabled, is_published, visibility, title").eq("id", streamId).maybeSingle();
  if (!s) return { changed: false, reason: "stream not found" };
  const stream = s as StreamRow;
  const now = opts.at ?? new Date().toISOString();
  if (stream.status === "disabled") return { changed: false, reason: "stream disabled" };

  if (signal === "connected") {
    if (stream.status === "live") {
      await db.from("streams").update({ source_health: "healthy", source_health_detail: null, source_checked_at: now }).eq("id", stream.id);
      return { changed: false, reason: "already live" };
    }
    const settings = await getRecordingSettings();
    const resumable = stream.status === "ended" && stream.ended_at && (Date.parse(now) - Date.parse(stream.ended_at)) / 1000 <= settings.reconnect_window_seconds;
    const patch = resumable
      ? { status: "live" as const, ended_at: null, source_health: "healthy" as const, source_health_detail: null, source_checked_at: now, last_error: null }
      : { status: "live" as const, started_at: now, ended_at: null, source_health: "healthy" as const, source_health_detail: null, source_checked_at: now, last_error: null };
    const { error } = await db.from("streams").update(patch).eq("id", stream.id);
    if (error) throw error;
    if (stream.source_type === "platform_rtmps" && stream.recording_enabled) {
      await openRecordingFor(stream.id, stream.owner_id, opts.videoUid ?? null, now);
    }
    if (!resumable) {
      const { error: nErr } = await db.rpc("notify_followers_live", { p_stream: stream.id });
      if (nErr) logger.warn("notify_followers_live failed", { streamId, error: nErr.message });
    }
    return { changed: true, reason: resumable ? "resumed" : "went live" };
  }

  if (signal === "disconnected") {
    if (stream.status !== "live") return { changed: false, reason: `not live (${stream.status})` };
    await db.from("streams").update({ status: "ended", ended_at: now, source_health: "unknown", source_checked_at: now }).eq("id", stream.id);
    if (stream.source_type === "platform_rtmps" && stream.recording_enabled) {
      await db.from("stream_recordings").update({ status: "processing", ended_at: now, processing_status: "awaiting provider" }).eq("stream_id", stream.id).in("status", ["pending", "recording"]);
    }
    return { changed: true, reason: "ended" };
  }

  await db.from("streams").update({ source_health: "failed", source_health_detail: opts.detail ?? "Provider reported an input error", last_error: opts.detail ?? "input error", source_checked_at: now }).eq("id", stream.id);
  return { changed: true, reason: "errored" };
}

/** Ask the provider whether the input is really connected and reconcile our row with the answer. */
export async function reconcileStream(streamId: string) {
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Service role client unavailable");
  const { data } = await db.from("streams").select("id, source_type, provider_stream_id, status").eq("id", streamId).maybeSingle();
  const s = data as Pick<Stream, "id" | "source_type" | "provider_stream_id" | "status"> | null;
  if (!s || !s.provider_stream_id || !(s.source_type === "platform_rtmps" || s.source_type === "platform_webrtc")) {
    return { live: false, changed: false, reason: "not a platform stream" };
  }
  try {
    const life = await getLifecycle(s.provider_stream_id);
    const res = await applyLiveSignal(s.id, life.live ? "connected" : "disconnected", { videoUid: life.videoUID });
    return { live: life.live, changed: res.changed, reason: res.reason };
  } catch (e) {
    logger.warn("reconcile failed", { streamId, error: errMessage(e) });
    throw e;
  }
}
