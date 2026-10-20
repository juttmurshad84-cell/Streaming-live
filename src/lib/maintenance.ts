import "server-only";
import { hasCloudflare } from "@/lib/env";
import { errMessage, logger } from "@/lib/log";
import { updateLiveInput } from "@/lib/providers/cloudflare";
import { deleteProviderAsset, getRecordingSettings, reconcileRecordings } from "@/lib/recording";
import { reconcileStream } from "@/lib/stream-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

/** Periodic housekeeping, run every few minutes by cron. Each step is independent and reports its own result. */
export async function runMaintenance() {
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Service role client unavailable");
  const out: Record<string, unknown> = {};
  const settings = await getRecordingSettings();

  // 1. Remind users about matches that are about to start.
  const rem = await db.rpc("dispatch_match_reminders", { p_window: "30 minutes" });
  out.reminders = rem.error ? `error: ${rem.error.message}` : rem.data;

  // 2. Drop stale viewer sessions.
  await db.from("stream_viewer_sessions").delete().lt("last_seen_at", new Date(Date.now() - 6 * 3600_000).toISOString());

  if (hasCloudflare()) {
    // 3. Reconcile live status with the provider for streams we believe are live or just ended (missed webhooks).
    const { data: liveish } = await db.from("streams").select("id, started_at, provider_stream_id, status, source_type, ended_at").in("source_type", ["platform_rtmps", "platform_webrtc"]).or(`status.eq.live,and(status.eq.ended,ended_at.gte.${new Date(Date.now() - 3600_000).toISOString()})`).limit(100);
    let reconciled = 0;
    const errors: string[] = [];
    for (const s of liveish ?? []) {
      try {
        await reconcileStream(s.id);
        reconciled++;
      } catch (e) {
        errors.push(`${s.id}: ${errMessage(e)}`);
      }
      // 4. Enforce the administrator's maximum broadcast duration.
      if (s.status === "live" && s.started_at && s.provider_stream_id && Date.now() - Date.parse(s.started_at) > settings.max_duration_minutes * 60_000) {
        try {
          await updateLiveInput(s.provider_stream_id, { enabled: false });
          await db.rpc("log_moderation_action", { p_action: "stream_duration_limit", p_target_type: "stream", p_target_id: s.id, p_reason: `Exceeded ${settings.max_duration_minutes} minutes` });
        } catch (e) {
          errors.push(`limit ${s.id}: ${errMessage(e)}`);
        }
      }
    }
    out.reconciledStreams = reconciled;
    if (errors.length) out.reconcileErrors = errors;

    // 5. Recover recordings that are stuck "processing" after the stream ended (missed video webhook).
    const { data: stuck } = await db.from("stream_recordings").select("stream_id, status, updated_at").in("status", ["processing", "recording", "pending"]).lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(25);
    let recovered = 0;
    for (const r of stuck ?? []) {
      try {
        const res = await reconcileRecordings(r.stream_id);
        recovered += res.published;
      } catch (e) {
        logger.warn("recording recovery failed", { stream: r.stream_id, error: errMessage(e) });
      }
    }
    out.recoveredRecordings = recovered;
    // Recordings with no provider asset 2h after the stream ended are reported as failed (not silently pending).
    await db.from("stream_recordings").update({ status: "failed", error: "The provider did not produce a recording for this broadcast.", processing_status: "timeout" }).in("status", ["pending", "recording", "processing"]).is("provider_recording_id", null).lt("updated_at", new Date(Date.now() - 2 * 3600_000).toISOString());

    // 6. Retention: delete replays older than the configured retention window (and their provider assets).
    const cutoff = new Date(Date.now() - settings.retention_days * 864e5).toISOString();
    const { data: old } = await db.from("videos").select("id, provider_asset_id, recording_id").lt("published_at", cutoff).limit(25);
    let removed = 0;
    for (const v of old ?? []) {
      try {
        await deleteProviderAsset(v.provider_asset_id);
        if (v.recording_id) await db.from("stream_recordings").update({ status: "skipped", error: "Removed by retention policy" }).eq("id", v.recording_id);
        await db.from("videos").delete().eq("id", v.id);
        removed++;
      } catch (e) {
        logger.warn("retention delete failed", { video: v.id, error: errMessage(e) });
      }
    }
    out.retentionRemoved = removed;
  }
  return out;
}

