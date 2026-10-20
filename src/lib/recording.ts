import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/log";
import { getVideo, listLiveInputVideos, signPlaybackToken, thumbnailUrl, deleteVideo, type CfVideo } from "@/lib/providers/cloudflare";
import { ingestProviderVideo, providerVideoState, type RecordingStore, type StreamLite } from "@/lib/recording-core";

export interface RecordingSettings {
  policy: "all_streamers" | "approved_only" | "disabled";
  max_duration_minutes: number;
  retention_days: number;
  per_user_quota_minutes: number;
  reconnect_window_seconds: number;
}
const DEFAULT_SETTINGS: RecordingSettings = { policy: "all_streamers", max_duration_minutes: 480, retention_days: 90, per_user_quota_minutes: 3000, reconnect_window_seconds: 60 };

export async function getRecordingSettings(): Promise<RecordingSettings> {
  const db = createSupabaseAdminClient();
  if (!db) return DEFAULT_SETTINGS;
  const { data } = await db.from("site_settings").select("value").eq("key", "recording").maybeSingle();
  return { ...DEFAULT_SETTINGS, ...((data?.value as Partial<RecordingSettings>) ?? {}) };
}

/** Is this owner currently allowed to record (admin policy + approval + storage quota)? */
export async function recordingAllowedFor(ownerId: string): Promise<{ allowed: boolean; reason?: string }> {
  const db = createSupabaseAdminClient();
  if (!db) return { allowed: false, reason: "Database not configured" };
  const s = await getRecordingSettings();
  if (s.policy === "disabled") return { allowed: false, reason: "Recording is disabled by the administrator." };
  if (s.policy === "approved_only") {
    const { data } = await db.from("profile_private").select("recording_approved").eq("user_id", ownerId).maybeSingle();
    if (!data?.recording_approved) return { allowed: false, reason: "Recording is limited to approved streamers." };
  }
  const { data: vids } = await db.from("videos").select("duration_seconds").eq("owner_id", ownerId);
  const minutes = (vids ?? []).reduce((a, v) => a + Number(v.duration_seconds ?? 0), 0) / 60;
  if (minutes >= s.per_user_quota_minutes) return { allowed: false, reason: "Your recording storage quota is full. Delete old videos to record again." };
  return { allowed: true };
}

/** Called when a recordable input connects: make sure there is a recording row tracking it. */
export async function openRecordingFor(streamId: string, ownerId: string, videoUid: string | null, at: string) {
  const db = createSupabaseAdminClient();
  if (!db) return;
  if (videoUid) {
    const { data: byUid } = await db.from("stream_recordings").select("id").eq("provider", "cloudflare").eq("provider_recording_id", videoUid).maybeSingle();
    if (byUid) {
      await db.from("stream_recordings").update({ status: "recording", ended_at: null }).eq("id", byUid.id);
      return;
    }
  }
  const { data: open } = await db.from("stream_recordings").select("id").eq("stream_id", streamId).in("status", ["pending", "recording", "processing"]).is("provider_recording_id", null).limit(1).maybeSingle();
  if (open) {
    await db.from("stream_recordings").update({ status: "recording", ended_at: null, provider_recording_id: videoUid }).eq("id", open.id);
    return;
  }
  const { error } = await db.from("stream_recordings").insert({ stream_id: streamId, owner_id: ownerId, provider_recording_id: videoUid, status: "recording", started_at: at });
  if (error && error.code !== "23505") logger.warn("openRecordingFor insert failed", { streamId, error: error.message });
}

function supabaseStore(): RecordingStore {
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Service role client unavailable");
  const recCols = "id, stream_id, provider_recording_id, status";
  return {
    async getStreamByInput(inputUid) {
      const { data } = await db.from("streams").select("id, owner_id, title, description, sport_id, language, visibility, is_published, thumbnail_url, thumbnail_alt, thumbnail_focus_x, thumbnail_focus_y, started_at").eq("provider", "cloudflare").eq("provider_stream_id", inputUid).maybeSingle();
      return (data as StreamLite | null) ?? null;
    },
    async findRecordingByProviderId(uid) {
      const { data } = await db.from("stream_recordings").select(recCols).eq("provider", "cloudflare").eq("provider_recording_id", uid).maybeSingle();
      return data ?? null;
    },
    async findOpenRecording(streamId) {
      const { data } = await db.from("stream_recordings").select(recCols).eq("stream_id", streamId).is("provider_recording_id", null).in("status", ["pending", "recording", "processing"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
    async saveRecording(r) {
      const { id, ...rest } = r;
      if (id) {
        const { error } = await db.from("stream_recordings").update(rest).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await db.from("stream_recordings").insert({ ...rest, started_at: new Date().toISOString() }).select("id").single();
      if (error?.code === "23505") {
        const { data: again } = await db.from("stream_recordings").select("id").eq("provider", "cloudflare").eq("provider_recording_id", r.provider_recording_id).single();
        if (again) {
          await db.from("stream_recordings").update(rest).eq("id", again.id);
          return again.id;
        }
      }
      if (error) throw error;
      return data!.id;
    },
    async videoExists(uid) {
      const { data } = await db.from("videos").select("id").eq("provider", "cloudflare").eq("provider_asset_id", uid).maybeSingle();
      return Boolean(data);
    },
    async insertVideo(v) {
      const { data, error } = await db.from("videos").insert(v).select("id").single();
      if (error?.code === "23505") {
        const { data: ex } = await db.from("videos").select("id").eq("provider", "cloudflare").eq("provider_asset_id", v.provider_asset_id).single();
        return { created: false, id: ex?.id ?? "" };
      }
      if (error) throw error;
      return { created: true, id: data!.id };
    },
    async notify(userId, n) {
      const { data: prefs } = await db.from("profile_private").select("notification_prefs").eq("user_id", userId).maybeSingle();
      const p = (prefs?.notification_prefs ?? {}) as { recording_ready?: boolean };
      if (n.type === "recording_ready" && p.recording_ready === false) return;
      const { error } = await db.from("notifications").insert({ user_id: userId, ...n });
      if (error && error.code !== "23505") logger.warn("notify failed", { error: error.message });
    },
  };
}

async function copyProviderThumbnail(videoUid: string, ownerId: string, key: string): Promise<string | null> {
  const db = createSupabaseAdminClient();
  if (!db) return null;
  const token = await signPlaybackToken(videoUid, 600);
  const res = await fetch(thumbnailUrl(token), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 5 * 1024 * 1024) return null;
  const path = `${ownerId}/auto-${key}.jpg`;
  const { error } = await db.storage.from("thumbnails").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) return null;
  return db.storage.from("thumbnails").getPublicUrl(path).data.publicUrl;
}

export async function ingestRecordingVideo(v: CfVideo) {
  return ingestProviderVideo(supabaseStore(), v, {
    resolveLiveInput: async (uid) => (await getVideo(uid)).liveInput ?? null,
    copyThumbnail: copyProviderThumbnail,
  });
}

/** Recovery path: list the provider's videos for a stream's input and (re)ingest any that are finished. */
export async function reconcileRecordings(streamId: string) {
  const db = createSupabaseAdminClient();
  if (!db) throw new Error("Service role client unavailable");
  const { data: s } = await db.from("streams").select("provider_stream_id, source_type").eq("id", streamId).maybeSingle();
  if (!s?.provider_stream_id || s.source_type !== "platform_rtmps") return { found: 0, published: 0, failed: 0, pending: 0 };
  const videos = await listLiveInputVideos(s.provider_stream_id);
  const out = { found: videos.length, published: 0, failed: 0, pending: 0 };
  for (const v of videos) {
    const withInput = { ...v, liveInput: v.liveInput ?? s.provider_stream_id };
    const state = providerVideoState(withInput);
    if (state === "live") {
      out.pending++;
      continue;
    }
    const r = await ingestRecordingVideo(withInput);
    if (r.kind === "published") out.published++;
    else if (r.kind === "failed") out.failed++;
    else if (r.kind === "processing") out.pending++;
  }
  return out;
}

/** Remove a video asset from the provider (best effort; a 404 means it is already gone). */
export async function deleteProviderAsset(uid: string) {
  try {
    await deleteVideo(uid);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 404) throw e;
  }
}

export const recordingWebhookConfigured = () => Boolean(env.cfVideoWebhookSecret);
